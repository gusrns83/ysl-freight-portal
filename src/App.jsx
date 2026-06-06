import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  UPLOAD_FORMATS,
  readExcelFile,
  parseByFormat,
  suggestSheet,
  suggestYslSheet,
  previewSummary,
  mergePolCostsCarrier,
  mergePolCostsWithSells,
  mergePolMarginsMap,
  buildDyDropRates,
  buildRentalRatesFromBases,
  mergeRentalRatesPatch,
  buildRateHistoryRowsFromUpload,
} from "./excelUpload";

const SB_URL = "https://mmswsopevmyreoygovpa.supabase.co";
const SB_KEY = "sb_publishable_XaUcvApLXTrJ5lRhte7YXQ_Bqmj_IEq";
const ADMIN_PIN = "0000";
const ADMIN_SKIP_PIN = true; // 검토용 — 배포 전 false 로 변경
const ADMIN_SAVE_REV = "save-v23b"; // Admin 저장 로직 버전 (배포 확인용)
const SAVE_UI_MAX_MS = 90000;
const SAVE_HEAVY_ATTEMPTS = 3;
const SAVE_HEAVY_TIMEOUT_MS = 45000;
const SAVE_LIGHT_TIMEOUT_MS = 30000;
const rentSocType = (si) => (si === 0 ? "soc20" : "soc40");
const rentRentalType = (si) => (si === 0 ? "r20" : "r40");
const PRICING_CACHE_KEY = "ysl_pricing_cache_v1";

const readStoredPricingCache = () => {
  try {
    const raw = localStorage.getItem(PRICING_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    return cache?.v === 1 ? cache : null;
  } catch {
    return null;
  }
};

const DEFAULT_MARGINS = { coc20: 80, coc40: 100, soc20: 80, soc40: 100 };

const ADMIN_SESSION_KEY = "ysl_admin_session";
const NOTICE_COUNT = 3;
const mkNotices = () => Array.from({ length: NOTICE_COUNT }, (_, i) => ({
  text: "",
  on: false,
  fileUrl: "",
  title: `Notice ${i + 1}`,
}));

const parseNoticeOn = (v) => v === true || v === "true";

const AD_COUNT = 3;
const AD_ROTATE_MS = 10000;

const mkAds = () => Array.from({ length: AD_COUNT }, (_, i) => ({
  imageUrl: "",
  linkUrl: "",
  on: false,
  title: `Ad ${i + 1}`,
}));

const parseAdsFromSettings = (s) => {
  const base = mkAds();
  if (s.ad_banners_json) {
    try {
      const parsed = JSON.parse(s.ad_banners_json);
      if (Array.isArray(parsed)) {
        return base.map((n, i) => {
          const p = parsed[i];
          if (!p) return n;
          return {
            ...n,
            imageUrl: p.imageUrl ?? "",
            linkUrl: p.linkUrl ?? "",
            title: p.title || n.title,
            on: parseNoticeOn(p.on),
          };
        });
      }
    } catch (e) {}
  }
  if (s.ad_banner_json) {
    try {
      const p = JSON.parse(s.ad_banner_json);
      base[0] = {
        ...base[0],
        imageUrl: p.imageUrl ?? "",
        linkUrl: p.linkUrl ?? "",
        title: p.title || base[0].title,
        on: parseNoticeOn(p.on),
      };
    } catch (e) {}
  }
  return base;
};

function FooterAdSlot({ ads, dismissed, onDismiss }) {
  const slotRef = useRef(null);
  const activeAds = useMemo(
    () => (ads || []).filter(a => a.on && a.imageUrl),
    [ads]
  );
  const [idx, setIdx] = useState(0);
  const cur = activeAds[idx] || activeAds[0];

  useEffect(() => {
    setIdx(0);
  }, [activeAds.map(a => `${a.imageUrl}|${a.linkUrl}|${a.on}`).join(";")]);

  useEffect(() => {
    if (activeAds.length <= 1) return undefined;
    const t = setInterval(() => {
      setIdx(i => (i + 1) % activeAds.length);
    }, AD_ROTATE_MS);
    return () => clearInterval(t);
  }, [activeAds.length]);

  useEffect(() => {
    if (dismissed || !activeAds.length) {
      document.documentElement.style.removeProperty("--app-ad-h");
      return undefined;
    }
    const el = slotRef.current;
    if (!el) return undefined;
    const syncHeight = () => {
      document.documentElement.style.setProperty("--app-ad-h", `${el.offsetHeight}px`);
    };
    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dismissed, activeAds.length, cur?.imageUrl, cur?.linkUrl]);

  if (dismissed || !cur) return null;

  const media = (
    <img
      key={cur.imageUrl}
      src={cur.imageUrl}
      alt=""
      className="app-ad-image"
    />
  );

  return (
    <section ref={slotRef} className="app-ad-slot" aria-label="Advertisement">
      <div className="app-ad-slot-inner">
        <div className="app-ad-media-wrap">
          <button
            type="button"
            className="app-ad-close"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
            aria-label="광고 닫기"
          >
            ×
          </button>
          {activeAds.length > 1 && (
            <div className="app-ad-dots" aria-hidden>
              {activeAds.map((_, i) => (
                <span key={i} className={`app-ad-dot${i === idx ? " app-ad-dot--on" : ""}`} />
              ))}
            </div>
          )}
          {cur.linkUrl ? (
            <a
              href={cur.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="app-ad-link"
            >
              {media}
            </a>
          ) : media}
        </div>
      </div>
    </section>
  );
}

const api = async (path, opts = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation", ...opts.headers },
    ...opts,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t || `HTTP ${r.status}`);
  return t ? JSON.parse(t) : [];
};

const HEAVY_SETTING_KEYS_LIST = ["pol_costs", "rental_rates_json", "carrier_rates_json"];

const PRICING_LIGHT_KEYS = [
  "global_margins", "area_margins", "pol_margins", "pol_margins_future",
  "margin_timestamps", "area_margin_timestamps", "pol_margin_timestamps", "pol_margin_timestamps_future",
  "rental_global_margins", "rental_area_margins", "rental_pol_margins",
  "rental_margin_timestamps", "rental_area_margin_timestamps", "rental_pol_margin_timestamps",
  "validity_info_json", "validity_snk", "validity_dy", "validity_ck", "validity_rental",
  "carrier_drop_rates_json", "carrier_drop_margins_json",
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

const serializePolCosts = (polCostO) => JSON.stringify(compactPolCostO(polCostO));

const HEAVY_SETTING_KEYS = new Set(["pol_costs", "rental_rates_json", "carrier_rates_json"]);

/** Supabase settings 쓰기 — 동시 요청 방지 (Failed to fetch 원인) */
let networkWriteQueue = Promise.resolve();
const enqueueNetworkWrite = (task) => {
  const job = networkWriteQueue.then(task);
  networkWriteQueue = job.catch(() => {});
  return job;
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
  throw new Error(`Supabase 연결 실패 (${label}) — ${lastErr?.message || "Failed to fetch"}`);
});

const saveSettingsEntries = async (entries) => {
  const light = [];
  const flushLight = async () => {
    if (!light.length) return;
    const chunk = light.splice(0, light.length);
    await postSettingsRows(chunk, chunk.map(r => r.key).join(", "));
  };
  for (const entry of entries) {
    if (HEAVY_SETTING_KEYS.has(entry[0])) {
      await flushLight();
      await saveSettingValue(entry[0], entry[1]);
      await new Promise(r => setTimeout(r, 300));
    } else {
      light.push({ key: entry[0], value: String(entry[1]) });
    }
  }
  await flushLight();
};

const saveOneSettingWithRetry = (key, value) => saveSettingValue(key, value);

const RC = ["Moscow","Chelyabinsk","Novosibirsk","Irkutsk","Krasnoyarsk","Ekaterinburg","Vladivostok","St.Petersburg","Samara","Tolyatti","Kazan","Minsk"];
const FR = [
  ["KOREA","BUSAN",950,1300,800,930,1000,1400,850,1150,1100,1650,1000,1500],
  ["KOREA","INCHEON",1250,1650,null,null,1150,1600,1000,1350,null,null,null,null],
  ["KOREA","KWANGYANG",null,null,null,null,1150,1600,1000,1350,null,null,null,null],
  ["N.CHINA","SHANGHAI",1250,1750,1100,1550,1350,1800,1250,1650,1420,1950,1320,1750],
  ["N.CHINA","QINGDAO",1300,1750,1100,1350,1350,1800,1250,1650,1570,2100,1420,2050],
  ["N.CHINA","TIANJIN",1250,1750,1100,1350,1350,1800,1250,1650,1470,2000,1270,1700],
  ["N.CHINA","DALIAN",1250,1750,1100,1550,1350,1800,1250,1650,1470,2000,1270,1700],
  ["N.CHINA","NINGBO",1250,1750,1100,1550,1350,1800,1250,1650,1420,1950,1320,1750],
  ["N.CHINA","NANJING",1250,1770,1200,1750,1400,1850,1250,1650,null,null,null,null],
  ["N.CHINA","YANGZHOU",1550,2050,null,null,null,null,null,null,null,null,null,null],
  ["N.CHINA","ZHANGJIAGANG",1250,1800,1200,1750,1400,1850,1250,1650,1650,2200,1450,1850],
  ["N.CHINA","TAICANG",null,null,null,null,1450,1950,1350,1800,1650,2200,1450,1850],
  ["N.CHINA","LIANYUNGANG",null,null,null,null,1400,1850,1250,1650,1650,2200,1400,1850],
  ["N.CHINA","YANTAI",null,null,null,null,1350,1800,1250,1650,null,null,null,null],
  ["N.CHINA","CHONGQING",1900,2550,1850,2450,null,null,null,null,null,null,null,null],
  ["S.CHINA","SHEKOU",1350,1800,1300,1650,1450,1900,1350,1750,1470,2000,1420,1950],
  ["S.CHINA","XIAMEN",1350,1800,1300,1650,1450,1900,1350,1750,1470,2000,1420,1850],
  ["S.CHINA","NANSHA",1350,1800,1300,1700,1500,2000,1400,1850,1750,2400,1550,2200],
  ["S.CHINA","YANTIAN",null,1950,null,null,null,null,null,null,null,null,null,null],
  ["S.CHINA","HONGKONG",2400,2950,2300,2850,1450,1900,1350,1750,1400,2000,1300,1800],
  ["S.CHINA","SHANTOU",1350,1950,1300,1700,null,null,null,null,1470,2000,1320,1750],
  ["S.CHINA","FUZHOU",null,null,null,null,null,null,null,null,1520,2050,1370,1800],
  ["S.CHINA","HUANGPU/PRD",1350,1950,1300,1700,null,null,null,null,1670,2200,1470,1900],
  ["S.CHINA","QINZHOU",null,null,null,null,null,null,null,null,1620,2100,1470,2000],
  ["JAPAN","TOKYO",1600,1800,1600,1800,1600,1950,1550,1900,1625,1950,1525,1850],
  ["JAPAN","YOKOHAMA",1600,1800,1600,1800,1600,1950,1550,1900,1625,1950,1525,1850],
  ["JAPAN","NAGOYA",1600,1800,1600,1800,1600,1950,1550,1900,1625,1950,1525,1850],
  ["JAPAN","OSAKA",1600,1800,1600,1800,1600,1950,1550,1900,1625,1950,1525,1850],
  ["JAPAN","KOBE",1600,1800,1600,1800,1600,1950,1550,1900,1625,1950,1525,1850],
  ["JAPAN","HAKATA",1600,1800,1600,1800,1600,1950,1550,1900,1725,2050,1625,1950],
  ["JAPAN","MOJI",1600,1800,1600,1800,1600,1950,1550,1900,1725,2050,1625,1950],
  ["JAPAN","NIIGATA",1600,1800,1600,1800,1700,2050,1650,2000,1725,2050,1625,1950],
  ["JAPAN","TOMAKOMAI",1600,1800,1600,1800,1700,2050,1650,2000,1725,2050,1625,1950],
  ["JAPAN","SHIMIZU",1600,1800,1600,1800,1700,2050,1650,2000,1625,1950,1525,1850],
  ["JAPAN","YOKKACHI",null,null,null,null,null,null,null,null,1625,1950,1525,1850],
  ["JAPAN","AKITA",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","CHIBA",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","HIROSHIMA",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","IYOMISHIMA",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","KANAZAWA",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","MAIZURU",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","MIZUSHIMA",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","NAOETSU",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","SAKAIMINATO",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","TAKAMATSU",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","TOYOHASHI",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","TOYAMASHINKO",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","TSURUGA",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["JAPAN","WAKAYAMA",null,null,null,null,null,null,null,null,1725,2050,1625,1950],
  ["VIETNAM","HOCHIMINH",1200,1650,1100,1450,1400,1950,1300,1800,1350,1950,1250,1750],
  ["VIETNAM","HAIPHONG",1200,1750,1100,1550,1400,1950,1300,1800,1350,1950,1250,1750],
  ["VIETNAM","DANANG",2100,2750,2000,2550,1800,2450,1650,2300,null,null,null,null],
  ["TAIWAN","KEELUNG",1500,1950,1400,1750,null,null,null,null,1550,2200,1500,1900],
  ["TAIWAN","KAOHSIUNG",1500,1950,1400,1750,null,null,null,null,null,null,null,null],
  ["TAIWAN","TAICHUNG",1800,2100,1700,2000,null,null,null,null,null,null,null,null],
  ["THAILAND","BANGKOK",1400,1850,1100,1500,1400,1950,1300,1800,1400,2000,1250,1750],
  ["THAILAND","LAEM CHABANG",1400,1850,1100,1500,1400,1950,1300,1800,1350,1950,1250,1750],
  ["INDONESIA","JAKARTA",1500,1950,1400,1750,null,null,null,null,1550,2300,1550,2300],
  ["INDONESIA","SURABAYA",1500,1950,1400,1750,null,null,null,null,1550,2300,1550,2300],
  ["INDONESIA","SEMARANG",1800,2350,1700,2150,null,null,null,null,1550,2500,1450,2000],
  ["INDONESIA","BELAWAN",1800,2350,1700,2150,null,null,null,null,null,null,null,null],
  ["INDONESIA","PANJANG",1800,2350,1700,2150,null,null,null,null,null,null,null,null],
  ["INDONESIA","MAKASSAR",1800,2350,1700,2150,null,null,null,null,null,null,null,null],
  ["INDONESIA","PALEMBANG",1800,2350,1700,2150,null,null,null,null,null,null,null,null],
  ["OTHERS","SINGAPORE",1800,2250,1700,2050,null,null,null,null,null,null,null,null],
  ["OTHERS","MANILA",1800,2250,1700,2050,null,null,null,null,null,null,null,null],
  ["OTHERS","MALAYSIA (P.KLANG)",1800,2250,1700,2050,null,null,null,null,null,null,null,null],
  ["OTHERS","PASIR GUDANG",1600,2250,1700,2050,null,null,null,null,null,null,null,null],
  ["OTHERS","PENANG",1600,2250,1700,2050,null,null,null,null,null,null,null,null],
  ["OTHERS","TANJUNG PELEPAS",1800,2250,1700,2050,null,null,null,null,null,null,null,null],
  ["OTHERS","CHATTOGRAM",1900,2250,1800,2150,null,null,null,null,null,null,null,null],
  ["OTHERS","INDIA (MUNDRA)",1800,2250,1700,2250,null,null,null,null,null,null,null,null],
  ["OTHERS","NHAVA SHEVA",1800,2250,1700,2250,null,null,null,null,null,null,null,null],
  ["OTHERS","INDIA (CHENNAI)",2100,2750,2000,2550,null,null,null,null,null,null,null,null],
  ["OTHERS","JEBEL ALI",2600,3750,2500,3550,null,null,null,null,null,null,null,null],
];
const RN = [
  ["Shanghai",680,380,280,80,80,380,80,380,380,380,280,480,1075,975,875,675,675,825,775,775,975,975,875,925],
  ["Ningbo",680,380,280,80,80,380,80,380,380,380,280,480,1075,975,875,675,675,825,775,775,975,975,875,925],
  ["Qingdao",720,420,320,120,120,420,120,420,420,420,320,520,1100,1000,900,700,700,850,800,800,1000,1000,900,950],
  ["Tianjin",750,450,350,150,150,450,150,450,450,450,350,550,1200,1100,1000,800,800,950,900,900,1100,1100,1000,1050],
  ["Dalian",750,450,350,150,150,450,150,450,450,450,350,550,1150,1050,950,750,750,900,850,850,1050,1050,950,1000],
  ["Shenzhen",650,350,250,50,50,350,50,350,350,350,250,450,1050,950,850,650,650,800,750,750,950,950,850,900],
  ["Xiamen",650,350,250,50,50,350,50,350,350,350,250,450,1050,950,850,650,650,800,750,750,950,950,850,900],
  ["Huangpu",650,350,250,50,50,350,50,350,350,350,250,450,1100,1000,900,700,700,850,800,800,1000,1000,900,950],
  ["Nansha",680,380,280,80,80,380,80,380,380,380,280,480,1050,950,850,650,650,800,750,750,950,950,850,900],
  ["Yantian",650,350,250,50,50,350,50,350,350,350,250,450,1050,950,850,650,650,800,750,750,950,950,850,900],
  ["Chengdu",850,550,450,250,250,550,250,550,550,550,450,650,1200,1100,1000,800,800,950,900,900,1100,1100,1000,1100],
  ["Chongqing",800,500,400,200,200,500,200,500,500,500,400,600,1350,1250,1150,950,950,1100,1050,1050,1250,1250,1150,1200],
  ["Wuhan",930,630,530,330,330,630,330,630,630,630,530,730,1300,1200,1100,900,900,1050,1000,1000,1200,1200,1100,1150],
  ["Keelung",780,480,380,180,180,480,180,480,480,480,380,580,1080,980,880,680,680,830,780,780,980,980,880,930],
  ["Kaohsiung",730,430,330,130,130,430,130,430,430,430,330,530,1030,930,830,630,630,780,730,730,930,930,830,880],
  ["Busan",750,450,350,150,150,450,150,450,450,450,350,550,1200,1100,1000,800,800,950,900,900,1100,1100,1000,1050],
  ["Yokohama",800,500,400,200,200,500,200,500,500,500,400,600,1500,1400,1300,1100,1100,1250,1200,1200,1400,1400,1300,1350],
  ["Kobe",800,500,400,200,200,500,200,500,500,500,400,600,1500,1400,1300,1100,1100,1250,1200,1200,1400,1400,1300,1350],
  ["Osaka",800,500,400,200,200,500,200,500,500,500,400,600,1500,1400,1300,1100,1100,1250,1200,1200,1400,1400,1300,1350],
  ["Nagoya",800,500,400,200,200,500,200,500,500,500,400,600,1500,1400,1300,1100,1100,1250,1200,1200,1400,1400,1300,1350],
  ["Ho Chi Minh",650,350,250,50,50,350,50,350,350,350,250,450,1000,900,800,600,600,750,700,700,900,900,800,850],
  ["Haiphong",650,350,250,50,50,350,50,350,350,350,250,450,1000,900,800,600,600,750,700,700,900,900,800,850],
  ["Jakarta",720,420,320,120,120,420,120,420,420,420,320,520,1000,900,800,600,600,800,750,750,900,900,800,850],
  ["Surabaya",875,575,475,275,275,575,275,575,575,575,475,675,1050,950,850,650,650,800,750,750,950,950,850,900],
  ["Port Kelang",720,420,320,120,120,420,120,420,420,420,320,520,1050,950,850,650,650,800,750,750,950,950,850,900],
  ["Pasir Gudang",800,500,400,200,200,500,200,500,500,500,400,600,1100,1000,900,700,700,850,800,800,1000,1000,900,950],
  ["Laem Chabang",750,450,350,150,150,450,150,450,450,450,350,550,1050,950,850,650,650,800,750,750,950,950,850,900],
  ["Bangkok",720,420,320,120,120,420,120,420,420,420,320,520,1050,950,850,650,650,800,750,750,950,950,850,900],
  ["Mundra",775,475,375,175,175,475,175,475,475,475,375,575,1300,1200,1100,900,900,1050,1000,1000,1200,1200,1100,1150],
  ["Chennai",750,450,350,150,150,450,150,450,450,450,350,550,1250,1150,1050,850,850,1000,950,950,1150,1150,1050,1100],
  ["Nhava Sheva",700,400,300,100,100,400,100,400,400,400,300,500,1200,1100,1000,800,800,950,900,900,1100,1100,1000,1050],
];
const PM = {"Shanghai":"SHANGHAI","Ningbo":"NINGBO","Qingdao":"QINGDAO","Tianjin":"TIANJIN","Dalian":"DALIAN","Shenzhen":"SHEKOU","Xiamen":"XIAMEN","Huangpu":"HUANGPU/PRD","Nansha":"NANSHA","Chongqing":"CHONGQING","Keelung":"KEELUNG","Kaohsiung":"KAOHSIUNG","Busan":"BUSAN","Yokohama":"YOKOHAMA","Kobe":"KOBE","Osaka":"OSAKA","Nagoya":"NAGOYA","Ho Chi Minh":"HOCHIMINH","Haiphong":"HAIPHONG","Jakarta":"JAKARTA","Surabaya":"SURABAYA","Laem Chabang":"LAEM CHABANG","Bangkok":"BANGKOK","Port Kelang":"MALAYSIA (P.KLANG)","Mundra":"INDIA (MUNDRA)","Chennai":"INDIA (CHENNAI)","Nhava Sheva":"NHAVA SHEVA","Pasir Gudang":"PASIR GUDANG"};
const DO = {mow:{SNK:[1100,1400],DY:[800,1400],CK:[950,1300]},spb:{SNK:[700,1000],DY:null,CK:null},nsb:{SNK:[700,1000],DY:[400,600],CK:[400,600]},ekb:{SNK:null,DY:null,CK:[550,800]}};
const CRS = ["SNK","DY","CK"];
const VALIDITY_KEYS = [...CRS, "RENTAL"];
const RATE_TYPES = ["coc20","coc40","soc20","soc40"];
const RENTAL_RATE_TYPES = ["r20", "r40"];
const rentalRateLabel = (t) => (t === "r20" ? "20'" : "40'");
const defaultRentalMargins = () => ({ r20: 80, r40: 100 });
const FURTHER_NOTICE_LABEL = "Further notice";

const defaultValiditySlot = () => ({ from: "", till: "", furtherNotice: false });

const normalizeValiditySlot = (slot) => {
  if (!slot) return defaultValiditySlot();
  if (typeof slot === "string") {
    const s = slot.trim();
    if (!s) return defaultValiditySlot();
    if (/further\s*notice/i.test(s)) return { from: "", till: "", furtherNotice: true };
    if (/^from\s/i.test(s)) return { from: s, till: "", furtherNotice: false };
    if (/^till\s/i.test(s)) return { from: "", till: s, furtherNotice: false };
    return { from: "", till: s, furtherNotice: false };
  }
  return {
    from: slot.from ?? "",
    till: slot.till ?? "",
    furtherNotice: !!slot.furtherNotice,
  };
};

const normalizeValidityCarrier = (raw) => ({
  current: normalizeValiditySlot(raw?.current),
  future: normalizeValiditySlot(raw?.future),
});

const formatValiditySlotLabel = (slot) => {
  const s = normalizeValiditySlot(slot);
  if (s.furtherNotice && !s.from && !s.till) return FURTHER_NOTICE_LABEL;
  const fromPart = s.from || "";
  const tillPart = s.furtherNotice ? FURTHER_NOTICE_LABEL : (s.till || "");
  if (fromPart && tillPart) return `${fromPart} - ${tillPart}`;
  if (fromPart) return fromPart;
  if (tillPart) return tillPart;
  return "";
};

/** 게스트 운임표: 01.06.26 - 15.06.26 */
const compactValidityDatePart = (str) => {
  if (!str) return "";
  const iso = parseValidityToISO(str);
  if (iso) {
    const [y, mo, d] = iso.split("-");
    return `${String(parseInt(d, 10)).padStart(2, "0")}.${mo}.${y.slice(-2)}`;
  }
  const m = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const d = String(parseInt(m[1], 10)).padStart(2, "0");
    const mo = String(parseInt(m[2], 10)).padStart(2, "0");
    const y = m[3].length === 4 ? m[3].slice(-2) : m[3];
    return `${d}.${mo}.${y}`;
  }
  return "";
};

const formatValidityCompact = (slot) => {
  const s = normalizeValiditySlot(slot);
  if (s.furtherNotice && !s.from && !s.till) return FURTHER_NOTICE_LABEL;
  const from = compactValidityDatePart(s.from);
  const till = s.furtherNotice ? FURTHER_NOTICE_LABEL : compactValidityDatePart(s.till);
  if (from && till && till !== FURTHER_NOTICE_LABEL) return `${from} - ${till}`;
  if (from && till === FURTHER_NOTICE_LABEL) return `${from} - ${till}`;
  if (from && !till) return `${from} -`;
  if (till) return till;
  if (from) return from;
  return "";
};

const defaultValidityInfo = () => Object.fromEntries(VALIDITY_KEYS.map(k => [k, {
  current: {
    from: "",
    till: k === "SNK" ? "Till 15.06.2026" : "Till 30.06.2026",
    furtherNotice: false,
  },
  future: {
    from: k === "SNK" ? "From 16.06.2026" : (k === "CK" ? "From 16.06.2026" : "From 01.07.2026"),
    till: "Till 30.06.2026",
    furtherNotice: false,
  },
}]));
const defaultCarrierRates = () => Object.fromEntries(CRS.map(k => [k, {
  current: { coc20: "", coc40: "", soc20: "", soc40: "" },
  future: { coc20: "", coc40: "", soc20: "", soc40: "" },
}]));
const buildDefaultRentalRates = () => {
  const rates = {};
  RN.forEach(row => {
    const pol = row[0];
    const current = {};
    RC.forEach((city, i) => {
      const c20 = row[1 + i];
      const c40 = row[13 + i];
      if (c20 != null || c40 != null) current[city] = { c20: c20 ?? "", c40: c40 ?? "" };
    });
    rates[pol] = { current, future: {} };
  });
  return rates;
};
const mergeRentalRates = (base, saved) => {
  const next = { ...base };
  Object.entries(saved || {}).forEach(([pol, periods]) => {
    next[pol] = { current: { ...(next[pol]?.current || {}) }, future: { ...(next[pol]?.future || {}) } };
    ["current", "future"].forEach(p => {
      Object.entries(periods?.[p] || {}).forEach(([city, vals]) => {
        next[pol][p][city] = { ...(next[pol][p][city] || {}), ...vals };
      });
    });
  });
  return next;
};
const CN = {SNK:"Sinokor",DY:"Dongyoung",CK:"CK Line",RENTAL:"Container Rental"};
const CN_KR = {SNK:"장금상선",DY:"동영해운",CK:"CK Line",RENTAL:"Rental"};
const CARRIER_CALL_PORTS = {
  SNK: ["VMTP", "Fishery", "PL", "VMPP"],
  DY: ["VMTP", "Fishery"],
  CK: ["VMTP", "Fishery"],
};
const DOC = [{k:"mow",l:"Moscow"},{k:"spb",l:"SPB"},{k:"nsb",l:"Novosibirsk"},{k:"ekb",l:"Ekaterinburg"}];

const defaultCarrierDropRates = () => Object.fromEntries(CRS.map(cr => [cr, {
  current: Object.fromEntries(
    DOC.filter(({ k }) => DO[k]?.[cr]).map(({ k }) => [k, { c20: DO[k][cr][0], c40: DO[k][cr][1] }])
  ),
  future: {},
}]));

const defaultCarrierDropMargins = () => Object.fromEntries(
  CRS.map(cr => [cr, Object.fromEntries(DOC.map(({ k }) => [k, { c20: 0, c40: 0 }]))])
);

const mergeCarrierDropRates = (saved) => {
  const next = defaultCarrierDropRates();
  Object.entries(saved || {}).forEach(([cr, periods]) => {
    if (!next[cr]) next[cr] = { current: {}, future: {} };
    ["current", "future"].forEach(p => {
      Object.entries(periods?.[p] || {}).forEach(([city, vals]) => {
        next[cr][p][city] = { ...(next[cr][p][city] || {}), ...vals };
      });
    });
  });
  return next;
};

const mergeCarrierDropMargins = (saved) => {
  const next = defaultCarrierDropMargins();
  Object.entries(saved || {}).forEach(([cr, cities]) => {
    if (!next[cr]) next[cr] = {};
    Object.entries(cities || {}).forEach(([city, vals]) => {
      next[cr][city] = { ...(next[cr][city] || { c20: 0, c40: 0 }), ...vals };
    });
  });
  return next;
};
const F_TO_R = Object.fromEntries(Object.entries(PM).map(([rental, freight]) => [freight, rental]));
const DOC_RC = {mow:"Moscow",spb:"St.Petersburg",nsb:"Novosibirsk",ekb:"Ekaterinburg"};
const RC_LABEL = Object.fromEntries(DOC.map(d => [DOC_RC[d.k], d.l]));
const RENT_CITY_ORDER = [...DOC.map(d => DOC_RC[d.k]), ...RC.filter(c => !Object.values(DOC_RC).includes(c))];
const n = v => v != null ? v.toLocaleString() : "—";

const MONTH_MAP = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const parseValidityToISO = (str) => {
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const dm = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dm) {
    const [, d, mo, y] = dm;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const eng = str.match(/([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s*(\d{4})/);
  if (eng) {
    const mo = MONTH_MAP[eng[1].toLowerCase()];
    if (mo) {
      return `${eng[4]}-${String(mo).padStart(2, "0")}-${String(eng[3]).padStart(2, "0")}`;
    }
  }
  return "";
};

const formatValidityDate = (iso, prefix) => {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-");
  return `${prefix} ${parseInt(d, 10)}.${mo}.${y}`;
};

const addDaysToISO = (iso, days) => {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const syncFromAfterTill = (currentTill, futureFrom) => {
  const tillIso = parseValidityToISO(currentTill);
  if (!tillIso) return futureFrom;
  const fromIso = parseValidityToISO(futureFrom);
  if (!fromIso || fromIso <= tillIso) {
    return formatValidityDate(addDaysToISO(tillIso, 1), "From");
  }
  return futureFrom;
};

function AdminSaveToast({ busy, feedback, onDismiss }) {
  if (!busy && !feedback?.type) return null;
  const ok = feedback?.type === "success";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`admin-save-toast${ok ? " admin-save-toast--ok" : busy ? " admin-save-toast--busy" : " admin-save-toast--err"} admin-save-toast--dismissible`}
    >
      <span className="admin-save-toast-msg">
        {busy ? "저장 중… (오래 걸리면 × 로 닫기 · 💾 저장 재시도)" : feedback.message}
      </span>
      <button type="button" className="admin-save-toast-close" onClick={onDismiss} aria-label="닫기">
        ×
      </button>
    </div>
  );
}

function ValidityPeriodFields({ carrierKey, period, periodLabel, compact, validityInfo, onUpdate, futureFromMin }) {
  const slot = normalizeValiditySlot(validityInfo[carrierKey]?.[period]);
  const isFuture = period === "future";
  const boxStyle = {
    marginBottom: compact ? 8 : 10,
    padding: compact ? 8 : 10,
    background: isFuture ? "#fffbeb" : "#f0fdf4",
    border: `1px solid ${isFuture ? "#fde68a" : "#bbf7d0"}`,
    borderRadius: 8,
  };
  return (
    <div style={boxStyle}>
      <div style={{ fontSize: 10, fontWeight: 700, color: isFuture ? "#b45309" : "#166534", marginBottom: 6 }}>
        {periodLabel}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: "#b45309", marginBottom: 2 }}>From</div>
          <ValidityDateInput
            kind="from"
            compact={compact}
            value={slot.from}
            min={futureFromMin}
            onChange={v => onUpdate(carrierKey, period, "from", v)}
          />
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#166534", marginBottom: 2 }}>Till</div>
          {slot.furtherNotice ? (
            <div
              className={`validity-date-inp validity-date-till${compact ? " validity-date-compact" : ""}`}
              style={{ display: "flex", alignItems: "center", fontSize: 11, fontWeight: 600, color: "#6b7280", fontStyle: "italic", cursor: "default" }}
            >
              {FURTHER_NOTICE_LABEL}
            </div>
          ) : (
            <ValidityDateInput
              kind="till"
              compact={compact}
              value={slot.till}
              onChange={v => onUpdate(carrierKey, period, "till", v)}
            />
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 10, color: "#6b7280", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={slot.furtherNotice}
              onChange={e => onUpdate(carrierKey, period, "furtherNotice", e.target.checked)}
            />
            Further notice (Till 미정)
          </label>
        </div>
      </div>
    </div>
  );
}

const ValidityDateInput = ({ kind, value, onChange, compact, min, disabled }) => (
  <input
    type="date"
    className={`validity-date-inp validity-date-${kind}${compact ? " validity-date-compact" : ""}`}
    value={parseValidityToISO(value)}
    min={min || undefined}
    disabled={disabled}
    onChange={(e) => {
      const v = e.target.value;
      onChange(v ? formatValidityDate(v, kind === "till" ? "Till" : "From") : "");
    }}
  />
);

const Logo = ({size=32}) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="49" fill="#1D2B4F"/><circle cx="50" cy="50" r="40" fill="#E8A817"/>
    <polygon points="50,10 55,40 50,32 45,40" fill="#C0392B"/><polygon points="50,90 55,60 50,68 45,60" fill="#C0392B"/>
    <polygon points="10,50 40,45 32,50 40,55" fill="#C0392B"/><polygon points="90,50 60,45 68,50 60,55" fill="#C0392B"/>
    <polygon points="22,22 40,40 34,36 36,34" fill="#C0392B"/><polygon points="78,78 60,60 66,64 64,66" fill="#C0392B"/>
    <polygon points="78,22 60,40 64,34 66,36" fill="#C0392B"/><polygon points="22,78 40,60 36,66 34,64" fill="#C0392B"/>
    <circle cx="50" cy="50" r="7" fill="white"/><circle cx="50" cy="50" r="3.5" fill="#C0392B"/>
  </svg>
);

const Bg = ({k, title}) => {
  if (!k) return null;
  const styles = {SNK:{background:"#dbeafe",color:"#1d4ed8"},DY:{background:"#d1fae5",color:"#065f46"},CK:{background:"#ffedd5",color:"#9a3412"},RENTAL:{background:"#ede9fe",color:"#6d21a8"}};
  return <span title={title || CN[k] || k} style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:4,...styles[k]}}>{k === "RENTAL" ? "RENT" : k}</span>;
};

