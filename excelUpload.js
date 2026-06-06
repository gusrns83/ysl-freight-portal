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

export const RATE_TYPES = ["coc20", "coc40", "soc20", "soc40"];

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
];

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
  Ekaterinburg: [400, 700],
  Vladivostok: [600, 700],
  "St.Petersburg": [450, 750],
  Samara: [500, 800],
  Tolyatti: [400, 700],
  Kazan: [650, 750],
  Minsk: [500, 500],
};

export const UPLOAD_FORMATS = [
  { id: "SNK", label: "장금상선 (SKR-YSL)", hint: "NET/SELL/PROFIT 시트 · Vladivostok 등" },
  { id: "DY", label: "동영 (Fishery Import)", hint: "Import 시트 · 해상 + Drop off" },
  { id: "CK", label: "천경 (CK Line)", hint: "첫 시트 · COC/SOC 열" },
  { id: "YSL", label: "YSL 관리양식", hint: "SNK/DY/CK 선사 시트 · NET(C~F)" },
  { id: "RENTAL", label: "컨테이너 Rental", hint: "극동 컨테이너 운임 · POL별 base" },
];

const num = (v) => {
  if (v == null || v === "" || v === "-") return null;
  const s = String(v).trim().replace(/,/g, "");
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

const expandSnkPol = (name) => {
  const key = String(name).trim().toUpperCase();
  if (SNK_POL_EXPAND[key]) return SNK_POL_EXPAND[key];
  return [key];
};

const reSkipSnk = (name) => /^(CK LINE|SC NUMBER)/i.test(name);

export async function readExcelFile(file) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellFormula: false, raw: true });
  const sheets = {};
  wb.SheetNames.forEach(name => {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
  });
  return { sheetNames: wb.SheetNames, sheets, fileName: file.name };
}

function detectSnkColumns(rows) {
  for (let r = 0; r < 7; r++) {
    const vals = [];
    for (let c = 0; c < 20; c++) vals.push(String(cell(rows, r, c) ?? "").trim().toUpperCase());
    if (vals.includes("NET") && vals.includes("SELL") && vals.includes("PROFIT")) {
      const netI = vals.indexOf("NET");
      const profitI = vals.indexOf("PROFIT");
      const nextRow = cell(rows, r + 1, netI);
      const dataStart = nextRow == null || nextRow === "COC" || nextRow === "FILO / COC" ? r + 4 : r + 3;
      return {
        dataStart,
        areaCol: 0,
        polCol: 1,
        netStart: netI,
        profitStart: profitI,
      };
    }
  }
  for (let r = 0; r < 7; r++) {
    const vals = [];
    for (let c = 0; c < 22; c++) vals.push(String(cell(rows, r, c) ?? "").trim().toUpperCase());
    if (vals.includes("NET") && vals.includes("SELL") && vals.includes("PROFIT")) {
      const netI = vals.indexOf("NET");
      const profitI = vals.indexOf("PROFIT");
      return { dataStart: 6, areaCol: 1, polCol: 2, netStart: netI, profitStart: profitI };
    }
  }
  throw new Error("NET/SELL/PROFIT 헤더를 찾을 수 없습니다 (장금상선 양식 확인)");
}

export function parseSnkSheet(rows) {
  const cols = detectSnkColumns(rows);
  const netRows = {};
  const marginRows = {};
  const skipped = [];
  let currentArea = null;

  for (let r = cols.dataStart; r < rows.length; r++) {
    const areaCell = cell(rows, r, cols.areaCol);
    if (areaCell != null && String(areaCell).trim()) currentArea = String(areaCell).trim();

    let polName = cell(rows, r, cols.polCol);
    if (polName != null && String(polName).trim()) {
      polName = String(polName).trim();
    } else if (currentArea && currentArea.toUpperCase() === "SINGAPORE") {
      polName = "SINGAPORE";
    } else continue;

    if (reSkipSnk(polName)) continue;

    const net = {
      coc20: num(cell(rows, r, cols.netStart)),
      coc40: num(cell(rows, r, cols.netStart + 1)),
      soc20: num(cell(rows, r, cols.netStart + 2)),
      soc40: num(cell(rows, r, cols.netStart + 3)),
    };
    const profit = {
      coc20: num(cell(rows, r, cols.profitStart)),
      coc40: num(cell(rows, r, cols.profitStart + 1)),
      soc20: num(cell(rows, r, cols.profitStart + 2)),
      soc40: num(cell(rows, r, cols.profitStart + 3)),
    };

    if (RATE_TYPES.every(t => net[t] == null)) continue;

    let mapped = false;
    for (const portal of expandSnkPol(polName)) {
      if (!APP_POLS.has(portal)) continue;
      mapped = true;
      const costs = Object.fromEntries(RATE_TYPES.filter(t => net[t] != null).map(t => [t, net[t]]));
      if (Object.keys(costs).length) netRows[portal] = costs;
      const margins = Object.fromEntries(RATE_TYPES.filter(t => profit[t] != null).map(t => [t, profit[t]]));
      if (Object.keys(margins).length) marginRows[portal] = margins;
    }
    if (!mapped) skipped.push(polName);
  }
  return { netRows, marginRows, skipped, carrier: "SNK" };
}

