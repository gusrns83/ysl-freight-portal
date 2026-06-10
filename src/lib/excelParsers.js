import { normalizeRentalCityBucket } from "../config.js";
import { CRS, DOC_RC, PM, RATE_TYPES, formatValiditySlotLabel, normalizeRentalCityName, normalizeValidityCarrier, normalizeValiditySlot, parseValidityToISO, syncFromAfterTill } from "../data/staticData.js";
import { DROP_CITY_LABELS, marginNum, resolveCarrierEffectiveSell, resolveCarrierExplicitSell } from "./pricing.js";

// ── Excel upload (inlined — GitHub App.jsx 단일 배포) ──
let xlsxLoadPromise = null;
const loadXlsx = () => {
  if (typeof window !== "undefined" && window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoadPromise) return xlsxLoadPromise;
  xlsxLoadPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Excel 파싱은 브라우저에서만 가능합니다"));
      return;
    }
    const existing = document.querySelector('script[data-ysl-xlsx="1"]');
    if (existing && window.XLSX) {
      resolve(window.XLSX);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.async = true;
    s.dataset.yslXlsx = "1";
    s.onload = () => {
      if (window.XLSX) resolve(window.XLSX);
      else reject(new Error("SheetJS 로드 실패"));
    };
    s.onerror = () => reject(new Error("SheetJS CDN 로드 실패"));
    document.head.appendChild(s);
  });
  return xlsxLoadPromise;
};

const APP_POLS = new Set([
  "BUSAN", "INCHEON", "KWANGYANG", "SHANGHAI", "QINGDAO", "TIANJIN", "DALIAN", "NINGBO",
  "NANJING", "YANGZHOU", "ZHANGJIAGANG", "TAICANG", "LIANYUNGANG", "YANTAI", "CHONGQING", "SHEKOU",
  "XIAMEN", "NANSHA", "YANTIAN", "HONGKONG", "SHANTOU", "FUZHOU", "HUANGPU/PRD", "QINZHOU",
  "TOKYO", "YOKOHAMA", "NAGOYA", "OSAKA", "KOBE", "HAKATA", "MOJI", "NIIGATA", "TOMAKOMAI", "SHIMIZU",
  "YOKKACHI", "AKITA", "CHIBA", "HIROSHIMA", "IYOMISHIMA", "KANAZAWA", "MAIZURU", "MIZUSHIMA",
  "NAOETSU", "SAKAIMINATO", "TAKAMATSU", "TOYOHASHI", "TOYAMASHINKO", "TSURUGA", "WAKAYAMA",
  "HOCHIMINH", "HAIPHONG", "DANANG", "KEELUNG", "KAOHSIUNG", "TAICHUNG", "BANGKOK", "LAEM CHABANG",
  "JAKARTA", "SURABAYA", "SEMARANG", "BELAWAN", "PANJANG", "MAKASSAR", "PALEMBANG",
  "SINGAPORE", "MANILA", "MALAYSIA (P.KLANG)", "PASIR GUDANG", "PENANG", "TANJUNG PELEPAS",
  "CHATTOGRAM", "INDIA (MUNDRA)", "NHAVA SHEVA", "INDIA (CHENNAI)", "JEBEL ALI",
]);

const JAPAN_PORTS = [
  "TOKYO", "YOKOHAMA", "NAGOYA", "OSAKA", "KOBE", "HAKATA", "MOJI", "NIIGATA", "TOMAKOMAI", "SHIMIZU",
  "YOKKACHI", "AKITA", "CHIBA", "HIROSHIMA", "IYOMISHIMA", "KANAZAWA", "MAIZURU", "MIZUSHIMA",
  "NAOETSU", "SAKAIMINATO", "TAKAMATSU", "TOYOHASHI", "TOYAMASHINKO", "TSURUGA", "WAKAYAMA",
];
const JAPAN_POL_SET = new Set(JAPAN_PORTS);

const SNK_POL_EXPAND = {
  "JAPAN ALL PORTS": JAPAN_PORTS,
  JAPAN: JAPAN_PORTS,
  LAEMCHABANG: ["LAEM CHABANG"],
  "LAEM CHABANG": ["LAEM CHABANG"],
  HUANGPU: ["HUANGPU/PRD"],
  NANSHA: ["NANSHA"],
  YANGZHOU: ["YANGZHOU"],
  YANTIAN: ["YANTIAN"],
  TAICHUNG: ["TAICHUNG"],
  BELAWAN: ["BELAWAN"],
  MAKASAR: ["MAKASSAR"],
  "PANJANG, MAKASAR, PALEMBANG": ["PANJANG", "MAKASSAR", "PALEMBANG"],
  "PASIR GUDANG, PENANG": ["PASIR GUDANG", "PENANG"],
  "PORT KLANG, TANJUNG PELEPAS": ["MALAYSIA (P.KLANG)", "TANJUNG PELEPAS"],
  "MANILA(N-HARBOUR)": ["MANILA"],
  "INDIA (WEST COAST)_MUNDRA, NHAVASHEVA": ["INDIA (MUNDRA)", "NHAVA SHEVA"],
  "INDIA (EAST COAST)_CHENNAI": ["INDIA (CHENNAI)"],
  "N.CHINA IN-LAND": ["CHONGQING"],
  "S.CHINA IN-LAND": ["CHONGQING"],
  "NANJING, ZHANGJIAGANG, LIANYUNGANG": ["NANJING", "ZHANGJIAGANG", "LIANYUNGANG"],
  "NANJING, ZHANGJIAGANG": ["NANJING", "ZHANGJIAGANG"],
  "LIANYUNGANG, N.CHINA IN-LAND": ["LIANYUNGANG", "CHONGQING"],
  SINGAPORE: ["SINGAPORE"],
};

const DY_POL_MAP = {
  SHANGHAI: "SHANGHAI",
  "TAICANG VIA SHA": "TAICANG",
  NINGBO: "NINGBO",
  NANJING: "NANJING",
  ZHANGJIAGANG: "ZHANGJIAGANG",
  QINGDAO: "QINGDAO",
  LIANYUNGANG: "LIANYUNGANG",
  YANTAI: "YANTAI",
  XINGANG: "TIANJIN",
  DALIAN: "DALIAN",
  XIAMEN: "XIAMEN",
  SHEKOU: "SHEKOU",
  NANSHA: "NANSHA",
  HONGKONG: "HONGKONG",
  BUSAN: "BUSAN",
  INCHEON: "INCHEON",
  KWANGYANG: "KWANGYANG",
  YOKOHAMA: "YOKOHAMA",
  TOKYO: "TOKYO",
  KOBE: "KOBE",
  NAGOYA: "NAGOYA",
  OSAKA: "OSAKA",
  HAKATA: "HAKATA",
  MOJI: "MOJI",
  NIIGATA: "NIIGATA",
  SHIMIZU: "SHIMIZU",
  TOMAKOMAI: "TOMAKOMAI",
  HAIPONG: "HAIPHONG",
  DANANG: "DANANG",
  HOCHIMINH: "HOCHIMINH",
  BANGKOK: "BANGKOK",
  "LAEM CHA BANG": "LAEM CHABANG",
  LAEMCHABANG: "LAEM CHABANG",
};

const CK_POL_MAP = {
  SHANGHAI: "SHANGHAI",
  "CHONGQING via SHA Barge": "CHONGQING",
  "CHONGQING via SHA Barg": "CHONGQING",
  "CHONGQING via QZH Rail": null,
  NINGBO: "NINGBO",
  TAICANG: "TAICANG",
  ZHANGJIAGANG: "ZHANGJIAGANG",
  QINGDAO: "QINGDAO",
  LIANYUNGANG: "LIANYUNGANG",
  XINGANG: "TIANJIN",
  DALIAN: "DALIAN",
  XIAMEN: "XIAMEN",
  SHEKOU: "SHEKOU",
  HUANGPU: "HUANGPU/PRD",
  PRD: "HUANGPU/PRD",
  SHANTOU: "SHANTOU",
  FUZHOU: "FUZHOU",
  QINZHOU: "QINZHOU",
  NANSHA: "NANSHA",
  HONGKONG: "HONGKONG",
  HOCHIMINH: "HOCHIMINH",
  HAIPONG: "HAIPHONG",
  BANGKOK: "BANGKOK",
  "LAEM CHA BANG": "LAEM CHABANG",
  JAKARTA: "JAKARTA",
  SURABAYA: "SURABAYA",
  SEMARANG: "SEMARANG",
  KEELUNG: "KEELUNG",
  TOKYO: "TOKYO",
  YOKOHAMA: "YOKOHAMA",
  NAGOYA: "NAGOYA",
  SHIMIZU: "SHIMIZU",
  KOBE: "KOBE",
  OSAKA: "OSAKA",
  HAKATA: "HAKATA",
  MOJI: "MOJI",
  NIIGATA: "NIIGATA",
  TOMAKOMAI: "TOMAKOMAI",
  BUSAN: "BUSAN",
  YOKKACHI: "YOKKACHI",
  AKITA: "AKITA",
  CHIBA: "CHIBA",
  HIROSHIMA: "HIROSHIMA",
  IYOMISHIMA: "IYOMISHIMA",
  KANAZAWA: "KANAZAWA",
  MAIZURU: "MAIZURU",
  MIZUSHIMA: "MIZUSHIMA",
  NAOETSU: "NAOETSU",
  SAKAIMINATO: "SAKAIMINATO",
  TAKAMATSU: "TAKAMATSU",
  TOYOHASHI: "TOYOHASHI",
  TOYAMASHINKO: "TOYAMASHINKO",
  TSRUGA: "TSURUGA",
  WAKAYAMAK: "WAKAYAMA",
};

const RENTAL_EXCEL_TO_POL = {
  YOKOHAMA: "Yokohama",
  OSAKA: "Osaka",
  KOBE: "Kobe",
  NAGOYA: "Nagoya",
  QINGDAO: "Qingdao",
  TIANJIN: "Tianjin",
  SHANGHAI: "Shanghai",
  NINGBO: "Ningbo",
  DALIAN: "Dalian",
  XIAMEN: "Xiamen",
  HUANGPU: "Huangpu",
  NANSHA: "Nansha",
  YANTIAN: "Yantian",
  SHEKOU: "Shenzhen",
  KEELUNG: "Keelung",
  KAOHSIUNG: "Kaohsiung",
  TAICHING: "Kaohsiung",
  TAICHUNG: "Kaohsiung",
  BUSAN: "Busan",
};

