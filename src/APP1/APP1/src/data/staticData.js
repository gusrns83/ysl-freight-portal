import { normalizeRentalCityBucket } from "../config.js";

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
const DO = {
  mow: { SNK: [1100, 1400], DY: [800, 1400], CK: [950, 1300] },
  spb: { SNK: [700, 1000], DY: null, CK: null },
  nsb: { SNK: [700, 1000], DY: [400, 600], CK: [400, 600] },
  ekb: { SNK: null, DY: null, CK: [550, 800] },
  irk: { SNK: null, DY: null, CK: null },
  khab: { SNK: null, DY: null, CK: null },
  krs: { SNK: null, DY: null, CK: null },
};
const CRS = ["SNK", "DY", "CK"];
const carrierDropValidityKey = (cr) => `${cr}_DROP`;
const VALIDITY_KEYS = [...CRS, ...CRS.map(carrierDropValidityKey), "RENTAL"];
const RATE_TYPES = ["coc20","coc40","soc20","soc40"];
const RENTAL_RATE_TYPES = ["r20", "r40dv", "r40hc"];
const rentalRateLabel = (t) => (t === "r20" ? "20'" : t === "r40dv" ? "40'DV" : "40'HC");
const defaultRentalMargins = () => ({ r20: 80, r40dv: 100, r40hc: 100 });
const normalizeRentalMargins = (m) => {
  const base = { ...defaultRentalMargins(), ...(m || {}) };
  if (base.r40 != null && base.r40 !== "" && base.r40dv == null) base.r40dv = base.r40;
  if (base.r40 != null && base.r40 !== "" && base.r40hc == null) base.r40hc = base.r40;
  return base;
};
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

const defaultValidityInfo = () => Object.fromEntries(VALIDITY_KEYS.map(k => {
  const isSnk = k === "SNK" || k === "SNK_DROP";
  const isDy = k === "DY" || k === "DY_DROP";
  const isCk = k === "CK" || k === "CK_DROP";
  return [k, {
    current: {
      from: "",
      till: (isSnk || isDy) ? "Till 15.06.2026" : "Till 30.06.2026",
      furtherNotice: false,
    },
    future: {
      from: (isSnk || isCk || isDy) ? "From 16.06.2026" : "From 01.07.2026",
      till: "Till 30.06.2026",
      furtherNotice: false,
    },
  }];
}));
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
      if (c20 != null || c40 != null) {
        current[city] = {
          c20: c20 ?? "",
          c40dv: c40 ?? "",
          c40hc: c40 ?? "",
        };
      }
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
        next[pol][p][city] = normalizeRentalCityBucket({ ...(next[pol][p][city] || {}), ...vals });
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
const DOC = [
  { k: "mow", l: "Moscow" },
  { k: "spb", l: "SPB" },
  { k: "nsb", l: "Novosibirsk" },
  { k: "ekb", l: "Ekaterinburg" },
  { k: "irk", l: "Irkutsk" },
  { k: "khab", l: "Khabarovsk" },
  { k: "krs", l: "Krasnoyarsk" },
];

const defaultCarrierDropRates = () => Object.fromEntries(CRS.map(cr => [cr, {
  current: Object.fromEntries(
    DOC.filter(({ k }) => DO[k]?.[cr]).map(({ k }) => [k, { c20: DO[k][cr][0], c40: DO[k][cr][1] }])
  ),
  future: {},
  byValidity: {},
}]));

const defaultCarrierDropMargins = () => Object.fromEntries(
  CRS.map(cr => [cr, Object.fromEntries(DOC.map(({ k }) => [k, { c20: 0, c40: 0 }]))])
);

