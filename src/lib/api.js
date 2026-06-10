import { API_TIMEOUT_MS, SAVE_HEAVY_ATTEMPTS, SAVE_HEAVY_TIMEOUT_MS, SAVE_LIGHT_TIMEOUT_MS, SB_KEY, SB_URL } from "../config.js";
import { RATE_TYPES } from "../data/staticData.js";

const api = async (path, opts = {}) => {
  const { headers: optHeaders, timeoutMs = API_TIMEOUT_MS, ...rest } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...optHeaders,
      },
    });
    const t = await r.text();
    if (!r.ok) throw new Error(t || `HTTP ${r.status}`);
    return t ? JSON.parse(t) : [];
  } catch (e) {
    const msg = String(e?.message || e);
    if (/abort/i.test(msg)) throw new Error(`요청 시간 초과 (${Math.round(timeoutMs / 1000)}초)`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
};


const HEAVY_SETTING_KEYS_LIST = ["pol_costs", "rental_rates_json", "carrier_rates_json"];

/** Supabase settings — 3개 운임 DB 번들 */
const OCEAN_DB_KEYS = [
  "pol_costs", "pol_portal_overrides_json",
  "pol_margins", "pol_margins_future", "global_margins", "area_margins",
  "margin_timestamps", "area_margin_timestamps", "pol_margin_timestamps", "pol_margin_timestamps_future",
  "carrier_rates_json", "validity_info_json", "validity_snk", "validity_dy", "validity_ck",
];
const DROP_DB_KEYS = ["carrier_drop_rates_json", "carrier_drop_margins_json"];
const RENTAL_DB_KEYS = [
  "rental_rates_json", "rental_global_margins", "rental_area_margins", "rental_pol_margins",
  "rental_margin_timestamps", "rental_area_margin_timestamps", "rental_pol_margin_timestamps",
  "validity_rental",
];
const MISC_SETTINGS_KEYS = [
  "notices_json", "notice_text", "notice_on", "notice_file_url", "ad_banners_json", "ad_banner_json",
  "sc_contacts_json",
];
const ALL_PRICING_DB_KEYS = [...new Set([...OCEAN_DB_KEYS, ...DROP_DB_KEYS, ...RENTAL_DB_KEYS])];

const PRICING_LIGHT_KEYS = [
  ...OCEAN_DB_KEYS.filter(k => k !== "pol_costs"),
  ...DROP_DB_KEYS,
  ...RENTAL_DB_KEYS.filter(k => k !== "rental_rates_json"),
];

const settingsMapFromRows = (rows) => {
  if (!Array.isArray(rows)) return {};
  return Object.fromEntries(rows.filter(r => r?.key).map(r => [r.key, r.value]));
};

const fetchSettingsByKey = (key) =>
  api(`settings?select=key,value&key=eq.${encodeURIComponent(key)}`);

const fetchSettingsInKeys = (keys) =>
  api(`settings?select=key,value&key=in.(${keys.join(",")})`);

const fetchSettingsExceptKeys = (excludeKeys) =>
  api(`settings?select=key,value&key=not.in.(${excludeKeys.join(",")})`);

const withTimeout = (promise, ms, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => { setTimeout(() => reject(new Error(message)), ms); }),
  ]);

const compactPolCostO = (polCostO) => {
  if (!polCostO || !Object.keys(polCostO).length) return {};
  const out = {};
  Object.entries(polCostO).forEach(([pol, data]) => {
    if (!data || typeof data !== "object") return;
    const next = {};
    if (data.carrier) {
      const carrier = {};
      Object.entries(data.carrier).forEach(([cr, crData]) => {
        if (!crData || typeof crData !== "object") return;
        const nextCr = {};
        ["current", "future"].forEach(period => {
          if (!crData[period]) return;
          const bucket = {};
          RATE_TYPES.forEach(t => {
            if (crData[period][t] != null && crData[period][t] !== "") bucket[t] = crData[period][t];
          });
          if (crData[period].sell) {
            const sell = {};
            RATE_TYPES.forEach(t => {
              const v = crData[period].sell[t];
              if (v != null && v !== "") sell[t] = v;
            });
            if (Object.keys(sell).length) bucket.sell = sell;
          }
          if (Object.keys(bucket).length) nextCr[period] = bucket;
        });
        RATE_TYPES.forEach(t => {
          if (crData[t] != null && crData[t] !== "") nextCr[t] = crData[t];
        });
        if (crData.byValidity && typeof crData.byValidity === "object") {
          const byValidity = {};
          Object.entries(crData.byValidity).forEach(([vKey, vEntry]) => {
            if (!vEntry || typeof vEntry !== "object") return;
            const archived = {};
            if (vEntry.slot) archived.slot = vEntry.slot;
            if (vEntry.from) archived.from = vEntry.from;
            if (vEntry.till) archived.till = vEntry.till;
            if (vEntry.label) archived.label = vEntry.label;
            if (vEntry.furtherNotice) archived.furtherNotice = true;
            RATE_TYPES.forEach(t => {
              if (vEntry[t] != null && vEntry[t] !== "") archived[t] = vEntry[t];
            });
            if (vEntry.sell) {
              const sell = {};
              RATE_TYPES.forEach(t => {
                const v = vEntry.sell[t];
                if (v != null && v !== "") sell[t] = v;
              });
              if (Object.keys(sell).length) archived.sell = sell;
            }
            if (Object.keys(archived).length) byValidity[vKey] = archived;
          });
          if (Object.keys(byValidity).length) nextCr.byValidity = byValidity;
        }
        if (Object.keys(nextCr).length) carrier[cr] = nextCr;
      });
      if (Object.keys(carrier).length) next.carrier = carrier;
    }
    if (data.rent && Object.keys(data.rent).length) next.rent = data.rent;
    if (data.drop && Object.keys(data.drop).length) next.drop = data.drop;
    if (Object.keys(next).length) out[pol] = next;
  });
  return out;
};