const PDF_DROP = {
  Moscow: [300, 400],
  Chelyabinsk: [500, 600],
  Novosibirsk: [650, 850],
  Irkutsk: [700, 900],
  Krasnoyarsk: [750, 900],
  Khabarovsk: [650, 750],
  Ekaterinburg: [400, 700],
  Vladivostok: [600, 700],
  "St.Petersburg": [450, 750],
  Samara: [500, 800],
  Tolyatti: [400, 700],
  Kazan: [650, 750],
  Minsk: [500, 500],
};

const UPLOAD_FORMATS = [
  { id: "SNK", label: "장금상선 (SKR-YSL)", hint: "「Vladivostok … (업로드용)」· NET+매출" },
  { id: "DY", label: "동영 (Fishery Import)", hint: "「Import (업로드용)」· NET+매출 · Import=Drop 포함" },
  { id: "CK", label: "천경 (CK Line)", hint: "「CKL Guidance Rate (업로드용)」· NET+매출" },
  { id: "YSL", label: "YSL 관리양식", hint: "NET(C~F) 매입 · SELL(G~J) 매출" },
  { id: "RENTAL", label: "컨테이너 Rental", hint: "「업로드용」· POL×반납지 · 20'/40'DV/40'HC" },
];

const excelUploadCarrierKey = (format, yslCarrier, parsed) => {
  if (format === "RENTAL" || parsed?.format === "RENTAL") return "RENTAL";
  if (format === "YSL" || parsed?.format === "YSL") return parsed?.carrier || yslCarrier;
  return parsed?.carrier || format;
};

const LEGACY_VALIDITY_KEY = { SNK: "validity_snk", DY: "validity_dy", CK: "validity_ck", RENTAL: "validity_rental" };

const mergeUploadValidity = (validityInfo, carrierKey, period, draft) => {
  const entry = normalizeValidityCarrier(validityInfo[carrierKey] || {});
  const slot = normalizeValiditySlot(draft);
  const updated = { ...entry, [period]: slot };
  if (period === "current" && slot.till && !updated.future?.furtherNotice) {
    updated.future = { ...updated.future, from: syncFromAfterTill(slot.till, updated.future?.from) };
  }
  return { ...validityInfo, [carrierKey]: updated };
};

/** Validity 구간 저장 키 — pol_costs.carrier[].byValidity 아카이브용 */
const validityStorageKey = (slot) => {
  const s = normalizeValiditySlot(slot);
  const from = parseValidityToISO(s.from) || "open";
  const till = s.furtherNotice ? "fn" : (parseValidityToISO(s.till) || "open");
  return `${from}_${till}`;
};

const buildPolCostBucket = (costs, sells) => {
  const bucket = {};
  RATE_TYPES.forEach(t => {
    if (costs?.[t] != null) bucket[t] = costs[t];
  });
  const sell = {};
  RATE_TYPES.forEach(t => {
    if (sells?.[t] != null) sell[t] = sells[t];
  });
  if (Object.keys(sell).length) bucket.sell = sell;
  return bucket;
};

const polCostBucketHasRates = (bucket) =>
  bucket && (RATE_TYPES.some(t => bucket[t] != null) || (bucket.sell && Object.keys(bucket.sell).length));

/** Validity별 누적 저장 + 선택한 current/future 슬롯 동기화 (기존 구간 삭제 없음) */

function mergePolCostsUploadByValidity(polCostO, netRows, sellRows, carrier, slotPeriod, validityDraft) {
  const out = JSON.parse(JSON.stringify(polCostO || {}));
  const slot = normalizeValiditySlot(validityDraft);
  const vKey = validityStorageKey(slot);
  const period = slotPeriod === "future" ? "future" : "current";
  const label = formatValiditySlotLabel(slot) || vKey;

  Object.entries(netRows || {}).forEach(([pol, costs]) => {
    const sells = sellRows?.[pol] || {};
    const bucket = buildPolCostBucket(costs, sells);
    if (!polCostBucketHasRates(bucket)) return;

    const polEntry = { ...(out[pol] || {}) };
    const carriers = { ...(polEntry.carrier || {}) };
    const cr = { ...(carriers[carrier] || {}) };
    const byValidity = { ...(cr.byValidity || {}) };

    byValidity[vKey] = {
      slot: period,
      from: slot.from ?? "",
      till: slot.till ?? "",
      furtherNotice: !!slot.furtherNotice,
      label,
      ...bucket,
    };

    cr[period] = { ...bucket };
    cr.byValidity = byValidity;
    carriers[carrier] = cr;
    polEntry.carrier = carriers;
    out[pol] = polEntry;
  });

  return out;
}

const countCarrierValidityArchive = (polCostO, carrier) => {
  const keys = new Set();
  Object.values(polCostO || {}).forEach(pol => {
    Object.keys(pol?.carrier?.[carrier]?.byValidity || {}).forEach(k => keys.add(k));
  });
  return keys.size;
};

/** Drop off 단일 셀 — validity 구간별 누적 + current/future 동기화 */
function mergeCarrierDropRateCell(carrierDropRates, carrier, cityKey, sk, rawValue, period, validityDraft) {
  const out = JSON.parse(JSON.stringify(carrierDropRates || {}));
  const slot = normalizeValiditySlot(validityDraft);
  const vKey = validityStorageKey(slot);
  const label = formatValiditySlotLabel(slot) || vKey;
  const cr = out[carrier] || { current: {}, future: {}, byValidity: {} };
  const crCopy = JSON.parse(JSON.stringify(cr));

  const periodBucket = { ...(crCopy[period] || {}) };
  const cityBucket = { ...(periodBucket[cityKey] || {}) };
  if (rawValue === "") delete cityBucket[sk];
  else {
    const v = parseInt(rawValue, 10);
    if (!Number.isFinite(v)) return null;
    cityBucket[sk] = v;
  }
  if (Object.keys(cityBucket).length === 0) delete periodBucket[cityKey];
  else periodBucket[cityKey] = cityBucket;
  crCopy[period] = periodBucket;

  const byValidity = { ...(crCopy.byValidity || {}) };
  const archEntry = { ...(byValidity[vKey] || {}) };
  archEntry.slot = period;
  archEntry.from = slot.from ?? "";
  archEntry.till = slot.till ?? "";
  archEntry.furtherNotice = !!slot.furtherNotice;
  archEntry.label = label;
  const archCity = { ...(archEntry[cityKey] || {}) };
  if (rawValue === "") delete archCity[sk];
  else archCity[sk] = parseInt(rawValue, 10);
  if (Object.keys(archCity).length === 0) delete archEntry[cityKey];
  else archEntry[cityKey] = archCity;
  byValidity[vKey] = archEntry;
  crCopy.byValidity = byValidity;

  out[carrier] = crCopy;
  return out;
}

const countCarrierDropValidityArchive = (carrierDropRates, carrier) =>
  Object.keys(carrierDropRates?.[carrier]?.byValidity || {}).length;

const num = (v) => {
  if (v == null || v === "" || v === "-") return null;
  const s = String(v).trim().replace(/,/g, "").replace(/^\$+/, "");
  if (!s || s.toLowerCase() === "x") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
};

const cell = (rows, r, c) => {
  const row = rows[r];
  if (!row) return null;
  return row[c] ?? null;
};

const normalizePol = (raw) => String(raw).trim().replace(/\s+/g, " ").toUpperCase();

const reSkipSnk = (name) => /^(CK LINE|SC NUMBER)/i.test(name);

const polCompact = (s) => normalizePol(s).replace(/[^A-Z0-9]/g, "");

const ciPolMap = (obj) => Object.fromEntries(
  Object.entries(obj).map(([k, v]) => [normalizePol(k), v]),
);
const DY_POL_MAP_CI = ciPolMap(DY_POL_MAP);
const CK_POL_MAP_CI = ciPolMap(CK_POL_MAP);
const CK_SERVICE_POLS = new Set(Object.values(CK_POL_MAP).filter(v => typeof v === "string"));
const DY_SERVICE_POLS = new Set(Object.values(DY_POL_MAP).filter(v => typeof v === "string"));

/** Excel POL명 → 포털 POL 목록 (선사별 별칭·그룹 확장 포함) */
function resolveExcelPolList(rawName, carrier) {
  const key = normalizePol(rawName);
  if (!key || reSkipSnk(key)) return [];

  const fromMap = (mapVal) => {
    if (mapVal === null || mapVal === undefined) return [];
    if (Array.isArray(mapVal)) return mapVal.filter(p => APP_POLS.has(p));
    if (typeof mapVal === "string" && APP_POLS.has(mapVal)) return [mapVal];
    return [];
  };

  if (carrier === "SNK" && SNK_POL_EXPAND[key]) return fromMap(SNK_POL_EXPAND[key]);
  if (carrier === "DY") {
    if (DY_POL_MAP_CI[key] !== undefined) return fromMap(DY_POL_MAP_CI[key]);
    return [];
  }
  if (carrier === "CK") {
    if (CK_POL_MAP_CI[key] !== undefined) return fromMap(CK_POL_MAP_CI[key]);
    return [];
  }

  if (SNK_POL_EXPAND[key]) return fromMap(SNK_POL_EXPAND[key]);
  if (APP_POLS.has(key)) return [key];

  const compact = polCompact(key);
  if (!compact) return [];
  for (const pol of APP_POLS) {
    if (polCompact(pol) === compact) return [pol];
  }
  return [];
}

const expandSnkPol = (name) => resolveExcelPolList(name, "SNK");

const ratesFromCols = (rows, r, cols) => Object.fromEntries(
  RATE_TYPES.map((t, i) => [t, num(cell(rows, r, cols[i]))]).filter(([, v]) => v != null),
);

const readRateQuadruple = (rows, r, startCol, opts = {}) => {
  if (startCol == null || startCol < 0) return {};
  return Object.fromEntries(
    RATE_TYPES.map((t, i) => [t, num(cell(rows, r, startCol + i))]).filter(([, v]) => {
      if (v == null) return false;
      if (opts.minPositive && v <= 0) return false;
      return true;
    }),
  );
};