function mapDyPol(raw) {
  const key = normalizePol(raw);
  if (DY_POL_MAP[key]) return DY_POL_MAP[key];
  return APP_POLS.has(key) ? key : null;
}

export function parseDySheet(rows) {
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
    if (portal == null || !APP_POLS.has(portal)) {
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
  return { oceanRows, dropRows, skipped, carrier: "DY" };
}

export function parseCkSheet(rows) {
  const netRows = {};
  const skipped = [];

  for (let r = 7; r < rows.length; r++) {
    const raw = cell(rows, r, 1);
    if (raw == null) continue;
    const name = String(raw).trim();
    if (!name || /^(remark|note|\*|-)/i.test(name)) continue;

    const portal = CK_POL_MAP[name];
    if (portal == null) {
      if (!(name in CK_POL_MAP)) skipped.push(name);
      continue;
    }
    if (!APP_POLS.has(portal)) {
      skipped.push(`${name} -> ${portal}`);
      continue;
    }

    const rates = Object.fromEntries(
      Object.entries({
        coc20: num(cell(rows, r, 2)),
        coc40: num(cell(rows, r, 3)),
        soc20: num(cell(rows, r, 13)),
        soc40: num(cell(rows, r, 14)),
      }).filter(([, v]) => v != null),
    );
    if (Object.keys(rates).length) netRows[portal] = rates;
  }
  return { netRows, marginRows: {}, skipped, carrier: "CK" };
}

export function parseYslCarrierSheet(rows, carrier) {
  const netRows = {};
  const sellRows = {};
  const marginRows = {};
  const skipped = [];
  const DATA_START = 10;

  for (let r = DATA_START; r < rows.length; r++) {
    const pol = cell(rows, r, 1);
    if (pol == null || !String(pol).trim()) continue;
    const portal = String(pol).trim().toUpperCase();
    if (!APP_POLS.has(portal)) {
      skipped.push(String(pol));
      continue;
    }
    const net = {
      coc20: num(cell(rows, r, 2)),
      coc40: num(cell(rows, r, 3)),
      soc20: num(cell(rows, r, 4)),
      soc40: num(cell(rows, r, 5)),
    };
    const sell = {
      coc20: num(cell(rows, r, 6)),
      coc40: num(cell(rows, r, 7)),
      soc20: num(cell(rows, r, 8)),
      soc40: num(cell(rows, r, 9)),
    };
    if (RATE_TYPES.every(t => net[t] == null)) continue;
    netRows[portal] = Object.fromEntries(RATE_TYPES.filter(t => net[t] != null).map(t => [t, net[t]]));
    const sells = Object.fromEntries(RATE_TYPES.filter(t => sell[t] != null).map(t => [t, sell[t]]));
    if (Object.keys(sells).length) sellRows[portal] = sells;
    RATE_TYPES.forEach(t => {
      if (net[t] != null && sell[t] != null) {
        if (!marginRows[portal]) marginRows[portal] = {};
        marginRows[portal][t] = sell[t] - net[t];
      }
    });
  }
  return { netRows, sellRows, marginRows, skipped, carrier };
}

export function parseRentalSheet(rows) {
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
    const c40 = num(cell(rows, r, 3)) ?? num(cell(rows, r, 4));
    if (c20 == null && c40 == null) {
      skipped.push(`${raw} (no rates)`);
      continue;
    }
    bases[rentalPol] = { c20, c40 };
  }
  return { bases, skipped, carrier: "RENTAL" };
}

