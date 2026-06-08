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

// PDF_DROP 도시명 → 엑셀 헤더 도시명 매핑
const PDF_CITY_TO_EXCEL = {
  Moscow: "Moscow",
  Chelyabinsk: "Chelyabinsk",
  Novosibirsk: "Novosibirsk",
  Irkutsk: "Irkutsk",
  Krasnoyarsk: "Krasnoyarsk",
  Ekaterinburg: "Ekaterinburg",
  Vladivostok: "Vladivostok",
  "St.Petersburg": "Saint-Petersburg",
  Samara: "Samara",
  Tolyatti: "Tolyatti",
  Kazan: "Kazan",
  Minsk: "Minsk",
};

export const UPLOAD_FORMATS = [
  { id: "SNK", label: "장금상선 (SKR-YSL)", hint: "「Vladivostok … (업로드용)」· NET+매출" },
  { id: "DY", label: "동영 (Fishery Import)", hint: "「Import (업로드용)」· NET+매출 · Import=Drop 포함" },
  { id: "CK", label: "천경 (CK Line)", hint: "「CKL Guidance Rate (업로드용)」· NET+매출" },
  { id: "YSL", label: "YSL 관리양식", hint: "SNK/DY/CK 선사 시트 · NET(C~F) 매입만" },
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
      if (sellStart == null) {
        for (let sr = ap.dataStart - 2; sr <= ap.dataStart - 1 && sr >= 0; sr++) {
          const c20s = (rows[sr] || []).map((c, i) => (is20SizeToken(c) ? i : -1)).filter(i => i >= 0);
          if (c20s.length >= 2) { sellStart = c20s[1]; break; }
        }
        if (sellStart == null) sellStart = netI + 5;
      }
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

  throw new Error("NET/SELL/PROFIT 헤더를 찾을 수 없습니다 · 「Vladivostok 06.01 (업로드용)」 시트를 선택하세요");
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

const readRateQuadruple = (rows, r, startCol) => {
  if (startCol == null || startCol < 0) return {};
  return Object.fromEntries(
    RATE_TYPES.map((t, i) => [t, num(cell(rows, r, startCol + i))]).filter(([, v]) => v != null),
  );
};

const is20SizeToken = (v) => {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  const u = s.toUpperCase();
  return (s === "20'" || s === "20" || u === "20'") && !u.includes("REF");
};

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

function parsePolNetSellGrid(rows, cols, carrier, resolvePol) {
  const netRows = {};
  const sellRows = {};
  const skipped = [];

  for (let r = cols.dataStart; r < rows.length; r++) {
    const raw = cell(rows, r, cols.polCol);
    if (raw == null) continue;
    const name = String(raw).trim();
    if (!name || /^(remark|note|\*|-)/i.test(name)) continue;

    const portal = resolvePol(name);
    if (portal == null) {
      skipped.push(name);
      continue;
    }

    const costs = readRateQuadruple(rows, r, cols.netStart);
    const sells = cols.sellStart != null ? readRateQuadruple(rows, r, cols.sellStart) : {};
    if (!Object.keys(costs).length && !Object.keys(sells).length) continue;

    if (Object.keys(costs).length) netRows[portal] = costs;
    if (Object.keys(sells).length) sellRows[portal] = sells;
  }
  return { netRows, sellRows, skipped, carrier };
}

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

    const costs = readRateQuadruple(rows, r, cols.netStart);
    const sells = readRateQuadruple(rows, r, cols.sellStart);
    if (!Object.keys(costs).length && !Object.keys(sells).length) continue;

    let mapped = false;
    for (const portal of expandSnkPol(polName)) {
      if (!APP_POLS.has(portal)) continue;
      mapped = true;
      if (Object.keys(costs).length) netRows[portal] = costs;
      if (Object.keys(sells).length) sellRows[portal] = sells;
    }
    if (!mapped) skipped.push(polName);
  }
  return { netRows, sellRows, skipped, carrier };
}

export function parseSnkSheet(rows) {
  if (isSnkLegacyTransitSheet(rows)) {
    throw new Error("구형 Vladivostok/TO RUSSIA 양식입니다 · 「Vladivostok 06.01 (업로드용)」 시트를 선택하세요");
  }
  const cols = detectSnkColumns(rows);
  const parsed = parseOceanNetSellRows(rows, cols, "SNK");
  return { ...parsed, marginRows: {} };
}

function mapDyPol(raw) {
  const key = normalizePol(raw);
  if (DY_POL_MAP[key]) return DY_POL_MAP[key];
  return APP_POLS.has(key) ? key : null;
}

