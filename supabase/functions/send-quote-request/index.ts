import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SB_URL = Deno.env.get("SUPABASE_URL");
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

// ── 남용 방지 설정 ────────────────────────────────────────────────────────────
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10분
const RATE_MAX = 5;                     // IP당 10분 5건
const FALLBACK_EMAIL = "gusrns83@gmail.com";
// CORS 허용 출처 (브라우저 임베드 차단용 — curl 은 무관하므로 레이트리밋이 본 방어선)
const ALLOWED_ORIGINS = [
  "https://ysl-freight-portal.vercel.app",
  "https://ysl-staff.vercel.app",
];

const corsHeaders = (origin: string | null) => {
  const allow = origin && (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]*ysl[a-z0-9-]*\.vercel\.app$/i.test(origin))
    ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const escapeHtml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// 문자열 강제 + 트림 + 길이 제한 (과대 입력·인젝션 방어)
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

const sbHeaders = {
  apikey: SB_SERVICE_KEY || "",
  Authorization: `Bearer ${SB_SERVICE_KEY || ""}`,
  "Content-Type": "application/json",
};

// service_role 로 직원 수신 이메일 조회 (anon 미노출)
async function fetchStaffEmails(): Promise<string[]> {
  try {
    if (!SB_URL || !SB_SERVICE_KEY) return [];
    const r = await fetch(`${SB_URL}/rest/v1/settings?select=value&key=eq.quote_staff_emails`, { headers: sbHeaders });
    if (!r.ok) return [];
    const rows = await r.json();
    const raw = rows?.[0]?.value;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e: unknown) => typeof e === "string" && (e as string).trim()) : [];
  } catch { return []; }
}

// 견적 요청을 quote_requests 에 service_role 로 저장 (anon 직접 INSERT 차단 대체)
async function insertQuote(f: Record<string, string>, customerEmail: string): Promise<void> {
  try {
    if (!SB_URL || !SB_SERVICE_KEY) return;
    await fetch(`${SB_URL}/rest/v1/quote_requests`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        customer_email: customerEmail,
        container_qty: f.containerQty || null,
        cargo_name: f.cargoName || null,
        target_rate: f.targetRate || null,
        pol: f.pol || null,
        pod: f.pod || null,
        carrier: f.carrier || null,
        rate_type: f.rateType || null,
        current_rate: f.currentRate || null,
        etd_from: f.etdFrom || null,
        etd_to: f.etdTo || null,
        comment: f.comment || null,
      }),
    });
  } catch { /* 저장 실패해도 메일 발송은 진행 */ }
}

// IP 레이트리밋 — 윈도 내 건수 초과 시 true(차단). service_role 없으면 fail-open(스킵).
async function isRateLimited(ip: string): Promise<boolean> {
  try {
    if (!SB_URL || !SB_SERVICE_KEY || ip === "unknown") return false;
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const q = `${SB_URL}/rest/v1/quote_rate_limit?select=id&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${since}`;
    const r = await fetch(q, { headers: sbHeaders });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length >= RATE_MAX) return true;
    }
    // 기록 + 가끔 오래된 행 청소(테이블 비대 방지)
    await fetch(`${SB_URL}/rest/v1/quote_rate_limit`, { method: "POST", headers: { ...sbHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ ip }) });
    if (Math.random() < 0.05) {
      const old = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await fetch(`${SB_URL}/rest/v1/quote_rate_limit?created_at=lt.${old}`, { method: "DELETE", headers: { ...sbHeaders, Prefer: "return=minimal" } });
    }
    return false;
  } catch { return false; }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    // 본문 크기 가드 (과대 페이로드 거부)
    const rawBody = await req.text();
    if (rawBody.length > 8000) return new Response(JSON.stringify({ error: "payload too large" }), { status: 413, headers: { ...cors, "Content-Type": "application/json" } });
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(rawBody || "{}"); } catch { return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }

    // 입력 검증·정제
    const customerEmail = clean(body.customerEmail, 254);
    if (!isEmail(customerEmail)) return new Response(JSON.stringify({ error: "invalid email" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const f = {
      pol: clean(body.pol, 80), pod: clean(body.pod, 80), carrier: clean(body.carrier, 60),
      rateType: clean(body.rateType, 120), currentRate: clean(body.currentRate, 60),
      containerQty: clean(body.containerQty, 60), cargoName: clean(body.cargoName, 200),
      targetRate: clean(body.targetRate, 60), comment: clean(body.comment, 2000),
      etdFrom: clean(body.etdFrom, 40), etdTo: clean(body.etdTo, 40),
    };

    // 레이트리밋
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    if (await isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: "too many requests", retryAfterMin: RATE_WINDOW_MS / 60000 }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // 견적 요청을 DB에 저장 (anon 직접 INSERT 대신 service_role 로 — 검증·레이트리밋 통과분만)
    await insertQuote(f, customerEmail);

    const fmtEtd = (v: string) => {
      if (!v) return "";
      const d = new Date(v);
      if (isNaN(d.getTime())) return v;
      const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
      return `${d.getDate()}.${mon}`;
    };
    const etdLabel = f.etdFrom || f.etdTo ? [fmtEtd(f.etdFrom), fmtEtd(f.etdTo)].filter(Boolean).join(" - ") : "-";

    const staffEmails = await fetchStaffEmails();
    const to = staffEmails.length ? staffEmails : [FALLBACK_EMAIL];

    const row = (label: string, v: string) => `<tr><td><b>${label}</b></td><td>${escapeHtml(v) || "-"}</td></tr>`;
    const html = `
      <h2>새 견적 요청</h2>
      <table border="1" cellpadding="8" style="border-collapse:collapse">
        ${row("고객 이메일", customerEmail)}
        ${row("POL", f.pol)}
        ${row("POD", f.pod)}
        <tr><td><b>ETD (희망 스케줄)</b></td><td>${escapeHtml(etdLabel)}</td></tr>
        ${row("선사", f.carrier)}
        ${row("운임 유형", f.rateType)}
        <tr><td><b>현재 운임</b></td><td>${f.currentRate ? `${escapeHtml(f.currentRate)} USD` : "-"}</td></tr>
        ${row("컨테이너 수량", f.containerQty)}
        ${row("화물명", f.cargoName)}
        <tr><td><b>Target 운임</b></td><td>${f.targetRate ? `${escapeHtml(f.targetRate)} USD` : "-"}</td></tr>
        <tr><td><b>Comment</b></td><td>${f.comment ? escapeHtml(f.comment).replace(/\n/g, "<br>") : "-"}</td></tr>
      </table>
      <p>YSL Freight Portal 자동 발송 메일</p>
    `;

    const sendMail = (recipients: string[]) => fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "YSL Portal <onboarding@resend.dev>",
        to: recipients,
        subject: `[견적요청] ${f.pol} ${f.carrier} - ${customerEmail}`.slice(0, 200),
        html,
      }),
    });

    let res = await sendMail(to);
    let data = await res.json();
    if (data?.statusCode === 403 && String(data?.message || "").includes("own email address")) {
      res = await sendMail([FALLBACK_EMAIL]);
      data = await res.json();
      if (data?.id) data = { ...data, fallback: "staff emails blocked (domain not verified) — sent to account email" };
    }
    return new Response(JSON.stringify(data), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
