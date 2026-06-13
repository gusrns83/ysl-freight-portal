


const SB_URL = "https://mmswsopevmyreoygovpa.supabase.co";
const SB_KEY = "sb_publishable_XaUcvApLXTrJ5lRhte7YXQ_Bqmj_IEq";
const ADMIN_PIN = "0000";
const ADMIN_SKIP_PIN = false; // APP1: 운영 기본값 false
const ADMIN_SAVE_REV = "save-v56"; // Admin 저장 로직 버전 (배포 확인용)
// 고객용 매출 스냅샷 키 — 매입·마진 없이 매출가만 (보안 B안 Phase 1)
const PUBLIC_RATES_KEY = "public_rates_json";
// 마스터 스위치 — false 면 고객도 기존처럼 raw 로드·렌더(즉시 전면 롤백용). 스냅샷 생성은 유지됨
const PUBLIC_RATES_ENABLED = true;
// 스냅샷이 없거나 깨졌을 때 raw(매입 포함)로 폴백할지. 롤아웃 중 true → 검증 후 false(안전모드)
const PUBLIC_RATES_FALLBACK_RAW = true;
const DB_OCEAN = "ocean";
const DB_DROP = "dropoff";
const DB_RENTAL = "rental";
const DB_LABEL = { [DB_OCEAN]: "해상 운임 DB", [DB_DROP]: "Drop off DB", [DB_RENTAL]: "Rental DB" };
const SAVE_UI_MAX_MS = 180000;
const SAVE_HEAVY_ATTEMPTS = 3;
const SAVE_HEAVY_TIMEOUT_MS = 45000;
const SAVE_LIGHT_TIMEOUT_MS = 30000;
const API_TIMEOUT_MS = 45000;
const RATE_HISTORY_UPLOAD_TIMEOUT_MS = 90000;
const rentSocType = (comboIdx) => (comboIdx === 0 ? "soc20" : "soc40");
const RENT_COMBO_KEYS = ["c20", "c40dv", "c40hc"];
const RENT_COMBO_SHORT = ["20'", "40'DV", "40'HC"];
const rentComboSk = (comboIdx) => RENT_COMBO_KEYS[comboIdx] ?? "c20";
const rentComboMarginType = (comboIdx) => (comboIdx === 0 ? "r20" : comboIdx === 1 ? "r40dv" : "r40hc");
const normalizeRentalCityBucket = (bucket) => {
  if (!bucket || typeof bucket !== "object") return {};
  const out = { ...bucket };
  if (out.c40 != null && out.c40 !== "" && out.c40dv == null) out.c40dv = out.c40;
  return out;
};
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


export { ADMIN_PIN, ADMIN_SAVE_REV, ADMIN_SESSION_KEY, ADMIN_SKIP_PIN, AD_COUNT, AD_ROTATE_MS, API_TIMEOUT_MS, DB_DROP, DB_LABEL, DB_OCEAN, DB_RENTAL, DEFAULT_MARGINS, NOTICE_COUNT, PRICING_CACHE_KEY, PUBLIC_RATES_ENABLED, PUBLIC_RATES_FALLBACK_RAW, PUBLIC_RATES_KEY, RATE_HISTORY_UPLOAD_TIMEOUT_MS, RENT_COMBO_KEYS, RENT_COMBO_SHORT, SAVE_HEAVY_ATTEMPTS, SAVE_HEAVY_TIMEOUT_MS, SAVE_LIGHT_TIMEOUT_MS, SAVE_UI_MAX_MS, SB_KEY, SB_URL, mkAds, mkNotices, normalizeRentalCityBucket, parseAdsFromSettings, parseNoticeOn, readStoredPricingCache, rentComboMarginType, rentComboSk, rentSocType };