/** pol_costs 선사 버킷에 저장된 sell(매출) 제거 — 매입만 유지 */
const stripSellFromPolCosts = (polCostO) => {
  if (!polCostO || typeof polCostO !== "object") return polCostO || {};
  const out = {};
  Object.entries(polCostO).forEach(([pol, data]) => {
    if (!data || typeof data !== "object") return;
    const next = { ...data };
    if (data.carrier) {
      const carrier = {};
      Object.entries(data.carrier).forEach(([cr, crData]) => {
        if (!crData || typeof crData !== "object") return;
        const nextCr = { ...crData };
        ["current", "future"].forEach(period => {
          if (!nextCr[period] || typeof nextCr[period] !== "object") return;
          const bucket = { ...nextCr[period] };
          delete bucket.sell;
          nextCr[period] = bucket;
        });
        carrier[cr] = nextCr;
      });
      next.carrier = carrier;
    }
    out[pol] = next;
  });
  return out;
};

const SELL_PURGE_REV = "v3";
const needsSellPurge = () => false;

const serializePolCosts = (polCostO) => JSON.stringify(compactPolCostO(polCostO));

const extractPortalOverrides = (polCostO) => {
  const out = {};
  Object.entries(polCostO || {}).forEach(([pol, data]) => {
    if (!data || typeof data !== "object") return;
    const entry = {};
    if (data.rent && Object.keys(data.rent).length) entry.rent = data.rent;
    if (data.drop && Object.keys(data.drop).length) entry.drop = data.drop;
    if (Object.keys(entry).length) out[pol] = entry;
  });
  return out;
};

const mergePortalOverridesIntoPolCostO = (polCostO, overrides) => {
  if (!overrides || !Object.keys(overrides).length) return polCostO || {};
  const out = { ...(polCostO || {}) };
  Object.entries(overrides).forEach(([pol, entry]) => {
    if (!entry || typeof entry !== "object") return;
    out[pol] = { ...(out[pol] || {}), ...entry };
  });
  return out;
};

/** 해상 DB 전용 — carrier 매입·매출·validity 아카이브만 (rent/drop 제외) */
const compactPolCostOceanOnly = (polCostO) => {
  if (!polCostO || !Object.keys(polCostO).length) return {};
  const carrierOnly = {};
  Object.entries(polCostO).forEach(([pol, data]) => {
    if (data?.carrier) carrierOnly[pol] = { carrier: data.carrier };
  });
  return compactPolCostO(carrierOnly);
};

const serializeOceanPolCosts = (polCostO) => JSON.stringify(compactPolCostOceanOnly(polCostO));

const saveOceanPolCostsBundle = async (polCostO, saveFn = saveOneSettingWithRetry) => {
  await saveFn("pol_costs", serializeOceanPolCosts(polCostO));
  await saveFn("pol_portal_overrides_json", JSON.stringify(extractPortalOverrides(polCostO)));
};

const HEAVY_SETTING_KEYS = new Set(["pol_costs", "rental_rates_json", "carrier_rates_json"]);
const EXCEL_UPLOAD_MAX_MS = 90000;

/** Supabase settings 쓰기 — 동시 요청 방지 (Failed to fetch 원인) */
let networkWriteQueue = Promise.resolve();
const resetNetworkWriteQueue = () => {
  networkWriteQueue = Promise.resolve();
};
const enqueueNetworkWrite = (task) => {
  const job = networkWriteQueue.then(task);
  networkWriteQueue = job.catch(() => {});
  return job;
};