const readCostQuadruple = (rows, r, startCol) => readRateQuadruple(rows, r, startCol, { minPositive: true });

const is20SizeToken = (v) => {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  const u = s.toUpperCase();
  return (s === "20'" || s === "20" || u === "20'") && !u.includes("REF");
};

/** CK/DY 「업로드용」: COC·SOC 4열 × 2 (매입·매출) */
function detectDualNetSellGrid(rows) {
  let polCol = 1;
  for (let r = 0; r < Math.min(20, rows.length); r++) {
    const row = rows[r] || [];
    const upper = row.map(c => String(c ?? "").trim().toUpperCase());
    const polI = upper.findIndex(t => t === "POL" || /^POL\b/.test(t));
    if (polI >= 0) polCol = polI;
    if (upper.some(t => t.includes("DROP OFF"))) continue;

    const c20cols = upper.map((t, i) => (is20SizeToken(row[i]) ? i : -1)).filter(i => i >= 0);
    const hasRef = upper.some(t => t.includes("REF"));
    if (c20cols.length >= 4 && !hasRef) {
      return { polCol, netStart: c20cols[0], sellStart: c20cols[2], dataStart: r + 1 };
    }
  }
  return null;
};

/** POL + 4운임(×2) 그리드 — CK/DY 업로드용 */
function parsePolNetSellGrid(rows, cols, carrier) {
  const netRows = {};
  const sellRows = {};
  const skipped = [];

  for (let r = cols.dataStart; r < rows.length; r++) {
    const raw = cell(rows, r, cols.polCol);
    if (raw == null) continue;
    const name = String(raw).trim();
    if (!name || /^(remark|note|\*|-)/i.test(name)) continue;

    const portals = resolveExcelPolList(name, carrier);
    if (!portals.length) {
      skipped.push(name);
      continue;
    }

    const costs = readCostQuadruple(rows, r, cols.netStart);
    const sells = cols.sellStart != null ? readRateQuadruple(rows, r, cols.sellStart) : {};
    if (!Object.keys(costs).length && !Object.keys(sells).length) continue;

    portals.forEach(portal => {
      if (Object.keys(costs).length) netRows[portal] = costs;
      if (Object.keys(sells).length) sellRows[portal] = sells;
    });
  }
  return { netRows, sellRows, skipped, carrier };
}

/** AREA/POL + NET·SELL 4열 양식 공통 파서 */
function parseOceanNetSellRows(rows, cols, carrier) {
  const netRows = {};
  const sellRows = {};
  const skipped = [];
  let currentArea = null;

  for (let r = cols.dataStart; r < rows.length; r++) {
    const areaCell = cols.areaCol != null ? cell(rows, r, cols.areaCol) : null;
    if (areaCell != null && String(areaCell).trim()) currentArea = String(areaCell).trim();

    let polName = cell(rows, r, cols.polCol);
    if (polName != null && String(polName).trim()) {
      polName = String(polName).trim();
    } else if (currentArea && currentArea.toUpperCase() === "SINGAPORE") {
      polName = "SINGAPORE";
    } else continue;

    if (reSkipSnk(polName)) continue;

    const costs = readCostQuadruple(rows, r, cols.netStart);
    const sells = readRateQuadruple(rows, r, cols.sellStart);
    if (!Object.keys(costs).length && !Object.keys(sells).length) continue;

    const portals = resolveExcelPolList(polName, carrier);
    if (!portals.length) { skipped.push(polName); continue; }

    portals.forEach(portal => {
      if (Object.keys(costs).length) netRows[portal] = costs;
      if (Object.keys(sells).length) sellRows[portal] = sells;
    });
  }
  return { netRows, sellRows, skipped, carrier };
}

/** CK Line: COC(해상) + IMPORT SOC(해상) 열만 — DROP OFF / REF 제외 */
function detectCkColumns(rows) {
  let polCol = 1;
  let coc20Col = 2;
  let coc40Col = 3;
  let soc20Col = 13;
  let soc40Col = 14;
  let dataStart = 8;
  let socAnchorCol = -1;

  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r] || [];
    const upper = row.map(c => String(c ?? "").trim().toUpperCase());

    const polI = upper.indexOf("POL");
    if (polI >= 0) polCol = polI;

    const socI = upper.findIndex(t => /IMPORT\s*SOC/.test(t));
    if (socI >= 0) socAnchorCol = socI;

    const isSizeRow = upper.some(t => t === "20'" || t === "20");
    const hasDropLabel = upper.some(t => t.includes("DROP OFF"));
    if (!isSizeRow || hasDropLabel) continue;

    const firstC20 = upper.findIndex(t => t === "20'" || t === "20");
    if (firstC20 >= 0) {
      coc20Col = firstC20;
      coc40Col = firstC20 + 1;
      dataStart = r + 1;
    }
    if (socAnchorCol >= 0) {
      const soc20 = upper.findIndex((t, i) => i >= socAnchorCol && (t === "20'" || t === "20"));
      if (soc20 >= 0) {
        soc20Col = soc20;
        soc40Col = soc20 + 1;
      }
    }
  }

  return { polCol, coc20Col, coc40Col, soc20Col, soc40Col, dataStart };
}

function parseCkOceanRows(rows, cols) {
  const netRows = {};
  const skipped = [];

  for (let r = cols.dataStart; r < rows.length; r++) {
    const raw = cell(rows, r, cols.polCol);
    if (raw == null) continue;
    const name = String(raw).trim();
    if (!name || /^(remark|note|\*|-)/i.test(name)) continue;

    const portals = resolveExcelPolList(name, "CK");
    if (!portals.length) {
      skipped.push(name);
      continue;
    }

    const rates = Object.fromEntries(
      Object.entries({
        coc20: num(cell(rows, r, cols.coc20Col)),
        coc40: num(cell(rows, r, cols.coc40Col)),
        soc20: num(cell(rows, r, cols.soc20Col)),
        soc40: num(cell(rows, r, cols.soc40Col)),
      }).filter(([, v]) => v != null),
    );
    if (Object.keys(rates).length) {
      portals.forEach(portal => { netRows[portal] = rates; });
    }
  }

  return { netRows, skipped };
}

/** 헤더·행 스캔으로 POL + 4운임 열 자동 탐지 (선사 양식 fallback) */
function parsePolScanSheet(rows, carrier) {
  if (carrier === "CK") {
    const cols = detectCkColumns(rows);
    const { netRows, skipped } = parseCkOceanRows(rows, cols);
    return { netRows, marginRows: {}, skipped, carrier: "CK", polScan: true };
  }

  const netRows = {};
  const skipped = [];
  let polCol = -1;
  let rateCols = null;
  let dataStart = 0;

  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const headers = (rows[r] || []).map(c => String(c ?? "").trim().toUpperCase());
    const polI = headers.findIndex(h => /^(POL|PORT|ORIGIN|LOADING)$/.test(h) || /^POL\b/.test(h));
    const netI = headers.indexOf("NET");
    if (polI >= 0 && netI >= 0) {
      polCol = polI;
      rateCols = [netI, netI + 1, netI + 2, netI + 3];
      dataStart = r + 1;
      break;
    }
    const c20 = headers.findIndex(h => /COC.*20|20.*COC|^C20$/.test(h.replace(/\s/g, "")));
    if (polI >= 0 && c20 >= 0) {
      polCol = polI;
      rateCols = [c20, c20 + 1, c20 + 2, c20 + 3];
      dataStart = r + 1;
      break;
    }
  }

  const applyRates = (portals, rates, rawLabel) => {
    if (!Object.keys(rates).length) return false;
    let mapped = false;
    portals.forEach(pol => {
      mapped = true;
      netRows[pol] = { ...(netRows[pol] || {}), ...rates };
    });
    if (!mapped && rawLabel) skipped.push(rawLabel);
    return mapped;
  };

  if (polCol >= 0 && rateCols) {
    for (let r = dataStart; r < rows.length; r++) {
      const raw = cell(rows, r, polCol);
      if (raw == null || !String(raw).trim()) continue;
      const name = String(raw).trim();
      if (/^(remark|note|area|\*|-)/i.test(name)) continue;
      const rates = ratesFromCols(rows, r, rateCols);
      const portals = resolveExcelPolList(name, carrier);
      if (!portals.length) { skipped.push(name); continue; }
      applyRates(portals, rates, name);
    }
  } else {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < Math.min(row.length, 10); c++) {
        const raw = cell(rows, r, c);
        if (raw == null || !String(raw).trim()) continue;
        const portals = resolveExcelPolList(raw, carrier);
        if (!portals.length) continue;
        const nums = [];
        for (let cc = c + 1; cc < row.length && nums.length < 4; cc++) {
          const v = num(cell(rows, r, cc));
          if (v != null) nums.push(v);
        }
        if (!nums.length) continue;
        const rates = {};
        RATE_TYPES.forEach((t, i) => { if (nums[i] != null) rates[t] = nums[i]; });
        applyRates(portals, rates, String(raw).trim());
        break;
      }
    }
  }

  return { netRows, marginRows: {}, skipped, carrier, polScan: true, sellRows: {} };
}

async function readExcelFile(file) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellFormula: false, raw: true });
  const sheets = {};
  wb.SheetNames.forEach(name => {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
  });
  return { sheetNames: wb.SheetNames, sheets, fileName: file.name };
}

function inferSnkSellStart(rows, dataStart, netStart) {
  for (let sr = dataStart - 2; sr <= dataStart - 1 && sr >= 0; sr++) {
    const c20s = (rows[sr] || []).map((c, i) => (is20SizeToken(c) ? i : -1)).filter(i => i >= 0);
    if (c20s.length >= 4) return c20s[2];
    if (c20s.length >= 2) return c20s[1];
  }
  return netStart != null ? netStart + 5 : undefined;
}