export function parseByFormat(format, rows, options = {}) {
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

export function suggestSheet(format, sheetNames) {
  if (!sheetNames?.length) return "";
  if (format === "DY") {
    const hit = sheetNames.find(s => /^Import$/i.test(s));
    if (hit) return hit;
  }
  if (format === "SNK") {
    const hit = sheetNames.find(s => /06\.01|6\.01|Vladivostok/i.test(s));
    if (hit) return hit;
  }
  if (format === "YSL") {
    const cr = format === "YSL" ? null : format;
    return sheetNames.find(s => /^(SNK|DY|CK)$/i.test(s)) || sheetNames[0];
  }
  if (format === "RENTAL") {
    return sheetNames.find(s => /^Sheet1$/i.test(s)) || sheetNames[0];
  }
  return sheetNames[0];
}

export function suggestYslSheet(carrier, period, sheetNames) {
  const base = carrier;
  const future = `${carrier}_향후`;
  const names = sheetNames || [];
  if (period === "future") {
    return names.find(s => s === future || s.includes("향후") && s.toUpperCase().includes(carrier)) || names.find(s => s.toUpperCase() === carrier) || names[0];
  }
  return names.find(s => s.toUpperCase() === base) || names[0];
}

export function mergePolCostsCarrier(polCostO, netRows, carrier, period) {
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

export function mergePolCostsWithSells(polCostO, netRows, sellRows, carrier, period) {
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

export function mergePolMarginsMap(polM, marginRows) {
  const out = { ...(polM || {}) };
  Object.entries(marginRows || {}).forEach(([pol, margins]) => {
    out[pol] = { ...(out[pol] || {}), ...margins };
  });
  return out;
}

export function buildDyDropRates(existingJson, oceanRows, dropRows, period, carrier = "DY", refPol = "BUSAN") {
  let out = existingJson ? JSON.parse(existingJson) : {};
  if (!out[carrier]) out[carrier] = { current: {}, future: {} };
  if (!out[carrier][period]) out[carrier][period] = {};

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

export function buildRentalRatesFromBases(bases, period = "current") {
  const out = {};
  Object.entries(bases).forEach(([pol, base]) => {
    const cities = {};
    Object.entries(PDF_DROP).forEach(([city, [d20, d40]]) => {
      const entry = {};
      if (base.c20 != null) entry.c20 = base.c20 + d20;
      if (base.c40 != null) entry.c40 = base.c40 + d40;
      if (Object.keys(entry).length) cities[city] = entry;
    });
    if (Object.keys(cities).length) out[pol] = { [period]: cities, future: {} };
  });
  return out;
}

export function mergeRentalRatesPatch(existing, patch) {
  const out = { ...(existing || {}) };
  Object.entries(patch).forEach(([pol, periods]) => {
    if (!out[pol]) out[pol] = { current: {}, future: {} };
    ["current", "future"].forEach(p => {
      if (periods[p]) out[pol][p] = periods[p];
    });
  });
  return out;
}

export function previewSummary(parsed, period) {
  if (parsed.format === "RENTAL") {
    return {
      title: `Rental · ${Object.keys(parsed.bases).length} POL`,
      detail: `기간: ${period === "future" ? "향후" : "현재"} · 스킵 ${parsed.skipped.length}건`,
      sample: Object.entries(parsed.bases).slice(0, 3),
    };
  }
  if (parsed.format === "DY") {
    return {
      title: `동영 · 해상 ${Object.keys(parsed.oceanRows).length} POL · Drop ${Object.keys(parsed.dropRows).length} POL`,
      detail: `기간: ${period === "future" ? "향후" : "현재"} · 스킵 ${parsed.skipped.length}건`,
      sample: Object.entries(parsed.oceanRows).slice(0, 3),
    };
  }
  const netRows = parsed.netRows || parsed.oceanRows || {};
  const marginCount = Object.keys(parsed.marginRows || {}).length;
  return {
    title: `${parsed.carrier} · ${Object.keys(netRows).length} POL`,
    detail: `마진 POL ${marginCount} · 스킵 ${(parsed.skipped || []).length}건`,
    sample: Object.entries(netRows).slice(0, 3),
  };
}

export function buildRateHistoryRowsFromUpload(parsed, period, fData, note) {
  const rows = [];
  const areaMap = Object.fromEntries((fData || []).map(r => [r.pol, r.area]));
  const batchNote = note || "";

  const pushOcean = (carrier, netRows, marginRows) => {
    Object.entries(netRows || {}).forEach(([pol, rates]) => {
      const margins = (marginRows || {})[pol] || {};
      RATE_TYPES.forEach(t => {
        if (rates[t] == null) return;
        const margin = margins[t];
        rows.push({
          carrier, area: areaMap[pol] || "", pol, route: pol, rate_type: t, period,
          category: "ocean", cost: rates[t], sell: margin != null ? rates[t] + margin : null, margin: margin ?? null,
          source: "excel_upload", note: batchNote,
        });
      });
    });
  };

  if (parsed.format === "RENTAL") {
    Object.entries(parsed.bases || {}).forEach(([rentalPol, base]) => {
      Object.entries(PDF_DROP).forEach(([city, [d20, d40]]) => {
        if (base.c20 != null) {
          rows.push({
            carrier: "RENTAL", area: "OTHERS", pol: rentalPol, route: `${rentalPol} > ${city}`,
            rate_type: "r20", period, category: "rental", cost: base.c20 + d20, sell: null, margin: null,
            source: "excel_upload", note: batchNote,
          });
        }
        if (base.c40 != null) {
          rows.push({
            carrier: "RENTAL", area: "OTHERS", pol: rentalPol, route: `${rentalPol} > ${city}`,
            rate_type: "r40", period, category: "rental", cost: base.c40 + d40, sell: null, margin: null,
            source: "excel_upload", note: batchNote,
          });
        }
      });
    });
    return rows;
  }

  if (parsed.format === "DY") {
    pushOcean("DY", parsed.oceanRows, {});
    return rows;
  }

  if (parsed.format === "YSL") {
    pushOcean(parsed.carrier, parsed.netRows, parsed.marginRows);
    return rows;
  }

  pushOcean(parsed.carrier, parsed.netRows, parsed.marginRows);
  return rows;
}