const mergeCarrierDropRates = (saved) => {
  const next = defaultCarrierDropRates();
  Object.entries(saved || {}).forEach(([cr, periods]) => {
    if (!next[cr]) next[cr] = { current: {}, future: {}, byValidity: {} };
    ["current", "future"].forEach(p => {
      Object.entries(periods?.[p] || {}).forEach(([city, vals]) => {
        next[cr][p][city] = { ...(next[cr][p][city] || {}), ...vals };
      });
    });
    if (periods?.byValidity && typeof periods.byValidity === "object") {
      next[cr].byValidity = JSON.parse(JSON.stringify(periods.byValidity));
    }
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

/** DB 저장용 — 화면에 보이는 모든 Drop off 금액을 carrier_drop_rates_json에 명시적으로 포함 */
const serializeCarrierDropRatesForSave = (carrierDropRates) => {
  const out = JSON.parse(JSON.stringify(carrierDropRates || {}));
  CRS.forEach(cr => {
    if (!out[cr]) out[cr] = { current: {}, future: {}, byValidity: {} };
    if (!out[cr].byValidity) out[cr].byValidity = {};
    ["current", "future"].forEach(period => {
      if (!out[cr][period]) out[cr][period] = {};
      DOC.forEach(({ k }) => {
        const bucket = { ...(out[cr][period][k] || {}) };
        [0, 1].forEach(si => {
          const sk = si === 0 ? "c20" : "c40";
          if (bucket[sk] != null && bucket[sk] !== "") return;
          const fallback = DO[k]?.[cr]?.[si];
          if (fallback != null) bucket[sk] = fallback;
        });
        if (Object.keys(bucket).length) out[cr][period][k] = bucket;
      });
    });
  });
  return out;
};
const F_TO_R = Object.fromEntries(Object.entries(PM).map(([rental, freight]) => [freight, rental]));
const DOC_RC = {
  mow: "Moscow",
  spb: "St.Petersburg",
  nsb: "Novosibirsk",
  ekb: "Ekaterinburg",
  irk: "Irkutsk",
  khab: "Khabarovsk",
  krs: "Krasnoyarsk",
};
const RC_LABEL = Object.fromEntries(DOC.map(d => [DOC_RC[d.k], d.l]));
const RENTAL_CITY_ALIASES = {
  "SAINT-PETERSBURG": "St.Petersburg",
  "SAINT PETERSBURG": "St.Petersburg",
  "ST.PETERSBURG": "St.Petersburg",
  "ST PETERSBURG": "St.Petersburg",
  "ROSTOV NA DONU": "Rostov na Donu",
  "NOVOKUZNECK": "Novokuznetsk",
  "NOVOROSSIYSK": "Novorossiysk",
  "NIZHNIY NOVGOROD": "Nizhniy Novgorod",
};
const normalizeRentalCityName = (raw) => {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const key = s.toUpperCase().replace(/[-]/g, " ").replace(/[^A-Z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  if (RENTAL_CITY_ALIASES[key]) return RENTAL_CITY_ALIASES[key];
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
};
const RENTAL_EXTRA_CITIES = [
  "Barnaul", "Blagoveshensk", "Krasnodar", "Niznekamsk", "Nizhniy Novgorod", "Novokuznetsk",
  "Novorossiysk", "Omsk", "Penza", "Perm", "Rostov na Donu", "Ulyanovsk", "Ufa",
];
const RENT_CITY_ORDER = [
  ...DOC.map(d => DOC_RC[d.k]),
  ...RC.filter(c => !Object.values(DOC_RC).includes(c)),
  ...RENTAL_EXTRA_CITIES.filter(c => !RC.includes(c) && !Object.values(DOC_RC).includes(c)),
];
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

/** Till이 From보다 앞서면(예: 01.07~30.06) 운임 validity 패턴(16일~말일)으로 보정 */
const repairValiditySlot = (slot) => {
  const s = normalizeValiditySlot(slot);
  if (s.furtherNotice) return s;
  const fromIso = parseValidityToISO(s.from);
  const tillIso = parseValidityToISO(s.till);
  if (!fromIso || !tillIso || tillIso >= fromIso) return s;
  const [y, mo] = tillIso.split("-");
  const alignedFrom = `${y}-${mo}-16`;
  if (alignedFrom <= tillIso) {
    return { ...s, from: formatValidityDate(alignedFrom, "From") };
  }
  const fromMonthEnd = new Date(Number(fromIso.slice(0, 4)), Number(fromIso.slice(5, 7)), 0);
  const tillFix = `${fromMonthEnd.getFullYear()}-${String(fromMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(fromMonthEnd.getDate()).padStart(2, "0")}`;
  if (tillFix >= fromIso) {
    return { ...s, till: formatValidityDate(tillFix, "Till") };
  }
  return { ...s, till: formatValidityDate(fromIso, "Till") };
};

const normalizeValidityCarrier = (raw) => ({
  current: repairValiditySlot(raw?.current),
  future: repairValiditySlot(raw?.future),
});

const serializeValidityInfo = (validityInfo) => JSON.stringify(
  Object.fromEntries(
    Object.entries(validityInfo || {}).map(([k, v]) => [k, normalizeValidityCarrier(v)]),
  ),
);


export { CARRIER_CALL_PORTS, CN, CN_KR, CRS, DO, DOC, DOC_RC, FR, FURTHER_NOTICE_LABEL, F_TO_R, MONTH_MAP, PM, RATE_TYPES, RC, RC_LABEL, RENTAL_CITY_ALIASES, RENTAL_EXTRA_CITIES, RENTAL_RATE_TYPES, RENT_CITY_ORDER, RN, VALIDITY_KEYS, addDaysToISO, buildDefaultRentalRates, carrierDropValidityKey, compactValidityDatePart, defaultCarrierDropMargins, defaultCarrierDropRates, defaultCarrierRates, defaultRentalMargins, defaultValidityInfo, defaultValiditySlot, formatValidityCompact, formatValidityDate, formatValiditySlotLabel, mergeCarrierDropMargins, mergeCarrierDropRates, mergeRentalRates, n, normalizeRentalCityName, normalizeRentalMargins, normalizeValidityCarrier, normalizeValiditySlot, parseValidityToISO, rentalRateLabel, repairValiditySlot, serializeCarrierDropRatesForSave, serializeValidityInfo, syncFromAfterTill };