function detectSnkColumns(rows) {
  const pickDataStart = (headerRow, netI) => {
    const nextRow = cell(rows, headerRow + 1, netI);
    const tag = String(nextRow ?? "").trim().toUpperCase();
    return nextRow == null || tag === "COC" || tag === "FILO / COC" ? headerRow + 4 : headerRow + 3;
  };

  const findAreaPolRow = (fromRow, toRow) => {
    for (let r2 = fromRow; r2 < toRow; r2++) {
      const h = (rows[r2] || []).map(c => String(c ?? "").trim().toUpperCase());
      const areaI = h.indexOf("AREA");
      const polI = h.findIndex(t => t === "POL" || /^POL\b/.test(t));
      if (areaI >= 0 && polI >= 0) {
        let dataStart = r2 + 1;
        const sizeRow = rows[r2 + 1] || [];
        const hasSizes = sizeRow.some(c => {
          const t = String(c ?? "").trim();
          return t === "20'" || t === "20" || t === "40'" || t === "40";
        });
        if (hasSizes) dataStart = r2 + 2;
        return { areaCol: areaI, polCol: polI, dataStart };
      }
    }
    return null;
  };

  for (let r = 0; r < 7; r++) {
    const vals = [];
    for (let c = 0; c < 22; c++) vals.push(String(cell(rows, r, c) ?? "").trim().toUpperCase());
    if (vals.includes("NET") && vals.includes("SELL") && vals.includes("PROFIT")) {
      const netI = vals.indexOf("NET");
      const sellI = vals.indexOf("SELL");
      const ap = findAreaPolRow(r + 1, Math.min(r + 5, rows.length));
      return {
        dataStart: ap?.dataStart ?? pickDataStart(r, netI),
        areaCol: ap?.areaCol ?? 0,
        polCol: ap?.polCol ?? 1,
        netStart: netI,
        sellStart: sellI,
      };
    }
  }

  for (let r = 0; r < 10; r++) {
    const rawVals = [];
    for (let c = 0; c < 22; c++) rawVals.push(String(cell(rows, r, c) ?? "").trim());
    const vals = rawVals.map(v => v.toUpperCase());
    if (!vals.includes("NET") || vals.includes("PROFIT")) continue;
    if (vals.includes("SELL") && vals.includes("PROFIT")) continue;
    const netI = vals.indexOf("NET");
    const sellI = vals.indexOf("SELL");
    const sellK = rawVals.findIndex(v => /매출|SELL/i.test(v));
    let sellStart = sellI >= 0 ? sellI : (sellK >= 0 ? sellK : undefined);
    const ap = findAreaPolRow(r + 1, Math.min(r + 5, rows.length));
    if (ap) {
      if (sellStart == null) sellStart = inferSnkSellStart(rows, ap.dataStart, netI);
      return { ...ap, netStart: netI, sellStart };
    }
  }

  for (let r = 0; r < 7; r++) {
    const vals = [];
    for (let c = 0; c < 22; c++) vals.push(String(cell(rows, r, c) ?? "").trim().toUpperCase());
    if (vals.includes("NET") && vals.includes("SELL") && vals.includes("PROFIT")) {
      const netI = vals.indexOf("NET");
      const sellI = vals.indexOf("SELL");
      return { dataStart: 6, areaCol: 1, polCol: 2, netStart: netI, sellStart: sellI };
    }
  }

  throw new Error("NET 헤더를 찾을 수 없습니다 · 「Vladivostok 06.01 (업로드용)」 시트를 선택하세요");
}

const isSnkLegacyTransitSheet = (rows) => {
  for (let r = 0; r < Math.min(20, rows.length); r++) {
    const row = rows[r] || [];
    if (row.some(c => /L\.AREA|POL\s*NAME|POR\s*NAME/i.test(String(c ?? "").replace(/\n/g, " ")))) {
      return true;
    }
  }
  return false;
};

function parseSnkSheet(rows) {
  try {
    const dual = detectDualNetSellGrid(rows);
    if (dual) {
      const dualParsed = parsePolNetSellGrid(rows, dual, "SNK");
      if (Object.keys(dualParsed.netRows).length || Object.keys(dualParsed.sellRows).length) {
        return { ...dualParsed, marginRows: {} };
      }
    }
    const cols = detectSnkColumns(rows);
    const parsed = parseOceanNetSellRows(rows, cols, "SNK");
    if (Object.keys(parsed.netRows).length || Object.keys(parsed.sellRows).length) {
      return { ...parsed, marginRows: {} };
    }
  } catch (e) {
    if (isSnkLegacyTransitSheet(rows)) {
      throw new Error("구형 Vladivostok/TO RUSSIA 양식입니다 · 「Vladivostok 06.01 (업로드용)」 시트를 선택하세요");
    }
    if (e?.message && !/POL 스캔/.test(e.message)) throw e;
  }
  if (isSnkLegacyTransitSheet(rows)) {
    throw new Error("구형 Vladivostok/TO RUSSIA 양식입니다 · 「Vladivostok 06.01 (업로드용)」 시트를 선택하세요");
  }
  return parsePolScanSheet(rows, "SNK");
}

function mapDyPol(raw) {
  const list = resolveExcelPolList(raw, "DY");
  return list[0] || null;
}

function parseDySheet(rows) {
  const dual = detectDualNetSellGrid(rows);
  if (dual) {
    const { netRows, sellRows, skipped } = parsePolNetSellGrid(rows, dual, "DY");
    return { oceanRows: netRows, sellRows, dropRows: {}, skipped, carrier: "DY" };
  }

  const DATA_START = 6;
  const POL_COL = 1;
  const oceanRows = {};
  const dropRows = {};
  const skipped = [];

  for (let r = DATA_START; r < rows.length; r++) {
    const raw = cell(rows, r, POL_COL);
    if (raw == null) continue;
    const name = String(raw).trim();
    if (!name || /^(remark|note|\*|-)/i.test(name)) continue;

    const portal = mapDyPol(name);
    if (portal == null) {
      skipped.push(name);
      continue;
    }

    const rates = Object.fromEntries(
      Object.entries({
        coc20: num(cell(rows, r, 2)),
        coc40: num(cell(rows, r, 3)),
        soc20: num(cell(rows, r, 6)),
        soc40: num(cell(rows, r, 7)),
      }).filter(([, v]) => v != null),
    );
    if (Object.keys(rates).length) oceanRows[portal] = rates;

    const drop = {};
    const mow = Object.fromEntries(
      Object.entries({ c20: num(cell(rows, r, 11)), c40: num(cell(rows, r, 12)) }).filter(([, v]) => v != null),
    );
    const nsb = Object.fromEntries(
      Object.entries({ c20: num(cell(rows, r, 14)), c40: num(cell(rows, r, 15)) }).filter(([, v]) => v != null),
    );
    if (Object.keys(mow).length) drop.mow = mow;
    if (Object.keys(nsb).length) drop.nsb = nsb;
    if (Object.keys(drop).length) dropRows[portal] = drop;
  }
  if (Object.keys(oceanRows).length) {
    return { oceanRows, dropRows, skipped, carrier: "DY", sellRows: {} };
  }
  const scanned = parsePolScanSheet(rows, "DY");
  return { oceanRows: scanned.netRows, dropRows: {}, skipped: scanned.skipped, carrier: "DY", polScan: true, sellRows: {} };
}

function parseCkSheet(rows) {
  const dual = detectDualNetSellGrid(rows);
  if (dual) {
    const parsed = parsePolNetSellGrid(rows, dual, "CK");
    return { ...parsed, marginRows: {} };
  }

  let cols = detectCkColumns(rows);
  let { netRows, skipped } = parseCkOceanRows(rows, cols);

  if (!Object.keys(netRows).length && cols.polCol !== 0) {
    cols = { ...cols, polCol: 0 };
    ({ netRows, skipped } = parseCkOceanRows(rows, cols));
  }

  return { netRows, marginRows: {}, skipped, carrier: "CK", sellRows: {} };
}

function parseYslCarrierSheet(rows, carrier) {
  try {
    const cols = detectSnkColumns(rows);
    const parsed = parseOceanNetSellRows(rows, cols, carrier);
    if (Object.keys(parsed.netRows).length || Object.keys(parsed.sellRows).length) {
      return { ...parsed, marginRows: {} };
    }
  } catch {
    /* fallback below */
  }

  const netRows = {};
  const sellRows = {};
  const skipped = [];
  const DATA_START = 10;

  for (let r = DATA_START; r < rows.length; r++) {
    const pol = cell(rows, r, 1);
    if (pol == null || !String(pol).trim()) continue;
    const portals = resolveExcelPolList(pol, carrier);
    if (!portals.length) {
      skipped.push(String(pol));
      continue;
    }
    const costs = readCostQuadruple(rows, r, 2);
    const sells = readRateQuadruple(rows, r, 6);
    if (!Object.keys(costs).length && !Object.keys(sells).length) continue;
    portals.forEach(portal => {
      if (Object.keys(costs).length) netRows[portal] = costs;
      if (Object.keys(sells).length) sellRows[portal] = sells;
    });
  }
  if (Object.keys(netRows).length || Object.keys(sellRows).length) {
    return { netRows, sellRows, marginRows: {}, skipped, carrier };
  }
  return parsePolScanSheet(rows, carrier);
}

function detectRentalUploadGrid(rows) {
  if (!rows?.length) return null;
  for (let r = 0; r < Math.min(6, rows.length); r++) {
    const sub = (rows[r] || []).map(c => String(c ?? "").trim());
    const dvIdx = sub.findIndex(c => /40['']?\s*DV/i.test(c));
    if (dvIdx < 0) continue;
    const cityRowIdx = r > 0 ? r - 1 : 0;
    const cityNames = rows[cityRowIdx] || [];
    const cities = [];
    const firstCityCol = dvIdx - 1; // 40'DV 바로 앞 col = 첫 도시의 20' col
    for (let c = firstCityCol; c < sub.length; c += 3) {
      const cityRaw = cityNames[c];
      if (!cityRaw) continue;
      const city = normalizeRentalCityName(cityRaw);
      if (city) cities.push({ col: c, city });
    }
    if (!cities.length) return null;
    return { cityRowIdx, sizeRowIdx: r, dataStart: r + 1, cities };
  }
  return null;
}

function parseRentalLegacySheet(rows) {
  const bases = {};
  const skipped = [];
  for (let r = 1; r < rows.length; r++) {
    const raw = cell(rows, r, 1);
    if (raw == null) continue;
    const key = normalizePol(raw);
    const rentalPol = RENTAL_EXCEL_TO_POL[key];
    if (!rentalPol) {
      skipped.push(String(raw).trim());
      continue;
    }
    const c20 = num(cell(rows, r, 2));
    const c40dv = num(cell(rows, r, 3)) ?? num(cell(rows, r, 4));
    const c40hc = num(cell(rows, r, 4));
    if (c20 == null && c40dv == null && c40hc == null) {
      skipped.push(`${raw} (no rates)`);
      continue;
    }
    bases[rentalPol] = { c20, c40dv, c40hc: c40hc ?? c40dv };
  }
  return { bases, skipped, carrier: "RENTAL" };
}