export function parseDySheet(rows) {
  const dual = detectDualNetSellGrid(rows);
  if (dual) {
    const resolvePol = (name) => mapDyPol(name);
    const { netRows, sellRows, skipped } = parsePolNetSellGrid(rows, dual, "DY", resolvePol);
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

function parseCkOceanRows(rows, cols, resolvePol) {
  const netRows = {};
  const skipped = [];

  for (let r = cols.dataStart; r < rows.length; r++) {
    const raw = cell(rows, r, cols.polCol);
    if (raw == null) continue;
    const name = String(raw).trim();
    if (!name || /^(remark|note|\*|-)/i.test(name)) continue;

    const portal = resolvePol(name);
    if (portal == null) {
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
    if (Object.keys(rates).length) netRows[portal] = rates;
  }

  return { netRows, skipped };
}

export function parseCkSheet(rows) {
  const resolvePol = (name) => {
    const portal = CK_POL_MAP[name];
    if (portal == null) return null;
    if (!APP_POLS.has(portal)) return null;
    return portal;
  };

  const dual = detectDualNetSellGrid(rows);
  if (dual) {
    const parsed = parsePolNetSellGrid(rows, dual, "CK", resolvePol);
    return { ...parsed, marginRows: {} };
  }

  let cols = detectCkColumns(rows);
  let { netRows, skipped } = parseCkOceanRows(rows, cols, resolvePol);

  if (!Object.keys(netRows).length && cols.polCol !== 0) {
    cols = { ...cols, polCol: 0 };
    ({ netRows, skipped } = parseCkOceanRows(rows, cols, resolvePol));
  }

  return { netRows, marginRows: {}, skipped, carrier: "CK" };
}

export function parseYslCarrierSheet(rows, carrier) {
  const netRows = {};
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
    if (RATE_TYPES.every(t => net[t] == null)) continue;
    netRows[portal] = Object.fromEntries(RATE_TYPES.filter(t => net[t] != null).map(t => [t, net[t]]));
  }
  return { netRows, sellRows: {}, marginRows: {}, skipped, carrier };
}

export function parseRentalSheet(rows) {
  const bases = {};
  const skipped = [];

  // 헤더 행에서 도시명과 컬럼 위치 파악 (2번 컬럼부터 3컬럼씩)
  const headerRow = rows[0] || [];
  const cityColumns = [];
  for (let c = 2; c < headerRow.length; c += 3) {
    const cityName = headerRow[c];
    if (cityName != null && String(cityName).trim()) {
      cityColumns.push({ city: String(cityName).trim(), col: c });
    }
  }

  for (let r = 1; r < rows.length; r++) {
    const raw = cell(rows, r, 1);
    if (raw == null) continue;
    const key = normalizePol(raw);
    const rentalPol = RENTAL_EXCEL_TO_POL[key];
    if (!rentalPol) {
      skipped.push(String(raw).trim());
      continue;
    }

    if (cityColumns.length > 0) {
      const citiesData = {};
      for (const { city, col } of cityColumns) {
        const c20 = num(cell(rows, r, col));
        const c40dv = num(cell(rows, r, col + 1));
        const c40hc = num(cell(rows, r, col + 2));
        if (c20 != null || c40dv != null || c40hc != null) {
          citiesData[city] = { c20, c40dv, c40hc };
        }
      }
      if (Object.keys(citiesData).length) {
        bases[rentalPol] = citiesData;
      } else {
        skipped.push(`${raw} (no rates)`);
      }
    } else {
      const c20 = num(cell(rows, r, 2));
      const c40 = num(cell(rows, r, 3)) ?? num(cell(rows, r, 4));
      if (c20 == null && c40 == null) {
        skipped.push(`${raw} (no rates)`);
        continue;
      }
      bases[rentalPol] = { c20, c40 };
    }
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

function carrierBucketHasData(cr) {
  if (!cr || typeof cr !== "object") return false;
  if (["current", "future"].some(p => {
    const b = cr[p];
    return b && (RATE_TYPES.some(t => b[t] != null) || (b.sell && Object.keys(b.sell).length));
  })) return true;
  return RATE_TYPES.some(t => cr[t] != null);
}

export function clearPolCostsCarrierPeriod(polCostO, carrier, period) {
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

export function replacePolCostsCarrier(polCostO, netRows, carrier, period) {
  return mergePolCostsCarrier(clearPolCostsCarrierPeriod(polCostO, carrier, period), netRows, carrier, period);
}

export function replacePolCostsWithSells(polCostO, netRows, sellRows, carrier, period) {
  return mergePolCostsWithSells(
    clearPolCostsCarrierPeriod(polCostO, carrier, period),
    netRows,
    sellRows || {},
    carrier,
    period,
  );
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

function isPerCityBase(base) {
  const firstVal = Object.values(base)[0];
  return firstVal != null && typeof firstVal === "object";
}

export function buildRentalRatesFromBases(bases, period = "current") {
  const out = {};
  Object.entries(bases).forEach(([pol, base]) => {
    const cities = {};
    if (isPerCityBase(base)) {
      Object.keys(PDF_DROP).forEach((city) => {
        const excelCity = PDF_CITY_TO_EXCEL[city] || city;
        const cityData = base[excelCity];
        if (!cityData) return;
        const entry = {};
        if (cityData.c20 != null) entry.c20 = cityData.c20;
        if (cityData.c40dv != null) entry.c40dv = cityData.c40dv;
        if (cityData.c40hc != null) entry.c40hc = cityData.c40hc;
        if (Object.keys(entry).length) cities[city] = entry;
      });
    } else {
      const bucket = rentalBaseToCityBucket(base);
      if (!Object.keys(bucket).length) return;
      Object.keys(PDF_DROP).forEach((city) => { cities[city] = { ...bucket }; });
    }
    if (Object.keys(cities).length) out[pol] = { [period]: cities };
  });
  return out;
}

export function mergeRentalRatesPatch(existing, patch) {
  const out = { ...(existing || {}) };
  Object.entries(patch).forEach(([pol, periods]) => {
    if (!out[pol]) out[pol] = { current: {}, future: {} };
    ["current", "future"].forEach(p => {
      const bucket = periods[p];
      if (!bucket || typeof bucket !== "object") return;
      const hasRates = Object.values(bucket).some(v => {
        const b = v && typeof v === "object" ? v : {};
        return b.c20 != null || b.c40dv != null || b.c40hc != null || b.c40 != null;
      });
      if (!hasRates) return;
      out[pol][p] = bucket;
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
  const sellRows = parsed.sellRows || {};
  const sellN = Object.keys(sellRows).length;
  const sellNote = sellN ? ` · 매출 ${sellN} POL` : "";
  return {
    title: `${parsed.carrier} · ${Object.keys(netRows).length} POL`,
    detail: `POL 기준 매입${sellNote}${sellN ? " · NET+SELL" : " · NET만"} · 스킵 ${(parsed.skipped || []).length}건`,
    sample: Object.entries(netRows).slice(0, 3).map(([pol, rates]) => {
      const sell = sellRows[pol];
      return [pol, sell ? { ...rates, sell } : rates];
    }),
  };
}

export function enrichRateHistoryRowsWithCosts(rows, polCostO, period) {
  const explicitSell = (pol, cr, t, p) => {
    const sellVal = polCostO?.[pol]?.carrier?.[cr]?.[p === "future" ? "future" : "current"]?.sell?.[t];
    if (sellVal != null && sellVal !== "") return Number(sellVal);
    return null;
  };
  return (rows || []).map(row => {
    if (row.sell != null || row.category !== "ocean") return row;
    const sell = explicitSell(row.pol, row.carrier, row.rate_type, period);
    if (sell == null) return row;
    return { ...row, sell, margin: sell - row.cost };
  });
}

export function buildRateHistoryRowsFromUpload(parsed, period, fData, note) {
  const rows = [];
  const areaMap = Object.fromEntries((fData || []).map(r => [r.pol, r.area]));
  const batchNote = note || "";

  const pushOcean = (carrier, netRows, sellRows = {}) => {
    Object.entries(netRows || {}).forEach(([pol, rates]) => {
      const sells = sellRows[pol] || {};
      RATE_TYPES.forEach(t => {
        if (rates[t] == null) return;
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
    Object.entries(parsed.bases || {}).forEach(([rentalPol, base]) => {
      if (isPerCityBase(base)) {
        Object.keys(PDF_DROP).forEach((city) => {
          const excelCity = PDF_CITY_TO_EXCEL[city] || city;
          const cityData = base[excelCity];
          if (!cityData) return;
          if (cityData.c20 != null) {
            rows.push({
              carrier: "RENTAL", area: "OTHERS", pol: rentalPol, route: `${rentalPol} > ${city}`,
              rate_type: "r20", period, category: "rental", cost: cityData.c20, sell: null, margin: null,
              source: "excel_upload", note: batchNote,
            });
          }
          const c40 = cityData.c40dv ?? cityData.c40hc;
          if (c40 != null) {
            rows.push({
              carrier: "RENTAL", area: "OTHERS", pol: rentalPol, route: `${rentalPol} > ${city}`,
              rate_type: "r40", period, category: "rental", cost: c40, sell: null, margin: null,
              source: "excel_upload", note: batchNote,
            });
          }
        });
      } else {
        const bucket = rentalBaseToCityBucket(base);
        Object.keys(PDF_DROP).forEach((city) => {
          if (bucket.c20 != null) {
            rows.push({
              carrier: "RENTAL", area: "OTHERS", pol: rentalPol, route: `${rentalPol} > ${city}`,
              rate_type: "r20", period, category: "rental", cost: bucket.c20, sell: null, margin: null,
              source: "excel_upload", note: batchNote,
            });
          }
          const c40 = bucket.c40dv ?? bucket.c40hc ?? bucket.c40;
          if (c40 != null) {
            rows.push({
              carrier: "RENTAL", area: "OTHERS", pol: rentalPol, route: `${rentalPol} > ${city}`,
              rate_type: "r40", period, category: "rental", cost: c40, sell: null, margin: null,
              source: "excel_upload", note: batchNote,
            });
          }
        });
      }
    });
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