const CarrierPortGuide = () => (
  <div className="carrier-port-guide" aria-label="Carrier calling ports">
    <span className="carrier-port-guide-label">Calling port</span>
    {CRS.map((k, i) => (
      <span key={k} className="carrier-port-guide-segment">
        {i > 0 && <span className="carrier-port-guide-sep">/</span>}
        <span className="carrier-port-guide-item">
          <span className="carrier-port-guide-carrier">{k}</span>
          <span className="carrier-port-guide-colon">:</span>
          <span>{CARRIER_CALL_PORTS[k].join(", ")}</span>
        </span>
      </span>
    ))}
  </div>
);

const tabIconStyle = (active) => ({ opacity: active ? 1 : 0.72, display: "block" });

const TabIconOcean = ({active}) => (
  <svg width="34" height="28" viewBox="0 0 34 28" fill="none" aria-hidden style={tabIconStyle(active)}>
    <path d="M2 24h30" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round"/>
    <path d="M5 24l1.5-5.5h19L27 24" fill="#1D4ED8" stroke="#1E3A8A" strokeWidth="1.2"/>
    <rect x="7" y="14" width="4" height="4" rx="0.3" fill="#EF4444" stroke="#B91C1C" strokeWidth="0.8"/>
    <rect x="12" y="14" width="4" height="4" rx="0.3" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="0.8"/>
    <rect x="17" y="14" width="4" height="4" rx="0.3" fill="#FBBF24" stroke="#D97706" strokeWidth="0.8"/>
    <rect x="10" y="10" width="4" height="3.5" rx="0.3" fill="#22C55E" stroke="#15803D" strokeWidth="0.8"/>
    <rect x="15" y="10" width="4" height="3.5" rx="0.3" fill="#F97316" stroke="#C2410C" strokeWidth="0.8"/>
    <path d="M22.5 11h3.5v8.5h-3.5" fill="#64748B" stroke="#475569" strokeWidth="1"/>
    <path d="M23.5 9.5h1.8v1.8h-1.8" fill="#94A3B8" stroke="#475569" strokeWidth="0.8"/>
  </svg>
);
const TabIconDropoff = ({active}) => (
  <svg width="42" height="28" viewBox="0 0 42 28" fill="none" aria-hidden style={tabIconStyle(active)}>
    <path d="M1 24h16" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M2.5 24l1-4.5h11l1 4.5" fill="#1D4ED8" stroke="#1E3A8A" strokeWidth="1"/>
    <rect x="3.5" y="16" width="2.8" height="2.8" rx="0.2" fill="#EF4444" stroke="#B91C1C" strokeWidth="0.6"/>
    <rect x="7" y="16" width="2.8" height="2.8" rx="0.2" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="0.6"/>
    <rect x="10.5" y="16" width="2.8" height="2.8" rx="0.2" fill="#FBBF24" stroke="#D97706" strokeWidth="0.6"/>
    <path d="M12.5 13h2v5.5h-2" fill="#64748B" stroke="#475569" strokeWidth="0.8"/>
    <path d="M19 24h3" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M22 24l1.2-1.2 1.2 1.2" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M24 15.5h3.5l1 2v4.5H20v-6.5z" fill="#F97316" stroke="#C2410C" strokeWidth="1"/>
    <rect x="27.5" y="11" width="11" height="7.5" rx="0.4" fill="#14B8A6" stroke="#0F766E" strokeWidth="1"/>
    <line x1="29.5" y1="11" x2="29.5" y2="18.5" stroke="#0D9488" strokeWidth="0.7"/>
    <line x1="32" y1="11" x2="32" y2="18.5" stroke="#0D9488" strokeWidth="0.7"/>
    <line x1="34.5" y1="11" x2="34.5" y2="18.5" stroke="#0D9488" strokeWidth="0.7"/>
    <line x1="37" y1="11" x2="37" y2="18.5" stroke="#0D9488" strokeWidth="0.7"/>
    <rect x="27.5" y="11" width="11" height="2" fill="#2DD4BF"/>
    <path d="M21.5 22h16" stroke="#475569" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="26" cy="23" r="1.6" fill="#1F2937"/><circle cx="37" cy="23" r="1.6" fill="#1F2937"/>
  </svg>
);
const TabIconRental = ({active}) => (
  <svg width="34" height="24" viewBox="0 0 36 24" fill="none" aria-hidden style={tabIconStyle(active)}>
    <rect x="2" y="5" width="32" height="15" rx="1" fill="#8B5CF6" fillOpacity="0.2" stroke="#7C3AED" strokeWidth="1.5"/>
    <line x1="2" y1="5" x2="2" y2="20" stroke="#6D28D9" strokeWidth="2"/>
    <line x1="34" y1="5" x2="34" y2="20" stroke="#6D28D9" strokeWidth="2"/>
    <line x1="9" y1="5" x2="9" y2="20" stroke="#A78BFA" strokeWidth="1"/>
    <line x1="16" y1="5" x2="16" y2="20" stroke="#A78BFA" strokeWidth="1"/>
    <line x1="23" y1="5" x2="23" y2="20" stroke="#A78BFA" strokeWidth="1"/>
    <line x1="30" y1="5" x2="30" y2="20" stroke="#A78BFA" strokeWidth="1"/>
    <rect x="2" y="5" width="32" height="3.5" fill="#A78BFA"/>
    <rect x="5" y="9" width="6" height="4" rx="0.3" fill="#F59E0B" stroke="#D97706" strokeWidth="0.8"/>
    <rect x="13" y="9" width="6" height="4" rx="0.3" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="0.8"/>
    <rect x="21" y="9" width="6" height="4" rx="0.3" fill="#EF4444" stroke="#B91C1C" strokeWidth="0.8"/>
    <circle cx="7" cy="22" r="1.8" fill="#1F2937"/><circle cx="29" cy="22" r="1.8" fill="#1F2937"/>
  </svg>
);
const MAIN_TABS = [
  {id:"ocean",label:"Ocean Freight",Icon:TabIconOcean},
  {id:"dropoff",label:"Ocean+Drop off",Icon:TabIconDropoff},
  {id:"rental",label:"Rental+Ocean",Icon:TabIconRental},
];

const marginInpStyle = {width:"100%",padding:"6px 8px",fontSize:13,fontWeight:700,color:"#92400e",background:"#fff",border:"1px solid #fcd34d",borderRadius:6,boxSizing:"border-box"};

const marginNowTs = () => Date.now();