function parseRentalSheet(rows) {
  const grid = detectRentalUploadGrid(rows);
  if (grid) {
    const cityRates = {};
    const skipped = [];
    for (let r = grid.dataStart; r < rows.length; r++) {
      const rawPol = cell(rows, r, 1);
      if (rawPol == null || String(rawPol).trim() === "") continue;
      const key = normalizePol(rawPol);
      const rentalPol = RENTAL_EXCEL_TO_POL[key];
      if (!rentalPol) {
        skipped.push(String(rawPol).trim());
        continue;
      }
      const cities = {};
      grid.cities.forEach(({ col, city }) => {
        const c20 = num(cell(rows, r, col));
        const c40dv = num(cell(rows, r, col + 1));
        const c40hc = num(cell(rows, r, col + 2));
        if (c20 == null && c40dv == null && c40hc == null) return;
        cities[city] = { c20, c40dv, c40hc };
      });
      if (!Object.keys(cities).length) {
        skipped.push(`${rawPol} (no city rates)`);
        continue;
      }
      cityRates[rentalPol] = cities;
    }
    return { format: "RENTAL", cityRates, skipped, carrier: "RENTAL" };
  }
  return { format: "RENTAL", ...parseRentalLegacySheet(rows) };
}

function parseByFormat(format, rows, options = {}) {
  if (format === "SNK") return { format: "SNK", ...parseSnkSheet(rows) };
  if (format === "DY") return { format: "DY", ...parseDySheet(rows) };
  if (format === "CK") return { format: "CK", ...parseCkSheet(rows) };
  if (format === "RENTAL") return { format: "RENTAL", ...parseRentalSheet(rows) };
  if (format === "YSL") {
    const carrier = options.carrier || "SNK";
    return { format: "YSL", ...parseYslCarrierSheet(rows, carrier) };
  }
  throw new Error(`Unknown format: ${format}`);
}

function suggestSheet(format, sheetNames) {
  if (!sheetNames?.length) return "";
  if (format === "DY") {
    const upload = sheetNames.find(s => /업로드용|\(upload\)/i.test(s) && /import/i.test(s));
    if (upload) return upload;
    const hit = sheetNames.find(s => /^Import$/i.test(s));
    if (hit) return hit;
  }
  if (format === "CK") {
    const upload = sheetNames.find(s => /업로드용|\(upload\)/i.test(s));
    if (upload) return upload;
  }
  if (format === "SNK") {
    const upload = sheetNames.find(s => /업로드용|\(upload\)/i.test(s) && /Vladivostok|06\.01|6\.01/i.test(s));
    if (upload) return upload;
    const uploadAny = sheetNames.find(s => /업로드용|\(upload\)/i.test(s));
    if (uploadAny) return uploadAny;
    const dated = sheetNames.find(s => /Vladivostok/i.test(s) && /06\.01|6\.01/.test(s) && !/업로드|\(upload\)/i.test(s));
    if (dated) return dated;
    const vladDated = sheetNames.find(s => /^Vladivostok\s+\d/i.test(s));
    if (vladDated) return vladDated;
  }
  if (format === "YSL") {
    const cr = format === "YSL" ? null : format;
    return sheetNames.find(s => /^(SNK|DY|CK)$/i.test(s)) || sheetNames[0];
  }
  if (format === "RENTAL") {
    const upload = sheetNames.find(s => /업로드용|\(upload\)/i.test(s) && /rental|렌탈|컨테이너/i.test(s));
    if (upload) return upload;
    const uploadAny = sheetNames.find(s => /업로드용|\(upload\)/i.test(s));
    if (uploadAny) return uploadAny;
    return sheetNames.find(s => /^Sheet1$/i.test(s)) || sheetNames[0];
  }
  return sheetNames[0];
}

function suggestYslSheet(carrier, period, sheetNames) {
  const base = carrier;
  const future = `${carrier}_향후`;
  const names = sheetNames || [];
  if (period === "future") {
    return names.find(s => s === future || s.includes("향후") && s.toUpperCase().includes(carrier)) || names.find(s => s.toUpperCase() === carrier) || names[0];
  }
  return names.find(s => s.toUpperCase() === base) || names[0];
}

function mergePolCostsCarrier(polCostO, netRows, carrier, period) {
  const out = { ...(polCostO || {}) };
  Object.entries(netRows).forEach(([pol, rates]) => {
    const polEntry = { ...(out[pol] || {}) };
    const carriers = { ...(polEntry.carrier || {}) };
    const cr = { ...(carriers[carrier] || {}) };
    const bucket = { ...(cr[period] || {}), ...rates };
    cr[period] = bucket;
    carriers[carrier] = cr;
    polEntry.carrier = carriers;
    out[pol] = polEntry;
  });
  return out;
}

/** 선사·기간 버킷 전체 제거 (재업로드 시 이전 POL/요율 누적 방지) */
function clearPolCostsCarrierPeriod(polCostO, carrier, period) {
  const out = JSON.parse(JSON.stringify(polCostO || {}));
  Object.entries(out).forEach(([pol, polEntry]) => {
    const carriers = polEntry?.carrier;
    if (!carriers?.[carrier]?.[period]) return;
    const cr = { ...carriers[carrier] };
    delete cr[period];
    if (!carrierBucketHasData(cr)) delete carriers[carrier];
    else carriers[carrier] = cr;
    if (!Object.keys(carriers).length) delete polEntry.carrier;
    if (!Object.keys(polEntry).length) delete out[pol];
  });
  return out;
}

function replacePolCostsCarrier(polCostO, netRows, carrier, period) {
  return mergePolCostsCarrier(clearPolCostsCarrierPeriod(polCostO, carrier, period), netRows, carrier, period);
}

function replacePolCostsWithSells(polCostO, netRows, sellRows, carrier, period) {
  return mergePolCostsWithSells(
    clearPolCostsCarrierPeriod(polCostO, carrier, period),
    netRows,
    sellRows || {},
    carrier,
    period,
  );
}

/** FR 운임표 기준 — 해당 POL·선사·타입에 기본 운임이 있는지 */
const freightTemplateServesRate = (fData, carrier, pol, rateType) => {
  const row = (fData || []).find(d => d.pol === pol);
  if (!row) return false;
  return row.rates?.[carrier]?.[rateType] != null;
};

/**
 * Excel 업로드·pol_costs 서비스 판정
 * - SNK: 일본 전항 + FR 운임표
 * - CK: CK Line 양식 POL 맵에 있는 POL만 (NANJING·YANGZHOU 등 제외)
 * - DY: 동영 POL 맵 + FR 타입별
 */
const carrierUploadServesRate = (fData, carrier, pol, rateType) => {
  if (carrier === "SNK" && JAPAN_POL_SET.has(pol)) return true;
  if (carrier === "CK") return CK_SERVICE_POLS.has(pol);
  if (carrier === "DY") {
    if (!DY_SERVICE_POLS.has(pol)) return false;
    return freightTemplateServesRate(fData, carrier, pol, rateType);
  }
  return freightTemplateServesRate(fData, carrier, pol, rateType);
};

/** Excel 업로드 NET/SELL — 포털에 서비스 없는 POL·타입 제외 */
function filterOceanUploadByFreightService(fData, carrier, netRows, sellRows = {}) {
  const filteredNet = {};
  const filteredSell = {};
  const skippedService = [];
  const pols = new Set([...Object.keys(netRows || {}), ...Object.keys(sellRows || {})]);

  pols.forEach(pol => {
    const costs = netRows?.[pol] || {};
    const sells = sellRows?.[pol] || {};
    const nextCosts = {};
    const nextSells = {};

    RATE_TYPES.forEach(t => {
      const hasCost = costs[t] != null;
      const hasSell = sells[t] != null;
      if (!hasCost && !hasSell) return;
      if (carrierUploadServesRate(fData, carrier, pol, t)) {
        if (hasCost) nextCosts[t] = costs[t];
        if (hasSell) nextSells[t] = sells[t];
      } else {
        skippedService.push({ pol, rateType: t, cost: costs[t] ?? null, sell: sells[t] ?? null });
      }
    });

    if (Object.keys(nextCosts).length) filteredNet[pol] = nextCosts;
    if (Object.keys(nextSells).length) filteredSell[pol] = nextSells;
  });

  return { netRows: filteredNet, sellRows: filteredSell, skippedService };
}

function applyFreightServiceFilterToUpload(parsed, fData) {
  if (!parsed || parsed.format === "RENTAL") return { parsed, skippedService: [] };

  const carrier = parsed.format === "DY"
    ? "DY"
    : parsed.format === "YSL"
      ? parsed.carrier
      : (parsed.carrier || parsed.format);
  const netKey = parsed.format === "DY" ? "oceanRows" : "netRows";
  const srcNet = parsed[netKey] || parsed.netRows || {};
  const { netRows, sellRows, skippedService } = filterOceanUploadByFreightService(
    fData, carrier, srcNet, parsed.sellRows || {},
  );

  const next = { ...parsed, sellRows, skippedService };
  if (parsed.format === "DY") next.oceanRows = netRows;
  else next.netRows = netRows;
  return { parsed: next, skippedService };
}

/** pol_costs — FR에 서비스 없는 POL·선사·타입 매입·매출 제거 */
function stripPolCostsOutsideFreightService(polCostO, fData) {
  const out = JSON.parse(JSON.stringify(polCostO || {}));
  let cleared = 0;

  Object.entries(out).forEach(([pol, polEntry]) => {
    const carriers = polEntry?.carrier;
    if (!carriers) return;

    Object.entries(carriers).forEach(([carrier, cr]) => {
      if (!CRS.includes(carrier)) return;

      ["current", "future"].forEach(period => {
        const bucket = cr[period];
        if (!bucket) return;

        RATE_TYPES.forEach(t => {
          if (carrierUploadServesRate(fData, carrier, pol, t)) return;
          if (bucket[t] != null) {
            delete bucket[t];
            cleared++;
          }
          if (bucket.sell?.[t] != null) {
            const sell = { ...bucket.sell };
            delete sell[t];
            if (Object.keys(sell).length) bucket.sell = sell;
            else delete bucket.sell;
            cleared++;
          }
        });

        const bucketLive = RATE_TYPES.some(rt => bucket[rt] != null)
          || (bucket.sell && Object.values(bucket.sell).some(v => v != null));
        if (bucketLive) cr[period] = bucket;
        else delete cr[period];
      });

      if (carrierBucketHasData(cr)) polEntry.carrier[carrier] = cr;
      else {
        delete polEntry.carrier[carrier];
        if (!Object.keys(polEntry.carrier).length) delete polEntry.carrier;
      }
    });

    if (!polEntry.carrier || !Object.keys(polEntry.carrier).length) delete out[pol];
  });

  return { polCostO: out, cleared };
}