/** Excel 업로드 등 — 저장 큐 대기 없이 직접 POST */
const saveSettingDirect = async (key, value) => {
  const strVal = String(value);
  const isHeavy = HEAVY_SETTING_KEYS.has(key);
  const attempts = isHeavy ? SAVE_HEAVY_ATTEMPTS : 3;
  const timeoutMs = isHeavy ? SAVE_HEAVY_TIMEOUT_MS : SAVE_LIGHT_TIMEOUT_MS;
  let lastErr;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1200 * attempt));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${SB_URL}/rest/v1/settings`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ key, value: strVal }),
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const msg = String(e.message || e);
      const retryable = /fetch|Failed|abort|network/i.test(msg);
      if (!retryable) throw new Error(`${key}: ${msg}`);
    }
  }
  const hint = /fetch|Failed|abort|network/i.test(String(lastErr?.message || ""))
    ? " · 네트워크 확인 후 다시 시도"
    : "";
  throw new Error(`Supabase 저장 실패 (${key}) — ${lastErr?.message || "Failed to fetch"}${hint}`);
};

const saveSettingsEntriesDirect = async (entries) => {
  for (const [key, value] of entries) {
    await saveSettingDirect(key, value);
    if (HEAVY_SETTING_KEYS.has(key)) await new Promise(r => setTimeout(r, 200));
  }
};

const saveSettingValue = async (key, value) => enqueueNetworkWrite(async () => {
  const strVal = String(value);
  const isHeavy = HEAVY_SETTING_KEYS.has(key);
  const attempts = isHeavy ? SAVE_HEAVY_ATTEMPTS : 3;
  const timeoutMs = isHeavy ? SAVE_HEAVY_TIMEOUT_MS : SAVE_LIGHT_TIMEOUT_MS;
  let lastErr;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1200 * attempt));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${SB_URL}/rest/v1/settings`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ key, value: strVal }),
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const msg = String(e.message || e);
      const retryable = /fetch|Failed|abort|network/i.test(msg);
      if (!retryable) throw new Error(`${key}: ${msg}`);
    }
  }
  const hint = /fetch|Failed|abort|network/i.test(String(lastErr?.message || ""))
    ? " · 네트워크 일시 오류 (화면값은 캐시 보존 · 💾 저장 재시도)"
    : "";
  throw new Error(`Supabase 연결 실패 (${key}) — ${lastErr?.message || "Failed to fetch"}${hint}`);
});

const postSettingsRows = async (rows, label) => enqueueNetworkWrite(async () => {
  if (!rows.length) return;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 800 * attempt));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), rows.length > 1 ? 45000 : 60000);
    try {
      const res = await fetch(`${SB_URL}/rest/v1/settings`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(await res.text());
      return;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const msg = String(e.message || e);
      if (!msg.includes("fetch") && !msg.includes("Failed") && !msg.includes("abort")) {
        throw new Error(`${label}: ${msg}`);
      }
    }
  }
  for (const row of rows) {
    await saveSettingDirect(row.key, row.value);
  }
});

const saveSettingsEntries = async (entries) => {
  const light = [];
  const heavy = [];
  for (const entry of entries) {
    if (HEAVY_SETTING_KEYS.has(entry[0])) heavy.push(entry);
    else light.push({ key: entry[0], value: String(entry[1]) });
  }
  for (const [key, value] of heavy) {
    await saveOneSettingWithRetry(key, value);
    await new Promise(r => setTimeout(r, 300));
  }
  if (light.length) {
    await postSettingsRows(light, light.map(r => r.key).join(", "));
  }
};

const saveOneSettingWithRetry = (key, value) => saveSettingValue(key, value);


export { ALL_PRICING_DB_KEYS, DROP_DB_KEYS, EXCEL_UPLOAD_MAX_MS, HEAVY_SETTING_KEYS, HEAVY_SETTING_KEYS_LIST, MISC_SETTINGS_KEYS, OCEAN_DB_KEYS, PRICING_LIGHT_KEYS, RENTAL_DB_KEYS, SELL_PURGE_REV, api, compactPolCostO, compactPolCostOceanOnly, enqueueNetworkWrite, extractPortalOverrides, fetchSettingsByKey, fetchSettingsExceptKeys, fetchSettingsInKeys, mergePortalOverridesIntoPolCostO, needsSellPurge, networkWriteQueue, postSettingsRows, resetNetworkWriteQueue, saveOceanPolCostsBundle, saveOneSettingWithRetry, saveSettingDirect, saveSettingValue, saveSettingsEntries, saveSettingsEntriesDirect, serializeOceanPolCosts, serializePolCosts, settingsMapFromRows, stripSellFromPolCosts, withTimeout };
