// 운임 자동 전환 + 만료 임박 알림 (pg_cron → 매일 호출)
//
//   action=transition : validity 시작일이 도래한 향후 운임 → 현재 운임으로 전환,
//                       종료일 지난 현재 운임은 만료 처리(데이터 보존, rate_history 기록)
//   action=alert      : 차기 운임 미입력 + 만료 임박(해상 D-3 / 렌탈 D-2) 시 선사별 집계 메일 1통
//
// 데이터는 Supabase settings(key/value) JSON — App.jsx 의 구조를 그대로 따른다.
//   validity_info_json      { SNK|DY|CK|SNK_DROP|DY_DROP|CK_DROP|RENTAL: { current:{from,till,furtherNotice}, future:{...} } }
//   pol_costs               { [pol]: { carrier: { [cr]: { current:{coc20..,sell:{}}, future:{}, byValidity:{} } } } }
//   carrier_rates_json      { [cr]: { current:{coc20,coc40,soc20,soc40}, future:{...} } }
//   carrier_drop_rates_json { [cr]: { current:{ [city]:{c20,c40} }, future:{}, byValidity:{} } }
//   rental_rates_json       { [pol]: { current:{ [city]:{c20,c40dv,c40hc} }, future:{} } }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "gusrns83@gmail.com";
const ADMIN_URL = Deno.env.get("ADMIN_URL") || "https://ysl-freight-portal.vercel.app";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const CRS = ["SNK", "DY", "CK"];
const RATE_TYPES = ["coc20", "coc40", "soc20", "soc40"];
const RENTAL_TYPES = ["c20", "c40dv", "c40hc"];
const LEGACY_VALIDITY_KEY: Record<string, string> = {
  SNK: "validity_snk", DY: "validity_dy", CK: "validity_ck", RENTAL: "validity_rental",
};
const STATE_KEY = "auto_transition_state_json";
const SETTINGS_KEYS = [
  "validity_info_json", "pol_costs", "carrier_rates_json",
  "carrier_drop_rates_json", "rental_rates_json",
  "validity_snk", "validity_dy", "validity_ck", "validity_rental",
  STATE_KEY,
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ── 날짜 유틸 (App.jsx parseValidityToISO 와 동일 규칙) ─────────────────────
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const mskTodayISO = () => new Date(Date.now() + MSK_OFFSET_MS).toISOString().slice(0, 10);

const parseValidityToISO = (str?: string): string => {
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const dm = String(str).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dm) return `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  return "";
};

type Slot = { from?: string; till?: string; furtherNotice?: boolean };

const slotLabel = (slot?: Slot): string => {
  const s = slot || {};
  if (s.furtherNotice && !s.from && !s.till) return "Further notice";
  const till = s.furtherNotice ? "Further notice" : (s.till || "");
  if (s.from && till) return `${s.from} - ${till}`;
  return s.from || till || "";
};

const validityStorageKey = (slot?: Slot): string => {
  const s = slot || {};
  const from = parseValidityToISO(s.from) || "open";
  const till = s.furtherNotice ? "fn" : (parseValidityToISO(s.till) || "open");
  return `${from}_${till}`;
};

const daysLeft = (tillISO: string, todayISO: string): number =>
  Math.round((Date.parse(tillISO) - Date.parse(todayISO)) / 86400000);

const fmtShortDate = (iso: string): string => {
  if (!iso) return "-";
  const [, m, d] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
};

// ── settings I/O ─────────────────────────────────────────────────────────────
const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

async function loadSettings(): Promise<Record<string, string>> {
  const res = await fetch(
    `${SB_URL}/rest/v1/settings?select=key,value&key=in.(${SETTINGS_KEYS.join(",")})`,
    { headers: sbHeaders },
  );
  if (!res.ok) throw new Error(`settings load failed: ${await res.text()}`);
  const rows = await res.json();
  return Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
}

async function saveSettings(entries: Array<[string, string]>) {
  for (const [key, value] of entries) {
    const res = await fetch(`${SB_URL}/rest/v1/settings`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key, value: String(value) }),
    });
    if (!res.ok) throw new Error(`settings save failed (${key}): ${await res.text()}`);
  }
}

async function insertRateHistory(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const res = await fetch(`${SB_URL}/rest/v1/rate_history`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`rate_history insert failed: ${await res.text()}`);
}

const parseJson = (raw: string | undefined, fallback: unknown) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// ── 버킷 검사 ────────────────────────────────────────────────────────────────
const oceanBucketHasRates = (b: Record<string, unknown> | undefined): boolean =>
  !!b && (
    RATE_TYPES.some(t => b[t] != null && b[t] !== "") ||
    (typeof b.sell === "object" && b.sell != null && Object.keys(b.sell).length > 0)
  );

const objHasEntries = (o: unknown): boolean =>
  !!o && typeof o === "object" && Object.keys(o as object).length > 0;

// ── 자동 전환 ────────────────────────────────────────────────────────────────
function runTransition(settings: Record<string, string>, today: string, dryRun: boolean) {
  const vi = parseJson(settings.validity_info_json, {}) as Record<string, { current?: Slot; future?: Slot }>;
  const polCosts = parseJson(settings.pol_costs, {}) as Record<string, any>;
  const carrierRates = parseJson(settings.carrier_rates_json, {}) as Record<string, any>;
  const dropRates = parseJson(settings.carrier_drop_rates_json, {}) as Record<string, any>;
  const rentalRates = parseJson(settings.rental_rates_json, {}) as Record<string, any>;
  const state = parseJson(settings[STATE_KEY], {}) as { expiredLogged?: Record<string, string> };
  if (!state.expiredLogged) state.expiredLogged = {};

  const changedKeys = new Set<string>();
  const historyRows: Array<Record<string, unknown>> = [];
  const summary: string[] = [];

  const promoteValidity = (key: string) => {
    const entry = vi[key] || {};
    const oldLabel = slotLabel(entry.current);
    vi[key] = {
      current: { ...(entry.future || {}) },
      future: { from: "", till: "", furtherNotice: false },
    };
    changedKeys.add("validity_info_json");
    const legacy = LEGACY_VALIDITY_KEY[key];
    if (legacy) {
      settings[legacy] = slotLabel(vi[key].current);
      changedKeys.add(legacy);
    }
    return { oldLabel, newLabel: slotLabel(vi[key].current) };
  };

  const archiveIntoByValidity = (
    cr: Record<string, any>, oldSlot: Slot | undefined, newSlot: Slot | undefined,
  ) => {
    // 이전 current 를 byValidity 에 보존(만료 이력) — 삭제 금지 요건
    const byValidity = { ...(cr.byValidity || {}) };
    if (objHasEntries(cr.current)) {
      const oldKey = validityStorageKey(oldSlot);
      if (!byValidity[oldKey]) {
        byValidity[oldKey] = {
          slot: "current",
          from: oldSlot?.from ?? "",
          till: oldSlot?.till ?? "",
          furtherNotice: !!oldSlot?.furtherNotice,
          label: slotLabel(oldSlot) || oldKey,
          ...cr.current,
        };
      } else {
        byValidity[oldKey] = { ...byValidity[oldKey], slot: "current" };
      }
    }
    const newKey = validityStorageKey(newSlot);
    if (byValidity[newKey]) byValidity[newKey] = { ...byValidity[newKey], slot: "current" };
    cr.byValidity = byValidity;
  };

  // 1) 해상 (Ocean) — 선사별
  for (const carrier of CRS) {
    const entry = vi[carrier];
    const fFrom = parseValidityToISO(entry?.future?.from);
    if (!fFrom || fFrom > today) continue;

    const crBase = carrierRates[carrier];
    const hasFutureBase = oceanBucketHasRates(crBase?.future);
    const polsWithFuture = Object.keys(polCosts).filter(pol =>
      oceanBucketHasRates(polCosts[pol]?.carrier?.[carrier]?.future));
    if (!hasFutureBase && polsWithFuture.length === 0) continue; // 향후 운임 데이터 없음 → 전환 보류 (알림 대상)

    const oldSlot = entry?.current;
    const newSlot = entry?.future;

    for (const pol of Object.keys(polCosts)) {
      const cr = polCosts[pol]?.carrier?.[carrier];
      if (!cr) continue;
      archiveIntoByValidity(cr, oldSlot, newSlot);
      if (oceanBucketHasRates(cr.future)) {
        cr.current = { ...cr.future };
        delete cr.future;
        changedKeys.add("pol_costs");
      }
    }
    if (hasFutureBase) {
      carrierRates[carrier] = {
        ...crBase,
        current: { ...crBase.future },
        future: { coc20: "", coc40: "", soc20: "", soc40: "" },
      };
      changedKeys.add("carrier_rates_json");
    }
    changedKeys.add("pol_costs");

    const { oldLabel, newLabel } = promoteValidity(carrier);
    historyRows.push({
      carrier, pol: "ALL", rate_type: "transition", period: "current", category: "ocean",
      source: "auto-transition",
      note: `자동 전환(해상): ${oldLabel || "이전 구간"} → ${newLabel} · POL ${polsWithFuture.length}건`,
    });
    summary.push(`ocean/${carrier}: ${oldLabel} → ${newLabel}`);
  }

  // 2) Drop off — 선사별 (validity 키: SNK_DROP …)
  for (const carrier of CRS) {
    const dropKey = `${carrier}_DROP`;
    const entry = vi[dropKey];
    const fFrom = parseValidityToISO(entry?.future?.from);
    if (!fFrom || fFrom > today) continue;

    const cr = dropRates[carrier];
    if (!objHasEntries(cr?.future)) continue;

    archiveIntoByValidity(cr, entry?.current, entry?.future);
    cr.current = { ...cr.future };
    cr.future = {};
    changedKeys.add("carrier_drop_rates_json");

    const { oldLabel, newLabel } = promoteValidity(dropKey);
    historyRows.push({
      carrier, pol: "ALL", rate_type: "transition", period: "current", category: "dropoff",
      source: "auto-transition",
      note: `자동 전환(Drop off): ${oldLabel || "이전 구간"} → ${newLabel}`,
    });
    summary.push(`dropoff/${carrier}: ${oldLabel} → ${newLabel}`);
  }

  // 3) Rental
  {
    const entry = vi.RENTAL;
    const fFrom = parseValidityToISO(entry?.future?.from);
    const polsWithFuture = Object.keys(rentalRates).filter(pol => objHasEntries(rentalRates[pol]?.future));
    if (fFrom && fFrom <= today && polsWithFuture.length > 0) {
      for (const pol of polsWithFuture) {
        const bucket = rentalRates[pol];
        // city 단위 덮어쓰기 — future 에 없는 도시는 기존 current 유지
        bucket.current = { ...(bucket.current || {}), ...(bucket.future || {}) };
        bucket.future = {};
      }
      changedKeys.add("rental_rates_json");
      const { oldLabel, newLabel } = promoteValidity("RENTAL");
      historyRows.push({
        carrier: "RENTAL", pol: "ALL", rate_type: "transition", period: "current", category: "rental",
        source: "auto-transition",
        note: `자동 전환(렌탈): ${oldLabel || "이전 구간"} → ${newLabel} · POL ${polsWithFuture.length}건`,
      });
      summary.push(`rental: ${oldLabel} → ${newLabel}`);
    }
  }

  // 4) 만료 처리 — 종료일 지난 current (향후 운임 미도래) → 만료 상태 기록 (데이터 삭제 없음)
  //    고객 화면은 validity till 이 지난 운임을 표시하지 않으므로(클라이언트 필터) 별도 플래그 불필요.
  for (const key of Object.keys(vi)) {
    const entry = vi[key];
    const tillISO = parseValidityToISO(entry?.current?.till);
    if (!tillISO || entry?.current?.furtherNotice) continue;
    if (tillISO >= today) continue;
    if (state.expiredLogged![key] === tillISO) continue; // 이미 기록함
    state.expiredLogged![key] = tillISO;
    changedKeys.add(STATE_KEY);
    const carrier = key.replace("_DROP", "");
    const category = key === "RENTAL" ? "rental" : key.endsWith("_DROP") ? "dropoff" : "ocean";
    historyRows.push({
      carrier, pol: "ALL", rate_type: "expired", period: "current", category,
      source: "auto-transition",
      note: `만료: ${slotLabel(entry?.current)} (차기 운임 미입력 — 고객 화면 비표시)`,
    });
    summary.push(`expired/${key}: till ${tillISO}`);
  }

  const saves: Array<[string, string]> = [];
  if (changedKeys.has("validity_info_json")) saves.push(["validity_info_json", JSON.stringify(vi)]);
  for (const legacy of Object.values(LEGACY_VALIDITY_KEY)) {
    if (changedKeys.has(legacy)) saves.push([legacy, settings[legacy]]);
  }
  if (changedKeys.has("pol_costs")) saves.push(["pol_costs", JSON.stringify(polCosts)]);
  if (changedKeys.has("carrier_rates_json")) saves.push(["carrier_rates_json", JSON.stringify(carrierRates)]);
  if (changedKeys.has("carrier_drop_rates_json")) saves.push(["carrier_drop_rates_json", JSON.stringify(dropRates)]);
  if (changedKeys.has("rental_rates_json")) saves.push(["rental_rates_json", JSON.stringify(rentalRates)]);
  if (changedKeys.has(STATE_KEY)) saves.push([STATE_KEY, JSON.stringify(state)]);

  return { saves, historyRows, summary, dryRun };
}

// ── 만료 임박 알림 ───────────────────────────────────────────────────────────
type AlertRow = { carrier: string; kind: string; tillISO: string; daysLeft: number; missing: number };

function buildAlertRows(settings: Record<string, string>, today: string): AlertRow[] {
  const vi = parseJson(settings.validity_info_json, {}) as Record<string, { current?: Slot; future?: Slot }>;
  const polCosts = parseJson(settings.pol_costs, {}) as Record<string, any>;
  const dropRates = parseJson(settings.carrier_drop_rates_json, {}) as Record<string, any>;
  const rentalRates = parseJson(settings.rental_rates_json, {}) as Record<string, any>;
  const rows: AlertRow[] = [];

  const check = (key: string, carrier: string, kind: string, threshold: number, countMissing: () => number) => {
    const entry = vi[key];
    if (!entry?.current || entry.current.furtherNotice) return;
    const tillISO = parseValidityToISO(entry.current.till);
    if (!tillISO) return;
    const d = daysLeft(tillISO, today);
    if (d > threshold) return; // 아직 임박 아님 (이미 만료된 것도 포함해 계속 알림)
    const missing = countMissing();
    const hasFutureFrom = !!parseValidityToISO(entry.future?.from);
    if (missing === 0 && hasFutureFrom) return; // 차기 운임 입력 완료
    rows.push({ carrier, kind, tillISO, daysLeft: d, missing });
  };

  for (const carrier of CRS) {
    check(carrier, carrier, "해상", 3, () => {
      let missing = 0;
      for (const pol of Object.keys(polCosts)) {
        const cr = polCosts[pol]?.carrier?.[carrier];
        if (!cr) continue;
        for (const t of RATE_TYPES) {
          const cur = cr.current?.[t];
          if (cur == null || cur === "") continue;
          const fut = cr.future?.[t];
          if (fut == null || fut === "") missing++;
        }
      }
      return missing;
    });
    check(`${carrier}_DROP`, carrier, "Drop off", 3, () => {
      let missing = 0;
      const cr = dropRates[carrier];
      for (const city of Object.keys(cr?.current || {})) {
        for (const sk of ["c20", "c40"]) {
          const cur = cr.current[city]?.[sk];
          if (cur == null || cur === "") continue;
          const fut = cr.future?.[city]?.[sk];
          if (fut == null || fut === "") missing++;
        }
      }
      return missing;
    });
  }
  check("RENTAL", "RENTAL", "렌탈", 2, () => {
    let missing = 0;
    for (const pol of Object.keys(rentalRates)) {
      const bucket = rentalRates[pol];
      for (const city of Object.keys(bucket?.current || {})) {
        for (const sk of RENTAL_TYPES) {
          const cur = bucket.current[city]?.[sk];
          if (cur == null || cur === "") continue;
          const fut = bucket.future?.[city]?.[sk];
          if (fut == null || fut === "") missing++;
        }
      }
    }
    return missing;
  });

  return rows;
}

async function sendAlertMail(rows: AlertRow[]) {
  const carriers = [...new Set(rows.map(r => r.carrier))];
  const first = carriers[0] === "RENTAL" ? "렌탈" : carriers[0];
  const subject = `[YSL 운임포털] 차기 운임 미입력 - ${first}${carriers.length > 1 ? ` 외 ${carriers.length - 1}개 선사` : ""}`;

  const tr = rows.map(r => `
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb"><b>${r.carrier === "RENTAL" ? "렌탈" : r.carrier}</b></td>
      <td style="padding:8px;border:1px solid #e5e7eb">${r.kind}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${fmtShortDate(r.tillISO)} 만료${r.daysLeft < 0 ? " (지남!)" : ` (D-${r.daysLeft})`}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;color:#dc2626"><b>미입력 ${r.missing}건</b></td>
    </tr>`).join("");

  const html = `
    <h2>⚠️ 차기 운임 미입력 알림</h2>
    <p>아래 운임의 유효기간이 임박했지만 차기(향후) 운임이 입력되지 않았습니다.</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr style="background:#f3f4f6">
        <th style="padding:8px;border:1px solid #e5e7eb">선사</th>
        <th style="padding:8px;border:1px solid #e5e7eb">구분</th>
        <th style="padding:8px;border:1px solid #e5e7eb">만료</th>
        <th style="padding:8px;border:1px solid #e5e7eb">차기 운임</th>
      </tr>
      ${tr}
    </table>
    <p style="margin-top:16px">
      <a href="${ADMIN_URL}" style="display:inline-block;padding:10px 18px;background:#1e40af;color:#fff;border-radius:8px;text-decoration:none">
        Admin 운임관리 바로가기
      </a>
    </p>
    <p style="color:#9ca3af;font-size:12px">YSL Freight Portal 자동 발송 메일 (매일 09:00 MSK)</p>
  `;

  const sendMail = (recipients: string[]) => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "YSL Portal <onboarding@resend.dev>", to: recipients, subject, html }),
  });

  let res = await sendMail([ADMIN_EMAIL]);
  let data = await res.json();
  // Resend 무료 계정: 도메인 미인증 시 계정 이메일로만 발송 가능 → 폴백
  if (data?.statusCode === 403 && String(data?.message || "").includes("own email address")) {
    res = await sendMail(["gusrns83@gmail.com"]);
    data = await res.json();
  }
  return { subject, resend: data };
}

// ── 엔트리 ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });
    }
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { /* empty body */ } }
    const action = String(body.action || url.searchParams.get("action") || "transition");
    const dryRun = body.dryRun === true || url.searchParams.get("dryRun") === "1";
    const today = String(body.today || url.searchParams.get("today") || mskTodayISO());

    const settings = await loadSettings();

    if (action === "transition") {
      const result = runTransition(settings, today, dryRun);
      if (!dryRun) {
        await saveSettings(result.saves);
        await insertRateHistory(result.historyRows);
      }
      return new Response(JSON.stringify({
        action, today, dryRun,
        changed: result.saves.map(([k]) => k),
        history: result.historyRows.map(r => r.note),
        summary: result.summary,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "alert") {
      const rows = buildAlertRows(settings, today);
      if (rows.length === 0) {
        return new Response(JSON.stringify({ action, today, sent: false, reason: "미입력 0건" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (dryRun) {
        return new Response(JSON.stringify({ action, today, sent: false, dryRun: true, rows }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const mail = await sendAlertMail(rows);
      return new Response(JSON.stringify({ action, today, sent: true, rows, ...mail }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