const carrierBucketHasData = (cr) => {
  if (!cr || typeof cr !== "object") return false;
  if (["current", "future"].some(p => {
    const b = cr[p];
    return b && (RATE_TYPES.some(t => b[t] != null) || (b.sell && Object.keys(b.sell).length));
  })) return true;
  if (cr.byValidity && typeof cr.byValidity === "object") {
    return Object.values(cr.byValidity).some(v => polCostBucketHasRates(v));
  }
  return RATE_TYPES.some(t => cr[t] != null);
};

const countCarrierPeriodPols = (polCostO, carrier, period) =>
  Object.keys(polCostO || {}).filter(pol => {
    const b = polCostO[pol]?.carrier?.[carrier]?.[period];
    return b && RATE_TYPES.some(t => b[t] != null);
  }).length;

const countCarrierDropCities = (carrierDropRates, carrier, period) => {
  const bucket = carrierDropRates?.[carrier]?.[period];
  if (!bucket) return 0;
  return Object.keys(bucket).filter(city => bucket[city]?.c20 != null || bucket[city]?.c40 != null).length;
};

const countRentalPeriodPols = (rentalRates, period) =>
  Object.keys(rentalRates || {}).filter(pol => {
    const bucket = rentalRates[pol]?.[period];
    return bucket && Object.values(bucket).some(v => {
      const b = normalizeRentalCityBucket(v);
      return b.c20 != null || b.c40dv != null || b.c40hc != null || b.c40 != null;
    });
  }).length;

function clearPolCostsCarrier(polCostO, carrier, period) {
  const out = JSON.parse(JSON.stringify(polCostO || {}));
  const clearedPols = [];
  Object.entries(out).forEach(([pol, polEntry]) => {
    const carriers = polEntry?.carrier;
    const bucket = carriers?.[carrier]?.[period];
    if (!bucket || !RATE_TYPES.some(t => bucket[t] != null)) return;
    clearedPols.push(pol);
    const cr = { ...carriers[carrier] };
    delete cr[period];
    if (!carrierBucketHasData(cr)) delete carriers[carrier];
    else carriers[carrier] = cr;
    if (!Object.keys(carriers).length) delete polEntry.carrier;
    if (!Object.keys(polEntry).length) delete out[pol];
  });
  return { polCostO: out, clearedPols };
}

/** Rate History 선택 행 → pol_costs 개별 셀(매입·매출) 제거 */
function clearPolCostRateCells(polCostO, entries) {
  const out = JSON.parse(JSON.stringify(polCostO || {}));
  let cleared = 0;
  entries.forEach(({ carrier, pol, period, rate_type: t }) => {
    const polEntry = out[pol];
    const bucket = polEntry?.carrier?.[carrier]?.[period];
    if (!bucket) return;
    const hasCost = bucket[t] != null;
    const hasSell = bucket.sell?.[t] != null;
    if (!hasCost && !hasSell) return;

    const cr = { ...polEntry.carrier[carrier] };
    const nextBucket = { ...bucket };
    delete nextBucket[t];
    if (nextBucket.sell) {
      const sell = { ...nextBucket.sell };
      delete sell[t];
      if (Object.keys(sell).length) nextBucket.sell = sell;
      else delete nextBucket.sell;
    }
    cleared++;

    const bucketLive = RATE_TYPES.some(rt => nextBucket[rt] != null)
      || (nextBucket.sell && Object.values(nextBucket.sell).some(v => v != null));
    if (bucketLive) cr[period] = nextBucket;
    else delete cr[period];

    if (carrierBucketHasData(cr)) {
      polEntry.carrier = { ...polEntry.carrier, [carrier]: cr };
    } else {
      const carriers = { ...polEntry.carrier };
      delete carriers[carrier];
      if (Object.keys(carriers).length) polEntry.carrier = carriers;
      else delete out[pol];
    }
  });
  return { polCostO: out, cleared };
}

const dropCityKeyFromRhLabel = (label) => {
  const hit = Object.entries(DOC_RC).find(([, v]) => v === label);
  if (hit) return hit[0];
  const hit2 = Object.entries(DROP_CITY_LABELS).find(([, v]) => v === label);
  return hit2?.[0] || label;
};

function clearCarrierDropRateCells(carrierDropRates, entries) {
  const out = JSON.parse(JSON.stringify(carrierDropRates || {}));
  let cleared = 0;
  entries.forEach(({ carrier, period, cityLabel, rate_type }) => {
    const sk = rate_type === "drop40" ? "c40" : "c20";
    const cityKey = dropCityKeyFromRhLabel(cityLabel);
    const city = out[carrier]?.[period]?.[cityKey];
    if (!city || city[sk] == null) return;
    if (!out[carrier]) out[carrier] = { current: {}, future: {} };
    if (!out[carrier][period]) out[carrier][period] = {};
    const nextCity = { ...city };
    delete nextCity[sk];
    if (nextCity.c20 == null && nextCity.c40 == null) delete out[carrier][period][cityKey];
    else out[carrier][period][cityKey] = nextCity;
    cleared++;
  });
  return { carrierDropRates: out, cleared };
}

function clearRentalRateCells(rentalRates, entries, rData) {
  const out = JSON.parse(JSON.stringify(rentalRates || {}));
  let cleared = 0;
  const rentalSkFromType = (rate_type) => {
    if (rate_type === "r20") return "c20";
    if (rate_type === "r40hc") return "c40hc";
    return "c40dv";
  };
  entries.forEach(({ pol, route, rate_type, period }) => {
    const sk = rentalSkFromType(rate_type);
    const city = (route && route.includes(" > ")) ? route.split(" > ").slice(1).join(" > ").trim() : "";
    if (!city) return;
    const rentalPol = rData.find(r => (PM[r.pol] || r.pol.toUpperCase()) === pol)?.pol || pol;
    const bucket = out[rentalPol]?.[period]?.[city];
    if (!bucket || bucket[sk] == null) return;
    if (!out[rentalPol]) out[rentalPol] = { current: {}, future: {} };
    if (!out[rentalPol][period]) out[rentalPol][period] = {};
    const next = normalizeRentalCityBucket({ ...bucket });
    delete next[sk];
    if (next.c20 == null && next.c40dv == null && next.c40hc == null && next.c40 == null) {
      delete out[rentalPol][period][city];
    } else {
      out[rentalPol][period][city] = next;
    }
    cleared++;
  });
  return { rentalRates: out, cleared };
}

function applyRateHistoryDeletesToStores(selectedRows, stores, rData) {
  const oceanEntries = [];
  const dropEntries = [];
  const rentalEntries = [];

  selectedRows.forEach(row => {
    if (row.category === "ocean" && RATE_TYPES.includes(row.rate_type)) {
      oceanEntries.push({
        carrier: row.carrier, pol: row.pol, period: row.period, rate_type: row.rate_type,
      });
    } else if (row.category === "dropoff") {
      dropEntries.push({
        carrier: row.carrier, period: row.period, cityLabel: row.pol, rate_type: row.rate_type,
      });
    } else if (row.category === "rental") {
      rentalEntries.push({
        pol: row.pol, route: row.route, rate_type: row.rate_type, period: row.period,
      });
    }
  });

  let polCostO = stores.polCostO;
  let carrierDropRates = stores.carrierDropRates;
  let rentalRates = stores.rentalRates;
  let polCostsChanged = false;
  let dropChanged = false;
  let rentalChanged = false;
  let dbCleared = 0;

  if (oceanEntries.length) {
    const r = clearPolCostRateCells(polCostO, oceanEntries);
    polCostO = r.polCostO;
    polCostsChanged = r.cleared > 0;
    dbCleared += r.cleared;
  }
  if (dropEntries.length) {
    const r = clearCarrierDropRateCells(carrierDropRates, dropEntries);
    carrierDropRates = r.carrierDropRates;
    dropChanged = r.cleared > 0;
    dbCleared += r.cleared;
  }
  if (rentalEntries.length) {
    const r = clearRentalRateCells(rentalRates, rentalEntries, rData);
    rentalRates = r.rentalRates;
    rentalChanged = r.cleared > 0;
    dbCleared += r.cleared;
  }

  return { polCostO, carrierDropRates, rentalRates, polCostsChanged, dropChanged, rentalChanged, dbCleared };
}

function clearCarrierDropPeriod(carrierDropRates, carrier, period) {
  const out = JSON.parse(JSON.stringify(carrierDropRates || {}));
  const bucket = out[carrier]?.[period];
  const had = bucket && Object.keys(bucket).some(city => bucket[city]?.c20 != null || bucket[city]?.c40 != null);
  if (had) {
    if (!out[carrier]) out[carrier] = { current: {}, future: {} };
    out[carrier][period] = {};
  }
  return { carrierDropRates: out, cleared: !!had };
}

function clearRentalPeriodRates(rentalRates, period) {
  const out = JSON.parse(JSON.stringify(rentalRates || {}));
  const clearedPols = [];
  Object.keys(out).forEach(pol => {
    const bucket = out[pol]?.[period];
    if (!bucket || !Object.values(bucket).some(v => {
      const b = normalizeRentalCityBucket(v);
      return b.c20 != null || b.c40dv != null || b.c40hc != null || b.c40 != null;
    })) return;
    clearedPols.push(pol);
    out[pol] = { ...out[pol], [period]: {} };
  });
  return { rentalRates: out, clearedPols };
}