const marginNum = (v) => {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const marginInpVal = (v) => (v === "" || v == null || v === undefined ? "" : v);

const settingBundleHas = (s, key) =>
  Object.prototype.hasOwnProperty.call(s, key) && s[key] != null && s[key] !== "";

const countPolCostOverrides = (polCostO) =>
  Object.values(polCostO || {}).filter(p => p?.carrier && Object.keys(p.carrier).length > 0).length;

/** pol_costs 병합 — overlay의 매입·매출(sell)을 base에 덮어씀 (캐시↔서버 동기화용) */
const mergePolCostODeep = (base, overlay) => {
  if (!overlay || !Object.keys(overlay).length) return base ? { ...base } : {};
  const out = { ...(base || {}) };
  Object.entries(overlay).forEach(([pol, polData]) => {
    if (!polData || typeof polData !== "object") return;
    const prevPol = out[pol] || {};
    const nextPol = { ...prevPol };
    if (polData.carrier) {
      nextPol.carrier = { ...(prevPol.carrier || {}) };
      Object.entries(polData.carrier).forEach(([cr, crData]) => {
        if (!crData || typeof crData !== "object") return;
        const prevCr = nextPol.carrier[cr] || {};
        const nextCr = { ...prevCr };
        ["current", "future"].forEach(period => {
          if (!crData[period]) return;
          const prevBucket = { ...(nextCr[period] || {}) };
          const oBucket = crData[period];
          RATE_TYPES.forEach(t => {
            if (oBucket[t] != null && oBucket[t] !== "") prevBucket[t] = oBucket[t];
          });
          if (oBucket.sell && typeof oBucket.sell === "object") {
            prevBucket.sell = { ...(prevBucket.sell || {}), ...oBucket.sell };
          }
          nextCr[period] = prevBucket;
        });
        RATE_TYPES.forEach(t => {
          if (crData[t] != null && crData[t] !== "") nextCr[t] = crData[t];
        });
        nextPol.carrier[cr] = nextCr;
      });
    }
    if (polData.rent) nextPol.rent = { ...(prevPol.rent || {}), ...polData.rent };
    if (polData.drop) nextPol.drop = { ...(prevPol.drop || {}), ...polData.drop };
    out[pol] = nextPol;
  });
  return out;
};

const polCostOHasSellOverrides = (polCostO) => {
  if (!polCostO) return false;
  return Object.values(polCostO).some(polData => {
    const carriers = polData?.carrier;
    if (!carriers) return false;
    return Object.values(carriers).some(crData =>
      ["current", "future"].some(period => {
        const sell = crData?.[period]?.sell;
        return sell && Object.keys(sell).length > 0;
      }),
    );
  });
};

const countPolMarginOverrides = (polM) =>
  Object.keys(polM || {}).filter(pol => polM[pol] && Object.keys(polM[pol]).length > 0).length;

const resolveCarrierCostFromStore = (costs, pol, cr, t, period, carrierRates, fData) => {
  const c = costs[pol]?.carrier?.[cr];
  if (c?.[period]?.[t] != null && c[period][t] !== "") return Number(c[period][t]);
  if (period === "current" && c?.[t] != null && c[t] !== "") return Number(c[t]);
  const g = carrierRates[cr]?.[period]?.[t];
  if (g != null && g !== "") return Number(g);
  const row = fData.find(d => d.pol === pol);
  const base = row?.rates[cr]?.[t];
  return base != null ? Number(base) : null;
};

/** pol_costs에 직접 저장된 매출가 (없으면 null) */
const resolveCarrierExplicitSell = (costs, pol, cr, t, period) => {
  const c = costs[pol]?.carrier?.[cr];
  const p = period === "future" ? "future" : "current";
  const sellVal = c?.[p]?.sell?.[t];
  if (sellVal != null && sellVal !== "") return Number(sellVal);
  return null;
};

const getPolStoredMargin = (pol, type, period, polM, polMFuture) => {
  const store = period === "future" ? polMFuture : polM;
  const val = store?.[pol]?.[type];
  if (val == null || val === "") return null;
  return marginNum(val);
};

/** 매출가: 저장된 sell → cost+POL마진 → cost+fullMargin(게스트) → cost */
const resolveCarrierEffectiveSell = (
  costs, pol, cr, t, period, cost,
  { polM, polMFuture, fullMargin = null } = {},
) => {
  if (cost == null) return null;
  const explicit = resolveCarrierExplicitSell(costs, pol, cr, t, period);
  if (explicit != null) return explicit;
  const polMargin = getPolStoredMargin(pol, t, period, polM, polMFuture);
  if (polMargin != null) return cost + polMargin;
  if (fullMargin != null) return cost + fullMargin;
  return cost;
};

const DROP_CITY_LABELS = { mow: "Moscow", spb: "St.Petersburg", nsb: "Novosibirsk", ekb: "Ekaterinburg" };
const RATE_HISTORY_CHUNK = 80;

const rateHistoryEntryKey = (row) =>
  `${row.carrier}|${row.pol}|${row.rate_type}|${row.period}|${row.category}|${row.route || ""}`;

const flattenRateSnapshot = ({
  fData, rData, polCostO, carrierRates, carrierDropRates, carrierDropMargins, rentalRates, polM, polMFuture,
}) => {
  const map = new Map();
  const put = (entry) => map.set(rateHistoryEntryKey(entry), entry);

  fData.forEach(row => {
    CRS.forEach(cr => {
      ["current", "future"].forEach(period => {
        RATE_TYPES.forEach(t => {
          const cost = resolveCarrierCostFromStore(polCostO, row.pol, cr, t, period, carrierRates, fData);
          if (cost == null) return;
          const sell = resolveCarrierEffectiveSell(polCostO, row.pol, cr, t, period, cost, { polM, polMFuture });
          put({
            carrier: cr, area: row.area, pol: row.pol, route: row.pol, rate_type: t, period,
            category: "ocean", cost, sell, margin: sell != null ? sell - cost : null,
          });
        });
      });
    });
  });

  Object.keys(DO).forEach(cityKey => {
    CRS.forEach(cr => {
      ["current", "future"].forEach(period => {
        [0, 1].forEach(si => {
          const sk = si === 0 ? "c20" : "c40";
          const stored = carrierDropRates[cr]?.[period]?.[cityKey]?.[sk];
          const base = DO[cityKey]?.[cr];
          const cost = stored != null && stored !== "" ? Number(stored) : (base ? base[si] : null);
          if (cost == null) return;
          const dropM = carrierDropMargins[cr]?.[cityKey]?.[sk];
          const margin = dropM != null && dropM !== "" ? Number(dropM) : 0;
          const label = DROP_CITY_LABELS[cityKey] || cityKey;
          put({
            carrier: cr, area: "DROP", pol: label, route: `Drop · ${label}`,
            rate_type: si === 0 ? "drop20" : "drop40", period, category: "dropoff",
            cost, sell: cost + margin, margin,
          });
        });
      });
    });
  });

  rData.forEach(row => {
    const freightPol = PM[row.pol] || row.pol;
    const fr = fData.find(d => d.pol === freightPol);
    RC.forEach(city => {
      ["current", "future"].forEach(period => {
        [0, 1].forEach(si => {
          const sk = si === 0 ? "c20" : "c40";
          const bucket = rentalRates[row.pol]?.[period]?.[city];
          let cost = bucket?.[sk];
          if (cost == null || cost === "") {
            if (period === "future") cost = rentalRates[row.pol]?.current?.[city]?.[sk];
            if (cost == null || cost === "") cost = si === 0 ? row.r20[city] : row.r40[city];
          }
          if (cost == null || cost === "") return;
          cost = Number(cost);
          put({
            carrier: "RENTAL", area: fr?.area || "OTHERS", pol: freightPol,
            route: `${freightPol} > ${city}`, rate_type: si === 0 ? "r20" : "r40", period,
            category: "rental", cost, sell: null, margin: null,
          });
        });
      });
    });
  });

  return map;
};

const diffRateHistoryRows = (prevMap, nextMap, { source, note, batchId } = {}) => {
  const batch_id = batchId || (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `batch-${Date.now()}`);
  const rows = [];
  nextMap.forEach((entry) => {
    const prev = prevMap?.get(rateHistoryEntryKey(entry));
    if (prev && prev.cost === entry.cost && prev.sell === entry.sell && prev.margin === entry.margin) return;
    rows.push({
      batch_id, source: source || "admin", note: note || null,
      carrier: entry.carrier, area: entry.area || null, pol: entry.pol,
      route: entry.route || entry.pol, rate_type: entry.rate_type, period: entry.period,
      category: entry.category, cost: entry.cost, sell: entry.sell, margin: entry.margin,
    });
  });
  return rows;
};

const postRateHistoryRows = async (rows) => {
  if (!rows.length) return 0;
  let sent = 0;
  for (let i = 0; i < rows.length; i += RATE_HISTORY_CHUNK) {
    await api("rate_history", { method: "POST", body: JSON.stringify(rows.slice(i, i + RATE_HISTORY_CHUNK)) });
    sent += Math.min(RATE_HISTORY_CHUNK, rows.length - i);
  }
  return sent;
};

const buildRateHistoryQuery = (filters) => {
  const parts = ["rate_history?select=*", "order=created_at.desc", "limit=400"];
  if (filters.carrier && filters.carrier !== "ALL") parts.push(`carrier=eq.${encodeURIComponent(filters.carrier)}`);
  if (filters.area && filters.area !== "ALL") parts.push(`area=eq.${encodeURIComponent(filters.area)}`);
  if (filters.period && filters.period !== "ALL") parts.push(`period=eq.${encodeURIComponent(filters.period)}`);
  if (filters.category && filters.category !== "ALL") parts.push(`category=eq.${encodeURIComponent(filters.category)}`);
  if (filters.pol?.trim()) parts.push(`pol=ilike.*${encodeURIComponent(filters.pol.trim())}*`);
  if (filters.dateFrom) parts.push(`created_at=gte.${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) parts.push(`created_at=lte.${filters.dateTo}T23:59:59.999`);
  return parts.join("&");
};

const buildBuyingGriCosts = (prevCosts, { deltas, rows, carrier, period, carrierRates, fData }) => {
  let next = { ...prevCosts };
  rows.forEach(row => {
    RATE_TYPES.forEach(t => {
      const delta = deltas[t];
      if (!Number.isFinite(delta)) return;
      const cost = resolveCarrierCostFromStore(next, row.pol, carrier, t, period, carrierRates, fData);
      if (cost == null) return;
      const prevCr = { ...(next[row.pol]?.carrier?.[carrier] || {}) };
      const bucket = { ...(prevCr[period] || {}) };
      bucket[t] = cost + delta;
      const nextCr = { ...prevCr, [period]: bucket };
      delete nextCr[t];
      next = {
        ...next,
        [row.pol]: {
          ...(next[row.pol] || {}),
          carrier: { ...(next[row.pol]?.carrier || {}), [carrier]: nextCr },
        },
      };
    });
  });
  return next;
};

const buildSellingGriSells = (prevCosts, { deltas, rows, carrier, period, carrierRates, fData, polM, polMFuture }) => {
  let next = { ...prevCosts };
  rows.forEach(row => {
    RATE_TYPES.forEach(t => {
      const delta = deltas[t];
      if (!Number.isFinite(delta)) return;
      const cost = resolveCarrierCostFromStore(next, row.pol, carrier, t, period, carrierRates, fData);
      if (cost == null) return;
      const currentSell = resolveCarrierEffectiveSell(next, row.pol, carrier, t, period, cost, { polM, polMFuture });
      const prevCr = { ...(next[row.pol]?.carrier?.[carrier] || {}) };
      const bucket = { ...(prevCr[period] || {}) };
      const sellBucket = { ...(bucket.sell || {}), [t]: currentSell + delta };
      bucket.sell = sellBucket;
      const nextCr = { ...prevCr, [period]: bucket };
      delete nextCr[t];
      next = {
        ...next,
        [row.pol]: {
          ...(next[row.pol] || {}),
          carrier: { ...(next[row.pol]?.carrier || {}), [carrier]: nextCr },
        },
      };
    });
  });
  return next;
};

const resolveMarginCandidates = (pol, area, type, period, ctx) => {
  const candidates = [{ value: marginNum(ctx.margins[type]), ts: ctx.marginTs[type] ?? 0 }];
  const areaVal = ctx.areaM[area]?.[type];
  if (areaVal != null && areaVal !== "") {
    candidates.push({ value: marginNum(areaVal), ts: ctx.areaTs[area]?.[type] ?? 0 });
  }
  // POL 마진은 기간별 완전 분리 — current↔future 상호 참조 금지
  if (period === "future") {
    const futVal = ctx.polMFuture[pol]?.[type];
    if (futVal != null && futVal !== "") {
      candidates.push({ value: marginNum(futVal), ts: ctx.polTsFuture[pol]?.[type] ?? 0 });
    }
  } else {
    const polVal = ctx.polM[pol]?.[type];
    if (polVal != null && polVal !== "") {
      candidates.push({ value: marginNum(polVal), ts: ctx.polTs[pol]?.[type] ?? 0 });
    }
  }
  return candidates;
};

const griPeriodLabel = (period) => (period === "future" ? "향후 운임" : "현재 운임");

const displayMarginFromPrices = (cost, sell) =>
  (cost != null && sell != null ? sell - cost : null);

/** 현재 운임 매입가 → 향후 운임 pol_costs 복사 */
const buildCopyCurrentToFutureCosts = (prevCosts, { rows, carrier, carrierRates, fData }) => {
  let next = { ...prevCosts };
  rows.forEach(row => {
    const prevCr = { ...(next[row.pol]?.carrier?.[carrier] || {}) };
    const curBucket = prevCr.current || {};
    const futureBucket = { ...(prevCr.future || {}) };
    let hasCost = false;
    RATE_TYPES.forEach(t => {
      const cost = resolveCarrierCostFromStore(next, row.pol, carrier, t, "current", carrierRates, fData);
      if (cost == null) return;
      futureBucket[t] = cost;
      hasCost = true;
    });
    if (!hasCost) return;
    if (curBucket.sell && Object.keys(curBucket.sell).length > 0) {
      futureBucket.sell = { ...curBucket.sell };
    } else {
      delete futureBucket.sell;
    }
    const nextCr = { ...prevCr, future: futureBucket };
    RATE_TYPES.forEach(t => delete nextCr[t]);
    next = {
      ...next,
      [row.pol]: {
        ...(next[row.pol] || {}),
        carrier: { ...(next[row.pol]?.carrier || {}), [carrier]: nextCr },
      },
    };
  });
  return next;
};

const copyCarrierRatesPeriod = (prev, carrier) => {
  const cur = prev[carrier]?.current || {};
  return {
    ...prev,
    [carrier]: {
      current: { ...(prev[carrier]?.current || {}) },
      future: { ...cur },
    },
  };
};

const copyCarrierDropRatesPeriod = (prev, carrier) => {
  const cur = prev[carrier]?.current || {};
  return {
    ...prev,
    [carrier]: {
      current: { ...(prev[carrier]?.current || {}) },
      future: JSON.parse(JSON.stringify(cur)),
    },
  };
};

const pickLatestMargin = (candidates) =>
  candidates.reduce((best, c) => (c.ts > best.ts ? c : best)).value;

const buildLegacyMarginTimestamps = (areaM, polM, types = RATE_TYPES) => {
  const marginTs = Object.fromEntries(types.map(t => [t, 1]));
  const areaTs = {};
  Object.entries(areaM || {}).forEach(([area, m]) => {
    areaTs[area] = {};
    types.forEach(t => { if (m[t] != null && m[t] !== "") areaTs[area][t] = 2; });
  });
  const polTs = {};
  Object.entries(polM || {}).forEach(([pol, m]) => {
    polTs[pol] = {};
    types.forEach(t => { if (m[t] != null && m[t] !== "") polTs[pol][t] = 3; });
  });
  return { marginTs, areaTs, polTs };
};

const parsePricingFromSettings = (s) => {
  const snap = {
    validityInfo: defaultValidityInfo(),
    carrierRates: defaultCarrierRates(),
    rentalRates: buildDefaultRentalRates(),
    margins: { ...DEFAULT_MARGINS },
    areaM: {},
    polM: {},
    polMFuture: {},
    marginTs: Object.fromEntries(RATE_TYPES.map(t => [t, marginNowTs()])),
    areaTs: {},
    polTs: {},
    polTsFuture: {},
    rentalMargins: defaultRentalMargins(),
    rentalAreaM: {},
    rentalPolM: {},
    rentalMarginTs: Object.fromEntries(RENTAL_RATE_TYPES.map(t => [t, marginNowTs()])),
    rentalAreaTs: {},
    rentalPolTs: {},
    polCostO: {},
    carrierDropRates: defaultCarrierDropRates(),
    carrierDropMargins: defaultCarrierDropMargins(),
  };

  if (s.validity_info_json) {
    try {
      const parsed = JSON.parse(s.validity_info_json);
      if (parsed && typeof parsed === "object") {
        snap.validityInfo = Object.fromEntries(
          VALIDITY_KEYS.map(k => [k, normalizeValidityCarrier({ ...defaultValidityInfo()[k], ...(parsed[k] || {}) })])
        );
      }
    } catch (e) {}
  } else if (s.validity_snk !== undefined || s.validity_dy !== undefined || s.validity_ck !== undefined || s.validity_rental !== undefined) {
    snap.validityInfo = {
      SNK: normalizeValidityCarrier({ ...snap.validityInfo.SNK, current: s.validity_snk ?? snap.validityInfo.SNK?.current }),
      DY: normalizeValidityCarrier({ ...snap.validityInfo.DY, current: s.validity_dy ?? snap.validityInfo.DY?.current }),
      CK: normalizeValidityCarrier({ ...snap.validityInfo.CK, current: s.validity_ck ?? snap.validityInfo.CK?.current }),
      RENTAL: normalizeValidityCarrier({ ...snap.validityInfo.RENTAL, current: s.validity_rental ?? snap.validityInfo.RENTAL?.current }),
    };
  }
  if (s.carrier_rates_json) {
    try {
      const parsed = JSON.parse(s.carrier_rates_json);
      if (parsed && typeof parsed === "object") {
        snap.carrierRates = Object.fromEntries(
          CRS.map(k => [k, {
            current: { ...defaultCarrierRates()[k].current, ...(parsed[k]?.current || {}) },
            future: { ...defaultCarrierRates()[k].future, ...(parsed[k]?.future || {}) },
          }])
        );
      }
    } catch (e) {}
  }
  if (s.rental_rates_json) {
    try {
      const parsed = JSON.parse(s.rental_rates_json);
      if (parsed && typeof parsed === "object") {
        snap.rentalRates = mergeRentalRates(buildDefaultRentalRates(), parsed);
      }
    } catch (e) {}
  }
  let loadedAreaM = {};
  let loadedPolM = {};
  if (s.global_margins) { try { snap.margins = JSON.parse(s.global_margins); } catch (e) {} }
  if (s.area_margins) { try { loadedAreaM = JSON.parse(s.area_margins); snap.areaM = loadedAreaM; } catch (e) {} }
  if (s.pol_margins) { try { loadedPolM = JSON.parse(s.pol_margins); snap.polM = loadedPolM; } catch (e) {} }
  if (s.pol_margins_future) { try { snap.polMFuture = JSON.parse(s.pol_margins_future); } catch (e) {} }
  if (s.margin_timestamps) {
    try { snap.marginTs = JSON.parse(s.margin_timestamps); } catch (e) {}
  } else {
    snap.marginTs = buildLegacyMarginTimestamps(loadedAreaM, loadedPolM).marginTs;
  }
  if (s.area_margin_timestamps) {
    try { snap.areaTs = JSON.parse(s.area_margin_timestamps); } catch (e) {}
  } else {
    snap.areaTs = buildLegacyMarginTimestamps(loadedAreaM, loadedPolM).areaTs;
  }
  if (s.pol_margin_timestamps) {
    try { snap.polTs = JSON.parse(s.pol_margin_timestamps); } catch (e) {}
  } else {
    snap.polTs = buildLegacyMarginTimestamps(loadedAreaM, loadedPolM).polTs;
  }
  if (s.pol_margin_timestamps_future) {
    try { snap.polTsFuture = JSON.parse(s.pol_margin_timestamps_future); } catch (e) {}
  }
  let loadedRentalAreaM = {};
  let loadedRentalPolM = {};
  if (s.rental_global_margins) { try { snap.rentalMargins = JSON.parse(s.rental_global_margins); } catch (e) {} }
  if (s.rental_area_margins) { try { loadedRentalAreaM = JSON.parse(s.rental_area_margins); snap.rentalAreaM = loadedRentalAreaM; } catch (e) {} }
  if (s.rental_pol_margins) { try { loadedRentalPolM = JSON.parse(s.rental_pol_margins); snap.rentalPolM = loadedRentalPolM; } catch (e) {} }
  if (s.rental_margin_timestamps) {
    try { snap.rentalMarginTs = JSON.parse(s.rental_margin_timestamps); } catch (e) {}
  } else {
    snap.rentalMarginTs = buildLegacyMarginTimestamps(loadedRentalAreaM, loadedRentalPolM, RENTAL_RATE_TYPES).marginTs;
  }
  if (s.rental_area_margin_timestamps) {
    try { snap.rentalAreaTs = JSON.parse(s.rental_area_margin_timestamps); } catch (e) {}
  } else {
    snap.rentalAreaTs = buildLegacyMarginTimestamps(loadedRentalAreaM, loadedRentalPolM, RENTAL_RATE_TYPES).areaTs;
  }
  if (s.rental_pol_margin_timestamps) {
    try { snap.rentalPolTs = JSON.parse(s.rental_pol_margin_timestamps); } catch (e) {}
  } else {
    snap.rentalPolTs = buildLegacyMarginTimestamps(loadedRentalAreaM, loadedRentalPolM, RENTAL_RATE_TYPES).polTs;
  }
  if (s.pol_costs != null && s.pol_costs !== "") {
    try { snap.polCostO = JSON.parse(s.pol_costs); } catch (e) {}
  }
  if (s.carrier_drop_rates_json) {
    try {
      snap.carrierDropRates = mergeCarrierDropRates(JSON.parse(s.carrier_drop_rates_json));
    } catch (e) {}
  }
  if (s.carrier_drop_margins_json) {
    try {
      snap.carrierDropMargins = mergeCarrierDropMargins(JSON.parse(s.carrier_drop_margins_json));
    } catch (e) {}
  }
  return snap;
};

const pricingCacheFromSnapshot = (snap) => ({
  v: 1,
  polCostO: snap.polCostO,
  margins: snap.margins,
  areaM: snap.areaM,
  polM: snap.polM,
  polMFuture: snap.polMFuture,
  marginTs: snap.marginTs,
  areaTs: snap.areaTs,
  polTs: snap.polTs,
  polTsFuture: snap.polTsFuture,
  carrierRates: snap.carrierRates,
  carrierDropRates: snap.carrierDropRates,
  carrierDropMargins: snap.carrierDropMargins,
  validityInfo: snap.validityInfo,
  rentalRates: snap.rentalRates,
  rentalMargins: snap.rentalMargins,
  rentalAreaM: snap.rentalAreaM,
  rentalPolM: snap.rentalPolM,
  rentalMarginTs: snap.rentalMarginTs,
  rentalAreaTs: snap.rentalAreaTs,
  rentalPolTs: snap.rentalPolTs,
});

const bootPricingFromCache = () => {
  const cache = readStoredPricingCache();
  if (!cache) return null;
  return {
    polCostO: cache.polCostO ?? {},
    margins: cache.margins ?? { ...DEFAULT_MARGINS },
    areaM: cache.areaM ?? {},
    polM: cache.polM ?? {},
    polMFuture: cache.polMFuture ?? {},
    marginTs: cache.marginTs ?? Object.fromEntries(RATE_TYPES.map(t => [t, marginNowTs()])),
    areaTs: cache.areaTs ?? {},
    polTs: cache.polTs ?? {},
    polTsFuture: cache.polTsFuture ?? {},
    carrierRates: cache.carrierRates ?? defaultCarrierRates(),
    carrierDropRates: cache.carrierDropRates
      ? mergeCarrierDropRates(cache.carrierDropRates)
      : defaultCarrierDropRates(),
    carrierDropMargins: cache.carrierDropMargins
      ? mergeCarrierDropMargins(cache.carrierDropMargins)
      : defaultCarrierDropMargins(),
    validityInfo: cache.validityInfo ?? defaultValidityInfo(),
    rentalRates: cache.rentalRates
      ? mergeRentalRates(buildDefaultRentalRates(), cache.rentalRates)
      : buildDefaultRentalRates(),
    rentalMargins: cache.rentalMargins ?? defaultRentalMargins(),
    rentalAreaM: cache.rentalAreaM ?? {},
    rentalPolM: cache.rentalPolM ?? {},
    rentalMarginTs: cache.rentalMarginTs ?? Object.fromEntries(RENTAL_RATE_TYPES.map(t => [t, marginNowTs()])),
    rentalAreaTs: cache.rentalAreaTs ?? {},
    rentalPolTs: cache.rentalPolTs ?? {},
  };
};

function RatesLoading() {
  return (
    <div className="rates-loading" role="status" aria-live="polite">
      운임 정보 불러오는 중…
    </div>
  );
}

function MarginPanel({
  filterHint,
  marginTab, setMarginTab,
  margins, applyGlobalMargin,
  selArea, setSelArea, areaM, applyAreaMarginType, applyAreaMargins,
  selPol, setSelPol, polM, applyPolMargins, clearPolMargins, polEdit, setPolEdit,
  areas, fData, getM,
  rateTypes = RATE_TYPES,
  rateLabel = (t) => t.toUpperCase(),
  gridCols = "1fr 1fr 1fr 1fr",
  polData,
  globalHint = "전체 마진 변경 시 운임표·매출에 즉시 반영 (셀별 마진은 해당 항목만 해제)",
  formatAreaSummary,
}) {
  const polList = polData || fData;
  const emptyPolEdit = () => Object.fromEntries(rateTypes.map(t => [t, ""]));
  const areaSummary = (area, m) => formatAreaSummary
    ? formatAreaSummary(m, margins)
    : <>COC {m.coc20 ?? margins.coc20}/{m.coc40 ?? margins.coc40} SOC {m.soc20 ?? margins.soc20}/{m.soc40 ?? margins.soc40}</>;
  return (
    <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:12,marginBottom:10}}>
      <div style={{fontSize:10,fontWeight:700,color:"#92400e",marginBottom:8}}>MARGIN (USD)</div>
      <div style={{display:"flex",background:"#fef3c7",borderRadius:8,padding:2,marginBottom:10}}>
        {[["global","전체"],["area","지역별"],["pol","도시별"]].map(([k,l])=>(
          <button key={k} type="button" onClick={()=>setMarginTab(k)} style={{flex:1,padding:"6px",fontSize:11,fontWeight:600,borderRadius:6,background:marginTab===k?"#fff":"transparent",border:"none",cursor:"pointer",color:marginTab===k?"#92400e":"#b45309"}}>{l}</button>
        ))}
      </div>
      {filterHint && <div style={{fontSize:9,color:"#b45309",marginBottom:8}}>{filterHint}</div>}
      {marginTab==="global" && (
        <div>
          <div style={{fontSize:10,color:"#b45309",marginBottom:6}}>{globalHint}</div>
          <div style={{display:"grid",gridTemplateColumns:gridCols,gap:8}}>
            {rateTypes.map(t=>(
              <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{rateLabel(t)}</div>
                <input type="number" value={marginInpVal(margins[t])} onChange={e=>applyGlobalMargin(t, e.target.value)}
                  style={marginInpStyle}/></div>
            ))}
          </div>
        </div>
      )}
      {marginTab==="area" && (
        <div>
          <div style={{fontSize:10,color:"#b45309",marginBottom:6}}>지역별 마진 (마지막 수정 기준 · 선택 시 운임표 필터)</div>
          <select value={selArea} onChange={e=>setSelArea(e.target.value)}
            style={{width:"100%",padding:"8px",fontSize:13,border:"1px solid #fcd34d",borderRadius:6,marginBottom:8,background:"#fff"}}>
            <option value="">-- 전체 지역 --</option>
            {areas.map(a=><option key={a} value={a}>{a} {areaM[a]?"✅":""}</option>)}
          </select>
          {selArea && <>
            <div style={{display:"grid",gridTemplateColumns:gridCols,gap:8,marginBottom:8}}>
              {rateTypes.map(t=>(
                <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{rateLabel(t)}</div>
                  <input type="number"
                    value={marginInpVal(
                      areaM[selArea] && Object.prototype.hasOwnProperty.call(areaM[selArea], t)
                        ? areaM[selArea][t]
                        : margins[t]
                    )}
                    onChange={e=>applyAreaMarginType(selArea, t, e.target.value)}
                    style={marginInpStyle}/></div>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button type="button" onClick={()=>{applyAreaMargins(selArea, null);}}
                style={{flex:1,padding:"7px",fontSize:11,color:"#dc2626",background:"#fee2e2",border:"none",borderRadius:6,cursor:"pointer"}}>초기화</button>
            </div>
          </>}
          {Object.keys(areaM).length>0 && (
            <div style={{marginTop:8,padding:"8px",background:"#fef3c7",borderRadius:6}}>
              <div style={{fontSize:10,color:"#92400e",fontWeight:700,marginBottom:4}}>적용된 지역 마진:</div>
              {Object.entries(areaM).map(([area,m])=>(
                <div key={area} style={{fontSize:11,color:"#78350f",marginBottom:2}}>
                  <b>{area}</b>: {areaSummary(area, m)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {marginTab==="pol" && (
        <div>
          <div style={{fontSize:10,color:"#b45309",marginBottom:6}}>도시별 마진 (마지막 수정 기준 · 선택 시 해당 POL만 표시)</div>
          <select value={selPol} onChange={e=>{setSelPol(e.target.value); const m=polM[e.target.value]; setPolEdit(m||emptyPolEdit());}}
            style={{width:"100%",padding:"8px",fontSize:13,border:"1px solid #fcd34d",borderRadius:6,marginBottom:8,background:"#fff"}}>
            <option value="">-- 전체 POL --</option>
            {polList.map(d=><option key={d.pol} value={d.pol}>{d.area} · {d.pol} {polM[d.pol]?"✅":""}</option>)}
          </select>
          {selPol && <>
            <div style={{display:"grid",gridTemplateColumns:gridCols,gap:8,marginBottom:8}}>
              {rateTypes.map(t=>(
                <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{rateLabel(t)}</div>
                  <input type="number" placeholder={String(getM(selPol,polList.find(d=>d.pol===selPol)?.area||"",t))} value={polEdit[t] ?? ""} onChange={e=>setPolEdit(p=>({...p,[t]:e.target.value}))}
                    style={marginInpStyle}/></div>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button type="button" onClick={()=>{
                const area=polList.find(d=>d.pol===selPol)?.area||"";
                const m={};
                rateTypes.forEach(t=>{
                  const raw=polEdit[t];
                  if(raw===""||raw==null) return;
                  const v=parseInt(raw,10);
                  if(Number.isFinite(v)) m[t]=v;
                });
                applyPolMargins(selPol, m);
              }}
                style={{flex:1,padding:"7px",fontSize:11,fontWeight:700,color:"#fff",background:"#d97706",border:"none",borderRadius:6,cursor:"pointer"}}>적용</button>
              <button type="button" onClick={()=>{clearPolMargins(selPol); setPolEdit(emptyPolEdit());}}
                style={{flex:1,padding:"7px",fontSize:11,color:"#dc2626",background:"#fee2e2",border:"none",borderRadius:6,cursor:"pointer"}}>초기화</button>
            </div>
          </>}
        </div>
      )}
    </div>
  );
}

function GriAdjustPanel({
  rateTypes = RATE_TYPES,
  rateLabel = (t) => t.toUpperCase(),
  gridCols = "1fr 1fr 1fr 1fr",
  filterHint,
  periodLabel,
  areas = [],
  scopeTab = "all",
  setScopeTab,
  selAreas = [],
  toggleArea,
  clearAreas,
  onApplyBuying,
  onApplySelling,
  canUndoBuying = false,
  canUndoSelling = false,
  onUndoBuying,
  onUndoSelling,
}) {
  const empty = () => Object.fromEntries(rateTypes.map(t => [t, ""]));
  const [buyGri, setBuyGri] = useState(empty);
  const [sellGri, setSellGri] = useState(empty);
  const areaModeBlocked = scopeTab === "area" && selAreas.length === 0;

  const parseDeltas = (vals) => {
    const deltas = {};
    rateTypes.forEach(t => {
      const raw = String(vals[t] ?? "").trim();
      if (raw === "") return;
      const v = parseInt(raw, 10);
      if (Number.isFinite(v) && v !== 0) deltas[t] = v;
    });
    return deltas;
  };

  const tryApplyBuying = () => {
    if (areaModeBlocked) return;
    const deltas = parseDeltas(buyGri);
    if (Object.keys(deltas).length) onApplyBuying(deltas);
    setBuyGri(empty());
  };

  const tryApplySelling = () => {
    if (areaModeBlocked) return;
    const deltas = parseDeltas(sellGri);
    if (Object.keys(deltas).length) onApplySelling(deltas);
    setSellGri(empty());
  };

  const buyInpStyle = { ...marginInpStyle, color: "#3d6a9e", borderColor: "#93c5fd" };
  const sellInpStyle = { ...marginInpStyle, color: "#6b5038", borderColor: "#d6b88a" };
  const undoBtnStyle = (enabled) => ({
    padding: "7px 10px",
    fontSize: 10,
    fontWeight: 600,
    color: enabled ? "#6b7280" : "#d1d5db",
    background: enabled ? "#f3f4f6" : "#fafafa",
    border: `1px solid ${enabled ? "#e5e7eb" : "#f3f4f6"}`,
    borderRadius: 6,
    cursor: enabled ? "pointer" : "not-allowed",
    whiteSpace: "nowrap",
  });

  const applyBtnStyle = (enabled, bg) => ({
    flex: 1,
    padding: "7px",
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    background: enabled ? bg : "#d1d5db",
    border: "none",
    borderRadius: 6,
    cursor: enabled ? "pointer" : "not-allowed",
  });

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>GRI 일괄 조정 (USD)</div>
        {periodLabel && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
            background: periodLabel.includes("향후") ? "#fef3c7" : "#f3f4f6",
            color: periodLabel.includes("향후") ? "#b45309" : "#374151",
            border: `1px solid ${periodLabel.includes("향후") ? "#fcd34d" : "#e5e7eb"}`,
            whiteSpace: "nowrap",
          }}>
            {periodLabel}만 적용
          </span>
        )}
      </div>
      <div style={{ display: "flex", background: "#eff6ff", borderRadius: 8, padding: 2, marginBottom: 8 }}>
        {[["all", "전체"], ["area", "지역별"]].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setScopeTab(k)}
            style={{
              flex: 1, padding: "6px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer",
              background: scopeTab === k ? "#fff" : "transparent",
              color: scopeTab === k ? "#1d4ed8" : "#60a5fa",
              boxShadow: scopeTab === k ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {scopeTab === "area" && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: "#6b7280" }}>적용 지역 선택 (중복 선택 가능)</div>
            {selAreas.length > 0 && (
              <button type="button" onClick={clearAreas}
                style={{ fontSize: 9, color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                선택 해제
              </button>
            )}
          </div>
          <div className="gri-area-chips">
            {areas.map(area => {
              const on = selAreas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  className={`gri-area-chip${on ? " gri-area-chip--on" : ""}`}
                  onClick={() => toggleArea(area)}
                >
                  {area}
                </button>
              );
            })}
          </div>
          {areaModeBlocked && (
            <div style={{ fontSize: 9, color: "#dc2626", marginTop: 6 }}>지역을 하나 이상 선택하세요</div>
          )}
        </div>
      )}
      {filterHint && <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 8 }}>{filterHint}</div>}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#3d6a9e", marginBottom: 6 }}>매입 GRI</div>
        <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 6 }}>입력값만큼 매입가에 가산 (+/- 가능)</div>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, marginBottom: 8 }}>
          {rateTypes.map(t => (
            <div key={`buy-${t}`}>
              <div style={{ fontSize: 10, color: "#3d6a9e", marginBottom: 2 }}>{rateLabel(t)}</div>
              <input type="number" value={buyGri[t]} onChange={e => setBuyGri(p => ({ ...p, [t]: e.target.value }))}
                placeholder="0" style={buyInpStyle} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={tryApplyBuying} disabled={areaModeBlocked}
            style={applyBtnStyle(!areaModeBlocked, "#2563eb")}>
            매입 GRI 적용
          </button>
          <button type="button" disabled={!canUndoBuying} onClick={onUndoBuying} style={undoBtnStyle(canUndoBuying)}>
            되돌리기
          </button>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#6b5038", marginBottom: 6 }}>매출 GRI</div>
        <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 6 }}>
          {periodLabel ? `${periodLabel} 매출(마진)에만 가산 · 다른 기간·매입은 유지` : "입력값만큼 매출가(마진)에 가산 · 매입은 유지"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, marginBottom: 8 }}>
          {rateTypes.map(t => (
            <div key={`sell-${t}`}>
              <div style={{ fontSize: 10, color: "#6b5038", marginBottom: 2 }}>{rateLabel(t)}</div>
              <input type="number" value={sellGri[t]} onChange={e => setSellGri(p => ({ ...p, [t]: e.target.value }))}
                placeholder="0" style={sellInpStyle} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={tryApplySelling} disabled={areaModeBlocked}
            style={applyBtnStyle(!areaModeBlocked, "#b45309")}>
            매출 GRI 적용
          </button>
          <button type="button" disabled={!canUndoSelling} onClick={onUndoSelling} style={undoBtnStyle(canUndoSelling)}>
            되돌리기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const fData = useMemo(() => FR.map(r => ({area:r[0],pol:r[1],rates:{SNK:{coc20:r[2],coc40:r[3],soc20:r[4],soc40:r[5]},DY:{coc20:r[6],coc40:r[7],soc20:r[8],soc40:r[9]},CK:{coc20:r[10],coc40:r[11],soc20:r[12],soc40:r[13]}}})), []);
  const rData = useMemo(() => RN.map(r => { const r20={},r40={}; RC.forEach((c,i)=>{r20[c]=r[1+i];r40[c]=r[13+i];}); return {pol:r[0],r20,r40}; }), []);
  const areas = useMemo(() => [...new Set(fData.map(d=>d.area))], [fData]);
  const carrierAreaGroups = useMemo(() => {
    const groups = [];
    fData.forEach(row => {
      const last = groups[groups.length - 1];
      if (!last || last.area !== row.area) groups.push({ area: row.area, rows: [row] });
      else last.rows.push(row);
    });
    return groups;
  }, [fData]);
  const fMap = useMemo(() => Object.fromEntries(fData.map(d=>[d.pol,d])), [fData]);
  const rentalRows = useMemo(() => rData.map(row => {
    const fp = PM[row.pol];
    const fr = fp ? fMap[fp] : null;
    return {
      rentalPol: row.pol,
      freightPol: fp || row.pol,
      displayPol: fp || row.pol,
      area: fr?.area || "OTHERS",
    };
  }), [rData, fMap]);
  const rentalAreaGroups = useMemo(() => {
    const groups = [];
    rentalRows.forEach(row => {
      const last = groups[groups.length - 1];
      if (!last || last.area !== row.area) groups.push({ area: row.area, rows: [row] });
      else last.rows.push(row);
    });
    return groups;
  }, [rentalRows]);

  const rentalPolData = useMemo(
    () => rentalRows.map(r => ({ area: r.area, pol: r.freightPol })),
    [rentalRows]
  );

  // Auth
  const [mode, setMode] = useState("guest"); // guest | client | admin
  const [client, setClient] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginTab, setLoginTab] = useState("client"); // client | admin
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pin, setPin] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Default margins — localStorage 캐시로 첫 렌더부터 복원 (깜빡임 방지)
  const [pricingBoot] = useState(() => bootPricingFromCache());
  const [settingsLoaded, setSettingsLoaded] = useState(() => !!pricingBoot);
  const [margins, setMargins] = useState(() => pricingBoot?.margins ?? { ...DEFAULT_MARGINS });
  const [marginTs, setMarginTs] = useState(() => pricingBoot?.marginTs ?? Object.fromEntries(RATE_TYPES.map(t => [t, marginNowTs()])));
  const [areaM, setAreaM] = useState(() => pricingBoot?.areaM ?? {});
  const [areaTs, setAreaTs] = useState(() => pricingBoot?.areaTs ?? {});
  const [polM, setPolM] = useState(() => pricingBoot?.polM ?? {});
  const [polMFuture, setPolMFuture] = useState(() => pricingBoot?.polMFuture ?? {});
  const [polTs, setPolTs] = useState(() => pricingBoot?.polTs ?? {});
  const [polTsFuture, setPolTsFuture] = useState(() => pricingBoot?.polTsFuture ?? {});
  const [rentalMargins, setRentalMargins] = useState(() => pricingBoot?.rentalMargins ?? defaultRentalMargins());
  const [rentalMarginTs, setRentalMarginTs] = useState(() => pricingBoot?.rentalMarginTs ?? Object.fromEntries(RENTAL_RATE_TYPES.map(t => [t, marginNowTs()])));
  const [rentalAreaM, setRentalAreaM] = useState(() => pricingBoot?.rentalAreaM ?? {});
  const [rentalAreaTs, setRentalAreaTs] = useState(() => pricingBoot?.rentalAreaTs ?? {});
  const [rentalPolM, setRentalPolM] = useState(() => pricingBoot?.rentalPolM ?? {});
  const [rentalPolTs, setRentalPolTs] = useState(() => pricingBoot?.rentalPolTs ?? {});
  const [polCostO, setPolCostO] = useState(() => pricingBoot?.polCostO ?? {});
  const [griBuyUndo, setGriBuyUndo] = useState(null);
  const [griSellUndo, setGriSellUndo] = useState(null);
  const [importFreightUndo, setImportFreightUndo] = useState(null);
  const [griScopeTab, setGriScopeTab] = useState("all");
  const [griSelAreas, setGriSelAreas] = useState([]);
  const toggleGriArea = (area) => {
    setGriSelAreas(prev => (prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]));
  };
  const [marginTab, setMarginTab] = useState("global");
  const [rentalMarginTab, setRentalMarginTab] = useState("global");
  const [selArea, setSelArea] = useState("");
  const [rentalSelArea, setRentalSelArea] = useState("");
  const [selPol, setSelPol] = useState("");
  const [rentalSelPol, setRentalSelPol] = useState("");
  const [polEdit, setPolEdit] = useState({coc20:"",coc40:"",soc20:"",soc40:""});
  const [rentalPolEdit, setRentalPolEdit] = useState({r20:"",r40:""});
  const [validityInfo, setValidityInfo] = useState(() => pricingBoot?.validityInfo ?? defaultValidityInfo());
  const [carrierRates, setCarrierRates] = useState(() => pricingBoot?.carrierRates ?? defaultCarrierRates());
  const [carrierDropRates, setCarrierDropRates] = useState(
    () => pricingBoot?.carrierDropRates ?? defaultCarrierDropRates()
  );
  const [carrierDropMargins, setCarrierDropMargins] = useState(
    () => pricingBoot?.carrierDropMargins ?? defaultCarrierDropMargins()
  );
  const [rentalRates, setRentalRates] = useState(() => pricingBoot?.rentalRates ?? buildDefaultRentalRates());
  const [ratePeriod, setRatePeriod] = useState("current"); // current | future
  const [notices, setNotices] = useState(mkNotices);
  const [dismissedNotices, setDismissedNotices] = useState(() => new Set());
  const [noticeAdminTab, setNoticeAdminTab] = useState(0);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState({ type: null, message: "" });
  const saveFeedbackTimerRef = useRef(null);
  const skipAutoSaveRef = useRef(true);
  const autoSaveTimerRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const pricingSaveRef = useRef({});
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [adBanners, setAdBanners] = useState(mkAds);
  const [adAdminTab, setAdAdminTab] = useState(0);
  const [adUploadLoading, setAdUploadLoading] = useState(false);
  const [adUploadMsg, setAdUploadMsg] = useState("");
  const [adDragOver, setAdDragOver] = useState(false);
  const [adDismissed, setAdDismissed] = useState(() => sessionStorage.getItem("ysl_ad_dismissed") === "1");

  // App state
  const [search, setSearch] = useState("");
  const [areaF, setAreaF] = useState("ALL");
  const [tab, setTab] = useState("ocean");
  const [ctype, setCtype] = useState("coc");
  const [exp, setExp] = useState(null);
  const [cityOpen, setCityOpen] = useState(null);
  const [doCityOpen, setDoCityOpen] = useState(null);
  const [sc, setSc] = useState(null);

  // Client mgmt
  const [showMgr, setShowMgr] = useState(false);
  const [showNoticeAdmin, setShowNoticeAdmin] = useState(false);
  const [showAdAdmin, setShowAdAdmin] = useState(false);
  const [showCarrierAdmin, setShowCarrierAdmin] = useState(false);
  const [showRentalAdmin, setShowRentalAdmin] = useState(false);
  const [showRateHistoryAdmin, setShowRateHistoryAdmin] = useState(false);
  const [showExcelUploadAdmin, setShowExcelUploadAdmin] = useState(false);
  const [excelFormat, setExcelFormat] = useState("SNK");
  const [excelPeriod, setExcelPeriod] = useState("current");
  const [excelSheet, setExcelSheet] = useState("");
  const [excelYslCarrier, setExcelYslCarrier] = useState("SNK");
  const [excelWorkbook, setExcelWorkbook] = useState(null);
  const [excelPreview, setExcelPreview] = useState(null);
  const [excelUploading, setExcelUploading] = useState(false);
  const [excelMsg, setExcelMsg] = useState("");
  const [excelDragOver, setExcelDragOver] = useState(false);
  const rateHistoryBaselineRef = useRef(null);
  const [rhRows, setRhRows] = useState([]);
  const [rhLoading, setRhLoading] = useState(false);
  const [rhError, setRhError] = useState("");
  const [rhCarrier, setRhCarrier] = useState("ALL");
  const [rhArea, setRhArea] = useState("ALL");
  const [rhPeriod, setRhPeriod] = useState("ALL");
  const [rhCategory, setRhCategory] = useState("ALL");
  const [rhPol, setRhPol] = useState("");
  const [rhDateFrom, setRhDateFrom] = useState("");
  const [rhDateTo, setRhDateTo] = useState("");
  const [carrierAdminCr, setCarrierAdminCr] = useState("SNK");
  const [carrierAdminPeriod, setCarrierAdminPeriod] = useState("current");
  const [carrierAdminMode, setCarrierAdminMode] = useState("ocean");
  const [carrierEditCell, setCarrierEditCell] = useState(null);
  const [rentalAdminPeriod, setRentalAdminPeriod] = useState("current");
  const [selReturnCity, setSelReturnCity] = useState("");
  const [rentalEditCell, setRentalEditCell] = useState(null);
  const [clients, setClients] = useState([]);
  const [addForm, setAddForm] = useState(false);
  const [editC, setEditC] = useState(null);
  const [newC, setNewC] = useState({company_name:"",email:"",password_hash:"",margin_coc20:80,margin_coc40:100,margin_soc20:80,margin_soc40:100,notes:""});

  const isAdmin = mode === "admin";
  const isClient = mode === "client";
  const isGuest = mode === "guest";

  pricingSaveRef.current = {
    polCostO,
    polM,
    polMFuture,
    polTs,
    polTsFuture,
    margins,
    areaM,
    marginTs,
    areaTs,
    carrierRates,
    carrierDropRates,
    carrierDropMargins,
    validityInfo,
    rentalRates,
    rentalMargins,
    rentalAreaM,
    rentalPolM,
    rentalMarginTs,
    rentalAreaTs,
    rentalPolTs,
  };

  const cancelPendingPricingSave = () => {
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  };

  const resetSaveQueue = () => {
    saveQueueRef.current = Promise.resolve();
  };

  const syncRateHistoryBaseline = () => {
    const s = pricingSaveRef.current;
    rateHistoryBaselineRef.current = flattenRateSnapshot({ ...s, fData, rData });
  };

  const recordRateHistory = (opts = {}, snapOverride = null) => {
    const base = snapOverride || pricingSaveRef.current;
    const nextMap = flattenRateSnapshot({ ...base, fData, rData });
    const rows = diffRateHistoryRows(rateHistoryBaselineRef.current, nextMap, opts);
    if (!rows.length) return Promise.resolve(0);
    return postRateHistoryRows(rows)
      .then(count => {
        rateHistoryBaselineRef.current = nextMap;
        return count;
      })
      .catch(err => {
        console.warn("rate history save failed", err);
        return 0;
      });
  };

  const loadRateHistory = async () => {
    setRhLoading(true);
    setRhError("");
    try {
      const data = await api(buildRateHistoryQuery({
        carrier: rhCarrier,
        area: rhArea,
        period: rhPeriod,
        category: rhCategory,
        pol: rhPol,
        dateFrom: rhDateFrom,
        dateTo: rhDateTo,
      }));
      setRhRows(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg = String(e.message || e);
      setRhRows([]);
      setRhError(/rate_history|42P01|relation|does not exist/i.test(msg)
        ? "rate_history 테이블 없음 · supabase-rate-history.sql 을 Supabase SQL Editor에서 실행하세요."
        : msg);
    } finally {
      setRhLoading(false);
    }
  };

  const parseExcelWorkbook = (workbook, format, sheetName, period, yslCarrier) => {
    const sheet = sheetName || suggestSheet(format, workbook.sheetNames);
    const rows = workbook.sheets[sheet];
    if (!rows?.length) throw new Error(`시트 "${sheet}" 가 비어 있습니다`);
    const parsed = parseByFormat(format, rows, { carrier: yslCarrier });
    return { ...parsed, period, fileName: workbook.fileName, sheet };
  };

  const handleExcelFile = async (file) => {
    if (!file) return;
    setExcelMsg("");
    setExcelPreview(null);
    setExcelUploading(true);
    try {
      const workbook = await readExcelFile(file);
      setExcelWorkbook(workbook);
      const sheet = excelFormat === "YSL"
        ? suggestYslSheet(excelYslCarrier, excelPeriod, workbook.sheetNames)
        : (excelSheet && workbook.sheetNames.includes(excelSheet)
          ? excelSheet
          : suggestSheet(excelFormat, workbook.sheetNames));
      setExcelSheet(sheet);
      const preview = parseExcelWorkbook(workbook, excelFormat, sheet, excelPeriod, excelYslCarrier);
      setExcelPreview(preview);
      const sum = previewSummary(preview, excelPeriod);
      setExcelMsg(`✅ ${sum.title} · ${sum.detail}`);
    } catch (e) {
      setExcelWorkbook(null);
      setExcelMsg("파싱 실패: " + e.message);
    } finally {
      setExcelUploading(false);
    }
  };

  const refreshExcelPreview = () => {
    if (!excelWorkbook) return;
    try {
      let sheet = excelSheet;
      if (!sheet || !excelWorkbook.sheetNames.includes(sheet)) {
        sheet = excelFormat === "YSL"
          ? suggestYslSheet(excelYslCarrier, excelPeriod, excelWorkbook.sheetNames)
          : suggestSheet(excelFormat, excelWorkbook.sheetNames);
        setExcelSheet(sheet);
      }
      const preview = parseExcelWorkbook(excelWorkbook, excelFormat, sheet, excelPeriod, excelYslCarrier);
      setExcelPreview(preview);
      const sum = previewSummary(preview, excelPeriod);
      setExcelMsg(`✅ ${sum.title} · ${sum.detail}`);
    } catch (e) {
      setExcelPreview(null);
      setExcelMsg("파싱 실패: " + e.message);
    }
  };

  const applyExcelUpload = () => {
    if (!excelPreview) return;
    const parsed = excelPreview;
    const period = excelPeriod;
    const note = `${parsed.fileName} · ${parsed.sheet}`;

    runSave("Excel 업로드", async () => {
      clearTimeout(autoSaveTimerRef.current);
      skipAutoSaveRef.current = true;
      const batchId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `batch-${Date.now()}`;

      if (parsed.format === "RENTAL") {
        const patch = buildRentalRatesFromBases(parsed.bases, period);
        const merged = mergeRentalRatesPatch(rentalRates, patch);
        setRentalRates(merged);
        await saveOneSettingWithRetry("rental_rates_json", JSON.stringify(merged));
        pricingSaveRef.current = { ...pricingSaveRef.current, rentalRates: merged };
      } else if (parsed.format === "DY") {
        const nextCosts = mergePolCostsCarrier(polCostO, parsed.oceanRows, "DY", period);
        const nextDrop = buildDyDropRates(
          JSON.stringify(carrierDropRates),
          parsed.oceanRows,
          parsed.dropRows,
          period,
        );
        setPolCostO(nextCosts);
        setCarrierDropRates(nextDrop);
        await saveSettingsEntries([
          ["pol_costs", serializePolCosts(nextCosts)],
          ["carrier_drop_rates_json", JSON.stringify(nextDrop)],
        ]);
        pricingSaveRef.current = { ...pricingSaveRef.current, polCostO: nextCosts, carrierDropRates: nextDrop };
      } else if (parsed.format === "YSL") {
        const cr = parsed.carrier;
        let nextCosts = mergePolCostsWithSells(
          polCostO, parsed.netRows, parsed.sellRows || {}, cr, period,
        );
        let nextPolM = polM;
        if (Object.keys(parsed.marginRows || {}).length) {
          nextPolM = mergePolMarginsMap(polM, parsed.marginRows);
          setPolM(nextPolM);
          const ts = marginNowTs();
          const nextPolTs = { ...polTs };
          Object.keys(parsed.marginRows).forEach(pol => {
            nextPolTs[pol] = { ...(nextPolTs[pol] || {}), ...Object.fromEntries(RATE_TYPES.map(t => [t, ts])) };
          });
          setPolTs(nextPolTs);
          await saveSettingsEntries([
            ["pol_costs", serializePolCosts(nextCosts)],
            ["pol_margins", JSON.stringify(nextPolM)],
            ["pol_margin_timestamps", JSON.stringify(nextPolTs)],
          ]);
        } else {
          await saveOneSettingWithRetry("pol_costs", serializePolCosts(nextCosts));
        }
        setPolCostO(nextCosts);
        pricingSaveRef.current = { ...pricingSaveRef.current, polCostO: nextCosts, polM: nextPolM };
      } else {
        const cr = parsed.carrier;
        const nextCosts = mergePolCostsCarrier(polCostO, parsed.netRows, cr, period);
        let nextPolM = polM;
        let nextPolTs = polTs;
        if (Object.keys(parsed.marginRows || {}).length) {
          nextPolM = mergePolMarginsMap(polM, parsed.marginRows);
          const ts = marginNowTs();
          nextPolTs = { ...polTs };
          Object.keys(parsed.marginRows).forEach(pol => {
            nextPolTs[pol] = { ...(nextPolTs[pol] || {}), ...Object.fromEntries(RATE_TYPES.map(t => [t, ts])) };
          });
          setPolM(nextPolM);
          setPolTs(nextPolTs);
          await saveSettingsEntries([
            ["pol_costs", serializePolCosts(nextCosts)],
            ["pol_margins", JSON.stringify(nextPolM)],
            ["pol_margin_timestamps", JSON.stringify(nextPolTs)],
          ]);
        } else {
          await saveOneSettingWithRetry("pol_costs", serializePolCosts(nextCosts));
        }
        setPolCostO(nextCosts);
        pricingSaveRef.current = { ...pricingSaveRef.current, polCostO: nextCosts, polM: nextPolM, polTs: nextPolTs };
      }

      const rhRaw = buildRateHistoryRowsFromUpload(parsed, period, fData, note);
      if (rhRaw.length) {
        await postRateHistoryRows(rhRaw.map(r => ({ ...r, batch_id: batchId })));
        rateHistoryBaselineRef.current = flattenRateSnapshot({ ...pricingSaveRef.current, fData, rData });
      }

      writePricingCache({
        ...buildPricingCache(),
        pricingSavedAt: Date.now(),
        serverSyncedAt: Date.now(),
      });
      setTimeout(() => { skipAutoSaveRef.current = false; }, 2000);
    });
  };

  const doLogin = async () => {
    setLoginLoading(true); setLoginErr("");
    try {
      const d = await api(`clients?email=eq.${encodeURIComponent(email)}&password_hash=eq.${encodeURIComponent(pw)}&is_active=eq.true&select=*`);
      if (!d.length) { setLoginErr("Email or password incorrect"); }
      else {
        const c = d[0];
        setClient(c);
        setMargins({coc20:c.margin_coc20,coc40:c.margin_coc40,soc20:c.margin_soc20,soc40:c.margin_soc40});
        setMode("client");
        setShowLoginModal(false);
        setEmail(""); setPw("");
      }
    } catch(e) { setLoginErr("Server error"); }
    setLoginLoading(false);
  };

  const doAdminLogin = () => {
    if (ADMIN_SKIP_PIN || pin === ADMIN_PIN) {
      setMode("admin");
      setShowLoginModal(false);
      setPin("");
      setLoginErr("");
      try { sessionStorage.setItem(ADMIN_SESSION_KEY, "1"); } catch (_) {}
    } else { setLoginErr("Wrong PIN"); }
  };

  const logout = () => {
    setMode("guest");
    setClient(null);
    try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch (_) {}
  };

  useEffect(() => {
    if (ADMIN_SKIP_PIN && sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
      setMode("admin");
    }
  }, []);

  const loadClients = async () => { const d = await api("clients?select=*&order=created_at.desc"); setClients(d); };
  const saveClient = async () => { await api("clients",{method:"POST",body:JSON.stringify(newC)}); setAddForm(false); setNewC({company_name:"",email:"",password_hash:"",margin_coc20:80,margin_coc40:100,margin_soc20:80,margin_soc40:100,notes:""}); loadClients(); };
  const updateMargins = async (id,data) => { await api(`clients?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(data)}); setEditC(null); loadClients(); };
  const toggleClient = async (id,cur) => { await api(`clients?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({is_active:!cur})}); loadClients(); };

  const stripPolMarginType = (type, polNames = null) => {
    const allowed = polNames ? new Set(polNames) : null;
    setPolM(p => {
      const n = { ...p };
      Object.keys(n).forEach(pol => {
        if (allowed && !allowed.has(pol)) return;
        if (n[pol]?.[type] == null) return;
        const next = { ...n[pol] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
      });
      return n;
    });
    setPolTs(p => {
      const n = { ...p };
      Object.keys(n).forEach(pol => {
        if (allowed && !allowed.has(pol)) return;
        if (n[pol]?.[type] == null) return;
        const next = { ...n[pol] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
      });
      return n;
    });
  };

  const stripAreaMarginType = (type, areaName = null) => {
    setAreaM(p => {
      const n = { ...p };
      Object.keys(n).forEach(area => {
        if (areaName && area !== areaName) return;
        if (n[area]?.[type] == null) return;
        const next = { ...n[area] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[area];
        else n[area] = next;
      });
      return n;
    });
    setAreaTs(p => {
      const n = { ...p };
      Object.keys(n).forEach(area => {
        if (areaName && area !== areaName) return;
        if (n[area]?.[type] == null) return;
        const next = { ...n[area] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[area];
        else n[area] = next;
      });
      return n;
    });
  };

  const getM = (pol, area, type, period = "current") =>
    pickLatestMargin(resolveMarginCandidates(pol, area, type, period, {
      margins, marginTs, areaM, areaTs, polM, polTs, polMFuture, polTsFuture,
    }));

  /** 선사 Admin 단가표: sell 저장값 → POL 마진 → 매입 (전역 150/200 자동 가산 없음) */
  const getCarrierAdminSell = (pol, cr, type, period, cost) =>
    resolveCarrierEffectiveSell(polCostO, pol, cr, type, period, cost, { polM, polMFuture });

  /** 게스트·포털: sell 저장값 → POL 마진 → getM() 전체 마진 */
  const getGuestCarrierSell = (pol, cr, type, period, cost, area) =>
    resolveCarrierEffectiveSell(polCostO, pol, cr, type, period, cost, {
      polM,
      polMFuture,
      fullMargin: getM(pol, area, type, period),
    });

  const applyBuyingGriBulk = (deltas, rows, carrier, period) => {
    if (!rows?.length || !Object.keys(deltas).length) return;
    setGriBuyUndo({ carrier, period, polCostO: JSON.parse(JSON.stringify(polCostO)) });
    const nextCosts = buildBuyingGriCosts(polCostO, {
      deltas, rows, carrier, period, carrierRates, fData,
    });
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    setPolCostO(nextCosts);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: nextCosts,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveOneSettingWithRetry("pol_costs", serializePolCosts(nextCosts));
    })
      .then(() => {
        writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
        recordRateHistory({ source: "gri", note: `매입 GRI ${griPeriodLabel(period)}` }, { ...pricingSaveRef.current, polCostO: nextCosts });
        flashSaveFeedback("success", `✅ 매입 GRI (${griPeriodLabel(period)}) · 저장 완료`);
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const undoBuyingGriBulk = () => {
    if (!griBuyUndo) return;
    const restored = griBuyUndo.polCostO;
    setGriBuyUndo(null);
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    setPolCostO(restored);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: restored,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveOneSettingWithRetry("pol_costs", serializePolCosts(restored));
    })
      .then(() => {
        writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
        recordRateHistory({ source: "gri", note: "매입 GRI 되돌리기" }, { ...pricingSaveRef.current, polCostO: restored });
        flashSaveFeedback("success", "✅ 매입 GRI 되돌리기 · 저장 완료");
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const applySellingGriBulk = (deltas, rows, carrier, period) => {
    if (!rows?.length || !Object.keys(deltas).length) return;
    setGriSellUndo({
      carrier,
      period,
      polCostO: JSON.parse(JSON.stringify(polCostO)),
    });
    const nextCosts = buildSellingGriSells(polCostO, {
      deltas,
      rows,
      carrier,
      period,
      carrierRates,
      fData,
      polM,
      polMFuture,
    });
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    setPolCostO(nextCosts);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: nextCosts,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveOneSettingWithRetry("pol_costs", serializePolCosts(nextCosts));
    })
      .then(() => {
        writePricingCache({
          ...(readStoredPricingCache() || {}),
          polCostO: nextCosts,
          pricingSavedAt: Date.now(),
          serverSyncedAt: Date.now(),
        });
        recordRateHistory({ source: "gri", note: `매출 GRI ${griPeriodLabel(period)}` }, { ...pricingSaveRef.current, polCostO: nextCosts });
        flashSaveFeedback("success", `✅ 매출 GRI (${griPeriodLabel(period)}) · 저장 완료`);
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const undoSellingGriBulk = () => {
    if (!griSellUndo) return;
    const { polCostO: restoredCosts } = griSellUndo;
    setGriSellUndo(null);
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    setPolCostO(restoredCosts);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: restoredCosts,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveOneSettingWithRetry("pol_costs", serializePolCosts(restoredCosts));
    })
      .then(() => {
        writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
        recordRateHistory({ source: "gri", note: "매출 GRI 되돌리기" }, { ...pricingSaveRef.current, polCostO: restoredCosts });
        flashSaveFeedback("success", "✅ 매출 GRI 되돌리기 · 저장 완료");
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const importCurrentToFutureFreight = (carrier, dropoffMode) => {
    if (!window.confirm(`${CN_KR[carrier]} 현재 운임을 향후 운임에 복사합니다.\n기존 향후 운임 값은 덮어씁니다. 계속할까요?`)) return;
    setImportFreightUndo({
      carrier,
      dropoffMode,
      polCostO: JSON.parse(JSON.stringify(polCostO)),
      carrierRates: JSON.parse(JSON.stringify(carrierRates)),
      carrierDropRates: JSON.parse(JSON.stringify(carrierDropRates)),
    });
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    setCarrierEditCell(null);

    if (dropoffMode) {
      const nextDrop = copyCarrierDropRatesPeriod(carrierDropRates, carrier);
      setCarrierDropRates(nextDrop);
      writePricingCache({
        ...(readStoredPricingCache() || { v: 1 }),
        v: 1,
        carrierDropRates: nextDrop,
        pricingSavedAt: Date.now(),
      });
      enqueueSave(async () => {
        await saveOneSettingWithRetry("carrier_drop_rates_json", JSON.stringify(nextDrop));
      })
        .then(() => {
          writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
          recordRateHistory({ source: "import", note: `${CN_KR[carrier]} Drop off 향후 복사` }, { ...pricingSaveRef.current, carrierDropRates: nextDrop });
          flashSaveFeedback("success", `✅ ${CN_KR[carrier]} Drop off · 기존운임 → 향후 복사 완료`);
        })
        .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
        .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
      return;
    }

    const nextCosts = buildCopyCurrentToFutureCosts(polCostO, {
      rows: fData, carrier, carrierRates, fData,
    });
    const nextRates = copyCarrierRatesPeriod(carrierRates, carrier);
    setPolCostO(nextCosts);
    setCarrierRates(nextRates);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: nextCosts,
      carrierRates: nextRates,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveSettingsEntries([
        ["pol_costs", serializePolCosts(nextCosts)],
        ["carrier_rates_json", JSON.stringify(nextRates)],
      ]);
    })
      .then(() => {
        writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
        recordRateHistory({ source: "import", note: `${CN_KR[carrier]} 향후 복사` }, { ...pricingSaveRef.current, polCostO: nextCosts, carrierRates: nextRates });
        flashSaveFeedback("success", `✅ ${CN_KR[carrier]} · 기존운임 → 향후 복사 완료 · GRI로 조정하세요`);
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const undoImportFreight = () => {
    if (!importFreightUndo) return;
    const {
      carrier, dropoffMode,
      polCostO: restoredCosts, carrierRates: restoredRates, carrierDropRates: restoredDrop,
    } = importFreightUndo;
    setImportFreightUndo(null);
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    if (dropoffMode) {
      setCarrierDropRates(restoredDrop);
      writePricingCache({
        ...(readStoredPricingCache() || { v: 1 }),
        v: 1,
        carrierDropRates: restoredDrop,
        pricingSavedAt: Date.now(),
      });
      enqueueSave(async () => {
        await saveOneSettingWithRetry("carrier_drop_rates_json", JSON.stringify(restoredDrop));
      })
        .then(() => {
          writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
          recordRateHistory({ source: "import_undo" }, { ...pricingSaveRef.current, carrierDropRates: restoredDrop });
          flashSaveFeedback("success", "✅ 기존운임 가져오기 되돌리기 · 저장 완료");
        })
        .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
        .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
      return;
    }
    setPolCostO(restoredCosts);
    setCarrierRates(restoredRates);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: restoredCosts,
      carrierRates: restoredRates,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveSettingsEntries([
        ["pol_costs", serializePolCosts(restoredCosts)],
        ["carrier_rates_json", JSON.stringify(restoredRates)],
      ]);
    })
      .then(() => {
        writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
        recordRateHistory({ source: "import_undo" }, { ...pricingSaveRef.current, polCostO: restoredCosts, carrierRates: restoredRates });
        flashSaveFeedback("success", "✅ 기존운임 가져오기 되돌리기 · 저장 완료");
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const applyPolMargin = (pol, type, value, period = "current") => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    const isFuture = period === "future";
    const setStore = isFuture ? setPolMFuture : setPolM;
    const setTsStore = isFuture ? setPolTsFuture : setPolTs;
    if (raw === "") {
      setStore(p => {
        if (p[pol]?.[type] == null) return p;
        const next = { ...p[pol] };
        delete next[type];
        const n = { ...p };
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
        return n;
      });
      setTsStore(p => {
        if (p[pol]?.[type] == null) return p;
        const next = { ...p[pol] };
        delete next[type];
        const n = { ...p };
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
        return n;
      });
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setStore(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: v } }));
    setTsStore(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: ts } }));
  };

  const applyPolMargins = (pol, m) => {
    const ts = marginNowTs();
    setPolM(p => ({ ...p, [pol]: m }));
    setPolTs(p => ({
      ...p,
      [pol]: {
        ...(p[pol] || {}),
        ...Object.fromEntries(Object.keys(m).map(t => [t, ts])),
      },
    }));
  };

  const clearPolMargins = (pol) => {
    setPolM(p => { const n = { ...p }; delete n[pol]; return n; });
    setPolTs(p => { const n = { ...p }; delete n[pol]; return n; });
  };

  const applyGlobalMargin = (type, value) => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    if (raw === "") {
      setMargins(p => ({ ...p, [type]: "" }));
      setMarginTs(p => ({ ...p, [type]: ts }));
      stripPolMarginType(type);
      stripAreaMarginType(type);
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setMargins(p => ({ ...p, [type]: v }));
    setMarginTs(p => ({ ...p, [type]: ts }));
    stripPolMarginType(type);
    stripAreaMarginType(type);
  };

  const applyAreaMarginType = (area, type, value) => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    if (raw === "") {
      setAreaM(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: "" } }));
      setAreaTs(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: ts } }));
      stripPolMarginType(type, fData.filter(d => d.area === area).map(d => d.pol));
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setAreaM(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: v } }));
    setAreaTs(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: ts } }));
    stripPolMarginType(type, fData.filter(d => d.area === area).map(d => d.pol));
  };

  const applyAreaMargins = (area, m) => {
    if (m) {
      const ts = marginNowTs();
      const pols = fData.filter(d => d.area === area).map(d => d.pol);
      setAreaM(p => ({ ...p, [area]: m }));
      setAreaTs(p => ({
        ...p,
        [area]: {
          ...(p[area] || {}),
          ...Object.fromEntries(Object.keys(m).map(t => [t, ts])),
        },
      }));
      Object.keys(m).forEach(t => stripPolMarginType(t, pols));
    } else {
      setAreaM(p => { const n = { ...p }; delete n[area]; return n; });
      setAreaTs(p => { const n = { ...p }; delete n[area]; return n; });
    }
  };

  const stripRentalPolMarginType = (type, polNames = null) => {
    const allowed = polNames ? new Set(polNames) : null;
    setRentalPolM(p => {
      const n = { ...p };
      Object.keys(n).forEach(pol => {
        if (allowed && !allowed.has(pol)) return;
        if (n[pol]?.[type] == null) return;
        const next = { ...n[pol] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
      });
      return n;
    });
    setRentalPolTs(p => {
      const n = { ...p };
      Object.keys(n).forEach(pol => {
        if (allowed && !allowed.has(pol)) return;
        if (n[pol]?.[type] == null) return;
        const next = { ...n[pol] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
      });
      return n;
    });
  };

  const stripRentalAreaMarginType = (type, areaName = null) => {
    setRentalAreaM(p => {
      const n = { ...p };
      Object.keys(n).forEach(area => {
        if (areaName && area !== areaName) return;
        if (n[area]?.[type] == null) return;
        const next = { ...n[area] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[area];
        else n[area] = next;
      });
      return n;
    });
    setRentalAreaTs(p => {
      const n = { ...p };
      Object.keys(n).forEach(area => {
        if (areaName && area !== areaName) return;
        if (n[area]?.[type] == null) return;
        const next = { ...n[area] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[area];
        else n[area] = next;
      });
      return n;
    });
  };

  const getRentalM = (pol, area, type) => {
    const candidates = [{ value: marginNum(rentalMargins[type]), ts: rentalMarginTs[type] ?? 0 }];
    const areaVal = rentalAreaM[area]?.[type];
    if (areaVal != null && areaVal !== "") {
      candidates.push({ value: marginNum(areaVal), ts: rentalAreaTs[area]?.[type] ?? 0 });
    }
    const polVal = rentalPolM[pol]?.[type];
    if (polVal != null && polVal !== "") {
      candidates.push({ value: marginNum(polVal), ts: rentalPolTs[pol]?.[type] ?? 0 });
    }
    return pickLatestMargin(candidates);
  };

  const applyRentalPolMargin = (pol, type, value) => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    if (raw === "") {
      setRentalPolM(p => {
        if (p[pol]?.[type] == null) return p;
        const next = { ...p[pol] };
        delete next[type];
        const n = { ...p };
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
        return n;
      });
      setRentalPolTs(p => {
        if (p[pol]?.[type] == null) return p;
        const next = { ...p[pol] };
        delete next[type];
        const n = { ...p };
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
        return n;
      });
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setRentalPolM(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: v } }));
    setRentalPolTs(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: ts } }));
  };

  const applyRentalPolMargins = (pol, m) => {
    const ts = marginNowTs();
    setRentalPolM(p => ({ ...p, [pol]: m }));
    setRentalPolTs(p => ({
      ...p,
      [pol]: { ...(p[pol] || {}), ...Object.fromEntries(Object.keys(m).map(t => [t, ts])) },
    }));
  };

  const clearRentalPolMargins = (pol) => {
    setRentalPolM(p => { const n = { ...p }; delete n[pol]; return n; });
    setRentalPolTs(p => { const n = { ...p }; delete n[pol]; return n; });
  };

  const applyRentalGlobalMargin = (type, value) => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    if (raw === "") {
      setRentalMargins(p => ({ ...p, [type]: "" }));
      setRentalMarginTs(p => ({ ...p, [type]: ts }));
      stripRentalPolMarginType(type);
      stripRentalAreaMarginType(type);
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setRentalMargins(p => ({ ...p, [type]: v }));
    setRentalMarginTs(p => ({ ...p, [type]: ts }));
    stripRentalPolMarginType(type);
    stripRentalAreaMarginType(type);
  };

  const applyRentalAreaMarginType = (area, type, value) => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    if (raw === "") {
      setRentalAreaM(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: "" } }));
      setRentalAreaTs(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: ts } }));
      stripRentalPolMarginType(type, rentalPolData.filter(d => d.area === area).map(d => d.pol));
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setRentalAreaM(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: v } }));
    setRentalAreaTs(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: ts } }));
    stripRentalPolMarginType(type, rentalPolData.filter(d => d.area === area).map(d => d.pol));
  };

  const applyRentalAreaMargins = (area, m) => {
    if (m) {
      const ts = marginNowTs();
      const pols = rentalPolData.filter(d => d.area === area).map(d => d.pol);
      setRentalAreaM(p => ({ ...p, [area]: m }));
      setRentalAreaTs(p => ({
        ...p,
        [area]: { ...(p[area] || {}), ...Object.fromEntries(Object.keys(m).map(t => [t, ts])) },
      }));
      Object.keys(m).forEach(t => stripRentalPolMarginType(t, pols));
    } else {
      setRentalAreaM(p => { const n = { ...p }; delete n[area]; return n; });
      setRentalAreaTs(p => { const n = { ...p }; delete n[area]; return n; });
    }
  };

  const rentalType = (si) => (si === 0 ? "r20" : "r40");

  const updateValiditySlot = (carrier, period, field, value) => {
    setValidityInfo(p => {
      const entry = normalizeValidityCarrier(p[carrier] || {});
      const slot = { ...entry[period] };
      if (field === "furtherNotice") {
        slot.furtherNotice = !!value;
        if (slot.furtherNotice) slot.till = "";
      } else {
        slot[field] = value;
        if (field === "till") slot.furtherNotice = false;
        if (period === "current" && field === "till" && value) {
          const fut = { ...entry.future };
          if (!fut.furtherNotice) {
            entry.future = { ...fut, from: syncFromAfterTill(value, fut.from) };
          }
        }
      }
      entry[period] = slot;
      return { ...p, [carrier]: entry };
    });
  };

  const getFutureFromMinDate = (carrierKey) => {
    const cur = normalizeValiditySlot(validityInfo[carrierKey]?.current);
    const tillIso = parseValidityToISO(cur.till);
    if (tillIso) return addDaysToISO(tillIso, 1);
    const fromIso = parseValidityToISO(cur.from);
    return fromIso ? addDaysToISO(fromIso, 1) : undefined;
  };

  const legacyValidityCurrent = (carrierKey) =>
    formatValiditySlotLabel(validityInfo[carrierKey]?.current);

  const patchNotice = (idx, patch) => setNotices(prev => prev.map((n, i) => i === idx ? { ...n, ...patch } : n));

  const uploadNoticeFile = async (file, slotIdx) => {
    setUploadLoading(true); setUploadMsg("");
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const fname = `notice_${slotIdx + 1}_${Date.now()}.${ext}`;
      const res = await fetch(`${SB_URL}/storage/v1/object/Notices/${fname}`, {
        method: "POST",
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": file.type, "x-upsert": "true" },
        body: file,
      });
      if (!res.ok) {
        const errText = await res.text();
        if (errText.includes("row-level security")) {
          throw new Error("Supabase Storage 권한 없음 — Storage Policies를 확인하세요.");
        }
        throw new Error(errText);
      }
      const url = `${SB_URL}/storage/v1/object/public/Notices/${fname}`;
      patchNotice(slotIdx, { fileUrl: url });
      setUploadMsg(`공지 ${slotIdx + 1} 업로드 완료!`);
      setTimeout(() => setUploadMsg(""), 2000);
    } catch(e) { setUploadMsg("업로드 실패: " + e.message); }
    setUploadLoading(false);
  };

  const saveNoticeSettings = async () => {
    await saveSettingsEntries([
      ["notices_json", JSON.stringify(notices)],
      ["notice_text", notices[0].text],
      ["notice_on", notices[0].on],
      ["notice_file_url", notices[0].fileUrl],
    ]);
  };

  const saveAdBannersSetting = async (banners) => {
    await saveSetting("ad_banners_json", JSON.stringify(banners));
  };

  const patchAd = (idx, patch) => setAdBanners(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a));

  const uploadAdFile = async (file, slotIdx) => {
    setAdUploadLoading(true);
    setAdUploadMsg("");
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const fname = `ad_banner_${slotIdx + 1}_${Date.now()}.${ext}`;
      const res = await fetch(`${SB_URL}/storage/v1/object/Notices/${fname}`, {
        method: "POST",
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": file.type, "x-upsert": "true" },
        body: file,
      });
      if (!res.ok) {
        const errText = await res.text();
        if (errText.includes("row-level security")) {
          throw new Error("Supabase Storage 권한 없음 — Storage Policies를 확인하세요.");
        }
        throw new Error(errText);
      }
      const url = `${SB_URL}/storage/v1/object/public/Notices/${fname}`;
      let next;
      setAdBanners(prev => {
        next = prev.map((a, i) => i === slotIdx ? { ...a, imageUrl: url, on: true } : a);
        return next;
      });
      await saveAdBannersSetting(next);
      setAdUploadMsg(`광고 ${slotIdx + 1} 업로드 완료 — 하단에 즉시 반영!`);
      setTimeout(() => setAdUploadMsg(""), 2500);
    } catch (e) {
      setAdUploadMsg("업로드 실패: " + e.message);
    }
    setAdUploadLoading(false);
  };

  const persistAdBanners = (banners) => runSave("광고", () => saveAdBannersSetting(banners));

  const dismissAd = () => {
    setAdDismissed(true);
    sessionStorage.setItem("ysl_ad_dismissed", "1");
  };

  const saveSetting = async (key, value) => {
    await saveOneSettingWithRetry(key, value);
  };

  const enqueueSave = (task) => {
    const job = saveQueueRef.current.then(task);
    saveQueueRef.current = job.catch(() => {});
    return job;
  };

  const dismissSaveFeedback = () => {
    if (saveFeedbackTimerRef.current) clearTimeout(saveFeedbackTimerRef.current);
    setSaveFeedback({ type: null, message: "" });
    setSaveBusy(false);
  };

  const flashSaveFeedback = (type, message) => {
    if (saveFeedbackTimerRef.current) clearTimeout(saveFeedbackTimerRef.current);
    setSaveFeedback({ type, message });
    if (type === "success") {
      saveFeedbackTimerRef.current = setTimeout(() => {
        setSaveFeedback({ type: null, message: "" });
      }, 5000);
    }
  };

  const runSave = async (successLabel, fn) => {
    if (saveBusy) return;
    setSaveBusy(true);
    setSaveFeedback({ type: null, message: "" });
    try {
      await withTimeout(
        enqueueSave(fn),
        SAVE_UI_MAX_MS,
        "저장 시간 초과 (90초) · 네트워크 확인 후 💾 저장 재시도",
      );
      writePricingCache({
        ...buildPricingCache(),
        pricingSavedAt: Date.now(),
        serverSyncedAt: Date.now(),
      });
      flashSaveFeedback("success", `✅ ${successLabel} 저장 완료`);
      if (!String(successLabel).includes("Excel")) {
        recordRateHistory({ source: "admin_save", note: successLabel });
      }
    } catch (e) {
      resetSaveQueue();
      flashSaveFeedback("error", `저장 실패: ${e.message}`);
    } finally {
      setSaveBusy(false);
    }
  };

  const adminSaveToastEl = isAdmin && (saveBusy || saveFeedback.type)
    ? createPortal(<AdminSaveToast busy={saveBusy} feedback={saveFeedback} onDismiss={dismissSaveFeedback} />, document.body)
    : null;

  const getCarrierSaveEntries = () => {
    const s = pricingSaveRef.current;
    return [
      ["pol_costs", serializePolCosts(s.polCostO)],
      ["pol_margins", JSON.stringify(s.polM)],
      ["pol_margins_future", JSON.stringify(s.polMFuture)],
      ["global_margins", JSON.stringify(s.margins)],
      ["area_margins", JSON.stringify(s.areaM)],
      ["margin_timestamps", JSON.stringify(s.marginTs)],
      ["area_margin_timestamps", JSON.stringify(s.areaTs)],
      ["pol_margin_timestamps", JSON.stringify(s.polTs)],
      ["pol_margin_timestamps_future", JSON.stringify(s.polTsFuture)],
      ["carrier_rates_json", JSON.stringify(s.carrierRates)],
      ["carrier_drop_rates_json", JSON.stringify(s.carrierDropRates)],
      ["carrier_drop_margins_json", JSON.stringify(s.carrierDropMargins)],
      ["validity_info_json", JSON.stringify(s.validityInfo)],
    ];
  };

  const getRentalSaveEntries = () => {
    const s = pricingSaveRef.current;
    return [
      ["rental_rates_json", JSON.stringify(s.rentalRates)],
      ["rental_global_margins", JSON.stringify(s.rentalMargins)],
      ["rental_area_margins", JSON.stringify(s.rentalAreaM)],
      ["rental_pol_margins", JSON.stringify(s.rentalPolM)],
      ["rental_margin_timestamps", JSON.stringify(s.rentalMarginTs)],
      ["rental_area_margin_timestamps", JSON.stringify(s.rentalAreaTs)],
      ["rental_pol_margin_timestamps", JSON.stringify(s.rentalPolTs)],
      ["validity_info_json", JSON.stringify(s.validityInfo)],
    ];
  };

  const getPricingSaveEntries = () => [...getCarrierSaveEntries(), ...getRentalSaveEntries().filter(
    ([k]) => k !== "validity_info_json"
  )];

  const persistCarrierQuiet = () => enqueueSave(() => saveSettingsEntries(getCarrierSaveEntries()));
  const persistRentalQuiet = () => enqueueSave(() => saveSettingsEntries(getRentalSaveEntries()));
  const persistPricingQuiet = () => enqueueSave(async () => {
    await saveSettingsEntries(getCarrierSaveEntries());
    try {
      await saveSettingsEntries(getRentalSaveEntries());
    } catch (e) {
      console.warn("rental save deferred", e);
    }
  });

  const buildPricingCache = () => {
    const s = pricingSaveRef.current;
    return {
      v: 1,
      polCostO: s.polCostO,
      margins: s.margins,
      areaM: s.areaM,
      polM: s.polM,
      polMFuture: s.polMFuture,
      marginTs: s.marginTs,
      areaTs: s.areaTs,
      polTs: s.polTs,
      polTsFuture: s.polTsFuture,
      carrierRates: s.carrierRates,
      carrierDropRates: s.carrierDropRates,
      carrierDropMargins: s.carrierDropMargins,
      validityInfo: s.validityInfo,
      rentalRates: s.rentalRates,
      rentalMargins: s.rentalMargins,
      rentalAreaM: s.rentalAreaM,
      rentalPolM: s.rentalPolM,
      rentalMarginTs: s.rentalMarginTs,
      rentalAreaTs: s.rentalAreaTs,
      rentalPolTs: s.rentalPolTs,
    };
  };

  const applyPricingSnapshot = (snap, s = {}) => {
    if (!snap) return;
    if (settingBundleHas(s, "validity_info_json")
      || ["validity_snk", "validity_dy", "validity_ck", "validity_rental"].some(k => settingBundleHas(s, k))) {
      setValidityInfo(snap.validityInfo);
    }
    if (settingBundleHas(s, "carrier_rates_json")) setCarrierRates(snap.carrierRates);
    if (settingBundleHas(s, "rental_rates_json")) setRentalRates(snap.rentalRates);
    if (settingBundleHas(s, "global_margins")) setMargins(snap.margins);
    if (settingBundleHas(s, "area_margins")) setAreaM(snap.areaM);
    if (settingBundleHas(s, "pol_margins")) {
      setPolM(prev => {
        const next = snap.polM;
        if (countPolMarginOverrides(next) === 0 && countPolMarginOverrides(prev) > 0) return prev;
        return next;
      });
    }
    if (settingBundleHas(s, "pol_margins_future")) {
      setPolMFuture(prev => {
        const next = snap.polMFuture;
        if (countPolMarginOverrides(next) === 0 && countPolMarginOverrides(prev) > 0) return prev;
        return next;
      });
    }
    if (settingBundleHas(s, "margin_timestamps")) setMarginTs(snap.marginTs);
    if (settingBundleHas(s, "area_margin_timestamps")) setAreaTs(snap.areaTs);
    if (settingBundleHas(s, "pol_margin_timestamps")) setPolTs(snap.polTs);
    if (settingBundleHas(s, "pol_margin_timestamps_future")) setPolTsFuture(snap.polTsFuture);
    if (settingBundleHas(s, "rental_global_margins")) setRentalMargins(snap.rentalMargins);
    if (settingBundleHas(s, "rental_area_margins")) setRentalAreaM(snap.rentalAreaM);
    if (settingBundleHas(s, "rental_pol_margins")) setRentalPolM(snap.rentalPolM);
    if (settingBundleHas(s, "rental_margin_timestamps")) setRentalMarginTs(snap.rentalMarginTs);
    if (settingBundleHas(s, "rental_area_margin_timestamps")) setRentalAreaTs(snap.rentalAreaTs);
    if (settingBundleHas(s, "rental_pol_margin_timestamps")) setRentalPolTs(snap.rentalPolTs);
    if (settingBundleHas(s, "pol_costs")) {
      setPolCostO(prev => {
        const server = snap.polCostO;
        const cached = readStoredPricingCache()?.polCostO;
        const merged = mergePolCostODeep(mergePolCostODeep(server, prev), cached);
        if (countPolCostOverrides(server) === 0 && countPolCostOverrides(merged) > 0) return merged;
        if (!polCostOHasSellOverrides(server) && polCostOHasSellOverrides(merged)) return merged;
        return merged;
      });
    }
    if (settingBundleHas(s, "carrier_drop_rates_json")) {
      setCarrierDropRates(snap.carrierDropRates ?? defaultCarrierDropRates());
    }
    if (settingBundleHas(s, "carrier_drop_margins_json")) {
      setCarrierDropMargins(snap.carrierDropMargins ?? defaultCarrierDropMargins());
    }
  };

  const applyPricingFromSettings = (s, opts = {}) => {
    const snap = parsePricingFromSettings(s);
    applyPricingSnapshot(snap, s);
    const prev = readStoredPricingCache();
    const patch = pricingCacheFromSnapshot(snap);
    const cacheKeys = [
      ["pol_costs", "polCostO"],
      ["global_margins", "margins"],
      ["area_margins", "areaM"],
      ["pol_margins", "polM"],
      ["pol_margins_future", "polMFuture"],
      ["margin_timestamps", "marginTs"],
      ["area_margin_timestamps", "areaTs"],
      ["pol_margin_timestamps", "polTs"],
      ["pol_margin_timestamps_future", "polTsFuture"],
      ["carrier_rates_json", "carrierRates"],
      ["carrier_drop_rates_json", "carrierDropRates"],
      ["carrier_drop_margins_json", "carrierDropMargins"],
      ["rental_rates_json", "rentalRates"],
      ["rental_global_margins", "rentalMargins"],
      ["rental_area_margins", "rentalAreaM"],
      ["rental_pol_margins", "rentalPolM"],
      ["rental_margin_timestamps", "rentalMarginTs"],
      ["rental_area_margin_timestamps", "rentalAreaTs"],
      ["rental_pol_margin_timestamps", "rentalPolTs"],
      ["validity_info_json", "validityInfo"],
    ];
    const merged = { v: 1, ...(prev || {}) };
    cacheKeys.forEach(([settingKey, cacheKey]) => {
      if (settingBundleHas(s, settingKey)) merged[cacheKey] = patch[cacheKey];
    });
    if (["validity_snk", "validity_dy", "validity_ck", "validity_rental"].some(k => settingBundleHas(s, k))) {
      merged.validityInfo = patch.validityInfo;
    }
    if (settingBundleHas(s, "pol_costs") || settingBundleHas(s, "pol_margins") || settingBundleHas(s, "pol_margins_future")) {
      merged.pricingSavedAt = merged.pricingSavedAt || Date.now();
    }
    const markSynced = opts.markServerSynced !== false;
    if (markSynced && (settingBundleHas(s, "pol_costs") || settingBundleHas(s, "pol_margins") || settingBundleHas(s, "global_margins"))) {
      merged.serverSyncedAt = Date.now();
    }
    writePricingCache(merged);
  };

  const writePricingCache = (payload) => {
    try {
      localStorage.setItem(PRICING_CACHE_KEY, JSON.stringify(payload ?? buildPricingCache()));
    } catch (_) {}
  };

  const saveAllSettings = () => runSave("전체 설정", () => saveSettingsEntries([
    ["notices_json", JSON.stringify(notices)],
    ["notice_text", notices[0].text],
    ["notice_on", notices[0].on],
    ["notice_file_url", notices[0].fileUrl],
    ["validity_info_json", JSON.stringify(validityInfo)],
    ["carrier_rates_json", JSON.stringify(carrierRates)],
    ["carrier_drop_rates_json", JSON.stringify(carrierDropRates)],
    ["carrier_drop_margins_json", JSON.stringify(carrierDropMargins)],
    ["rental_rates_json", JSON.stringify(rentalRates)],
    ["validity_snk", legacyValidityCurrent("SNK")],
    ["validity_dy", legacyValidityCurrent("DY")],
    ["validity_ck", legacyValidityCurrent("CK")],
    ["validity_rental", legacyValidityCurrent("RENTAL")],
    ["global_margins", JSON.stringify(margins)],
    ["area_margins", JSON.stringify(areaM)],
    ["pol_margins", JSON.stringify(polM)],
    ["pol_margins_future", JSON.stringify(polMFuture)],
    ["margin_timestamps", JSON.stringify(marginTs)],
    ["area_margin_timestamps", JSON.stringify(areaTs)],
    ["pol_margin_timestamps", JSON.stringify(polTs)],
    ["pol_margin_timestamps_future", JSON.stringify(polTsFuture)],
    ["rental_global_margins", JSON.stringify(rentalMargins)],
    ["rental_area_margins", JSON.stringify(rentalAreaM)],
    ["rental_pol_margins", JSON.stringify(rentalPolM)],
    ["rental_margin_timestamps", JSON.stringify(rentalMarginTs)],
    ["rental_area_margin_timestamps", JSON.stringify(rentalAreaTs)],
    ["rental_pol_margin_timestamps", JSON.stringify(rentalPolTs)],
    ["pol_costs", serializePolCosts(polCostO)],
    ["ad_banners_json", JSON.stringify(adBanners)],
  ]));

  const applyNoticesAndAdsFromSettings = (s) => {
    if (s.notices_json) {
      try {
        const parsed = JSON.parse(s.notices_json);
        if (Array.isArray(parsed)) {
          setNotices(mkNotices().map((n, i) => {
            const p = parsed[i];
            if (!p) return n;
            return { ...n, text: p.text ?? "", fileUrl: p.fileUrl ?? "", title: p.title || n.title, on: parseNoticeOn(p.on) };
          }));
        }
      } catch (e) {}
    } else if (s.notice_text !== undefined || s.notice_on !== undefined || s.notice_file_url !== undefined) {
      setNotices(prev => prev.map((n, i) => i === 0 ? {
        ...n,
        text: s.notice_text ?? "",
        on: s.notice_on === "true",
        fileUrl: s.notice_file_url ?? "",
      } : n));
    }
    if (s.ad_banners_json || s.ad_banner_json) {
      setAdBanners(parseAdsFromSettings(s));
    }
  };

  const applySettingsBundle = (s, opts = {}) => {
    applyPricingFromSettings(s, opts);
    applyNoticesAndAdsFromSettings(s);
  };

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const deferExclude = [...HEAVY_SETTING_KEYS_LIST, ...PRICING_LIGHT_KEYS];
        const [polCostsRows, pricingLightRows] = await Promise.all([
          fetchSettingsByKey("pol_costs"),
          fetchSettingsInKeys(PRICING_LIGHT_KEYS),
        ]);
        if (cancelled) return;

        const priority = {
          ...settingsMapFromRows(pricingLightRows),
          ...settingsMapFromRows(polCostsRows),
        };
        const cached = readStoredPricingCache();
        const serverSnap = parsePricingFromSettings(priority);
        const cacheCosts = cached?.polCostO;
        const serverCosts = serverSnap.polCostO || {};
        const mergedCosts = mergePolCostODeep(serverCosts, cacheCosts || {});
        const cacheMargins = cached?.polM;
        const serverMargins = serverSnap.polM;
        const cacheMarginsFuture = cached?.polMFuture;
        const serverMarginsFuture = serverSnap.polMFuture;
        const costsDiffer = cacheCosts && JSON.stringify(cacheCosts) !== JSON.stringify(serverCosts);
        const mergedDiffersFromServer = JSON.stringify(mergedCosts) !== JSON.stringify(serverCosts);
        const marginsDiffer = cacheMargins && JSON.stringify(cacheMargins) !== JSON.stringify(serverMargins);
        const marginsFutureDiffer = cacheMarginsFuture && JSON.stringify(cacheMarginsFuture) !== JSON.stringify(serverMarginsFuture);
        const cacheNewer = (cached?.pricingSavedAt || 0) > (cached?.serverSyncedAt || 0);
        const pendingCostResync = cacheNewer && (costsDiffer || mergedDiffersFromServer);
        const pendingMarginResync = (marginsDiffer || marginsFutureDiffer) && cacheNewer;

        priority.pol_costs = serializePolCosts(mergedCosts);
        if (pendingMarginResync && cacheMargins) priority.pol_margins = JSON.stringify(cacheMargins);
        if (pendingMarginResync && cacheMarginsFuture) priority.pol_margins_future = JSON.stringify(cacheMarginsFuture);

        applySettingsBundle(priority, { markServerSynced: !pendingCostResync && !pendingMarginResync });

        if (pendingCostResync || pendingMarginResync) {
          skipAutoSaveRef.current = true;
          enqueueNetworkWrite(async () => {
            try {
              if (pendingCostResync) {
                await saveOneSettingWithRetry("pol_costs", serializePolCosts(mergedCosts));
              }
              if (pendingMarginResync) {
                await saveSettingsEntries([
                  ...(cacheMargins ? [["pol_margins", JSON.stringify(cacheMargins)]] : []),
                  ...(cached?.polTs ? [["pol_margin_timestamps", JSON.stringify(cached.polTs)]] : []),
                  ...(cacheMarginsFuture ? [["pol_margins_future", JSON.stringify(cacheMarginsFuture)]] : []),
                  ...(cached?.polTsFuture ? [["pol_margin_timestamps_future", JSON.stringify(cached.polTsFuture)]] : []),
                ]);
              }
              writePricingCache({
                ...(readStoredPricingCache() || {}),
                polCostO: mergedCosts,
                serverSyncedAt: Date.now(),
                pricingSavedAt: Date.now(),
              });
            } catch (e) {
              console.warn("cache re-sync failed", e);
            }
          });
          setTimeout(() => { skipAutoSaveRef.current = false; }, 4000);
        } else {
          setTimeout(() => { skipAutoSaveRef.current = false; }, 4000);
        }

        setSettingsLoaded(true);
        setTimeout(() => syncRateHistoryBaseline(), 500);

        const [rentalRows, carrierRows, miscRows] = await Promise.all([
          fetchSettingsByKey("rental_rates_json"),
          fetchSettingsByKey("carrier_rates_json"),
          fetchSettingsExceptKeys(deferExclude),
        ]);
        if (cancelled) return;

        applySettingsBundle({
          ...settingsMapFromRows(rentalRows),
          ...settingsMapFromRows(carrierRows),
          ...settingsMapFromRows(miscRows),
        });
      } catch (err) {
        console.error("settings load failed", err);
        setSettingsLoaded(true);
        skipAutoSaveRef.current = false;
      }
    };

    loadSettings();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (skipAutoSaveRef.current || !isAdmin || saveBusy) return;
    writePricingCache(buildPricingCache());
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const task = showCarrierAdmin
        ? () => saveSettingsEntries(getCarrierSaveEntries())
        : showRentalAdmin
          ? () => saveSettingsEntries(getRentalSaveEntries())
          : async () => {
              await saveSettingsEntries(getCarrierSaveEntries());
              try {
                await saveSettingsEntries(getRentalSaveEntries());
              } catch (e) {
                console.warn("rental auto-save deferred", e);
              }
            };
      enqueueSave(task)
        .then(() => {
          writePricingCache({
            ...buildPricingCache(),
            pricingSavedAt: Date.now(),
            serverSyncedAt: Date.now(),
          });
          recordRateHistory({ source: "auto_save" });
        })
        .catch(err => {
          console.error("auto-save failed", err);
          writePricingCache({ ...buildPricingCache(), pricingSavedAt: Date.now() });
        });
    }, 2500);
    return () => clearTimeout(autoSaveTimerRef.current);
  }, [
    isAdmin,
    saveBusy,
    showCarrierAdmin,
    showRentalAdmin,
    polCostO,
    margins,
    areaM,
    polM,
    polMFuture,
    marginTs,
    areaTs,
    polTs,
    polTsFuture,
    carrierRates,
    carrierDropRates,
    carrierDropMargins,
    validityInfo,
    rentalRates,
    rentalMargins,
    rentalAreaM,
    rentalPolM,
    rentalMarginTs,
    rentalAreaTs,
    rentalPolTs,
  ]);

  const sz = si => (si === 0 ? "c20" : "c40");
  const mkPrice = (cost, margin, cr) => ({
    cost: cost ?? null,
    margin: margin ?? 0,
    sell: cost != null ? cost + (margin ?? 0) : null,
    cr,
  });
  const getCarrierCostOverride = (pol, cr, t, period) => {
    const c = polCostO[pol]?.carrier?.[cr];
    if (c?.[period]?.[t] != null && c[period][t] !== "") return c[period][t];
    if (period === "current" && c?.[t] != null && c[t] !== "") return c[t];
    const g = carrierRates[cr]?.[period]?.[t];
    if (g != null && g !== "") return Number(g);
    return null;
  };

  const getCarrierRate = (row, cr, t, period = ratePeriod) => {
    const p = period === "future" ? "future" : "current";
    const ov = getCarrierCostOverride(row.pol, cr, t, p);
    return ov != null ? ov : row.rates[cr][t];
  };

  const getRentalBase = (rPol, city, si, period = ratePeriod) => {
    const p = period === "future" ? "future" : "current";
    const sk = sz(si);
    const bucket = rentalRates[rPol]?.[p]?.[city];
    if (bucket && bucket[sk] != null && bucket[sk] !== "") return Number(bucket[sk]);
    if (p === "future") {
      const cur = rentalRates[rPol]?.current?.[city]?.[sk];
      if (cur != null && cur !== "") return Number(cur);
    }
    const row = rData.find(r => r.pol === rPol);
    if (!row) return null;
    return si === 0 ? row.r20[city] : row.r40[city];
  };

  const applyRentalRate = (rPol, city, si, value, period = "current") => {
    const raw = String(value).trim();
    const sk = sz(si);
    const p = period === "future" ? "future" : "current";
    clearRentCostOverrides(PM[rPol] || null, city);
    setRentalRates(prev => {
      const polBucket = { current: { ...(prev[rPol]?.current || {}) }, future: { ...(prev[rPol]?.future || {}) } };
      const periodBucket = { ...polBucket[p] };
      const cityBucket = { ...(periodBucket[city] || {}) };
      if (raw === "") delete cityBucket[sk];
      else {
        const v = parseInt(raw, 10);
        if (!Number.isFinite(v)) return prev;
        cityBucket[sk] = v;
      }
      if (Object.keys(cityBucket).length === 0) delete periodBucket[city];
      else periodBucket[city] = cityBucket;
      return { ...prev, [rPol]: { ...polBucket, [p]: periodBucket } };
    });
  };

  const clearRentCostOverrides = (freightPol, city = null) => {
    if (!freightPol) return;
    setPolCostO(p => {
      const rent = p[freightPol]?.rent;
      if (!rent) return p;
      const next = { ...p, [freightPol]: { ...p[freightPol], rent: { ...rent } } };
      if (city) {
        delete next[freightPol].rent[city];
        if (Object.keys(next[freightPol].rent).length === 0) delete next[freightPol].rent;
      } else {
        delete next[freightPol].rent;
      }
      return next;
    });
  };

  const applyCarrierRate = (pol, cr, t, value, period = "current") => {
    const raw = String(value).trim();
    if (t === "soc20" || t === "soc40") clearRentCostOverrides(pol);
    setPolCostO(p => {
      const prev = { ...(p[pol]?.carrier?.[cr] || {}) };
      const bucket = { ...(prev[period] || {}) };
      if (raw === "") delete bucket[t];
      else {
        const v = parseInt(raw, 10);
        if (!Number.isFinite(v)) return p;
        bucket[t] = v;
      }
      const nextCr = { ...prev, [period]: bucket };
      delete nextCr[t];
      return {
        ...p,
        [pol]: {
          ...(p[pol] || {}),
          carrier: { ...(p[pol]?.carrier || {}), [cr]: nextCr },
        },
      };
    });
  };

  const applyCarrierSell = (pol, cr, t, value, period = "current") => {
    const raw = String(value).trim();
    setPolCostO(p => {
      const prev = { ...(p[pol]?.carrier?.[cr] || {}) };
      const bucket = { ...(prev[period] || {}) };
      const sellBucket = { ...(bucket.sell || {}) };
      if (raw === "") delete sellBucket[t];
      else {
        const v = parseInt(raw, 10);
        if (!Number.isFinite(v)) return p;
        sellBucket[t] = v;
      }
      if (Object.keys(sellBucket).length === 0) delete bucket.sell;
      else bucket.sell = sellBucket;
      const nextCr = { ...prev, [period]: bucket };
      delete nextCr[t];
      return {
        ...p,
        [pol]: {
          ...(p[pol] || {}),
          carrier: { ...(p[pol]?.carrier || {}), [cr]: nextCr },
        },
      };
    });
  };

  const getCarrierDropAddon = (cr, cityKey, si, period = "current") => {
    const p = period === "future" ? "future" : "current";
    const sk = sz(si);
    const stored = carrierDropRates[cr]?.[p]?.[cityKey]?.[sk];
    if (stored != null && stored !== "") return Number(stored);
    const d = DO[cityKey]?.[cr];
    return d ? d[si] : null;
  };

  const getDropM = (cr, cityKey, si) => {
    const sk = sz(si);
    const v = carrierDropMargins[cr]?.[cityKey]?.[sk];
    return v != null && v !== "" ? Number(v) : 0;
  };

  const getCarrierDropTotalCost = (row, cr, cityKey, si, period = "current") => {
    const t = si === 0 ? "coc20" : "coc40";
    const ocean = getCarrierRate(row, cr, t, period);
    const addon = getCarrierDropAddon(cr, cityKey, si, period);
    if (ocean == null || addon == null) return null;
    return ocean + addon;
  };

  const applyCarrierDropRate = (cr, cityKey, si, value, period = "current") => {
    const raw = String(value).trim();
    const sk = sz(si);
    const p = period === "future" ? "future" : "current";
    setCarrierDropRates(prev => {
      const crBucket = { current: { ...(prev[cr]?.current || {}) }, future: { ...(prev[cr]?.future || {}) } };
      const periodBucket = { ...crBucket[p] };
      const cityBucket = { ...(periodBucket[cityKey] || {}) };
      if (raw === "") delete cityBucket[sk];
      else {
        const v = parseInt(raw, 10);
        if (!Number.isFinite(v)) return prev;
        cityBucket[sk] = v;
      }
      if (Object.keys(cityBucket).length === 0) delete periodBucket[cityKey];
      else periodBucket[cityKey] = cityBucket;
      return { ...prev, [cr]: { ...crBucket, [p]: periodBucket } };
    });
  };

  const applyCarrierDropMargin = (cr, cityKey, si, value) => {
    const raw = String(value).trim();
    const sk = sz(si);
    setCarrierDropMargins(prev => {
      const crBucket = { ...(prev[cr] || {}) };
      const cityBucket = { ...(crBucket[cityKey] || { c20: 0, c40: 0 }) };
      if (raw === "") cityBucket[sk] = 0;
      else {
        const v = parseInt(raw, 10);
        if (!Number.isFinite(v)) return prev;
        cityBucket[sk] = v;
      }
      return { ...prev, [cr]: { ...crBucket, [cityKey]: cityBucket } };
    });
  };

  const setGlobalCarrierRate = (cr, period, t, value) => {
    setCarrierRates(p => ({
      ...p,
      [cr]: {
        ...p[cr],
        [period]: { ...p[cr][period], [t]: value },
      },
    }));
  };
  const getDropCityCost = (row, cityKey, si) => {
    const ov = polCostO[row.pol]?.drop?.[cityKey]?.[sz(si)];
    if (ov != null) return ov;
    return bDO(row, cityKey, si).val;
  };
  const applyDropCityCost = (pol, cityKey, si, value) => {
    const v = parseInt(value, 10);
    if (!Number.isFinite(v)) return;
    setPolCostO(p => ({
      ...p,
      [pol]: {
        ...(p[pol] || {}),
        drop: { ...(p[pol]?.drop || {}), [cityKey]: { ...(p[pol]?.drop?.[cityKey] || {}), [sz(si)]: v } },
      },
    }));
  };
  const getRentCombinedCost = (freightPol, rPol, city, si, carrierCr = null) => {
    const fp = PM[rPol] || freightPol;
    const fr = fMap[fp];
    const t = rentSocType(si);
    const rental = getRentalBase(rPol, city, si);
    if (!fr) return rental ?? null;
    if (carrierCr) {
      const soc = getCarrierRate(fr, carrierCr, t);
      return soc != null && rental != null ? soc + rental : null;
    }
    let best = null;
    CRS.forEach(k => {
      const soc = getCarrierRate(fr, k, t);
      if (soc == null || rental == null) return;
      const cost = soc + rental;
      if (best === null || cost < best) best = cost;
    });
    return best;
  };

  const getRentCityCost = (freightPol, rPol, city, rRow, si) => {
    const manual = polCostO[freightPol]?.rent?.[city]?.[sz(si)];
    if (manual != null && manual !== "") return manual;
    return getRentCombinedCost(freightPol, rPol, city, si);
  };

  const getRentSellMargin = (freightPol, rPol, area, si) => {
    const fp = PM[rPol] || freightPol;
    if (!fp || !area) return 0;
    return getM(fp, area, rentSocType(si), ratePeriod) + getRentalM(fp, area, rentRentalType(si));
  };

  const applyRentCityCost = (freightPol, city, si, value) => {
    const raw = String(value).trim();
    if (raw === "") {
      setPolCostO(p => {
        const rent = { ...(p[freightPol]?.rent || {}) };
        const cityBucket = { ...(rent[city] || {}) };
        delete cityBucket[sz(si)];
        const next = { ...p, [freightPol]: { ...(p[freightPol] || {}), rent: { ...rent } } };
        if (Object.keys(cityBucket).length === 0) delete next[freightPol].rent[city];
        else next[freightPol].rent[city] = cityBucket;
        if (Object.keys(next[freightPol].rent || {}).length === 0) delete next[freightPol].rent;
        return next;
      });
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setPolCostO(p => ({
      ...p,
      [freightPol]: {
        ...(p[freightPol] || {}),
        rent: { ...(p[freightPol]?.rent || {}), [city]: { ...(p[freightPol]?.rent?.[city] || {}), [sz(si)]: v } },
      },
    }));
  };
  const clearPolCost = (pol, kind, key, cityKey) => {
    setPolCostO(p => {
      const next = { ...p, [pol]: { ...(p[pol] || {}) } };
      if (kind === "carrier" && key) {
        const c = { ...(next[pol].carrier || {}) };
        delete c[key];
        next[pol].carrier = c;
      } else if (kind === "drop" && cityKey) {
        const d = { ...(next[pol].drop || {}) };
        delete d[cityKey];
        next[pol].drop = d;
      } else if (kind === "rent" && cityKey) {
        const r = { ...(next[pol].rent || {}) };
        delete r[cityKey];
        next[pol].rent = r;
      }
      return next;
    });
  };

  const bNet = (row, t) => {
    let b = null, cr = null;
    CRS.forEach(k => {
      const v = getCarrierRate(row, k, t);
      if (v != null && (b === null || v < b)) { b = v; cr = k; }
    });
    return { val: b, cr };
  };
  const bDO = (row, city, si) => {
    const t = si === 0 ? "coc20" : "coc40";
    let b = null, cr = null;
    CRS.forEach(k => {
      const tot = getCarrierDropTotalCost(row, k, city, si);
      if (tot != null && (b === null || tot < b)) { b = tot; cr = k; }
    });
    return { val: b, cr };
  };
  const cRent = (rPol, city, rRow) => {
    const fp = PM[rPol];
    if (!fp || !fMap[fp]) return [];
    const fr = fMap[fp];
    const r20 = getRentalBase(rPol, city, 0), r40 = getRentalBase(rPol, city, 1);
    return CRS.map(k => {
      const s20 = getCarrierRate(fr, k, "soc20");
      const s40 = getCarrierRate(fr, k, "soc40");
      const m20 = getM(fp, fr.area, "soc20", ratePeriod) + getRentalM(fp, fr.area, "r20");
      const m40 = getM(fp, fr.area, "soc40", ratePeriod) + getRentalM(fp, fr.area, "r40");
      const cost20 = s20 != null && r20 != null ? s20 + r20 : null;
      const cost40 = s40 != null && r40 != null ? s40 + r40 : null;
      return {
        k,
        cost20, cost40, soc20: s20, soc40: s40, rent20: r20, rent40: r40, m20, m40,
        t20: cost20 != null ? cost20 + m20 : null,
        t40: cost40 != null ? cost40 + m40 : null,
      };
    }).filter(x => x.t20 != null || x.t40 != null);
  };
  const bRent = (rPol, city, rRow, si) => {
    const all = cRent(rPol, city, rRow);
    let b = null, cr = null;
    all.forEach(x => {
      const v = si === 0 ? x.t20 : x.t40;
      if (v != null && (b === null || v < b)) { b = v; cr = x.k; }
    });
    return { val: b, cr };
  };
  const rentDetail = (rPol, city, rRow, si) => {
    const fp = PM[rPol];
    const freightPol = fp || rPol;
    const fr = fp ? fMap[fp] : null;
    const margin = fr ? getRentSellMargin(freightPol, rPol, fr.area, si) : 0;
    const b = bRent(rPol, city, rRow, si);
    const cost = getRentCityCost(freightPol, rPol, city, rRow, si);
    return mkPrice(cost, margin, b.cr);
  };
  const oceanDetail = (row, t) => {
    const b = bNet(row, t);
    const cost = b.val;
    const cr = b.cr;
    if (cost != null && cr) {
      const sell = getGuestCarrierSell(row.pol, cr, t, ratePeriod, cost, row.area);
      return mkPrice(cost, sell - cost, cr);
    }
    return mkPrice(cost, getM(row.pol, row.area, t, ratePeriod), cr);
  };
  const doDetail = (row, cityKey, si) => {
    const t = si === 0 ? "coc20" : "coc40";
    const b = bDO(row, cityKey, si);
    const cost = getDropCityCost(row, cityKey, si);
    const dropM = b.cr ? getDropM(b.cr, cityKey, si) : 0;
    return mkPrice(cost, getM(row.pol, row.area, t, ratePeriod) + dropM, b.cr);
  };
  const dropCarrierDetail = (row, cityKey, cr, si, period = ratePeriod) => {
    const t = si === 0 ? "coc20" : "coc40";
    const cost = getCarrierDropTotalCost(row, cr, cityKey, si, period);
    if (cost == null) return mkPrice(null, 0, cr);
    const oceanCost = getCarrierRate(row, cr, t, period);
    const dropM = getDropM(cr, cityKey, si);
    if (oceanCost != null) {
      const oceanSell = getGuestCarrierSell(row.pol, cr, t, period, oceanCost, row.area);
      return mkPrice(cost, (oceanSell - oceanCost) + dropM, cr);
    }
    return mkPrice(cost, getM(row.pol, row.area, t, period) + dropM, cr);
  };
  const openSC = (k,type,route) => setSc({sc:`${k}-${type.includes("coc")?"COC":"SOC"}-123456`,k,route,size:type.includes("20")?"20'":"40'"});
  const copySC = () => { try{const t=document.createElement("textarea");t.value=sc.sc;t.style.cssText="position:fixed;left:-9999px";document.body.appendChild(t);t.select();document.execCommand("copy");document.body.removeChild(t);}catch(e){} setSc({...sc,copied:true}); setTimeout(()=>setSc(null),1500); };

  const filt = useMemo(()=>{ let d=fData; if(areaF!=="ALL")d=d.filter(r=>r.area===areaF); if(search)d=d.filter(r=>r.pol.toLowerCase().includes(search.toLowerCase())); return d; },[fData,areaF,search]);
  const rFilt = useMemo(()=>{
    const byRental = Object.fromEntries(rData.map(r => [r.pol, r]));
    let routes = fData;
    if (areaF !== "ALL") routes = routes.filter(r => r.area === areaF);
    if (search) {
      const q = search.toLowerCase();
      routes = routes.filter(r =>
        r.pol.toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q) ||
        (F_TO_R[r.pol] && F_TO_R[r.pol].toLowerCase().includes(q))
      );
    }
    return routes.map(fr => {
      const rentalPol = F_TO_R[fr.pol];
      if (!rentalPol) return null;
      const row = byRental[rentalPol];
      if (!row) return null;
      return { ...row, area: fr.area, displayPol: fr.pol };
    }).filter(Boolean);
  }, [fData, rData, areaF, search]);

  const ff = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

  const activeNoticeQueue = useMemo(
    () => notices.map((n, i) => ({ ...n, i })).filter(n => n.on && (n.text || n.fileUrl)),
    [notices]
  );
  const activeAds = useMemo(
    () => adBanners.filter(a => a.on && a.imageUrl),
    [adBanners]
  );
  const adVisible = activeAds.length > 0 && !adDismissed;
  const currentNoticePopup = activeNoticeQueue.find(n => !dismissedNotices.has(n.i));
  const dismissCurrentNotice = () => {
    if (currentNoticePopup) setDismissedNotices(prev => new Set([...prev, currentNoticePopup.i]));
  };

  const saveNoticesOnly = () => runSave("공지", () => saveNoticeSettings());

  const saveCarrierPricing = () => runSave("선사 운임", async () => {
    clearTimeout(autoSaveTimerRef.current);
    const entries = getCarrierSaveEntries();
    const light = entries.filter(([k]) => !HEAVY_SETTING_KEYS.has(k));
    const heavy = entries.filter(([k]) => HEAVY_SETTING_KEYS.has(k));
    if (light.length) {
      await postSettingsRows(light.map(([key, value]) => ({ key, value: String(value) })), "carrier settings");
    }
    for (const [key, value] of heavy) {
      await saveOneSettingWithRetry(key, value);
    }
  });

  const saveRentalPricing = () => runSave("렌탈 운임", async () => {
    clearTimeout(autoSaveTimerRef.current);
    await saveSettingsEntries(getRentalSaveEntries());
    writePricingCache();
  });

  const renderNoticeFile = (fileUrl, title) => {
    if (!fileUrl) return null;
    const ext = fileUrl.split(".").pop().toLowerCase();
    if (ext === "pdf") return (
      <div style={{ width:"100%", borderRadius:8, overflow:"hidden", border:"1px solid #e5e7eb" }}>
        <iframe src={fileUrl} style={{ width:"100%", height:400, border:"none" }} title={title}/>
      </div>
    );
    return <img src={fileUrl} alt={title} style={{ width:"100%", borderRadius:8, border:"1px solid #e5e7eb" }}/>;
  };

  // ── CLIENT MANAGEMENT ──
  if (showMgr && isAdmin) return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
      {adminSaveToastEl}
      <div style={{position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:30}}>
        <button onClick={()=>setShowMgr(false)} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
        <div style={{fontSize:14,fontWeight:700}}>Client Management</div>
        <button onClick={()=>{setAddForm(!addForm); if(!clients.length)loadClients();}} style={{fontSize:13,color:"#2563eb",fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>+ Add</button>
      </div>
      <div style={{maxWidth:600,margin:"0 auto",padding:"16px 16px 80px"}}>
        {addForm && (
          <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:12,padding:16,marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1d4ed8",marginBottom:12}}>New Client</div>
            {[["company_name","Company Name"],["email","Email"],["password_hash","Password"]].map(([k,l])=>(
              <input key={k} placeholder={l} value={newC[k]} onChange={e=>setNewC(p=>({...p,[k]:e.target.value}))}
                style={{width:"100%",padding:"8px 12px",fontSize:13,border:"1px solid #d1d5db",borderRadius:8,marginBottom:8,boxSizing:"border-box"}}/>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:12}}>
              {["coc20","coc40","soc20","soc40"].map(t=>(
                <div key={t}><div style={{fontSize:10,color:"#6b7280",marginBottom:2}}>{t.toUpperCase()}</div>
                  <input type="number" value={newC[`margin_${t}`]} onChange={e=>setNewC(p=>({...p,[`margin_${t}`]:parseInt(e.target.value)||0}))}
                    style={{width:"100%",padding:"6px 8px",fontSize:13,border:"1px solid #d1d5db",borderRadius:6,boxSizing:"border-box"}}/></div>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setAddForm(false)} style={{flex:1,padding:"8px",fontSize:12,color:"#6b7280",background:"#f3f4f6",border:"none",borderRadius:8,cursor:"pointer"}}>Cancel</button>
              <button onClick={saveClient} style={{flex:1,padding:"8px",fontSize:12,color:"#fff",background:"#2563eb",border:"none",borderRadius:8,cursor:"pointer"}}>Save</button>
            </div>
          </div>
        )}
        <button onClick={loadClients} style={{width:"100%",padding:"8px",fontSize:12,color:"#6b7280",background:"#fff",border:"1px solid #e5e7eb",borderRadius:8,cursor:"pointer",marginBottom:12}}>Refresh</button>
        {clients.map(c=>(
          <div key={c.id} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:16,marginBottom:12}}>
            {editC?.id===c.id ? (
              <div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:12}}>
                  {["coc20","coc40","soc20","soc40"].map(t=>(
                    <div key={t}><div style={{fontSize:10,color:"#6b7280",marginBottom:2}}>{t.toUpperCase()}</div>
                      <input type="number" value={editC[`margin_${t}`]} onChange={e=>setEditC(p=>({...p,[`margin_${t}`]:parseInt(e.target.value)||0}))}
                        style={{width:"100%",padding:"6px 8px",fontSize:13,border:"1px solid #d1d5db",borderRadius:6,boxSizing:"border-box"}}/></div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setEditC(null)} style={{flex:1,padding:"6px",fontSize:12,color:"#6b7280",background:"#f3f4f6",border:"none",borderRadius:6,cursor:"pointer"}}>Cancel</button>
                  <button onClick={()=>updateMargins(c.id,{margin_coc20:editC.margin_coc20,margin_coc40:editC.margin_coc40,margin_soc20:editC.margin_soc20,margin_soc40:editC.margin_soc40})}
                    style={{flex:1,padding:"6px",fontSize:12,color:"#fff",background:"#2563eb",border:"none",borderRadius:6,cursor:"pointer"}}>Save</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <span style={{fontSize:14,fontWeight:700,color:"#111"}}>{c.company_name}</span>
                    <span style={{marginLeft:8,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:c.is_active?"#dcfce7":"#fee2e2",color:c.is_active?"#166534":"#991b1b"}}>{c.is_active?"Active":"Inactive"}</span>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setEditC({...c})} style={{fontSize:11,color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:6,padding:"3px 10px",background:"none",cursor:"pointer"}}>Edit</button>
                    <button onClick={()=>toggleClient(c.id,c.is_active)} style={{fontSize:11,color:c.is_active?"#dc2626":"#16a34a",border:`1px solid ${c.is_active?"#fecaca":"#bbf7d0"}`,borderRadius:6,padding:"3px 10px",background:"none",cursor:"pointer"}}>{c.is_active?"Deactivate":"Activate"}</button>
                  </div>
                </div>
                <div style={{fontSize:12,color:"#9ca3af",marginBottom:6}}>{c.email}</div>
                <div style={{fontSize:11,color:"#6b7280",display:"flex",gap:12}}>
                  <span>COC20: +{c.margin_coc20}</span><span>COC40: +{c.margin_coc40}</span><span>SOC20: +{c.margin_soc20}</span><span>SOC40: +{c.margin_soc40}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ── EXCEL UPLOAD ADMIN ──
  if (showExcelUploadAdmin && isAdmin) {
    const fmt = UPLOAD_FORMATS.find(f => f.id === excelFormat);
    const sum = excelPreview ? previewSummary(excelPreview, excelPeriod) : null;
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: ff }}>
        {adminSaveToastEl}
        <div style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 30 }}>
          <button type="button" onClick={() => setShowExcelUploadAdmin(false)} style={{ fontSize: 13, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#b45309" }}>Excel 운임 업로드</div>
          <button type="button" onClick={applyExcelUpload} disabled={!excelPreview || saveBusy || excelUploading}
            style={{ fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8, background: !excelPreview || saveBusy ? "#fcd34d" : "#d97706", color: "#fff", border: "none", cursor: !excelPreview || saveBusy ? "not-allowed" : "pointer" }}>
            {saveBusy ? "저장 중…" : "업로드"}
          </button>
        </div>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 80px" }}>
          <div style={{ fontSize: 11, color: "#92400e", marginBottom: 12, lineHeight: 1.5 }}>
            선사 원본 Excel 또는 YSL 관리양식을 업로드하면 Supabase에 반영되고 Rate History에 기록됩니다.
          </div>

          <div style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", marginBottom: 8 }}>양식 선택</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {UPLOAD_FORMATS.map(f => (
                <label key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 8, background: excelFormat === f.id ? "#fffbeb" : "#fafafa", border: `1px solid ${excelFormat === f.id ? "#fbbf24" : "#e5e7eb"}`, cursor: "pointer" }}>
                  <input type="radio" name="excelFmt" checked={excelFormat === f.id} onChange={() => { setExcelFormat(f.id); setExcelPreview(null); setExcelMsg(""); if (excelWorkbook) setTimeout(refreshExcelPreview, 0); }} style={{ marginTop: 3 }}/>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>{f.label}</div>
                    <div style={{ fontSize: 10, color: "#a16207" }}>{f.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: "#6b7280" }}>적용 기간
              <select value={excelPeriod} onChange={e => { setExcelPeriod(e.target.value); if (excelWorkbook) setTimeout(refreshExcelPreview, 0); }}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" }}>
                <option value="current">현재 운임</option>
                <option value="future">향후 운임 (GRI)</option>
              </select>
            </label>
            {excelFormat === "YSL" ? (
              <label style={{ fontSize: 10, color: "#6b7280" }}>선사 시트
                <select value={excelYslCarrier} onChange={e => { setExcelYslCarrier(e.target.value); if (excelWorkbook) setTimeout(refreshExcelPreview, 0); }}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" }}>
                  {CRS.map(c => <option key={c} value={c}>{CN_KR[c]} ({c})</option>)}
                </select>
              </label>
            ) : (
              <label style={{ fontSize: 10, color: "#6b7280" }}>시트
                <select value={excelSheet} onChange={e => { setExcelSheet(e.target.value); if (excelWorkbook) setTimeout(refreshExcelPreview, 0); }} disabled={!excelWorkbook}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" }}>
                  {(excelWorkbook?.sheetNames || []).map(s => <option key={s} value={s}>{s}</option>)}
                  {!excelWorkbook && <option value="">파일 선택 후</option>}
                </select>
              </label>
            )}
          </div>

          {excelFormat === "YSL" && excelWorkbook && (
            <label style={{ fontSize: 10, color: "#6b7280", display: "block", marginBottom: 12 }}>시트
              <select value={excelSheet} onChange={e => { setExcelSheet(e.target.value); setTimeout(refreshExcelPreview, 0); }}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" }}>
                {excelWorkbook.sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}

          <label
            onDragOver={e => { e.preventDefault(); setExcelDragOver(true); }}
            onDragLeave={() => setExcelDragOver(false)}
            onDrop={e => { e.preventDefault(); setExcelDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleExcelFile(f); }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "28px 16px", background: excelDragOver ? "#fffbeb" : "#fff", border: `2px dashed ${excelDragOver ? "#f59e0b" : "#fcd34d"}`, borderRadius: 12, cursor: "pointer", marginBottom: 12 }}>
            <span style={{ fontSize: 32 }}>📊</span>
            <span style={{ fontSize: 13, color: "#b45309", fontWeight: 700 }}>{excelUploading ? "읽는 중…" : "Excel 파일 선택 또는 드래그"}</span>
            <span style={{ fontSize: 11, color: "#d97706" }}>.xlsx · {fmt?.hint}</span>
            <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleExcelFile(e.target.files[0]); e.target.value = ""; }} disabled={excelUploading}/>
          </label>

          {excelMsg && (
            <div style={{ fontSize: 12, marginBottom: 12, padding: 10, borderRadius: 8, color: excelMsg.startsWith("✅") ? "#166534" : "#dc2626", background: excelMsg.startsWith("✅") ? "#f0fdf4" : "#fef2f2", border: `1px solid ${excelMsg.startsWith("✅") ? "#bbf7d0" : "#fecaca"}` }}>{excelMsg}</div>
          )}

          {sum && excelPreview && (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 6 }}>{sum.title}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>{sum.detail}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 6 }}>샘플 (최대 3 POL)</div>
              {sum.sample.map(([pol, rates]) => (
                <div key={pol} style={{ fontSize: 11, padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontFamily: "monospace" }}>
                  <strong>{pol}</strong> {JSON.stringify(rates)}
                </div>
              ))}
              {(excelPreview.skipped || []).length > 0 && (
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 10 }}>
                  스킵: {(excelPreview.skipped || []).slice(0, 8).join(", ")}{(excelPreview.skipped.length > 8 ? " …" : "")}
                </div>
              )}
              <button type="button" onClick={applyExcelUpload} disabled={saveBusy}
                style={{ width: "100%", marginTop: 14, padding: "12px", fontSize: 13, fontWeight: 700, color: "#fff", background: saveBusy ? "#fcd34d" : "#d97706", border: "none", borderRadius: 8, cursor: saveBusy ? "not-allowed" : "pointer" }}>
                {saveBusy ? "저장 중…" : "✅ Supabase에 업로드 · Rate History 기록"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RATE HISTORY ADMIN ──
  if (showRateHistoryAdmin && isAdmin) {
    const fmtRhDate = (iso) => {
      if (!iso) return "—";
      try {
        return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      } catch { return iso; }
    };
    const rhSourceLabel = (s) => ({
      admin_save: "Admin 저장", auto_save: "자동 저장", excel_upload: "Excel 업로드",
      gri: "GRI", import: "기존운임 복사", import_undo: "복사 되돌리기", rental_save: "렌탈 저장",
    }[s] || s || "—");
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: ff }}>
        {adminSaveToastEl}
        <div style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 30 }}>
          <button type="button" onClick={() => setShowRateHistoryAdmin(false)} style={{ fontSize: 13, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f766e" }}>Rate History</div>
          <button type="button" onClick={loadRateHistory} disabled={rhLoading} style={{ fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 8, background: rhLoading ? "#99f6e4" : "#0d9488", color: "#fff", border: "none", cursor: rhLoading ? "not-allowed" : "pointer" }}>
            {rhLoading ? "…" : "검색"}
          </button>
        </div>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 16px 80px" }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0f766e", marginBottom: 10 }}>검색 조건</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: "#6b7280" }}>시작일
                <input type="date" value={rhDateFrom} onChange={e => setRhDateFrom(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }} />
              </label>
              <label style={{ fontSize: 10, color: "#6b7280" }}>종료일
                <input type="date" value={rhDateTo} onChange={e => setRhDateTo(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }} />
              </label>
              <label style={{ fontSize: 10, color: "#6b7280" }}>선사
                <select value={rhCarrier} onChange={e => setRhCarrier(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}>
                  {["ALL", ...CRS, "RENTAL"].map(c => <option key={c} value={c}>{c === "ALL" ? "전체" : (CN_KR[c] || c)}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 10, color: "#6b7280" }}>구간(Area)
                <select value={rhArea} onChange={e => setRhArea(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}>
                  <option value="ALL">전체</option>
                  {areas.map(a => <option key={a} value={a}>{a}</option>)}
                  <option value="DROP">DROP</option>
                </select>
              </label>
              <label style={{ fontSize: 10, color: "#6b7280" }}>기간
                <select value={rhPeriod} onChange={e => setRhPeriod(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}>
                  <option value="ALL">전체</option>
                  <option value="current">현재</option>
                  <option value="future">향후</option>
                </select>
              </label>
              <label style={{ fontSize: 10, color: "#6b7280" }}>유형
                <select value={rhCategory} onChange={e => setRhCategory(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}>
                  <option value="ALL">전체</option>
                  <option value="ocean">해상</option>
                  <option value="dropoff">Drop off</option>
                  <option value="rental">Rental</option>
                </select>
              </label>
            </div>
            <label style={{ fontSize: 10, color: "#6b7280", display: "block" }}>POL / 구간 검색
              <input type="text" value={rhPol} onChange={e => setRhPol(e.target.value)} placeholder="BUSAN, SHANGHAI, Moscow…" style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" }} />
            </label>
          </div>
          {rhError && (
            <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 10, marginBottom: 12 }}>{rhError}</div>
          )}
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>{rhLoading ? "불러오는 중…" : `${rhRows.length}건 (최대 400건)`}</div>
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 720 }}>
              <thead>
                <tr style={{ background: "#f0fdfa", borderBottom: "1px solid #e5e7eb" }}>
                  {["일시", "선사", "Area", "POL/구간", "타입", "기간", "매입", "매출", "마진", "출처"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 700, color: "#0f766e", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rhRows.length === 0 && !rhLoading && (
                  <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>기록 없음 · 저장 후 자동 적재됩니다</td></tr>
                )}
                {rhRows.map(row => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "7px 6px", whiteSpace: "nowrap", color: "#374151" }}>{fmtRhDate(row.created_at)}</td>
                    <td style={{ padding: "7px 6px", fontWeight: 600 }}>{CN_KR[row.carrier] || row.carrier}</td>
                    <td style={{ padding: "7px 6px", color: "#6b7280" }}>{row.area || "—"}</td>
                    <td style={{ padding: "7px 6px" }}>
                      <div style={{ fontWeight: 600 }}>{row.pol}</div>
                      {row.route && row.route !== row.pol && <div style={{ fontSize: 9, color: "#9ca3af" }}>{row.route}</div>}
                    </td>
                    <td style={{ padding: "7px 6px" }}>{row.rate_type}</td>
                    <td style={{ padding: "7px 6px" }}>{row.period === "future" ? "향후" : "현재"}</td>
                    <td style={{ padding: "7px 6px", textAlign: "right" }}>{row.cost != null ? n(row.cost) : "—"}</td>
                    <td style={{ padding: "7px 6px", textAlign: "right" }}>{row.sell != null ? n(row.sell) : "—"}</td>
                    <td style={{ padding: "7px 6px", textAlign: "right", color: "#059669" }}>{row.margin != null ? n(row.margin) : "—"}</td>
                    <td style={{ padding: "7px 6px", fontSize: 10, color: "#6b7280" }} title={row.note || ""}>{rhSourceLabel(row.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 12, lineHeight: 1.5 }}>
            Admin 저장·자동 저장·Excel 업로드 시 변경된 운임만 기록됩니다. 최초 사용 시 Supabase에서 <code style={{ fontSize: 9 }}>supabase-rate-history.sql</code> 실행이 필요합니다.
          </div>
        </div>
      </div>
    );
  }

  // ── NOTICE ADMIN ──
  if (showNoticeAdmin && isAdmin) {
    const slot = noticeAdminTab;
    const cur = notices[slot] ?? mkNotices()[slot];
    return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
      {adminSaveToastEl}
      <div style={{position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:30}}>
        <button onClick={()=>setShowNoticeAdmin(false)} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
        <div style={{fontSize:14,fontWeight:700,color:"#6b21a8"}}>Notice / GRI (최대 3개)</div>
        <div style={{width:48}}/>
      </div>
      <div style={{maxWidth:600,margin:"0 auto",padding:"16px 16px 80px"}}>
        <div style={{display:"flex",background:"#ede9fe",borderRadius:10,padding:3,marginBottom:12}}>
          {notices.map((n, i) => (
            <button key={i} type="button" onClick={()=>{ setNoticeAdminTab(i); setUploadMsg(""); }}
              style={{flex:1,padding:"8px 4px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                background:noticeAdminTab===i?"#fff":"transparent",color:noticeAdminTab===i?"#6b21a8":"#7c3aed",
                boxShadow:noticeAdminTab===i?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
              공지 {i + 1}{n.on && (n.text || n.fileUrl) ? " ●" : ""}
            </button>
          ))}
        </div>
        <div style={{fontSize:11,color:"#7c3aed",marginBottom:10}}>
          ON인 공지는 방문 시 순서대로 팝업됩니다 (1 → 2 → 3). 닫으면 다음 공지로 넘어갑니다.
        </div>
        <div style={{background:"#faf5ff",border:"1px solid #e9d5ff",borderRadius:12,padding:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:"#6b21a8"}}>공지 {slot + 1} 표시</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,color:"#7c3aed",fontWeight:600}}>{cur.on?"ON":"OFF"}</span>
              <div onClick={()=>patchNotice(slot,{ on:!cur.on })} style={{width:40,height:22,borderRadius:11,background:cur.on?"#7c3aed":"#d1d5db",cursor:"pointer",position:"relative"}}>
                <div style={{position:"absolute",top:2,left:cur.on?20:2,width:18,height:18,borderRadius:9,background:"#fff",transition:"left 0.2s"}}/>
              </div>
            </div>
          </div>
          <div style={{fontSize:11,fontWeight:700,color:"#6b21a8",marginBottom:4}}>팝업 제목</div>
          <input value={cur.title} onChange={e=>patchNotice(slot,{ title:e.target.value })} placeholder={`Notice ${slot + 1}`}
            style={{width:"100%",padding:"8px 12px",fontSize:13,color:"#4c1d95",background:"#fff",border:"1px solid #c4b5fd",borderRadius:8,boxSizing:"border-box",marginBottom:12}}/>
          <div style={{fontSize:11,fontWeight:700,color:"#6b21a8",marginBottom:6}}>공지 텍스트</div>
          <textarea value={cur.text} onChange={e=>patchNotice(slot,{ text:e.target.value })} placeholder="공지 텍스트 입력 (선사 GRI, 스케줄 변경 등)"
            style={{width:"100%",padding:"10px 12px",fontSize:13,color:"#4c1d95",background:"#fff",border:"1px solid #c4b5fd",borderRadius:8,boxSizing:"border-box",minHeight:140,resize:"vertical",fontFamily:"inherit",marginBottom:12}}/>
          <div style={{fontSize:11,fontWeight:700,color:"#6b21a8",marginBottom:8}}>공문 파일 첨부 (PDF / 이미지)</div>
          <label
            onDragOver={e=>{e.preventDefault();setDragOverSlot(slot);}}
            onDragLeave={()=>setDragOverSlot(null)}
            onDrop={e=>{e.preventDefault();setDragOverSlot(null);const f=e.dataTransfer.files[0];if(f)uploadNoticeFile(f,slot);}}
            style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,padding:"20px 12px",background:dragOverSlot===slot?"#ede9fe":"#fff",border:`2px dashed ${dragOverSlot===slot?"#7c3aed":"#c4b5fd"}`,borderRadius:10,cursor:"pointer",transition:"all 0.2s"}}>
            <span style={{fontSize:28}}>📎</span>
            <span style={{fontSize:13,color:"#7c3aed",fontWeight:600}}>{uploadLoading?"업로드 중...":"파일 선택 또는 드래그 앤 드롭"}</span>
            <span style={{fontSize:11,color:"#a78bfa"}}>PDF, JPG, PNG 지원</span>
            <input type="file" accept=".pdf,image/*" style={{display:"none"}} onChange={e=>{ if(e.target.files[0]) uploadNoticeFile(e.target.files[0],slot); e.target.value=""; }} disabled={uploadLoading}/>
          </label>
          {uploadMsg && <div style={{fontSize:12,marginTop:8,color:uploadMsg.includes("완료")?"#16a34a":"#dc2626"}}>{uploadMsg}</div>}
          {cur.fileUrl && (
            <div style={{marginTop:12,padding:"10px 12px",background:"#fff",border:"1px solid #c4b5fd",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <span style={{fontSize:12,color:"#7c3aed",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>✅ {cur.fileUrl.split("/").pop()}</span>
              <button type="button" onClick={()=>patchNotice(slot,{ fileUrl:"" })} style={{fontSize:12,color:"#dc2626",background:"none",border:"none",cursor:"pointer",flexShrink:0}}>삭제</button>
            </div>
          )}
          <button type="button" onClick={saveNoticesOnly} disabled={saveBusy}
            style={{width:"100%",marginTop:16,padding:"12px",fontSize:13,fontWeight:700,color:"#fff",background:saveBusy?"#c4b5fd":"#7c3aed",border:"none",borderRadius:8,cursor:saveBusy?"not-allowed":"pointer"}}>
            {saveBusy ? "저장 중…" : "💾 공지 3개 모두 저장"}
          </button>
        </div>
        {(cur.text || cur.fileUrl) && (
          <div style={{marginTop:16,padding:12,background:"#fff",border:"1px solid #e5e7eb",borderRadius:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#6b7280",marginBottom:8}}>미리보기 · {cur.title || `Notice ${slot + 1}`}</div>
            {cur.text && <div style={{fontSize:13,color:"#374151",lineHeight:1.7,whiteSpace:"pre-wrap",marginBottom:cur.fileUrl?12:0}}>{cur.text}</div>}
            {cur.fileUrl && <div style={{fontSize:11,color:"#7c3aed"}}>📎 첨부 파일 연결됨</div>}
          </div>
        )}
        <div style={{marginTop:12,padding:12,background:"#fff",border:"1px solid #e5e7eb",borderRadius:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#6b7280",marginBottom:8}}>전체 요약</div>
          {notices.map((n, i) => (
            <div key={i} style={{fontSize:12,color:"#374151",marginBottom:4}}>
              공지 {i + 1}: {n.on ? "ON" : "OFF"} · {(n.text || n.fileUrl) ? "내용 있음" : "비어 있음"}
            </div>
          ))}
        </div>
      </div>
    </div>
    );
  }

  // ── AD BANNER ADMIN ──
  if (showAdAdmin && isAdmin) {
    const slot = adAdminTab;
    const cur = adBanners[slot] ?? mkAds()[slot];
    return (
      <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
        {adminSaveToastEl}
        <div style={{position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:30}}>
          <button onClick={()=>setShowAdAdmin(false)} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
          <div style={{fontSize:14,fontWeight:700,color:"#c2410c"}}>하단 광고 배너 (최대 3개)</div>
          <div style={{width:48}}/>
        </div>
        <div style={{maxWidth:600,margin:"0 auto",padding:"16px 16px 80px"}}>
          <div style={{fontSize:11,color:"#c2410c",marginBottom:10}}>
            ON인 광고가 10초마다 순환 · X로 닫으면 탭을 닫을 때까지 숨김
          </div>
          <div style={{display:"flex",background:"#ffedd5",borderRadius:10,padding:3,marginBottom:12}}>
            {adBanners.map((a, i) => (
              <button key={i} type="button" onClick={() => { setAdAdminTab(i); setAdUploadMsg(""); }}
                style={{flex:1,padding:"8px 4px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                  background:adAdminTab===i?"#fff":"transparent",color:adAdminTab===i?"#c2410c":"#ea580c",
                  boxShadow:adAdminTab===i?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
                광고 {i + 1}{a.on && a.imageUrl ? " ●" : ""}
              </button>
            ))}
          </div>
          <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:12,padding:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#9a3412"}}>광고 {slot + 1} 표시</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:"#c2410c",fontWeight:600}}>{cur.on ? "ON" : "OFF"}</span>
                <div onClick={async () => {
                  const next = adBanners.map((a, i) => i === slot ? { ...a, on: !a.on } : a);
                  setAdBanners(next);
                  try { await saveAdBannersSetting(next); } catch (e) { setAdUploadMsg("저장 실패: " + e.message); }
                }} style={{width:40,height:22,borderRadius:11,background:cur.on?"#ea580c":"#d1d5db",cursor:"pointer",position:"relative"}}>
                  <div style={{position:"absolute",top:2,left:cur.on?20:2,width:18,height:18,borderRadius:9,background:"#fff",transition:"left 0.2s"}}/>
                </div>
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:700,color:"#9a3412",marginBottom:4}}>클릭 링크 URL</div>
            <input
              type="url"
              value={cur.linkUrl}
              onChange={e => patchAd(slot, { linkUrl: e.target.value })}
              onBlur={e => {
                const next = adBanners.map((a, i) => i === slot ? { ...a, linkUrl: e.target.value.trim() } : a);
                setAdBanners(next);
                persistAdBanners(next);
              }}
              placeholder="https://example.com"
              style={{width:"100%",padding:"8px 12px",fontSize:13,color:"#7c2d12",background:"#fff",border:"1px solid #fdba74",borderRadius:8,boxSizing:"border-box",marginBottom:12}}
            />
            <div style={{fontSize:11,fontWeight:700,color:"#9a3412",marginBottom:8}}>배너 이미지 (JPG · PNG · GIF · WebP)</div>
            <label
              onDragOver={e => { e.preventDefault(); setAdDragOver(true); }}
              onDragLeave={() => setAdDragOver(false)}
              onDrop={e => { e.preventDefault(); setAdDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadAdFile(f, slot); }}
              style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,padding:"20px 12px",background:adDragOver?"#ffedd5":"#fff",border:`2px dashed ${adDragOver?"#ea580c":"#fdba74"}`,borderRadius:10,cursor:"pointer",transition:"all 0.2s"}}>
              <span style={{fontSize:28}}>🖼️</span>
              <span style={{fontSize:13,color:"#c2410c",fontWeight:600}}>{adUploadLoading ? "업로드 중..." : "이미지 선택 또는 드래그 앤 드롭"}</span>
              <span style={{fontSize:11,color:"#fb923c"}}>Supabase Storage (Notices 버킷)</span>
              <input type="file" accept="image/*,.gif" style={{display:"none"}} onChange={e => { if (e.target.files[0]) uploadAdFile(e.target.files[0], slot); e.target.value = ""; }} disabled={adUploadLoading}/>
            </label>
            {adUploadMsg && <div style={{fontSize:12,marginTop:8,color:adUploadMsg.includes("실패")?"#dc2626":"#16a34a"}}>{adUploadMsg}</div>}
            {cur.imageUrl && (
              <div style={{marginTop:12,padding:"10px 12px",background:"#fff",border:"1px solid #fdba74",borderRadius:8}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8}}>
                  <span style={{fontSize:12,color:"#c2410c",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>✅ {cur.imageUrl.split("/").pop()}</span>
                  <button type="button" onClick={async () => {
                    const next = adBanners.map((a, i) => i === slot ? { ...a, imageUrl: "", on: false } : a);
                    setAdBanners(next);
                    await persistAdBanners(next);
                  }} style={{fontSize:12,color:"#dc2626",background:"none",border:"none",cursor:"pointer",flexShrink:0}}>삭제</button>
                </div>
                <img src={cur.imageUrl} alt="" style={{width:"100%",maxHeight:120,objectFit:"contain",borderRadius:6,background:"#f8fafc"}}/>
              </div>
            )}
            <button type="button" onClick={() => persistAdBanners(adBanners)} disabled={saveBusy}
              style={{width:"100%",marginTop:16,padding:"12px",fontSize:13,fontWeight:700,color:"#fff",background:saveBusy?"#fdba74":"#ea580c",border:"none",borderRadius:8,cursor:saveBusy?"not-allowed":"pointer"}}>
              {saveBusy ? "저장 중…" : "💾 광고 3개 모두 저장"}
            </button>
          </div>
          <div style={{marginTop:12,padding:12,background:"#fff",border:"1px solid #e5e7eb",borderRadius:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#6b7280",marginBottom:8}}>전체 요약</div>
            {adBanners.map((a, i) => (
              <div key={i} style={{fontSize:12,color:"#374151",marginBottom:4}}>
                광고 {i + 1}: {a.on ? "ON" : "OFF"} · {a.imageUrl ? "이미지 있음" : "비어 있음"}{a.linkUrl ? " · 링크 설정됨" : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const costInp = { width:"100%",maxWidth:"100%",minWidth:0,padding:"2px 4px",fontSize:11,fontWeight:700,color:"#1e40af",background:"#fff",border:"1px solid #93c5fd",borderRadius:4,boxSizing:"border-box",textAlign:"right" };

  const AdminPriceCols = ({d20,d40,prefix="",editable,onCost20,onCost40}) => (
    <div className="admin-price-cols" onClick={e=>e.stopPropagation()}>
      {[{l:"매출가",c:"#b45309",k:"sell",cr:d20.cr,vc:"#111"},
        {l:"매입가",c:"#2563eb",k:"cost",cr:null,vc:"#374151"},
        {l:"마진",c:"#7c3aed",k:"margin",cr:null,vc:"#7c3aed"}].map(col=>(
        <div key={col.l} className="apc-col">
          <div className="apc-label" style={{color:col.c}}>{col.l}</div>
          <div className="apc-size">{prefix?`${prefix} 20'`:"20'"}</div>
          {col.k==="cost"&&editable ? (
            <input type="number" inputMode="numeric" value={d20.cost??""} placeholder="—" onChange={e=>onCost20?.(e.target.value)} className="apc-inp"/>
          ) : (
            <div className="apc-val" style={{color:col.vc}}>{d20[col.k]!=null?`$${n(d20[col.k])}`:"—"}</div>
          )}
          <div className="apc-size" style={{marginTop:2}}>40'</div>
          {col.k==="cost"&&editable ? (
            <input type="number" inputMode="numeric" value={d40.cost??""} placeholder="—" onChange={e=>onCost40?.(e.target.value)} className="apc-inp"/>
          ) : (
            <div className="apc-val" style={{color:col.vc}}>{d40[col.k]!=null?`$${n(d40[col.k])}`:"—"}</div>
          )}
          {col.cr&&<div style={{marginTop:2}}><Bg k={col.cr}/></div>}
        </div>
      ))}
    </div>
  );

  const GuestPricePair = ({d20,d40,prefix=""}) => (
    <div className="guest-price-pair">
      <div className="guest-price-col">
        <div style={{fontSize:10,color:"#9ca3af"}}>{prefix?`${prefix} 20'`:"20'"}</div>
        <div className={`guest-price-val${ratePeriod==="future"?" guest-price-val--future":""}`}>{d20.sell!=null?`$${n(d20.sell)}`:"—"}</div>
        {d20.cr&&<Bg k={d20.cr}/>}
      </div>
      <div className="guest-price-col">
        <div style={{fontSize:10,color:"#9ca3af"}}>40'</div>
        <div className={`guest-price-val${ratePeriod==="future"?" guest-price-val--future":""}`}>{d40.sell!=null?`$${n(d40.sell)}`:"—"}</div>
        {d40.cr&&<Bg k={d40.cr}/>}
      </div>
    </div>
  );

  const RouteCardLabel = ({area, pol}) => (
    <div className="route-card-label">
      <span className="route-card-area">{area}</span>
      <span className="route-card-pol">{pol}</span>
    </div>
  );

  const getValidityLabel = (cr) => {
    const period = ratePeriod === "future" ? "future" : "current";
    return formatValidityCompact(validityInfo[cr]?.[period]);
  };

  const getValidityLabelFull = (cr) => {
    const period = ratePeriod === "future" ? "future" : "current";
    return formatValiditySlotLabel(validityInfo[cr]?.[period]);
  };

  const ValidityCell = ({carrierKey, compact}) => {
    const label = getValidityLabel(carrierKey);
    if (!label) return <span style={{fontSize:10,color:"#d1d5db"}}>—</span>;
    const isFuture = ratePeriod === "future";
    const tone = isFuture ? "future" : "current";
    return (
      <span
        className={`validity-badge validity-badge--${tone}${compact ? " validity-badge--compact" : ""} validity-compact-text`}
        title={getValidityLabelFull(carrierKey) || label}
      >
        {label}
      </span>
    );
  };

  const RatePeriodToggle = () => (
    <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8,marginTop:10}}>
      <div style={{display:"inline-flex",background:"#f3f4f6",borderRadius:8,padding:2}}>
        {[["current","현재 운임"],["future","향후 운임"]].map(([k,l])=>(
          <button key={k} type="button" onClick={()=>setRatePeriod(k)}
            style={{padding:"6px 14px",fontSize:11,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",
              background:ratePeriod===k?"#fff":"transparent",
              color:ratePeriod===k?(k==="future"?"#b45309":"#111"):"#9ca3af",
              boxShadow:ratePeriod===k?"0 1px 2px rgba(0,0,0,0.06)":"none"}}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );

  const PolAdjustBar = ({pol,area,types,costHint,onCost20,onCost40,onClearCost}) => (
    <div style={{padding:"10px 16px",background:"#fffbeb",borderBottom:"1px solid #fde68a"}} onClick={e=>e.stopPropagation()}>
      <div style={{fontSize:10,fontWeight:700,color:"#1e40af",marginBottom:6}}>{pol} · 매입가 조정 (USD)</div>
      {costHint && <div style={{fontSize:9,color:"#6b7280",marginBottom:6}}>{costHint}</div>}
      {onCost20 ? (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <div><div style={{fontSize:10,color:"#2563eb",marginBottom:2}}>20' 매입</div>
            <input type="number" placeholder="자동" onChange={e=>onCost20(e.target.value)} style={{...costInp,width:"100%"}}/></div>
          <div><div style={{fontSize:10,color:"#2563eb",marginBottom:2}}>40' 매입</div>
            <input type="number" placeholder="자동" onChange={e=>onCost40(e.target.value)} style={{...costInp,width:"100%"}}/></div>
        </div>
      ) : (
        <div style={{fontSize:9,color:"#6b7280",marginBottom:10}}>매입가: 카드·선사 행의 파란 칸에서 직접 입력</div>
      )}
      {onClearCost && <button type="button" onClick={onClearCost} style={{fontSize:10,color:"#dc2626",background:"#fee2e2",border:"none",borderRadius:4,padding:"4px 8px",cursor:"pointer",marginBottom:10}}>매입가 초기화</button>}
      <div style={{fontSize:10,fontWeight:700,color:"#92400e",marginBottom:6}}>마진 조정 (USD)</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {types.map(t=>(
          <div key={t}>
            <div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{t.toUpperCase()}</div>
            <input type="number" value={getM(pol,area,t)} onChange={e=>applyPolMargin(pol,t,e.target.value)}
              style={{width:"100%",padding:"6px 8px",fontSize:13,fontWeight:700,color:"#92400e",background:"#fff",border:"1px solid #fcd34d",borderRadius:6,boxSizing:"border-box"}}/>
          </div>
        ))}
      </div>
      <div style={{fontSize:9,color:"#9ca3af",marginTop:6}}>매입가·마진 변경 후 상단 「설정 저장」</div>
    </div>
  );

  // ── RENTAL RATES ADMIN ──
  if (showRentalAdmin && isAdmin) {
    if (!settingsLoaded) {
      return (
        <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
          {adminSaveToastEl}
          <div style={{position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:30}}>
            <button onClick={()=>setShowRentalAdmin(false)} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
            <div style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>컨테이너 Rental 운임</div>
            <div style={{width:48}}/>
          </div>
          <RatesLoading />
        </div>
      );
    }
    const raPeriod = rentalAdminPeriod;
    const isFuture = raPeriod === "future";
    const visibleReturnCities = selReturnCity
      ? RENT_CITY_ORDER.filter(c => c === selReturnCity)
      : RENT_CITY_ORDER;
    const rentalCityCount = visibleReturnCities.length;
    const rentalGridCols = 2 + rentalCityCount * 2;
    const applyRentalCellSell = (row, city, si, sellStr) => {
      const sell = parseInt(sellStr, 10);
      if (!Number.isFinite(sell)) return;
      const type = rentalType(si);
      const margin = getRentalM(row.freightPol, row.area, type);
      applyRentalRate(row.rentalPol, city, si, sell - margin, raPeriod);
    };
    const filteredRentalAreaGroups = rentalAreaGroups
      .filter(({ area }) => !(rentalMarginTab === "area" && rentalSelArea) || area === rentalSelArea)
      .map(({ area, rows }) => ({
        area,
        rows: rentalMarginTab === "pol" && rentalSelPol
          ? rows.filter(r => r.freightPol === rentalSelPol || r.displayPol === rentalSelPol)
          : rows,
      }))
      .filter(({ rows }) => rows.length > 0);
    const rentalGridPolCount = filteredRentalAreaGroups.reduce((n, g) => n + g.rows.length, 0);
    const rentalGridFilterLabel = rentalMarginTab === "area" && rentalSelArea
      ? `${rentalSelArea} · ${rentalGridPolCount}개 POL`
      : rentalMarginTab === "pol" && rentalSelPol
        ? `${rentalSelPol} · ${rentalGridPolCount}개 POL`
        : `${rentalGridPolCount}개 POL (전체)`;
    const rentalCityFilterLabel = selReturnCity
      ? RC_LABEL[selReturnCity] || selReturnCity
      : `전체 ${RENT_CITY_ORDER.length}개 반납지`;
    const renderRentalGridCell = (row, city, si) => {
      const cost = getRentalBase(row.rentalPol, city, si, raPeriod);
      if (cost == null) return <td className="cg-cell cg-empty">—</td>;
      const type = rentalType(si);
      const margin = getRentalM(row.freightPol, row.area, type);
      const sell = cost + margin;
      const cellKey = `${row.rentalPol}:${city}:${si}`;
      const isOpen = rentalEditCell === cellKey;
      return (
        <td className={`cg-cell${isFuture ? " cg-future" : ""}${isOpen ? " cg-active" : ""}`}>
          {isOpen ? (
            <div className="cg-edit-panel" onClick={e => e.stopPropagation()}>
              <table className="cg-mini">
                <tbody>
                  <tr>
                    <td className="cg-mini-label cg-mini-label-cost">매입</td>
                    <td className="cg-mini-val-cost">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-cost"
                        value={cost ?? ""} placeholder="—"
                        onChange={e => applyRentalRate(row.rentalPol, city, si, e.target.value, raPeriod)}/>
                    </td>
                  </tr>
                  <tr>
                    <td className="cg-mini-label cg-mini-label-sell">매출</td>
                    <td className="cg-mini-val-sell">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-sell"
                        value={sell ?? ""} placeholder="—"
                        onChange={e => applyRentalCellSell(row, city, si, e.target.value)}/>
                    </td>
                  </tr>
                  <tr className="cg-mini-margin-tr">
                    <td className="cg-mini-label cg-mini-label-margin">마진</td>
                    <td className="cg-mini-val-margin">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-margin"
                        value={margin} onChange={e => applyRentalPolMargin(row.freightPol, type, e.target.value)}/>
                    </td>
                  </tr>
                </tbody>
              </table>
              <button type="button" className="cg-close" onClick={() => setRentalEditCell(null)}>닫기</button>
            </div>
          ) : (
            <button type="button" className="cg-box" onClick={() => setRentalEditCell(cellKey)}>
              <div className="cg-pair-row cg-row-cost">
                <span className="cg-lbl cg-lbl-cost">매입</span>
                <span className="cg-val cg-val-cost">{n(cost)}</span>
              </div>
              <div className="cg-pair-row cg-row-sell">
                <span className="cg-lbl cg-lbl-sell">매출</span>
                <span className="cg-val cg-val-sell">{n(sell)}</span>
              </div>
              <div className="cg-margin-hint"><span className="cg-lbl-margin">마진</span> {margin != null ? n(margin) : "—"}</div>
            </button>
          )}
        </td>
      );
    };
    return (
      <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}} onClick={() => setRentalEditCell(null)}>
        {adminSaveToastEl}
        <div className="portal-sticky-top admin-sticky-top">
          <div style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <button onClick={()=>setShowRentalAdmin(false)} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
            <div style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>컨테이너 Rental 운임</div>
            <button type="button" onClick={saveRentalPricing} disabled={saveBusy}
              style={{fontSize:11,fontWeight:700,padding:"6px 12px",borderRadius:8,background:saveBusy?"#c4b5fd":"#7c3aed",color:"#fff",border:"none",cursor:saveBusy?"not-allowed":"pointer"}}>
              {saveBusy ? "저장 중…" : "💾 저장"}
            </button>
          </div>
          <div className="carrier-admin-page rental-admin-page" onClick={e => e.stopPropagation()}>
            <div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3}}>
              {[["current","현재 운임"],["future","향후 운임"]].map(([k,l])=>(
                <button key={k} type="button" onClick={()=>{setRentalAdminPeriod(k);setRentalEditCell(null);}}
                  style={{flex:1,padding:"8px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                    background:rentalAdminPeriod===k?"#fff":"transparent",
                    color:rentalAdminPeriod===k?(k==="future"?"#b45309":"#111"):"#9ca3af"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="carrier-admin-page rental-admin-page" onClick={e => e.stopPropagation()}>
          <div style={{marginBottom:10,background:"#fff",border:"1px solid #ddd6fe",borderRadius:10,padding:10}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <Bg k="RENTAL"/><span style={{fontSize:11,fontWeight:700,color:"#5b21b6"}}>{CN_KR.RENTAL} Validity</span>
            </div>
            <ValidityPeriodFields carrierKey="RENTAL" period="current" periodLabel="현재 운임" compact
              validityInfo={validityInfo} onUpdate={updateValiditySlot} />
            <ValidityPeriodFields carrierKey="RENTAL" period="future" periodLabel="향후 운임" compact
              validityInfo={validityInfo} onUpdate={updateValiditySlot}
              futureFromMin={getFutureFromMinDate("RENTAL")} />
          </div>
          <MarginPanel
            filterHint={
              rentalMarginTab === "area" && rentalSelArea ? `운임표: ${rentalSelArea} 지역만 표시` :
              rentalMarginTab === "pol" && rentalSelPol ? `운임표: ${rentalSelPol} 만 표시` :
              rentalMarginTab === "area" ? "지역 선택 시 해당 지역 운임만 표시" : null
            }
            marginTab={rentalMarginTab} setMarginTab={setRentalMarginTab}
            margins={rentalMargins} applyGlobalMargin={applyRentalGlobalMargin}
            selArea={rentalSelArea} setSelArea={setRentalSelArea}
            areaM={rentalAreaM} applyAreaMarginType={applyRentalAreaMarginType} applyAreaMargins={applyRentalAreaMargins}
            selPol={rentalSelPol} setSelPol={setRentalSelPol}
            polM={rentalPolM} applyPolMargins={applyRentalPolMargins} clearPolMargins={clearRentalPolMargins}
            polEdit={rentalPolEdit} setPolEdit={setRentalPolEdit}
            areas={areas} fData={fData} getM={getRentalM}
            rateTypes={RENTAL_RATE_TYPES}
            rateLabel={rentalRateLabel}
            gridCols="1fr 1fr"
            polData={rentalPolData}
            globalHint="렌탈 20'·40' 기본 마진 · 마지막 수정 기준 우선"
            formatAreaSummary={(m, mg) => `${m.r20 ?? mg.r20} / ${m.r40 ?? mg.r40}`}
          />
          <div style={{marginBottom:10,padding:10,background:"#faf5ff",border:"1px solid #ddd6fe",borderRadius:10}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6b21a8",marginBottom:6}}>반납지 (Return City) · 운임표 필터</div>
            <select value={selReturnCity} onChange={e=>{setSelReturnCity(e.target.value);setRentalEditCell(null);}}
              style={{width:"100%",padding:"8px 10px",fontSize:12,fontWeight:600,border:"1px solid #ddd6fe",borderRadius:8,background:"#fff",color:"#5b21b6",marginBottom:8}}>
              <option value="">-- 전체 반납지 --</option>
              {RENT_CITY_ORDER.map(city=>(
                <option key={city} value={city}>{RC_LABEL[city] || city}</option>
              ))}
            </select>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
              <button type="button" onClick={()=>{setSelReturnCity("");setRentalEditCell(null);}}
                style={{fontSize:10,fontWeight:600,padding:"5px 10px",borderRadius:16,whiteSpace:"nowrap",cursor:"pointer",border:`1px solid ${!selReturnCity?"#7c3aed":"#e9d5ff"}`,background:!selReturnCity?"#7c3aed":"#fff",color:!selReturnCity?"#fff":"#7c3aed"}}>
                전체
              </button>
              {RENT_CITY_ORDER.map(city=>{
                const on = selReturnCity === city;
                const label = RC_LABEL[city] || city;
                return (
                  <button key={city} type="button" onClick={()=>{setSelReturnCity(on?"":city);setRentalEditCell(null);}}
                    style={{fontSize:10,fontWeight:600,padding:"5px 10px",borderRadius:16,whiteSpace:"nowrap",cursor:"pointer",border:`1px solid ${on?"#7c3aed":"#e9d5ff"}`,background:on?"#7c3aed":"#fff",color:on?"#fff":"#7c3aed"}}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{fontSize:10,color:"#6b7280",marginBottom:8}}>
            {rentalCityFilterLabel} · {isFuture ? "향후" : "현재"} 렌탈 (USD) · 셀 클릭 → 매입·매출·마진 · {rentalGridFilterLabel}
          </div>
          <div className="carrier-grid-wrap rental-grid-wrap">
            <table className="carrier-grid rental-grid">
              <thead>
                <tr className="cg-carrier-row">
                  <th colSpan={2} className="cg-rental-sticky-pol"></th>
                  {visibleReturnCities.map(city => (
                    <th key={city} colSpan={2} className="cg-rental-city-head">{RC_LABEL[city] || city}</th>
                  ))}
                </tr>
                <tr className="cg-head-row">
                  <th className="cg-th-area cg-rental-sticky-area">AREA</th>
                  <th className="cg-th-pol cg-rental-sticky-pol">POL</th>
                  {visibleReturnCities.flatMap(city => ([
                    <th key={`${city}-20`}>20&apos;</th>,
                    <th key={`${city}-40`}>40&apos;</th>,
                  ]))}
                </tr>
              </thead>
              <tbody>
                {filteredRentalAreaGroups.length === 0 ? (
                  <tr><td colSpan={rentalGridCols} style={{padding:20,color:"#9ca3af",fontSize:12}}>표시할 POL 없음 · 지역/POL·반납지 선택 확인</td></tr>
                ) : filteredRentalAreaGroups.map(({ area, rows }) => rows.map((row, ri) => (
                  <tr key={row.rentalPol} className={ri % 2 === 1 ? "cg-stripe" : ""}>
                    {ri === 0 && (
                      <td rowSpan={rows.length} className="cg-area cg-rental-sticky-area">{area}</td>
                    )}
                    <td className="cg-pol cg-rental-sticky-pol">{row.displayPol}</td>
                    {visibleReturnCities.flatMap(city => ([
                      renderRentalGridCell(row, city, 0),
                      renderRentalGridCell(row, city, 1),
                    ]))}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── CARRIER RATES ADMIN ──
  if (showCarrierAdmin && isAdmin) {
    if (!settingsLoaded) {
      return (
        <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
          {adminSaveToastEl}
          <div style={{position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:30}}>
            <button onClick={()=>setShowCarrierAdmin(false)} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
            <div style={{fontSize:14,fontWeight:700,color:"#1e40af"}}>선사별 운임</div>
            <div style={{width:48}}/>
          </div>
          <RatesLoading />
        </div>
      );
    }
    const caPeriod = carrierAdminPeriod;
    const caCr = carrierAdminCr;
    const isDropAdmin = carrierAdminMode === "dropoff";
    const isFuture = caPeriod === "future";
    const applyCellSell = (row, type, sellStr) => {
      applyCarrierSell(row.pol, caCr, type, sellStr, caPeriod);
    };
    const applyDropAdminSell = (cityKey, si, sellStr) => {
      const sell = parseInt(sellStr, 10);
      if (!Number.isFinite(sell)) return;
      const cost = getCarrierDropAddon(caCr, cityKey, si, caPeriod);
      if (cost == null) return;
      applyCarrierDropMargin(caCr, cityKey, si, sell - cost);
    };
    const filteredCarrierAreaGroups = carrierAreaGroups;
    const gridPolCount = filteredCarrierAreaGroups.reduce((n, g) => n + g.rows.length, 0);
    const gridFilterLabel = `${gridPolCount}개 POL (전체)`;
    const griTargetRows = griScopeTab === "area" && griSelAreas.length > 0
      ? fData.filter(r => griSelAreas.includes(r.area))
      : fData;
    const griFilterLabel = griScopeTab === "area" && griSelAreas.length > 0
      ? `${griTargetRows.length}개 POL · ${griSelAreas.join(", ")}`
      : `${griTargetRows.length}개 POL (전체)`;
    const renderGridCell = (row, type) => {
      const base = row.rates[caCr]?.[type];
      const cost = getCarrierRate(row, caCr, type, caPeriod);
      if (base == null && cost == null) {
        return <td className="cg-cell cg-empty">—</td>;
      }
      const sell = cost != null ? getCarrierAdminSell(row.pol, caCr, type, caPeriod, cost) : null;
      const margin = displayMarginFromPrices(cost, sell);
      const cellKey = `${row.pol}:${type}`;
      const isOpen = carrierEditCell === cellKey;
      return (
        <td className={`cg-cell${isFuture ? " cg-future" : ""}${isOpen ? " cg-active" : ""}`}>
          {isOpen ? (
            <div className="cg-edit-panel" onClick={e => e.stopPropagation()}>
              <table className="cg-mini">
                <tbody>
                  <tr>
                    <td className="cg-mini-label cg-mini-label-cost">매입</td>
                    <td className="cg-mini-val-cost">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-cost"
                        value={cost ?? ""} placeholder="—"
                        onChange={e => applyCarrierRate(row.pol, caCr, type, e.target.value, caPeriod)}/>
                    </td>
                  </tr>
                  <tr>
                    <td className="cg-mini-label cg-mini-label-sell">매출</td>
                    <td className="cg-mini-val-sell">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-sell"
                        value={sell ?? ""} placeholder="—"
                        onChange={e => applyCellSell(row, type, e.target.value)}/>
                    </td>
                  </tr>
                </tbody>
              </table>
              {margin != null && (
                <div className="cg-edit-margin-readonly">마진 {n(margin)}</div>
              )}
              <button type="button" className="cg-close" onClick={() => setCarrierEditCell(null)}>닫기</button>
            </div>
          ) : (
            <button type="button" className="cg-box" onClick={() => setCarrierEditCell(cellKey)}>
              <div className="cg-pair-row cg-row-cost">
                <span className="cg-lbl cg-lbl-cost">매입</span>
                <span className="cg-val cg-val-cost">{cost != null ? n(cost) : "—"}</span>
              </div>
              <div className="cg-pair-row cg-row-sell">
                <span className="cg-lbl cg-lbl-sell">매출</span>
                <span className="cg-val cg-val-sell">{sell != null ? n(sell) : "—"}</span>
              </div>
              <div className="cg-margin-hint"><span className="cg-lbl-margin">마진</span> {margin != null ? n(margin) : "—"}</div>
            </button>
          )}
        </td>
      );
    };
    const renderDropAdminCell = (cityKey, si) => {
      const cost = getCarrierDropAddon(caCr, cityKey, si, caPeriod);
      const sell = cost != null ? cost + getDropM(caCr, cityKey, si) : null;
      const margin = displayMarginFromPrices(cost, sell);
      const cellKey = `drop:${caCr}:${cityKey}:${caPeriod}:${si}`;
      const isOpen = carrierEditCell === cellKey;
      return (
        <td className={`cg-cell drop-admin-td${isFuture ? " cg-future" : ""}${isOpen ? " cg-active" : ""}`}>
          {isOpen ? (
            <div className="cg-edit-panel" onClick={e => e.stopPropagation()}>
              <table className="cg-mini">
                <tbody>
                  <tr>
                    <td className="cg-mini-label cg-mini-label-cost">매입</td>
                    <td className="cg-mini-val-cost">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-cost"
                        value={cost ?? ""} placeholder="—"
                        onChange={e => applyCarrierDropRate(caCr, cityKey, si, e.target.value, caPeriod)}/>
                    </td>
                  </tr>
                  <tr>
                    <td className="cg-mini-label cg-mini-label-sell">매출</td>
                    <td className="cg-mini-val-sell">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-sell"
                        value={sell ?? ""} placeholder="—"
                        onChange={e => applyDropAdminSell(cityKey, si, e.target.value)}/>
                    </td>
                  </tr>
                </tbody>
              </table>
              {margin != null && (
                <div className="cg-edit-margin-readonly">마진 {n(margin)}</div>
              )}
              <button type="button" className="cg-close" onClick={() => setCarrierEditCell(null)}>닫기</button>
            </div>
          ) : (
            <button type="button" className="cg-box drop-admin-box" onClick={() => setCarrierEditCell(cellKey)}>
              <div className="cg-pair-row cg-row-cost">
                <span className="cg-lbl cg-lbl-cost">매입</span>
                <span className="cg-val cg-val-cost">{cost != null ? n(cost) : "—"}</span>
              </div>
              <div className="cg-pair-row cg-row-sell">
                <span className="cg-lbl cg-lbl-sell">매출</span>
                <span className="cg-val cg-val-sell">{sell != null ? n(sell) : "—"}</span>
              </div>
              <div className="cg-margin-hint"><span className="cg-lbl-margin">마진</span> {margin != null ? n(margin) : "—"}</div>
            </button>
          )}
        </td>
      );
    };
    return (
      <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}} onClick={() => setCarrierEditCell(null)}>
        {adminSaveToastEl}
        <div className="portal-sticky-top admin-sticky-top">
          <div style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <button onClick={()=>setShowCarrierAdmin(false)} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#1e40af"}}>선사별 운임</div>
              <div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>{ADMIN_SAVE_REV} · 변경 시 자동 저장</div>
            </div>
            <button type="button" onClick={saveCarrierPricing} disabled={saveBusy}
              style={{fontSize:11,fontWeight:700,padding:"6px 12px",borderRadius:8,background:saveBusy?"#93c5fd":"#2563eb",color:"#fff",border:"none",cursor:saveBusy?"not-allowed":"pointer"}}>
              {saveBusy ? "저장 중…" : "💾 저장"}
            </button>
          </div>
          <div className="carrier-admin-page" onClick={e => e.stopPropagation()}>
            <div style={{display:"flex",background:"#eff6ff",borderRadius:10,padding:3,marginBottom:8}}>
              {CRS.map(k=>(
                <button key={k} type="button" onClick={()=>{setCarrierAdminCr(k);setCarrierEditCell(null);}}
                  style={{flex:1,padding:"8px 4px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                    background:carrierAdminCr===k?"#fff":"transparent",color:carrierAdminCr===k?"#1e40af":"#60a5fa",
                    boxShadow:carrierAdminCr===k?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
                  {CN_KR[k]} ({k})
                </button>
              ))}
            </div>
            <div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3,marginBottom:8}}>
              {[["current","현재 운임"],["future","향후 운임"]].map(([k,l])=>(
                <button key={k} type="button" onClick={()=>{setCarrierAdminPeriod(k);setCarrierEditCell(null);}}
                  style={{flex:1,padding:"8px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                    background:carrierAdminPeriod===k?"#fff":"transparent",
                    color:carrierAdminPeriod===k?(k==="future"?"#b45309":"#111"):"#9ca3af"}}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{display:"flex",background:"#ecfdf5",borderRadius:10,padding:3}}>
              {[["ocean","해상 운임"],["dropoff","Drop off"]].map(([k,l])=>(
                <button key={k} type="button" onClick={()=>{setCarrierAdminMode(k);setCarrierEditCell(null);}}
                  style={{flex:1,padding:"8px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                    background:carrierAdminMode===k?"#fff":"transparent",
                    color:carrierAdminMode===k?"#047857":"#6ee7b7",
                    boxShadow:carrierAdminMode===k?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="carrier-admin-page" onClick={e => e.stopPropagation()}>
          {!isDropAdmin && (
          <>
          {isFuture && (
            <div className="import-current-freight-box" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className="import-current-freight-btn"
                onClick={() => importCurrentToFutureFreight(caCr, false)}
              >
                <span className="import-current-freight-icon">📋</span>
                <span className="import-current-freight-text">
                  <strong>기존운임 가져오기</strong>
                  <span>현재 {CN_KR[caCr]} 매입 운임을 향후 운임에 복사 · 이후 GRI로 조정</span>
                </span>
              </button>
              {importFreightUndo?.carrier === caCr && !importFreightUndo?.dropoffMode && (
                <button type="button" className="import-current-freight-undo" onClick={undoImportFreight}>
                  되돌리기
                </button>
              )}
            </div>
          )}
          <GriAdjustPanel
            periodLabel={griPeriodLabel(caPeriod)}
            areas={areas}
            scopeTab={griScopeTab}
            setScopeTab={tab => {
              setGriScopeTab(tab);
              if (tab === "all") setGriSelAreas([]);
            }}
            selAreas={griSelAreas}
            toggleArea={toggleGriArea}
            clearAreas={() => setGriSelAreas([])}
            filterHint={`${griFilterLabel} · COC/SOC 타입별 금액 입력 후 적용`}
            onApplyBuying={deltas => applyBuyingGriBulk(deltas, griTargetRows, caCr, caPeriod)}
            onApplySelling={deltas => applySellingGriBulk(deltas, griTargetRows, caCr, caPeriod)}
            canUndoBuying={griBuyUndo?.carrier === caCr && griBuyUndo?.period === caPeriod}
            canUndoSelling={griSellUndo?.carrier === caCr && griSellUndo?.period === caPeriod}
            onUndoBuying={undoBuyingGriBulk}
            onUndoSelling={undoSellingGriBulk}
          />
          <div style={{marginBottom:10,background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:10}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <Bg k={caCr}/><span style={{fontSize:11,fontWeight:700}}>{CN_KR[caCr]} Validity</span>
            </div>
            <ValidityPeriodFields carrierKey={caCr} period="current" periodLabel="현재 운임" compact
              validityInfo={validityInfo} onUpdate={updateValiditySlot} />
            <ValidityPeriodFields carrierKey={caCr} period="future" periodLabel="향후 운임" compact
              validityInfo={validityInfo} onUpdate={updateValiditySlot}
              futureFromMin={getFutureFromMinDate(caCr)} />
          </div>
          <div style={{fontSize:10,color:"#6b7280",marginBottom:8}}>
            셀 클릭 → 매입·매출 조정 · {gridFilterLabel}
          </div>
          <div className="carrier-grid-wrap">
            <table className="carrier-grid">
              <thead>
                <tr className="cg-carrier-row">
                  <th colSpan={2}></th>
                  <th colSpan={4}>{caCr} {CN_KR[caCr]} · {isFuture ? "향후" : "현재"} 운임 (USD)</th>
                </tr>
                <tr className="cg-head-row">
                  <th rowSpan={2} className="cg-th-area">AREA</th>
                  <th rowSpan={2} className="cg-th-pol">POL</th>
                  <th colSpan={2}>COC</th>
                  <th colSpan={2}>SOC</th>
                </tr>
                <tr className="cg-head-row">
                  <th>20&apos;</th>
                  <th>40&apos;</th>
                  <th>20&apos;</th>
                  <th>40&apos;</th>
                </tr>
              </thead>
              <tbody>
                {filteredCarrierAreaGroups.length === 0 ? (
                  <tr><td colSpan={6} style={{padding:20,color:"#9ca3af",fontSize:12}}>표시할 POL 없음 · 지역/POL 선택 확인</td></tr>
                ) : filteredCarrierAreaGroups.map(({ area, rows }) => rows.map((row, ri) => (
                  <tr key={row.pol} className={ri % 2 === 1 ? "cg-stripe" : ""}>
                    {ri === 0 && (
                      <td rowSpan={rows.length} className="cg-area">{area}</td>
                    )}
                    <td className="cg-pol">{row.pol}</td>
                    {renderGridCell(row, "coc20")}
                    {renderGridCell(row, "coc40")}
                    {renderGridCell(row, "soc20")}
                    {renderGridCell(row, "soc40")}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          </>
          )}
          {isDropAdmin && (
            <div className="drop-admin-panel">
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <Bg k={caCr}/>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#047857"}}>
                    {CN_KR[caCr]} · Drop off · 전체 반납지
                  </div>
                  <div style={{fontSize:10,color:"#6b7280",marginTop:2}}>
                    {isFuture ? "향후" : "현재"} · 반납지별 Drop off 단가 · 마진 기본 0 · 셀 클릭하여 수정
                  </div>
                </div>
              </div>
              {isFuture && (
                <div className="import-current-freight-box" style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    className="import-current-freight-btn import-current-freight-btn--drop"
                    onClick={() => importCurrentToFutureFreight(caCr, true)}
                  >
                    <span className="import-current-freight-icon">📋</span>
                    <span className="import-current-freight-text">
                      <strong>기존운임 가져오기</strong>
                      <span>현재 Drop off 운임을 향후 운임에 복사</span>
                    </span>
                  </button>
                  {importFreightUndo?.carrier === caCr && importFreightUndo?.dropoffMode && (
                    <button type="button" className="import-current-freight-undo" onClick={undoImportFreight}>
                      되돌리기
                    </button>
                  )}
                </div>
              )}
              <div className="carrier-grid-wrap drop-admin-table-wrap">
                <table className="carrier-grid drop-admin-table">
                  <thead>
                    <tr className="cg-carrier-row">
                      <th colSpan={3}>{caCr} {CN_KR[caCr]} · Drop off (USD)</th>
                    </tr>
                    <tr className="cg-head-row">
                      <th className="cg-th-pol drop-admin-city-col">반납지</th>
                      <th>20&apos;</th>
                      <th>40&apos;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DOC.map(({ k, l }, ri) => (
                      <tr key={k} className={ri % 2 === 1 ? "cg-stripe" : ""}>
                        <td className="cg-pol drop-admin-city-col">{l}</td>
                        {renderDropAdminCell(k, 0)}
                        {renderDropAdminCell(k, 1)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── CARDS ──
  const OCard = ({row,idx}) => {
    const types = ctype==="coc"?["coc20","coc40"]:["soc20","soc40"];
    const open = exp===`o${idx}`;
    const d20=oceanDetail(row,types[0]),d40=oceanDetail(row,types[1]);
    const t20=types[0],t40=types[1];
    return (
      <div style={{border:"1px solid #e5e7eb",borderRadius:10,marginBottom:8,background:"#fff",overflow:"hidden"}}>
        <button onClick={()=>setExp(open?null:`o${idx}`)} className={isAdmin?"admin-card-btn":"route-card-btn"} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:isAdmin?"10px 12px":"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",gap:8}}>
          <div className={isAdmin?"admin-card-top":"route-card-head"}>
            <RouteCardLabel area={row.area} pol={row.pol}/>
            {!isAdmin && <GuestPricePair d20={d20} d40={d40}/>}
            <span className="route-card-chevron" style={{transform:open?"rotate(180deg)":"none"}}>&#8964;</span>
          </div>
          {isAdmin && (
            <div className="admin-card-prices">
              <AdminPriceCols d20={d20} d40={d40} editable
                onCost20={v=>d20.cr&&applyCarrierRate(row.pol,d20.cr,t20,v)}
                onCost40={v=>d40.cr&&applyCarrierRate(row.pol,d40.cr,t40,v)}/>
            </div>
          )}
        </button>
        {open && (
          <div style={{borderTop:"1px solid #f3f4f6"}}>
            {isAdmin && <PolAdjustBar pol={row.pol} area={row.area} types={types} onClearCost={()=>clearPolCost(row.pol,"carrier")}/>}
            <div style={{padding:"0 16px 16px"}}>
            {isAdmin ? (
              <div style={{marginTop:12}}>
                {CRS.map(k=>{ 
                  const cv20=getCarrierRate(row,k,t20,"current"),cv40=getCarrierRate(row,k,t40,"current");
                  const fv20=getCarrierRate(row,k,t20,"future"),fv40=getCarrierRate(row,k,t40,"future");
                  if(cv20==null&&cv40==null&&fv20==null&&fv40==null)return null;
                  const cs20=cv20!=null?getGuestCarrierSell(row.pol,k,t20,"current",cv20,row.area):null;
                  const cs40=cv40!=null?getGuestCarrierSell(row.pol,k,t40,"current",cv40,row.area):null;
                  const fs20=fv20!=null?getGuestCarrierSell(row.pol,k,t20,"future",fv20,row.area):null;
                  const fs40=fv40!=null?getGuestCarrierSell(row.pol,k,t40,"future",fv40,row.area):null;
                  const cd20=mkPrice(cv20,cs20!=null?cs20-cv20:0,k);
                  const cd40=mkPrice(cv40,cs40!=null?cs40-cv40:0,k);
                  const fd20=mkPrice(fv20,fs20!=null?fs20-fv20:0,k);
                  const fd40=mkPrice(fv40,fs40!=null?fs40-fv40:0,k);
                  return (
                    <div key={k} style={{padding:"10px 0",borderBottom:"1px solid #f9fafb"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                        <Bg k={k}/><span style={{fontSize:11,color:"#6b7280",fontWeight:600}}>{CN[k]}</span>
                      </div>
                      <div style={{fontSize:9,fontWeight:700,color:"#166534",marginBottom:4}}>현재 운임 · {formatValiditySlotLabel(validityInfo[k]?.current) || "—"}</div>
                      <AdminPriceCols d20={cd20} d40={cd40} editable
                        onCost20={v=>applyCarrierRate(row.pol,k,t20,v,"current")}
                        onCost40={v=>applyCarrierRate(row.pol,k,t40,v,"current")}/>
                      <div style={{fontSize:9,fontWeight:700,color:"#b45309",margin:"10px 0 4px"}}>향후 운임 · {formatValiditySlotLabel(validityInfo[k]?.future) || "—"}</div>
                      <AdminPriceCols d20={fd20} d40={fd40} editable
                        onCost20={v=>applyCarrierRate(row.pol,k,t20,v,"future")}
                        onCost40={v=>applyCarrierRate(row.pol,k,t40,v,"future")}/>
                    </div>
                  ); })}
              </div>
            ) : (
            <table className="carrier-validity-table" style={{marginTop:12,fontSize:12}}>
              <colgroup>
                <col className="cvt-col-carrier"/>
                <col className="cvt-col-validity"/>
                <col className="cvt-col-price"/>
                <col className="cvt-col-price"/>
              </colgroup>
              <thead><tr style={{color:"#9ca3af",borderBottom:"1px solid #f3f4f6"}}>
                <th className="cvt-carrier" style={{textAlign:"left",padding:"4px 0",fontWeight:500}}>Carrier</th>
                <th className="cvt-validity" style={{padding:"4px 0",fontWeight:500}}>Validity</th>
                <th className="cvt-price" style={{padding:"4px 0",fontWeight:500}}>20'</th>
                <th className="cvt-price" style={{padding:"4px 0",fontWeight:500}}>40'</th>
              </tr></thead>
              <tbody>
                {CRS.map(k=>{ const v20=getCarrierRate(row,k,t20),v40=getCarrierRate(row,k,t40); if(v20==null&&v40==null)return null; const b20=bNet(row,t20),b40=bNet(row,t40);
                  const priceColor = ratePeriod==="future"?"#b45309":"#1d4ed8";
                  const s20=v20!=null?getGuestCarrierSell(row.pol,k,t20,ratePeriod,v20,row.area):null;
                  const s40=v40!=null?getGuestCarrierSell(row.pol,k,t40,ratePeriod,v40,row.area):null;
                  const best20=b20.val!=null?getGuestCarrierSell(row.pol,b20.cr,t20,ratePeriod,b20.val,row.area):null;
                  const best40=b40.val!=null?getGuestCarrierSell(row.pol,b40.cr,t40,ratePeriod,b40.val,row.area):null;
                  return <tr key={k} style={{borderBottom:"1px solid #f9fafb"}}>
                    <td className="cvt-carrier" style={{padding:"8px 0"}}>
                      <Bg k={k}/>
                    </td>
                    <td className="cvt-validity" style={{padding:"8px 0"}}><ValidityCell carrierKey={k}/></td>
                    <td className="cvt-price" style={{padding:"8px 0",fontWeight:s20===best20?700:400,color:s20!=null?(s20===best20?priceColor:"#6b7280"):"#d1d5db",cursor:s20?"pointer":"default"}} onClick={()=>s20&&openSC(k,t20,row.pol+" > VVO")}>{s20!=null?`$${n(s20)}`:"—"}</td>
                    <td className="cvt-price" style={{padding:"8px 0",fontWeight:s40===best40?700:400,color:s40!=null?(s40===best40?priceColor:"#6b7280"):"#d1d5db",cursor:s40?"pointer":"default"}} onClick={()=>s40&&openSC(k,t40,row.pol+" > VVO")}>{s40!=null?`$${n(s40)}`:"—"}</td>
                  </tr>; })}
              </tbody>
            </table>
            )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const DOCrd = ({row,idx}) => {
    const open = exp===`d${idx}`;
    const doTypes=["coc20","coc40"];
    const d20=doDetail(row,"mow",0),d40=doDetail(row,"mow",1);
    return (
      <div style={{border:"1px solid #e5e7eb",borderRadius:10,marginBottom:8,background:"#fff",overflow:"hidden"}}>
        <button onClick={()=>{setExp(open?null:`d${idx}`);setDoCityOpen(null);}} className={isAdmin?"admin-card-btn":"route-card-btn"} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:isAdmin?"10px 12px":"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",gap:8}}>
          <div className={isAdmin?"admin-card-top":"route-card-head"}>
            <RouteCardLabel area={row.area} pol={row.pol}/>
            {!isAdmin && d20.sell!=null && <GuestPricePair d20={d20} d40={d40} prefix="MOW"/>}
            <span className="route-card-chevron" style={{transform:open?"rotate(180deg)":"none"}}>&#8964;</span>
          </div>
          {isAdmin && (
            <div className="admin-card-prices">
              <AdminPriceCols d20={d20} d40={d40} prefix="MOW" editable
                onCost20={v=>applyDropCityCost(row.pol,"mow",0,v)}
                onCost40={v=>applyDropCityCost(row.pol,"mow",1,v)}/>
            </div>
          )}
        </button>
        {open && (
          <div style={{borderTop:"1px solid #f3f4f6",paddingBottom:8}}>
            {isAdmin && <PolAdjustBar pol={row.pol} area={row.area} types={doTypes} costHint="Moscow 합계 매입가 (아래 도시·선사 행에서도 수정)"
              onCost20={v=>applyDropCityCost(row.pol,"mow",0,v)} onCost40={v=>applyDropCityCost(row.pol,"mow",1,v)}
              onClearCost={()=>clearPolCost(row.pol,"drop",null,"mow")}/>}
            <div style={{padding:"12px 16px 4px",fontSize:11,fontWeight:700,color:"#6b7280"}}>Ocean + Drop off · City 선택</div>
            {DOC.map(({k,l})=>{
              const cd20=doDetail(row,k,0),cd40=doDetail(row,k,1);
              const cityKey=`${idx}-${k}`,cOpen=doCityOpen===cityKey;
              const carrierRows = CRS.map(cr=>{
                const cdC20=dropCarrierDetail(row,k,cr,0,"current"),cdC40=dropCarrierDetail(row,k,cr,1,"current");
                const fdC20=dropCarrierDetail(row,k,cr,0,"future"),fdC40=dropCarrierDetail(row,k,cr,1,"future");
                return {cr,cdC20,cdC40,fdC20,fdC40};
              }).filter(x=>x.cdC20.cost!=null||x.cdC40.cost!=null||x.fdC20.cost!=null||x.fdC40.cost!=null);
              return (
                <div key={k}>
                  <button onClick={()=>setDoCityOpen(cOpen?null:cityKey)} className={isAdmin?"admin-card-btn":""} style={{width:"100%",display:"flex",alignItems:"center",padding:"7px 12px",background:cOpen?"#f0f9ff":"none",border:"none",borderBottom:"1px solid #f9fafb",cursor:"pointer",textAlign:"left",gap:6}}>
                    <div className={isAdmin?"admin-card-top":undefined} style={isAdmin?undefined:{display:"flex",alignItems:"center",width:"100%",gap:8}}>
                      <span style={{flex:1,fontSize:12,fontWeight:600,color:"#374151",minWidth:0}}>{l}</span>
                      {!isAdmin && <GuestPricePair d20={cd20} d40={cd40}/>}
                      <span style={{fontSize:12,color:"#9ca3af",transform:cOpen?"rotate(180deg)":"none",display:"inline-block",flexShrink:0}}>&#8964;</span>
                    </div>
                    {isAdmin && (
                      <div className="admin-card-prices">
                        <AdminPriceCols d20={cd20} d40={cd40} editable
                          onCost20={v=>applyDropCityCost(row.pol,k,0,v)}
                          onCost40={v=>applyDropCityCost(row.pol,k,1,v)}/>
                      </div>
                    )}
                  </button>
                  {cOpen && (
                    <div style={{background:"#f0f9ff",borderBottom:"1px solid #bae6fd"}}>
                      {isAdmin ? (
                        carrierRows.length===0
                          ? <div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No service</div>
                          : carrierRows.map(({cr,cdC20,cdC40,fdC20,fdC40})=>(
                          <div key={cr} style={{padding:"10px 12px 10px 20px",borderBottom:"1px solid #e0f2fe"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                              <Bg k={cr}/><span style={{fontSize:11,color:"#6b7280",fontWeight:600}}>{CN[cr]}</span>
                              <ValidityCell carrierKey={cr} compact/>
                            </div>
                            <div style={{fontSize:9,fontWeight:700,color:"#166534",marginBottom:4}}>현재 운임</div>
                            <AdminPriceCols d20={cdC20} d40={cdC40} editable
                              onCost20={v=>applyCarrierRate(row.pol,cr,"coc20",v,"current")}
                              onCost40={v=>applyCarrierRate(row.pol,cr,"coc40",v,"current")}/>
                            <div style={{fontSize:9,fontWeight:700,color:"#b45309",margin:"8px 0 4px"}}>향후 운임</div>
                            <AdminPriceCols d20={fdC20} d40={fdC40} editable
                              onCost20={v=>applyCarrierRate(row.pol,cr,"coc20",v,"future")}
                              onCost40={v=>applyCarrierRate(row.pol,cr,"coc40",v,"future")}/>
                          </div>
                          ))
                      ) : carrierRows.length===0 ? (
                        <div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No service</div>
                      ) : (
                        <div className="carrier-table-shell">
                          <table className="carrier-validity-table" style={{fontSize:12}}>
                            <colgroup>
                              <col className="cvt-col-carrier"/>
                              <col className="cvt-col-validity"/>
                              <col className="cvt-col-price"/>
                              <col className="cvt-col-price"/>
                            </colgroup>
                            <thead><tr style={{color:"#9ca3af",borderBottom:"1px solid #e0f2fe"}}>
                              <th className="cvt-carrier" style={{textAlign:"left",padding:"6px 0",fontWeight:500}}>Carrier</th>
                              <th className="cvt-validity" style={{padding:"6px 0",fontWeight:500}}>Validity</th>
                              <th className="cvt-price" style={{padding:"6px 0",fontWeight:500}}>20'</th>
                              <th className="cvt-price" style={{padding:"6px 0",fontWeight:500}}>40'</th>
                            </tr></thead>
                            <tbody>
                              {carrierRows.map(({cr,cdC20,cdC40})=>(
                                <tr key={cr} style={{borderBottom:"1px solid #e0f2fe"}}>
                                  <td className="cvt-carrier" style={{padding:"8px 0"}}>
                                    <Bg k={cr}/>
                                  </td>
                                  <td className="cvt-validity" style={{padding:"8px 0"}}><ValidityCell carrierKey={cr}/></td>
                                  <td className="cvt-price" style={{padding:"8px 0",cursor:cdC20.sell?"pointer":"default",color:cdC20.sell?(ratePeriod==="future"?"#b45309":"#0369a1"):"#d1d5db",textDecoration:cdC20.sell?"underline":"none"}} onClick={()=>cdC20.sell&&openSC(cr,"coc20",row.pol+" > "+l)}>
                                    {cdC20.sell?`$${n(cdC20.sell)}`:"—"}
                                  </td>
                                  <td className="cvt-price" style={{padding:"8px 0",cursor:cdC40.sell?"pointer":"default",color:cdC40.sell?(ratePeriod==="future"?"#b45309":"#0369a1"):"#d1d5db",textDecoration:cdC40.sell?"underline":"none"}} onClick={()=>cdC40.sell&&openSC(cr,"coc40",row.pol+" > "+l)}>
                                    {cdC40.sell?`$${n(cdC40.sell)}`:"—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const RCrd = ({row,idx}) => {
    const open = exp===`r${idx}`;
    const mow="Moscow";
    const freightPol=row.displayPol||PM[row.pol]||row.pol;
    const d20=rentDetail(row.pol,mow,row,0),d40=rentDetail(row.pol,mow,row,1);
    return (
      <div style={{border:"1px solid #e5e7eb",borderRadius:10,marginBottom:8,background:"#fff",overflow:"hidden"}}>
        <button onClick={()=>{setExp(open?null:`r${idx}`);setCityOpen(null);}} className={isAdmin?"admin-card-btn":"route-card-btn"} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:isAdmin?"10px 12px":"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",gap:8}}>
          <div className={isAdmin?"admin-card-top":"route-card-head"}>
            <RouteCardLabel area={row.area} pol={row.displayPol || row.pol}/>
            {!isAdmin && <GuestPricePair d20={d20} d40={d40} prefix="MOW"/>}
            <span className="route-card-chevron" style={{transform:open?"rotate(180deg)":"none"}}>&#8964;</span>
          </div>
          {isAdmin && (
            <div className="admin-card-prices">
              <AdminPriceCols d20={d20} d40={d40} prefix="MOW" editable
                onCost20={v=>applyRentCityCost(freightPol,"Moscow",0,v)}
                onCost40={v=>applyRentCityCost(freightPol,"Moscow",1,v)}/>
            </div>
          )}
        </button>
        {open && (
          <div style={{borderTop:"1px solid #f3f4f6",paddingBottom:8}}>
            {isAdmin && <PolAdjustBar pol={freightPol} area={row.area} types={["soc20","soc40"]} costHint="Moscow 합계 매입가 (SOC+렌탈)"
              onCost20={v=>applyRentCityCost(freightPol,"Moscow",0,v)} onCost40={v=>applyRentCityCost(freightPol,"Moscow",1,v)}
              onClearCost={()=>clearPolCost(freightPol,"rent",null,"Moscow")}/>}
            <div style={{padding:"12px 16px 4px",fontSize:11,fontWeight:700,color:"#6b7280"}}>Ocean + Rental · Return City (Drop off 순서)</div>
            {RENT_CITY_ORDER.map(city=>{
              const cd20=rentDetail(row.pol,city,row,0),cd40=rentDetail(row.pol,city,row,1);
              const key=`${idx}-${city}`,cOpen=cityOpen===key;
              const carriers=cOpen?cRent(row.pol,city,row):[];
              const cityLabel=RC_LABEL[city]||city;
              const fp=PM[row.pol],fr=fp?fMap[fp]:null;
              return (
                <div key={city}>
                  <button onClick={()=>setCityOpen(cOpen?null:key)} className={isAdmin?"admin-card-btn":""} style={{width:"100%",display:"flex",alignItems:"center",padding:"8px 12px",background:cOpen?"#faf5ff":"none",border:"none",borderBottom:"1px solid #f9fafb",cursor:"pointer",textAlign:"left",gap:6}}>
                    <div className={isAdmin?"admin-card-top":undefined} style={isAdmin?undefined:{display:"flex",alignItems:"center",width:"100%",gap:8}}>
                      <span style={{flex:1,fontSize:12,fontWeight:600,color:"#374151",minWidth:0}}>{cityLabel}</span>
                      {!isAdmin && <GuestPricePair d20={cd20} d40={cd40}/>}
                      <span style={{fontSize:12,color:"#9ca3af",transform:cOpen?"rotate(180deg)":"none",display:"inline-block",flexShrink:0}}>&#8964;</span>
                    </div>
                    {isAdmin && (
                      <div className="admin-card-prices">
                        <AdminPriceCols d20={cd20} d40={cd40} editable
                          onCost20={v=>applyRentCityCost(freightPol,city,0,v)}
                          onCost40={v=>applyRentCityCost(freightPol,city,1,v)}/>
                      </div>
                    )}
                  </button>
                  {cOpen && (
                    <div style={{background:"#faf5ff",borderBottom:"1px solid #ede9fe"}}>
                      {isAdmin ? (
                        carriers.length===0
                          ? <div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No SOC data</div>
                          : carriers.map(c=>{
                          const cdC20=mkPrice(c.cost20,c.m20,c.k);
                          const cdC40=mkPrice(c.cost40,c.m40,c.k);
                          const socC20=mkPrice(c.soc20,getM(fp,fr.area,"soc20",ratePeriod),c.k);
                          const socC40=mkPrice(c.soc40,getM(fp,fr.area,"soc40",ratePeriod),c.k);
                          const rentC20=mkPrice(c.rent20,getRentalM(fp,fr.area,"r20"),c.k);
                          const rentC40=mkPrice(c.rent40,getRentalM(fp,fr.area,"r40"),c.k);
                          return (
                          <div key={c.k} style={{padding:"8px 12px 8px 20px",borderBottom:"1px solid #ede9fe"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                              <Bg k={c.k}/>
                              <span style={{fontSize:11,color:"#6b7280",fontWeight:600}}>{CN[c.k]}</span>
                              <ValidityCell carrierKey={c.k} compact/>
                            </div>
                            <div style={{fontSize:9,fontWeight:700,color:"#1e40af",marginBottom:4}}>SOC 해상 매입</div>
                            <AdminPriceCols d20={socC20} d40={socC40} editable
                              onCost20={v=>fp&&applyCarrierRate(fp,c.k,"soc20",v)}
                              onCost40={v=>fp&&applyCarrierRate(fp,c.k,"soc40",v)}/>
                            <div style={{fontSize:9,fontWeight:700,color:"#7c3aed",margin:"8px 0 4px"}}>렌탈 매입</div>
                            <AdminPriceCols d20={rentC20} d40={rentC40} editable
                              onCost20={v=>applyRentalRate(row.pol,city,0,v)}
                              onCost40={v=>applyRentalRate(row.pol,city,1,v)}/>
                            <div style={{fontSize:9,color:"#6b7280",marginTop:6}}>합계 매출 (SOC+렌탈+마진)</div>
                            <AdminPriceCols d20={cdC20} d40={cdC40} prefix="" editable={false}/>
                          </div>
                          );})
                      ) : carriers.length===0 ? (
                        <div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No SOC data</div>
                      ) : (
                        <div className="carrier-table-shell">
                          <table className="carrier-validity-table carrier-rent-table" style={{fontSize:12}}>
                            <colgroup>
                              <col className="cvt-col-carrier"/>
                              <col className="cvt-col-validity"/>
                              <col className="cvt-col-price"/>
                              <col className="cvt-col-price"/>
                            </colgroup>
                            <thead><tr style={{color:"#9ca3af",borderBottom:"1px solid #ede9fe"}}>
                              <th className="cvt-carrier" style={{textAlign:"left",padding:"6px 0",fontWeight:500}}>Carrier</th>
                              <th className="cvt-validity" style={{padding:"6px 0",fontWeight:500}}>Validity</th>
                              <th className="cvt-price" style={{padding:"6px 0",fontWeight:500}}>20'</th>
                              <th className="cvt-price" style={{padding:"6px 0",fontWeight:500}}>40'</th>
                            </tr></thead>
                            <tbody>
                              {carriers.map(c=>{
                                const rentPriceColor = ratePeriod==="future"?"#b45309":"#7c3aed";
                                return (
                                <tr key={c.k} style={{borderBottom:"1px solid #ede9fe"}}>
                                  <td className="cvt-carrier" style={{padding:"8px 0"}}>
                                    <Bg k={c.k}/>
                                  </td>
                                  <td className="cvt-validity" style={{padding:"8px 0"}}><ValidityCell carrierKey={c.k}/></td>
                                  <td className="cvt-price" style={{padding:"8px 0",cursor:c.t20?"pointer":"default",color:c.t20?rentPriceColor:"#d1d5db",textDecoration:c.t20?"underline":"none"}} onClick={()=>c.t20&&openSC(c.k,"soc20",row.pol+" > "+city)}>
                                    <div className="cvt-price-main">{c.t20?`$${n(c.t20)}`:"—"}</div>
                                    {c.t20&&<div className="cvt-price-sub">Rental {n(row.r20[city])}</div>}
                                  </td>
                                  <td className="cvt-price" style={{padding:"8px 0",cursor:c.t40?"pointer":"default",color:c.t40?rentPriceColor:"#d1d5db",textDecoration:c.t40?"underline":"none"}} onClick={()=>c.t40&&openSC(c.k,"soc40",row.pol+" > "+city)}>
                                    <div className="cvt-price-main">{c.t40?`$${n(c.t40)}`:"—"}</div>
                                    {c.t40&&<div className="cvt-price-sub">Rental {n(row.r40[city])}</div>}
                                  </td>
                                </tr>
                              );})}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── MAIN RENDER ──
  return (
    <div className={adVisible ? "app-root app-has-fixed-ad" : "app-root"} style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
      {adminSaveToastEl}

      <div className="portal-sticky-top">
      {/* HEADER */}
      <div>
        <div style={{maxWidth:640,margin:"0 auto",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Logo size={32}/>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#111",lineHeight:1}}>YSL Agency</div>
              <div style={{fontSize:10,color:"#9ca3af",marginTop:2}}>
                {isAdmin ? "Admin Mode" : isClient ? client?.company_name : "Freight Rate Portal"}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end",maxWidth:"62%"}}>
            {isAdmin && (
              <>
                <button onClick={()=>setShowCarrierAdmin(true)} style={{fontSize:11,fontWeight:700,padding:"6px 10px",borderRadius:20,background:"#1e40af",color:"#fff",border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>선사운임</button>
                <button onClick={()=>setShowRentalAdmin(true)} style={{fontSize:11,fontWeight:700,padding:"6px 10px",borderRadius:20,background:"#7c3aed",color:"#fff",border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>렌탈운임</button>
                <button onClick={()=>setShowExcelUploadAdmin(true)} style={{fontSize:11,fontWeight:700,padding:"6px 10px",borderRadius:20,background:"#d97706",color:"#fff",border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>Excel</button>
                <button onClick={()=>{setShowRateHistoryAdmin(true);}} style={{fontSize:11,fontWeight:700,padding:"6px 10px",borderRadius:20,background:"#0d9488",color:"#fff",border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>Rate History</button>
                <button onClick={()=>setShowNoticeAdmin(true)} style={{fontSize:11,fontWeight:600,padding:"6px 10px",borderRadius:20,background:"#faf5ff",color:"#7c3aed",border:"1px solid #e9d5ff",cursor:"pointer",whiteSpace:"nowrap"}}>Notice</button>
                <button onClick={()=>setShowAdAdmin(true)} style={{fontSize:11,fontWeight:600,padding:"6px 10px",borderRadius:20,background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa",cursor:"pointer",whiteSpace:"nowrap"}}>광고</button>
                <button onClick={()=>{setShowMgr(true);loadClients();}} style={{fontSize:11,fontWeight:600,padding:"6px 10px",borderRadius:20,background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",cursor:"pointer",whiteSpace:"nowrap"}}>Clients</button>
              </>
            )}
            {(isClient || isAdmin) ? (
              <button onClick={logout} style={{fontSize:11,fontWeight:500,padding:"6px 12px",borderRadius:20,background:"#f3f4f6",color:"#6b7280",border:"1px solid #e5e7eb",cursor:"pointer"}}>Logout</button>
            ) : (
              <button onClick={()=>{setShowLoginModal(true);setLoginErr("");}} style={{fontSize:11,fontWeight:600,padding:"6px 14px",borderRadius:20,background:"#1D2B4F",color:"#fff",border:"none",cursor:"pointer"}}>Login</button>
            )}
          </div>
        </div>
      </div>

      {!isAdmin && (
      <>
      {/* SEARCH + FILTERS */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"0 16px 8px"}}>
        <input placeholder="Search POL..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{width:"100%",padding:"10px 16px",fontSize:14,border:"1px solid #e5e7eb",borderRadius:10,outline:"none",background:"#fff",boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:6,marginTop:8,overflowX:"auto",paddingBottom:4}}>
          {["ALL",...areas].map(a=>(
            <button key={a} onClick={()=>setAreaF(a)} style={{fontSize:11,fontWeight:500,padding:"6px 12px",borderRadius:20,whiteSpace:"nowrap",background:a===areaF?"#111":"#fff",color:a===areaF?"#fff":"#6b7280",border:`1px solid ${a===areaF?"#111":"#e5e7eb"}`,cursor:"pointer"}}>
              {a==="ALL"?"All":a}
            </button>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"0 16px"}}>
        <div style={{display:"flex",borderBottom:"1px solid #e5e7eb"}}>
          {MAIN_TABS.map(({id,label,Icon})=>{
            const active=tab===id;
            const color=active?"#111":"#9ca3af";
            return (
              <button key={id} onClick={()=>{setTab(id);setExp(null);setCityOpen(null);}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,padding:"10px 4px 8px",fontSize:11,fontWeight:600,background:"none",border:"none",borderBottom:`2px solid ${active?"#111":"transparent"}`,color,cursor:"pointer"}}>
                <Icon active={active}/>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="carrier-port-guide-shell">
        <CarrierPortGuide/>
      </div>

      {/* COC/SOC TOGGLE */}
      {tab==="ocean" && (
        <div style={{maxWidth:640,margin:"0 auto",padding:"10px 16px 12px"}}>
          <div style={{display:"inline-flex",background:"#f3f4f6",borderRadius:8,padding:2}}>
            {["coc","soc"].map(t=>(
              <button key={t} onClick={()=>setCtype(t)} style={{padding:"6px 16px",fontSize:11,fontWeight:600,borderRadius:6,background:ctype===t?"#fff":"transparent",border:"none",cursor:"pointer",color:ctype===t?"#111":"#9ca3af"}}>{t.toUpperCase()}</button>
            ))}
          </div>
          <span style={{fontSize:10,color:"#9ca3af",marginLeft:8}}>{ctype==="coc"?"Carrier Owned":"Shipper Owned"}</span>
          <RatePeriodToggle/>
        </div>
      )}
      {tab==="dropoff" && (
        <div style={{maxWidth:640,margin:"0 auto",padding:"10px 16px 12px"}}>
          <RatePeriodToggle/>
        </div>
      )}
      {tab==="rental" && (
        <div style={{maxWidth:640,margin:"0 auto",padding:"10px 16px 12px"}}>
          <RatePeriodToggle/>
        </div>
      )}
      </>
      )}
      </div>

      {/* ADMIN MARGIN PANEL */}
      {isAdmin && (
        <div style={{maxWidth:640,margin:"12px auto 0",padding:"0 16px"}}>
          {!settingsLoaded ? (
            <RatesLoading />
          ) : (
          <>
          <button type="button" onClick={()=>setShowCarrierAdmin(true)}
            style={{width:"100%",padding:"12px 14px",marginBottom:8,fontSize:13,fontWeight:700,color:"#fff",background:"#1e40af",border:"none",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            선사별 운임 관리 (매입 · 매출 · 마진)
          </button>
          <button type="button" onClick={()=>setShowExcelUploadAdmin(true)}
            style={{width:"100%",padding:"12px 14px",marginBottom:8,fontSize:13,fontWeight:700,color:"#fff",background:"#d97706",border:"none",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            Excel 운임 업로드 (선사 원본 · YSL 양식)
          </button>
          <button type="button" onClick={()=>setShowRentalAdmin(true)}
            style={{width:"100%",padding:"12px 14px",marginBottom:8,fontSize:13,fontWeight:700,color:"#fff",background:"#7c3aed",border:"none",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            컨테이너 Rental 운임 관리 (매입 · 매출 · 마진)
          </button>
          <button type="button" onClick={()=>{ setShowRateHistoryAdmin(true); loadRateHistory(); }}
            style={{width:"100%",padding:"12px 14px",marginBottom:8,fontSize:13,fontWeight:700,color:"#fff",background:"#0d9488",border:"none",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            Rate History (운임 변경 이력)
          </button>
          <button type="button" onClick={()=>setShowAdAdmin(true)}
            style={{width:"100%",padding:"12px 14px",marginBottom:8,fontSize:13,fontWeight:700,color:"#fff",background:"#ea580c",border:"none",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            하단 광고 배너 관리 (최대 3개)
          </button>
          </>
          )}
        </div>
      )}

      {!isAdmin && (
      <>
      {/* CONTENT */}
      <div style={{maxWidth:640,margin:"12px auto",padding:"0 16px 24px"}}>
        {!settingsLoaded ? (
          <RatesLoading />
        ) : (
          <>
            <div style={{fontSize:10,color:"#9ca3af",marginBottom:8}}>{`${tab==="rental"?rFilt.length:filt.length} routes`}</div>
            {tab==="ocean" && filt.map((row,i)=><OCard key={i} row={row} idx={i}/>)}
            {tab==="dropoff" && filt.map((row,i)=><DOCrd key={i} row={row} idx={i}/>)}
            {tab==="rental" && rFilt.map((row,i)=><RCrd key={i} row={row} idx={i}/>)}
          </>
        )}
      </div>
      </>
      )}

      <FooterAdSlot ads={adBanners} dismissed={adDismissed} onDismiss={dismissAd} />

      <div style={{maxWidth:640,margin:"0 auto",padding:"8px 16px 24px",textAlign:"center"}}>
        <span style={{fontSize:10,color:"#d1d5db"}}>YSL Agency Far East · Rates subject to change</span>
      </div>

      {/* LOGIN MODAL */}
      {showLoginModal && (
        <div style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowLoginModal(false)}>
          <div style={{background:"#fff",borderRadius:20,padding:24,width:"100%",maxWidth:360,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <Logo size={40}/>
              <div><div style={{fontSize:16,fontWeight:700,color:"#111"}}>YSL Agency</div><div style={{fontSize:11,color:"#9ca3af"}}>Login</div></div>
              <button onClick={()=>setShowLoginModal(false)} style={{marginLeft:"auto",fontSize:18,color:"#9ca3af",background:"none",border:"none",cursor:"pointer",lineHeight:1}}>&#10005;</button>
            </div>
            {/* Tab */}
            <div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3,marginBottom:16}}>
              {[["client","Client"],["admin","Admin"]].map(([k,l])=>(
                <button key={k} onClick={()=>{setLoginTab(k);setLoginErr("");}} style={{flex:1,padding:"7px",fontSize:12,fontWeight:600,borderRadius:8,background:loginTab===k?"#fff":"transparent",border:"none",cursor:"pointer",color:loginTab===k?"#111":"#9ca3af"}}>{l}</button>
              ))}
            </div>
            {loginTab==="client" ? (
              <div>
                <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
                  style={{width:"100%",padding:"11px 14px",fontSize:14,border:"1px solid #e5e7eb",borderRadius:10,marginBottom:10,boxSizing:"border-box",outline:"none"}}/>
                <input type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}
                  style={{width:"100%",padding:"11px 14px",fontSize:14,border:"1px solid #e5e7eb",borderRadius:10,marginBottom:14,boxSizing:"border-box",outline:"none"}}/>
                {loginErr&&<div style={{fontSize:12,color:"#ef4444",marginBottom:10}}>{loginErr}</div>}
                <button onClick={doLogin} disabled={loginLoading}
                  style={{width:"100%",padding:"12px",fontSize:14,fontWeight:600,color:"#fff",background:"#1D2B4F",border:"none",borderRadius:10,cursor:"pointer",opacity:loginLoading?0.6:1}}>
                  {loginLoading?"Checking...":"Login"}
                </button>
              </div>
            ) : ADMIN_SKIP_PIN ? (
              <div>
                <div style={{fontSize:12,color:"#6b7280",marginBottom:14,textAlign:"center",lineHeight:1.5}}>
                  검토 모드 · PIN 없이 Admin 진입
                </div>
                {loginErr&&<div style={{fontSize:12,color:"#ef4444",marginBottom:10}}>{loginErr}</div>}
                <button onClick={doAdminLogin}
                  style={{width:"100%",padding:"12px",fontSize:14,fontWeight:600,color:"#fff",background:"#1D2B4F",border:"none",borderRadius:10,cursor:"pointer"}}>
                  Admin 바로 들어가기
                </button>
              </div>
            ) : (
              <div>
                <input type="password" placeholder="Admin PIN" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doAdminLogin()} autoFocus
                  style={{width:"100%",padding:"11px 14px",fontSize:22,fontWeight:700,letterSpacing:10,textAlign:"center",border:"1px solid #e5e7eb",borderRadius:10,marginBottom:14,boxSizing:"border-box",outline:"none"}}/>
                {loginErr&&<div style={{fontSize:12,color:"#ef4444",marginBottom:10}}>{loginErr}</div>}
                <button onClick={doAdminLogin}
                  style={{width:"100%",padding:"12px",fontSize:14,fontWeight:600,color:"#fff",background:"#1D2B4F",border:"none",borderRadius:10,cursor:"pointer"}}>
                  Admin Login
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NOTICE POPUP (up to 3, sequential) */}
      {currentNoticePopup && (
        <div style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:480,maxHeight:"85vh",boxShadow:"0 20px 60px rgba(0,0,0,0.25)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{background:"#1D2B4F",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18}}>📢</span>
                <div>
                  <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>{currentNoticePopup.title || `Notice ${currentNoticePopup.i + 1}`}</span>
                  {activeNoticeQueue.length > 1 && (
                    <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>
                      {activeNoticeQueue.findIndex(n => n.i === currentNoticePopup.i) + 1} / {activeNoticeQueue.length}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={dismissCurrentNotice} style={{color:"#9ca3af",background:"none",border:"none",cursor:"pointer",fontSize:20,lineHeight:1}}>✕</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
              {currentNoticePopup.text && (
                <div style={{fontSize:13,color:"#374151",lineHeight:1.8,whiteSpace:"pre-wrap",marginBottom:currentNoticePopup.fileUrl?16:0}}>{currentNoticePopup.text}</div>
              )}
              {renderNoticeFile(currentNoticePopup.fileUrl, currentNoticePopup.title)}
            </div>
            <div style={{padding:"12px 20px",borderTop:"1px solid #f3f4f6",flexShrink:0}}>
              <button onClick={dismissCurrentNotice}
                style={{width:"100%",padding:"11px",fontSize:13,fontWeight:600,color:"#fff",background:"#1D2B4F",border:"none",borderRadius:10,cursor:"pointer"}}>
                {(() => {
                  const idx = activeNoticeQueue.findIndex(n => n.i === currentNoticePopup.i);
                  return idx >= 0 && idx < activeNoticeQueue.length - 1 ? "다음" : "확인";
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* S/C POPUP */}
      {sc && (
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.3)"}} onClick={()=>setSc(null)}>
          <div style={{width:"100%",maxWidth:480,background:"#fff",borderRadius:"20px 20px 0 0",padding:"20px 20px 32px",boxShadow:"0 -20px 60px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:4,background:"#e5e7eb",borderRadius:2,margin:"0 auto 16px"}}/>
            <div style={{fontSize:10,color:"#9ca3af",fontWeight:500,marginBottom:4}}>S/C NUMBER · {sc.k} · {sc.size}</div>
            <div style={{fontSize:12,color:"#6b7280",marginBottom:12}}>{sc.route}</div>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:10,padding:12}}>
              <span style={{flex:1,fontSize:18,fontFamily:"monospace",fontWeight:700,color:"#111",letterSpacing:2}}>{sc.sc}</span>
              <button onClick={copySC} style={{padding:"8px 16px",fontSize:12,fontWeight:600,color:"#fff",background:sc.copied?"#16a34a":"#111827",border:"none",borderRadius:8,cursor:"pointer"}}>{sc.copied?"Copied":"Copy"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