function mergePolCostsWithSells(polCostO, netRows, sellRows, carrier, period) {
  let out = mergePolCostsCarrier(polCostO, netRows, carrier, period);
  Object.entries(sellRows || {}).forEach(([pol, sells]) => {
    const polEntry = { ...(out[pol] || {}) };
    const carriers = { ...(polEntry.carrier || {}) };
    const cr = { ...(carriers[carrier] || {}) };
    const bucket = { ...(cr[period] || {}), sell: { ...(cr[period]?.sell || {}), ...sells } };
    cr[period] = bucket;
    carriers[carrier] = cr;
    polEntry.carrier = carriers;
    out[pol] = polEntry;
  });
  return out;
}

/** SNK 일본 — SHIMIZU 등 매출 있는 항의 마진(기본 20'+120 / 40'+200) */
const SNK_JAPAN_DEFAULT_MARGIN = { coc20: 120, coc40: 200, soc20: 120, soc40: 200 };

function snkJapanReferenceMargins(polCostO, period) {
  const margin = {};
  JAPAN_PORTS.forEach(pol => {
    const bucket = polCostO?.[pol]?.carrier?.SNK?.[period];
    if (!bucket?.sell) return;
    RATE_TYPES.forEach(t => {
      if (bucket[t] != null && bucket[t] > 0 && bucket.sell[t] != null) {
        margin[t] = bucket.sell[t] - bucket[t];
      }
    });
  });
  RATE_TYPES.forEach(t => {
    if (margin[t] == null && SNK_JAPAN_DEFAULT_MARGIN[t] != null) {
      margin[t] = SNK_JAPAN_DEFAULT_MARGIN[t];
    }
  });
  return margin;
}

function applySnkJapanSellBackfill(polCostO) {
  const out = JSON.parse(JSON.stringify(polCostO || {}));
  let filled = 0;
  ["current", "future"].forEach(period => {
    const refMargin = snkJapanReferenceMargins(out, period);
    JAPAN_PORTS.forEach(pol => {
      const cr = out[pol]?.carrier?.SNK;
      const bucket = cr?.[period];
      if (!bucket) return;
      if (!bucket.sell) bucket.sell = {};
      RATE_TYPES.forEach(t => {
        if (bucket[t] == null || bucket[t] <= 0 || bucket.sell[t] != null) return;
        const m = refMargin[t];
        if (m == null) return;
        bucket.sell[t] = bucket[t] + m;
        filled++;
      });
      if (!Object.keys(bucket.sell).length) delete bucket.sell;
    });
  });
  return { polCostO: out, filled };
}

/** 매입만 있고 매출 없는 셀 보완 — 향후←현재 복사, 동일 POL 마진·전역 마진·SNK 일본 마진 적용 */
function backfillPolCostSells(polCostO, { polM, polMFuture, margins } = {}) {
  const out = JSON.parse(JSON.stringify(polCostO || {}));
  let filled = 0;

  const polMargin = (pol, t, period) => {
    const store = period === "future" ? polMFuture : polM;
    const val = store?.[pol]?.[t];
    return val != null && val !== "" ? marginNum(val) : null;
  };
  const globalMargin = (t) => marginNum(margins?.[t]);

  Object.entries(out).forEach(([pol, polEntry]) => {
    Object.entries(polEntry.carrier || {}).forEach(([carrier, cr]) => {
      ["current", "future"].forEach(period => {
        const bucket = cr[period];
        if (!bucket) return;

        const inferred = {};
        RATE_TYPES.forEach(t => {
          if (bucket.sell?.[t] != null && bucket[t] != null) inferred[t] = bucket.sell[t] - bucket[t];
        });
        const siblingMargin = RATE_TYPES.map(t => inferred[t]).find(m => m != null);

        if (!bucket.sell) bucket.sell = {};

        RATE_TYPES.forEach(t => {
          if (bucket[t] == null || bucket.sell[t] != null) return;

          if (period === "future") {
            const fromCur = cr.current?.sell?.[t];
            if (fromCur != null) {
              bucket.sell[t] = fromCur;
              filled++;
              return;
            }
          }

          const m = inferred[t]
            ?? siblingMargin
            ?? polMargin(pol, t, period)
            ?? polMargin(pol, "coc20", period)
            ?? globalMargin(t)
            ?? globalMargin("coc20");

          if (m != null) {
            bucket.sell[t] = bucket[t] + m;
            filled++;
          }
        });

        if (!Object.keys(bucket.sell).length) delete bucket.sell;
      });
    });
  });

  const japan = applySnkJapanSellBackfill(out);
  filled += japan.filled;
  return { polCostO: japan.polCostO, filled };
}

function mergePolMarginsMap(polM, marginRows) {
  const out = { ...(polM || {}) };
  Object.entries(marginRows || {}).forEach(([pol, margins]) => {
    out[pol] = { ...(out[pol] || {}), ...margins };
  });
  return out;
}

function buildDyDropRates(existingJson, oceanRows, dropRows, period, carrier = "DY", refPol = "BUSAN") {
  let out = existingJson ? JSON.parse(existingJson) : {};
  if (!out[carrier]) out[carrier] = { current: {}, future: {} };
  out[carrier][period] = {};

  const pol = dropRows[refPol] ? refPol : Object.keys(dropRows)[0];
  if (!pol) return out;

  const ocean = oceanRows[pol] || {};
  const coc20 = ocean.coc20;
  const coc40 = ocean.coc40;

  Object.entries(dropRows[pol] || {}).forEach(([city, totals]) => {
    const addon = {};
    if (totals.c20 != null && coc20 != null) addon.c20 = totals.c20 - coc20;
    if (totals.c40 != null && coc40 != null) addon.c40 = totals.c40 - coc40;
    if (Object.keys(addon).length) out[carrier][period][city] = addon;
  });
  return out;
}

function rentalBaseToCityBucket(base) {
  const entry = {};
  if (base.c20 != null) entry.c20 = base.c20;
  const dv = base.c40dv ?? base.c40;
  const hc = base.c40hc ?? base.c40;
  if (dv != null) entry.c40dv = dv;
  if (hc != null) entry.c40hc = hc;
  return entry;
}

function buildRentalRatesFromBases(bases, period = "current") {
  const out = {};
  Object.entries(bases).forEach(([pol, base]) => {
    const bucket = rentalBaseToCityBucket(base);
    if (!Object.keys(bucket).length) return;
    const cities = {};
    Object.keys(PDF_DROP).forEach((city) => { cities[city] = { ...bucket }; });
    out[pol] = { [period]: cities };
  });
  return out;
}

function buildRentalRatesFromCityRates(cityRates, period = "current") {
  const out = {};
  Object.entries(cityRates || {}).forEach(([pol, cities]) => {
    const normalized = {};
    Object.entries(cities).forEach(([city, vals]) => {
      normalized[city] = normalizeRentalCityBucket(vals);
    });
    if (Object.keys(normalized).length) out[pol] = { [period]: normalized };
  });
  return out;
}

function rentalPeriodBucketHasRates(bucket) {
  if (!bucket || typeof bucket !== "object") return false;
  return Object.values(bucket).some(v => {
    const b = normalizeRentalCityBucket(v);
    return b.c20 != null || b.c40dv != null || b.c40hc != null || b.c40 != null;
  });
}

function mergeRentalRatesPatch(existing, patch) {
  const out = { ...(existing || {}) };
  Object.entries(patch).forEach(([pol, periods]) => {
    if (!out[pol]) out[pol] = { current: {}, future: {} };
    ["current", "future"].forEach(p => {
      const bucket = periods[p];
      if (!rentalPeriodBucketHasRates(bucket)) return;
      out[pol][p] = bucket;
    });
  });
  return out;
}

function compactRentalRates(rentalRates) {
  if (!rentalRates || typeof rentalRates !== "object") return {};
  const out = {};
  Object.entries(rentalRates).forEach(([pol, periods]) => {
    if (!periods || typeof periods !== "object") return;
    const polOut = {};
    ["current", "future"].forEach(p => {
      const bucket = periods[p];
      if (!bucket || typeof bucket !== "object") return;
      const cityOut = {};
      Object.entries(bucket).forEach(([city, vals]) => {
        const b = normalizeRentalCityBucket(vals);
        const entry = {};
        if (b.c20 != null && b.c20 !== "") entry.c20 = b.c20;
        if (b.c40dv != null && b.c40dv !== "") entry.c40dv = b.c40dv;
        if (b.c40hc != null && b.c40hc !== "") entry.c40hc = b.c40hc;
        if (Object.keys(entry).length) cityOut[city] = entry;
      });
      if (Object.keys(cityOut).length) polOut[p] = cityOut;
    });
    if (Object.keys(polOut).length) out[pol] = polOut;
  });
  return out;
}

function previewSummary(parsed, period) {
  if (parsed.format === "RENTAL") {
    const polN = parsed.cityRates ? Object.keys(parsed.cityRates).length : Object.keys(parsed.bases || {}).length;
    const cityN = parsed.cityRates
      ? Object.values(parsed.cityRates).reduce((n, c) => n + Object.keys(c).length, 0)
      : null;
    return {
      title: `Rental · ${polN} POL`,
      detail: `기간: ${period === "future" ? "향후" : "현재"} · 20'/40'DV/40'HC${cityN != null ? ` · ${cityN} POL×도시` : ""} · 스킵 ${parsed.skipped.length}건`,
      sample: parsed.cityRates
        ? Object.entries(parsed.cityRates).slice(0, 2).map(([pol, cities]) => [pol, cities.Moscow || Object.values(cities)[0]])
        : Object.entries(parsed.bases || {}).slice(0, 3),
    };
  }
  if (parsed.format === "DY") {
    const svcSkip = (parsed.skippedService || []).length;
    const svcNote = svcSkip ? ` · 서비스外 ${svcSkip}셀 제외` : "";
    return {
      title: `동영 · 해상 ${Object.keys(parsed.oceanRows).length} POL · Drop ${Object.keys(parsed.dropRows).length} POL`,
      detail: `기간: ${period === "future" ? "향후" : "현재"} · 스킵 ${parsed.skipped.length}건${svcNote}`,
      sample: Object.entries(parsed.oceanRows).slice(0, 3),
    };
  }
  const netRows = parsed.netRows || parsed.oceanRows || {};
  const sellRows = parsed.sellRows || {};
  const sellN = Object.keys(sellRows).length;
  const scanNote = parsed.polScan ? " · POL 스캔 (양식 확인)" : (sellN ? " · NET+SELL" : " · NET 컬럼");
  const sellNote = sellN ? ` · 매출 ${sellN} POL` : "";
  const svcSkip = (parsed.skippedService || []).length;
  const svcNote = svcSkip ? ` · 서비스外 ${svcSkip}셀 제외` : "";
  return {
    title: `${parsed.carrier} · ${Object.keys(netRows).length} POL`,
    detail: `POL 기준 매입${sellNote}${scanNote} · 스킵 ${(parsed.skipped || []).length}건${svcNote}`,
    sample: Object.entries(netRows).slice(0, 3).map(([pol, rates]) => {
      const sell = sellRows[pol];
      return [pol, sell ? { ...rates, sell } : rates];
    }),
  };
}

function polCostSiblingMargin(polCostO, pol, carrier, period, rateType) {
  const bucket = polCostO?.[pol]?.carrier?.[carrier]?.[period];
  if (!bucket) return null;
  const inferred = {};
  RATE_TYPES.forEach(t => {
    if (bucket[t] != null && bucket.sell?.[t] != null) {
      inferred[t] = bucket.sell[t] - bucket[t];
    }
  });
  if (inferred[rateType] != null) return inferred[rateType];
  return RATE_TYPES.map(t => inferred[t]).find(m => m != null) ?? null;
}

function rateHistoryBatchSiblingMargin(rows, row) {
  const margins = (rows || [])
    .filter(r => r.category === "ocean"
      && r.pol === row.pol
      && r.carrier === row.carrier
      && r.period === row.period
      && r.id !== row.id
      && r.sell != null
      && r.cost != null
      && r.cost > 0)
    .map(r => r.sell - r.cost)
    .filter(m => Number.isFinite(m));
  return margins[0] ?? null;
}

function enrichRateHistoryRowsWithCosts(rows, polCostO, period) {
  const list = rows || [];
  return list.map(row => {
    if (row.category !== "ocean") return row;
    let sell = row.sell;
    if (sell == null) {
      sell = resolveCarrierExplicitSell(polCostO, row.pol, row.carrier, row.rate_type, period);
    }
    if (sell == null && row.carrier === "SNK" && JAPAN_POL_SET.has(row.pol) && row.cost > 0) {
      const m = snkJapanReferenceMargins(polCostO, period)[row.rate_type];
      if (m != null) sell = row.cost + m;
    }
    if (sell == null && row.cost > 0) {
      const m = polCostSiblingMargin(polCostO, row.pol, row.carrier, period, row.rate_type)
        ?? rateHistoryBatchSiblingMargin(list, row);
      if (m != null) sell = row.cost + m;
    }
    if (sell == null) return row;
    return { ...row, sell, margin: sell - row.cost };
  });
}

/** Rate History 표시 · DB에 매출 없을 때 pol_costs·동일 POL 마진·SNK 일본에서 보완 */
function hydrateRateHistoryRowSells(rows, polCostO, polM, polMFuture) {
  const list = rows || [];
  return list.map(row => {
    if (row.category !== "ocean" || row.cost == null || row.cost <= 0) return row;
    const explicit = resolveCarrierExplicitSell(polCostO, row.pol, row.carrier, row.rate_type, row.period);
    if (explicit != null && (row.sell == null || row.sell === 0)) {
      return { ...row, sell: explicit, margin: explicit - row.cost, sellHydrated: true };
    }
    if (row.sell != null && row.sell !== 0) return row;
    let sell = resolveCarrierEffectiveSell(polCostO, row.pol, row.carrier, row.rate_type, row.period, row.cost, {
      polM, polMFuture, adminMode: true,
    });
    if (sell == null && row.carrier === "SNK" && JAPAN_POL_SET.has(row.pol)) {
      const m = snkJapanReferenceMargins(polCostO, row.period)[row.rate_type];
      if (m != null) sell = row.cost + m;
    }
    if (sell == null) {
      const m = polCostSiblingMargin(polCostO, row.pol, row.carrier, row.period, row.rate_type)
        ?? rateHistoryBatchSiblingMargin(list, row);
      if (m != null) sell = row.cost + m;
    }
    if (sell == null) return row;
    return { ...row, sell, margin: sell - row.cost, sellHydrated: true };
  });
}

function buildRateHistoryRowsFromUpload(parsed, period, fData, note) {
  const rows = [];
  const areaMap = Object.fromEntries((fData || []).map(r => [r.pol, r.area]));
  const batchNote = note || "";

  const pushOcean = (carrier, netRows, sellRows = {}) => {
    Object.entries(netRows || {}).forEach(([pol, rates]) => {
      const sells = sellRows[pol] || {};
      RATE_TYPES.forEach(t => {
        if (rates[t] == null || rates[t] <= 0) return;
        if (!carrierUploadServesRate(fData, carrier, pol, t)) return;
        const sell = sells[t] ?? null;
        rows.push({
          carrier, area: areaMap[pol] || "", pol, route: pol, rate_type: t, period,
          category: "ocean", cost: rates[t], sell, margin: sell != null ? sell - rates[t] : null,
          source: "excel_upload", note: batchNote,
        });
      });
    });
  };

  if (parsed.format === "RENTAL") {
    const pushCityRates = (rentalPol, cities) => {
      const freightPol = PM[rentalPol] || rentalPol;
      const area = areaMap[freightPol] || "OTHERS";
      Object.entries(cities).forEach(([city, vals]) => {
        const bucket = normalizeRentalCityBucket(vals);
        if (bucket.c20 != null) {
          rows.push({
            carrier: "RENTAL", area, pol: freightPol, route: `${freightPol} > ${city}`,
            rate_type: "r20", period, category: "rental", cost: bucket.c20, sell: null, margin: null,
            source: "excel_upload", note: batchNote,
          });
        }
        if (bucket.c40dv != null) {
          rows.push({
            carrier: "RENTAL", area, pol: freightPol, route: `${freightPol} > ${city}`,
            rate_type: "r40dv", period, category: "rental", cost: bucket.c40dv, sell: null, margin: null,
            source: "excel_upload", note: batchNote,
          });
        }
        if (bucket.c40hc != null) {
          rows.push({
            carrier: "RENTAL", area, pol: freightPol, route: `${freightPol} > ${city}`,
            rate_type: "r40hc", period, category: "rental", cost: bucket.c40hc, sell: null, margin: null,
            source: "excel_upload", note: batchNote,
          });
        }
      });
    };
    if (parsed.cityRates) {
      Object.entries(parsed.cityRates).forEach(([rentalPol, cities]) => pushCityRates(rentalPol, cities));
    } else {
      Object.entries(parsed.bases || {}).forEach(([rentalPol, base]) => {
        const bucket = rentalBaseToCityBucket(base);
        Object.keys(PDF_DROP).forEach((city) => {
          pushCityRates(rentalPol, { [city]: bucket });
        });
      });
    }
    return rows;
  }

  if (parsed.format === "DY") {
    pushOcean("DY", parsed.oceanRows, parsed.sellRows);
    return rows;
  }

  if (parsed.format === "YSL") {
    pushOcean(parsed.carrier, parsed.netRows, parsed.sellRows);
    return rows;
  }

  pushOcean(parsed.carrier, parsed.netRows, parsed.sellRows);
  return rows;
}

function rateHistoryScopeFromUpload(parsed, period) {
  if (parsed.format === "RENTAL") return { carrier: "RENTAL", period, category: "rental" };
  const carrier = parsed.format === "YSL" ? parsed.carrier : (parsed.carrier || parsed.format);
  return { carrier, period, category: "ocean" };
}



export { APP_POLS, CK_POL_MAP, CK_POL_MAP_CI, CK_SERVICE_POLS, DY_POL_MAP, DY_POL_MAP_CI, DY_SERVICE_POLS, JAPAN_POL_SET, JAPAN_PORTS, LEGACY_VALIDITY_KEY, PDF_DROP, RENTAL_EXCEL_TO_POL, SNK_JAPAN_DEFAULT_MARGIN, SNK_POL_EXPAND, UPLOAD_FORMATS, applyFreightServiceFilterToUpload, applyRateHistoryDeletesToStores, applySnkJapanSellBackfill, backfillPolCostSells, buildDyDropRates, buildPolCostBucket, buildRateHistoryRowsFromUpload, buildRentalRatesFromBases, buildRentalRatesFromCityRates, carrierBucketHasData, carrierUploadServesRate, cell, ciPolMap, clearCarrierDropPeriod, clearCarrierDropRateCells, clearPolCostRateCells, clearPolCostsCarrier, clearPolCostsCarrierPeriod, clearRentalPeriodRates, clearRentalRateCells, compactRentalRates, countCarrierDropCities, countCarrierDropValidityArchive, countCarrierPeriodPols, countCarrierValidityArchive, countRentalPeriodPols, detectCkColumns, detectDualNetSellGrid, detectRentalUploadGrid, detectSnkColumns, dropCityKeyFromRhLabel, enrichRateHistoryRowsWithCosts, excelUploadCarrierKey, expandSnkPol, filterOceanUploadByFreightService, freightTemplateServesRate, hydrateRateHistoryRowSells, inferSnkSellStart, is20SizeToken, isSnkLegacyTransitSheet, loadXlsx, mapDyPol, mergeCarrierDropRateCell, mergePolCostsCarrier, mergePolCostsUploadByValidity, mergePolCostsWithSells, mergePolMarginsMap, mergeRentalRatesPatch, mergeUploadValidity, normalizePol, num, parseByFormat, parseCkOceanRows, parseCkSheet, parseDySheet, parseOceanNetSellRows, parsePolNetSellGrid, parsePolScanSheet, parseRentalLegacySheet, parseRentalSheet, parseSnkSheet, parseYslCarrierSheet, polCompact, polCostBucketHasRates, polCostSiblingMargin, previewSummary, rateHistoryBatchSiblingMargin, rateHistoryScopeFromUpload, ratesFromCols, reSkipSnk, readCostQuadruple, readRateQuadruple, rentalBaseToCityBucket, rentalPeriodBucketHasRates, replacePolCostsCarrier, replacePolCostsWithSells, resolveExcelPolList, snkJapanReferenceMargins, stripPolCostsOutsideFreightService, suggestSheet, suggestYslSheet, validityStorageKey, xlsxLoadPromise };
