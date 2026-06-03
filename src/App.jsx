import { useState, useMemo, useEffect, useRef } from "react";

const SB_URL = "https://mmswsopevmyreoygovpa.supabase.co";
const SB_KEY = "sb_publishable_XaUcvApLXTrJ5lRhte7YXQ_Bqmj_IEq";
const ADMIN_PIN = "0000";
const ADMIN_SKIP_PIN = true; // 검토용 — 배포 전 false 로 변경
const NOTICE_COUNT = 3;
const mkNotices = () => Array.from({ length: NOTICE_COUNT }, (_, i) => ({
  text: "",
  on: false,
  fileUrl: "",
  title: `Notice ${i + 1}`,
}));

const parseNoticeOn = (v) => v === true || v === "true";

const api = async (path, opts = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation", ...opts.headers },
    ...opts,
  });
  const t = await r.text();
  return t ? JSON.parse(t) : [];
};

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
  ["N.CHINA","ZHANGJIAGANG",1250,1800,1200,1750,1400,1850,1250,1650,1650,2200,1450,1850],
  ["N.CHINA","TAICANG",null,null,null,null,1450,1950,1350,1800,1650,2200,1450,1850],
  ["N.CHINA","LIANYUNGANG",null,null,null,null,1400,1850,1250,1650,1650,2200,1400,1850],
  ["N.CHINA","YANTAI",null,null,null,null,1350,1800,1250,1650,null,null,null,null],
  ["N.CHINA","CHONGQING",1900,2550,1850,2450,null,null,null,null,null,null,null,null],
  ["S.CHINA","SHEKOU",1350,1800,1300,1650,1450,1900,1350,1750,1470,2000,1420,1950],
  ["S.CHINA","XIAMEN",1350,1800,1300,1650,1450,1900,1350,1750,1470,2000,1420,1850],
  ["S.CHINA","NANSHA",1350,1800,1300,1700,1500,2000,1400,1850,1750,2400,1550,2200],
  ["S.CHINA","HONGKONG",2400,2950,2300,2850,1450,1900,1350,1750,1400,2000,1300,1800],
  ["S.CHINA","SHANTOU",1350,1950,1300,1700,null,null,null,null,1470,2000,1320,1750],
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
  ["VIETNAM","HOCHIMINH",1200,1650,1100,1450,1400,1950,1300,1800,1350,1950,1250,1750],
  ["VIETNAM","HAIPHONG",1200,1750,1100,1550,1400,1950,1300,1800,1350,1950,1250,1750],
  ["VIETNAM","DANANG",2100,2750,2000,2550,1800,2450,1650,2300,null,null,null,null],
  ["TAIWAN","KEELUNG",1500,1950,1400,1750,null,null,null,null,1550,2200,1500,1900],
  ["TAIWAN","KAOHSIUNG",1500,1950,1400,1750,null,null,null,null,null,null,null,null],
  ["THAILAND","BANGKOK",1400,1850,1100,1500,1400,1950,1300,1800,1400,2000,1250,1750],
  ["THAILAND","LAEM CHABANG",1400,1850,1100,1500,1400,1950,1300,1800,1350,1950,1250,1750],
  ["INDONESIA","JAKARTA",1500,1950,1400,1750,null,null,null,null,1550,2300,1550,2300],
  ["INDONESIA","SURABAYA",1500,1950,1400,1750,null,null,null,null,1550,2300,1550,2300],
  ["INDONESIA","SEMARANG",1800,2350,1700,2150,null,null,null,null,1550,2500,1450,2000],
  ["OTHERS","SINGAPORE",1800,2250,1700,2050,null,null,null,null,null,null,null,null],
  ["OTHERS","MANILA",1800,2250,1700,2050,null,null,null,null,null,null,null,null],
  ["OTHERS","MALAYSIA (P.KLANG)",1800,2250,1700,2050,null,null,null,null,null,null,null,null],
  ["OTHERS","CHATTOGRAM",1900,2250,1800,2150,null,null,null,null,null,null,null,null],
  ["OTHERS","INDIA (MUNDRA)",1800,2450,1700,2250,null,null,null,null,null,null,null,null],
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
const PM = {"Shanghai":"SHANGHAI","Ningbo":"NINGBO","Qingdao":"QINGDAO","Tianjin":"TIANJIN","Dalian":"DALIAN","Shenzhen":"SHEKOU","Xiamen":"XIAMEN","Huangpu":"HUANGPU/PRD","Nansha":"NANSHA","Chongqing":"CHONGQING","Keelung":"KEELUNG","Kaohsiung":"KAOHSIUNG","Busan":"BUSAN","Yokohama":"YOKOHAMA","Kobe":"KOBE","Osaka":"OSAKA","Nagoya":"NAGOYA","Ho Chi Minh":"HOCHIMINH","Haiphong":"HAIPHONG","Jakarta":"JAKARTA","Surabaya":"SURABAYA","Laem Chabang":"LAEM CHABANG","Bangkok":"BANGKOK","Port Kelang":"MALAYSIA (P.KLANG)","Mundra":"INDIA (MUNDRA)","Chennai":"INDIA (CHENNAI)"};
const DO = {mow:{SNK:[1100,1400],DY:[800,1400],CK:[950,1300]},spb:{SNK:[700,1000],DY:null,CK:null},nsb:{SNK:[700,1000],DY:[400,600],CK:[400,600]},ekb:{SNK:null,DY:null,CK:[550,800]}};
const CRS = ["SNK","DY","CK"];
const RATE_TYPES = ["coc20","coc40","soc20","soc40"];
const defaultValidityInfo = () => Object.fromEntries(CRS.map(k => [k, {
  current: k === "SNK" ? "Till 15.06.2026" : "Till 30.06.2026",
  future: k === "SNK" ? "From 16.06.2026" : "From 01.07.2026",
}]));
const defaultCarrierRates = () => Object.fromEntries(CRS.map(k => [k, {
  current: { coc20: "", coc40: "", soc20: "", soc40: "" },
  future: { coc20: "", coc40: "", soc20: "", soc40: "" },
}]));
const CN = {SNK:"Sinokor",DY:"Dongyoung",CK:"CK Line"};
const CN_KR = {SNK:"장금상선",DY:"동영해운",CK:"CK Line"};
const DOC = [{k:"mow",l:"Moscow"},{k:"spb",l:"SPB"},{k:"nsb",l:"Novosibirsk"},{k:"ekb",l:"Ekaterinburg"}];
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

const syncFromAfterTill = (current, future) => {
  const tillIso = parseValidityToISO(current);
  if (!tillIso) return future;
  const fromIso = parseValidityToISO(future);
  if (!fromIso || fromIso <= tillIso) {
    return formatValidityDate(addDaysToISO(tillIso, 1), "From");
  }
  return future;
};

const ValidityDateInput = ({ kind, value, onChange, compact, min }) => (
  <input
    type="date"
    className={`validity-date-inp validity-date-${kind}${compact ? " validity-date-compact" : ""}`}
    value={parseValidityToISO(value)}
    min={min || undefined}
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

const Bg = ({k}) => {
  if (!k) return null;
  const styles = {SNK:{background:"#dbeafe",color:"#1d4ed8"},DY:{background:"#d1fae5",color:"#065f46"},CK:{background:"#ffedd5",color:"#9a3412"}};
  return <span style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:4,...styles[k]}}>{k}</span>;
};

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

const pickLatestMargin = (candidates) =>
  candidates.reduce((best, c) => (c.ts > best.ts ? c : best)).value;

const buildLegacyMarginTimestamps = (areaM, polM) => {
  const marginTs = Object.fromEntries(RATE_TYPES.map(t => [t, 1]));
  const areaTs = {};
  Object.entries(areaM || {}).forEach(([area, m]) => {
    areaTs[area] = {};
    RATE_TYPES.forEach(t => { if (m[t] != null) areaTs[area][t] = 2; });
  });
  const polTs = {};
  Object.entries(polM || {}).forEach(([pol, m]) => {
    polTs[pol] = {};
    RATE_TYPES.forEach(t => { if (m[t] != null) polTs[pol][t] = 3; });
  });
  return { marginTs, areaTs, polTs };
};

function MarginPanel({
  onSave, filterHint, saveMsg,
  marginTab, setMarginTab,
  margins, applyGlobalMargin,
  selArea, setSelArea, areaM, applyAreaMarginType, applyAreaMargins,
  selPol, setSelPol, polM, applyPolMargins, clearPolMargins, polEdit, setPolEdit,
  areas, fData, getM,
}) {
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
          <div style={{fontSize:10,color:"#b45309",marginBottom:6}}>모든 구간 기본 마진 · 마지막 수정 기준 우선</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            {RATE_TYPES.map(t=>(
              <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{t.toUpperCase()}</div>
                <input type="number" value={margins[t]} onChange={e=>applyGlobalMargin(t, e.target.value)}
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
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
              {RATE_TYPES.map(t=>(
                <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{t.toUpperCase()}</div>
                  <input type="number" value={areaM[selArea]?.[t] ?? margins[t]} onChange={e=>applyAreaMarginType(selArea, t, e.target.value)}
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
                  <b>{area}</b>: COC {m.coc20 ?? margins.coc20}/{m.coc40 ?? margins.coc40} SOC {m.soc20 ?? margins.soc20}/{m.soc40 ?? margins.soc40}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {marginTab==="pol" && (
        <div>
          <div style={{fontSize:10,color:"#b45309",marginBottom:6}}>도시별 마진 (마지막 수정 기준 · 선택 시 해당 POL만 표시)</div>
          <select value={selPol} onChange={e=>{setSelPol(e.target.value); const m=polM[e.target.value]; setPolEdit(m||{coc20:"",coc40:"",soc20:"",soc40:""});}}
            style={{width:"100%",padding:"8px",fontSize:13,border:"1px solid #fcd34d",borderRadius:6,marginBottom:8,background:"#fff"}}>
            <option value="">-- 전체 POL --</option>
            {fData.map(d=><option key={d.pol} value={d.pol}>{d.area} · {d.pol} {polM[d.pol]?"✅":""}</option>)}
          </select>
          {selPol && <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
              {RATE_TYPES.map(t=>(
                <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{t.toUpperCase()}</div>
                  <input type="number" placeholder={String(getM(selPol,fData.find(d=>d.pol===selPol)?.area||"",t))} value={polEdit[t]} onChange={e=>setPolEdit(p=>({...p,[t]:e.target.value}))}
                    style={marginInpStyle}/></div>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button type="button" onClick={()=>{const area=fData.find(d=>d.pol===selPol)?.area||""; const m={coc20:parseInt(polEdit.coc20)||getM(selPol,area,"coc20"),coc40:parseInt(polEdit.coc40)||getM(selPol,area,"coc40"),soc20:parseInt(polEdit.soc20)||getM(selPol,area,"soc20"),soc40:parseInt(polEdit.soc40)||getM(selPol,area,"soc40")}; applyPolMargins(selPol, m);}}
                style={{flex:1,padding:"7px",fontSize:11,fontWeight:700,color:"#fff",background:"#d97706",border:"none",borderRadius:6,cursor:"pointer"}}>적용</button>
              <button type="button" onClick={()=>{clearPolMargins(selPol); setPolEdit({coc20:"",coc40:"",soc20:"",soc40:""});}}
                style={{flex:1,padding:"7px",fontSize:11,color:"#dc2626",background:"#fee2e2",border:"none",borderRadius:6,cursor:"pointer"}}>초기화</button>
            </div>
          </>}
        </div>
      )}
      <button type="button" onClick={onSave}
        style={{width:"100%",marginTop:10,padding:"8px",fontSize:11,fontWeight:700,color:"#fff",background:"#d97706",border:"none",borderRadius:6,cursor:"pointer"}}>
        {saveMsg || "💾 마진·운임 저장"}
      </button>
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

  // Default margins (used for guest + admin)
  const [margins, setMargins] = useState({coc20:80,coc40:100,soc20:80,soc40:100});
  const [marginTs, setMarginTs] = useState(() => Object.fromEntries(RATE_TYPES.map(t => [t, marginNowTs()])));
  const [areaM, setAreaM] = useState({});
  const [areaTs, setAreaTs] = useState({});
  const [polM, setPolM] = useState({});
  const [polTs, setPolTs] = useState({});
  const [polCostO, setPolCostO] = useState({});
  const [marginTab, setMarginTab] = useState("global");
  const [selArea, setSelArea] = useState("");
  const [selPol, setSelPol] = useState("");
  const [polEdit, setPolEdit] = useState({coc20:"",coc40:"",soc20:"",soc40:""});
  const [validityInfo, setValidityInfo] = useState(defaultValidityInfo);
  const [carrierRates, setCarrierRates] = useState(defaultCarrierRates);
  const [ratePeriod, setRatePeriod] = useState("current"); // current | future
  const [notices, setNotices] = useState(mkNotices);
  const [dismissedNotices, setDismissedNotices] = useState(() => new Set());
  const [noticeAdminTab, setNoticeAdminTab] = useState(0);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [dragOverSlot, setDragOverSlot] = useState(null);

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
  const [showCarrierAdmin, setShowCarrierAdmin] = useState(false);
  const [carrierAdminCr, setCarrierAdminCr] = useState("SNK");
  const [carrierAdminPeriod, setCarrierAdminPeriod] = useState("current");
  const [carrierEditCell, setCarrierEditCell] = useState(null);
  const [clients, setClients] = useState([]);
  const [addForm, setAddForm] = useState(false);
  const [editC, setEditC] = useState(null);
  const [newC, setNewC] = useState({company_name:"",email:"",password_hash:"",margin_coc20:80,margin_coc40:100,margin_soc20:80,margin_soc40:100,notes:""});

  const isAdmin = mode === "admin";
  const isClient = mode === "client";
  const isGuest = mode === "guest";

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
      setMargins({coc20:80,coc40:100,soc20:80,soc40:100});
    } else { setLoginErr("Wrong PIN"); }
  };

  const logout = () => { setMode("guest"); setClient(null); setMargins({coc20:80,coc40:100,soc20:80,soc40:100}); };

  const loadClients = async () => { const d = await api("clients?select=*&order=created_at.desc"); setClients(d); };
  const saveClient = async () => { await api("clients",{method:"POST",body:JSON.stringify(newC)}); setAddForm(false); setNewC({company_name:"",email:"",password_hash:"",margin_coc20:80,margin_coc40:100,margin_soc20:80,margin_soc40:100,notes:""}); loadClients(); };
  const updateMargins = async (id,data) => { await api(`clients?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(data)}); setEditC(null); loadClients(); };
  const toggleClient = async (id,cur) => { await api(`clients?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({is_active:!cur})}); loadClients(); };

  const getM = (pol, area, type) => {
    const candidates = [{ value: margins[type], ts: marginTs[type] ?? 0 }];
    if (areaM[area]?.[type] != null) {
      candidates.push({ value: areaM[area][type], ts: areaTs[area]?.[type] ?? 0 });
    }
    if (polM[pol]?.[type] != null) {
      candidates.push({ value: polM[pol][type], ts: polTs[pol]?.[type] ?? 0 });
    }
    return pickLatestMargin(candidates);
  };

  const applyPolMargin = (pol, type, value) => {
    const v = parseInt(value, 10);
    const ts = marginNowTs();
    setPolM(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: Number.isFinite(v) ? v : 0 } }));
    setPolTs(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: ts } }));
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
    const v = parseInt(value, 10) || 0;
    const ts = marginNowTs();
    setMargins(p => ({ ...p, [type]: v }));
    setMarginTs(p => ({ ...p, [type]: ts }));
  };

  const applyAreaMarginType = (area, type, value) => {
    const v = parseInt(value, 10) || 0;
    const ts = marginNowTs();
    setAreaM(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: v } }));
    setAreaTs(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: ts } }));
  };

  const applyAreaMargins = (area, m) => {
    if (m) {
      const ts = marginNowTs();
      setAreaM(p => ({ ...p, [area]: m }));
      setAreaTs(p => ({
        ...p,
        [area]: {
          ...(p[area] || {}),
          ...Object.fromEntries(Object.keys(m).map(t => [t, ts])),
        },
      }));
    } else {
      setAreaM(p => { const n = { ...p }; delete n[area]; return n; });
      setAreaTs(p => { const n = { ...p }; delete n[area]; return n; });
    }
  };

  const updateCarrierValidity = (carrier, field, value) => {
    setValidityInfo(p => {
      const prev = p[carrier] || { current: "", future: "" };
      const next = { ...prev, [field]: value };
      if (field === "current" && value) {
        next.future = syncFromAfterTill(next.current, next.future);
      }
      return { ...p, [carrier]: next };
    });
  };

  const getFromMinDate = (current) => {
    const tillIso = parseValidityToISO(current ?? "");
    return tillIso ? addDaysToISO(tillIso, 1) : undefined;
  };

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
    await Promise.all([
      saveSetting("notices_json", JSON.stringify(notices)),
      saveSetting("notice_text", notices[0].text),
      saveSetting("notice_on", notices[0].on),
      saveSetting("notice_file_url", notices[0].fileUrl),
    ]);
  };

  const saveSetting = async (key, value) => {
    const res = await fetch(`${SB_URL}/rest/v1/settings`, {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ key, value: String(value) }),
    });
    if (!res.ok) throw new Error(await res.text());
  };

  const saveAllSettings = async () => {
    try {
      await Promise.all([
        saveSetting("notices_json", JSON.stringify(notices)),
        saveSetting("notice_text", notices[0].text),
        saveSetting("notice_on", notices[0].on),
        saveSetting("notice_file_url", notices[0].fileUrl),
        saveSetting("validity_info_json", JSON.stringify(validityInfo)),
        saveSetting("carrier_rates_json", JSON.stringify(carrierRates)),
        saveSetting("validity_snk", validityInfo.SNK?.current ?? ""),
        saveSetting("validity_dy", validityInfo.DY?.current ?? ""),
        saveSetting("validity_ck", validityInfo.CK?.current ?? ""),
        saveSetting("global_margins", JSON.stringify(margins)),
        saveSetting("area_margins", JSON.stringify(areaM)),
        saveSetting("pol_margins", JSON.stringify(polM)),
        saveSetting("margin_timestamps", JSON.stringify(marginTs)),
        saveSetting("area_margin_timestamps", JSON.stringify(areaTs)),
        saveSetting("pol_margin_timestamps", JSON.stringify(polTs)),
        saveSetting("pol_costs", JSON.stringify(polCostO)),
      ]);
      setSaveMsg("저장 완료!");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch(e) { setSaveMsg("저장 실패: " + e.message); }
  };

  useEffect(() => {
    api("settings?select=*").then(rows => {
      if (!rows.length) return;
      const s = Object.fromEntries(rows.map(r=>[r.key, r.value]));
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
        } catch(e) {}
      } else if (s.notice_text !== undefined || s.notice_on !== undefined || s.notice_file_url !== undefined) {
        setNotices(prev => prev.map((n, i) => i === 0 ? {
          ...n,
          text: s.notice_text ?? "",
          on: s.notice_on === "true",
          fileUrl: s.notice_file_url ?? "",
        } : n));
      }
      if (s.validity_info_json) {
        try {
          const parsed = JSON.parse(s.validity_info_json);
          if (parsed && typeof parsed === "object") {
            setValidityInfo(Object.fromEntries(
              CRS.map(k => [k, { ...defaultValidityInfo()[k], ...(parsed[k] || {}) }])
            ));
          }
        } catch(e) {}
      } else if (s.validity_snk !== undefined || s.validity_dy !== undefined || s.validity_ck !== undefined) {
        setValidityInfo(prev => ({
          SNK: { ...prev.SNK, current: s.validity_snk ?? prev.SNK.current },
          DY: { ...prev.DY, current: s.validity_dy ?? prev.DY.current },
          CK: { ...prev.CK, current: s.validity_ck ?? prev.CK.current },
        }));
      }
      if (s.carrier_rates_json) {
        try {
          const parsed = JSON.parse(s.carrier_rates_json);
          if (parsed && typeof parsed === "object") {
            setCarrierRates(Object.fromEntries(
              CRS.map(k => [k, {
                current: { ...defaultCarrierRates()[k].current, ...(parsed[k]?.current || {}) },
                future: { ...defaultCarrierRates()[k].future, ...(parsed[k]?.future || {}) },
              }])
            ));
          }
        } catch(e) {}
      }
      let loadedAreaM = {};
      let loadedPolM = {};
      if (s.global_margins) { try { setMargins(JSON.parse(s.global_margins)); } catch(e){} }
      if (s.area_margins) { try { loadedAreaM = JSON.parse(s.area_margins); setAreaM(loadedAreaM); } catch(e){} }
      if (s.pol_margins) { try { loadedPolM = JSON.parse(s.pol_margins); setPolM(loadedPolM); } catch(e){} }
      if (s.margin_timestamps) {
        try { setMarginTs(JSON.parse(s.margin_timestamps)); } catch(e){}
      } else {
        setMarginTs(buildLegacyMarginTimestamps(loadedAreaM, loadedPolM).marginTs);
      }
      if (s.area_margin_timestamps) {
        try { setAreaTs(JSON.parse(s.area_margin_timestamps)); } catch(e){}
      } else {
        setAreaTs(buildLegacyMarginTimestamps(loadedAreaM, loadedPolM).areaTs);
      }
      if (s.pol_margin_timestamps) {
        try { setPolTs(JSON.parse(s.pol_margin_timestamps)); } catch(e){}
      } else {
        setPolTs(buildLegacyMarginTimestamps(loadedAreaM, loadedPolM).polTs);
      }
      if (s.pol_costs) { try { setPolCostO(JSON.parse(s.pol_costs)); } catch(e){} }
    }).catch(()=>{});
  }, []);

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

  const applyCarrierRate = (pol, cr, t, value, period = "current") => {
    const raw = String(value).trim();
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
  const getRentCityCost = (freightPol, rPol, city, rRow, si) => {
    const ov = polCostO[freightPol]?.rent?.[city]?.[sz(si)];
    if (ov != null) return ov;
    const fp = PM[rPol], fr = fp ? fMap[fp] : null;
    const t = si === 0 ? "soc20" : "soc40";
    const rental = si === 0 ? rRow.r20[city] : rRow.r40[city];
    const b = bRent(rPol, city, rRow, si);
    if (!fr || !b.cr) return rental ?? null;
    const soc = getCarrierRate(fr, b.cr, t);
    return soc != null && rental != null ? soc + rental : null;
  };
  const applyRentCityCost = (freightPol, city, si, value) => {
    const v = parseInt(value, 10);
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
      const o = getCarrierRate(row, k, t);
      const d = DO[city]?.[k];
      if (o != null && d) {
        const tot = o + d[si];
        if (b === null || tot < b) { b = tot; cr = k; }
      }
    });
    return { val: b, cr };
  };
  const cRent = (rPol, city, rRow) => {
    const fp = PM[rPol];
    if (!fp || !fMap[fp]) return [];
    const fr = fMap[fp];
    const r20 = rRow.r20[city], r40 = rRow.r40[city];
    return CRS.map(k => {
      const s20 = getCarrierRate(fr, k, "soc20");
      const s40 = getCarrierRate(fr, k, "soc40");
      const m20 = getM(fp, fr.area, "soc20");
      const m40 = getM(fp, fr.area, "soc40");
      const cost20 = s20 != null && r20 != null ? s20 + r20 : null;
      const cost40 = s40 != null && r40 != null ? s40 + r40 : null;
      return {
        k,
        cost20, cost40, m20, m40,
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
    const fp = PM[rPol], fr = fp ? fMap[fp] : null;
    const t = si === 0 ? "soc20" : "soc40";
    const margin = fr ? getM(fp, fr.area, t) : 0;
    const b = bRent(rPol, city, rRow, si);
    const cost = getRentCityCost(fp || rPol, rPol, city, rRow, si);
    return mkPrice(cost, margin, b.cr);
  };
  const oceanDetail = (row, t) => {
    const b = bNet(row, t);
    return mkPrice(b.val, getM(row.pol, row.area, t), b.cr);
  };
  const doDetail = (row, cityKey, si) => {
    const t = si === 0 ? "coc20" : "coc40";
    const b = bDO(row, cityKey, si);
    const cost = getDropCityCost(row, cityKey, si);
    return mkPrice(cost, getM(row.pol, row.area, t), b.cr);
  };
  const dropCarrierDetail = (row, cityKey, cr, si, period = ratePeriod) => {
    const t = si === 0 ? "coc20" : "coc40";
    const o = getCarrierRate(row, cr, t, period);
    const d = DO[cityKey]?.[cr];
    const cost = o != null && d ? o + d[si] : null;
    return mkPrice(cost, getM(row.pol, row.area, t), cr);
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
  const currentNoticePopup = activeNoticeQueue.find(n => !dismissedNotices.has(n.i));
  const dismissCurrentNotice = () => {
    if (currentNoticePopup) setDismissedNotices(prev => new Set([...prev, currentNoticePopup.i]));
  };

  const saveNoticesOnly = async () => {
    try {
      await saveNoticeSettings();
      setSaveMsg("저장 완료!");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch(e) { setSaveMsg("저장 실패: " + e.message); }
  };

  const saveCarrierPricing = async () => {
    try {
      await Promise.all([
        saveSetting("carrier_rates_json", JSON.stringify(carrierRates)),
        saveSetting("pol_costs", JSON.stringify(polCostO)),
        saveSetting("pol_margins", JSON.stringify(polM)),
        saveSetting("global_margins", JSON.stringify(margins)),
        saveSetting("area_margins", JSON.stringify(areaM)),
        saveSetting("margin_timestamps", JSON.stringify(marginTs)),
        saveSetting("area_margin_timestamps", JSON.stringify(areaTs)),
        saveSetting("pol_margin_timestamps", JSON.stringify(polTs)),
        saveSetting("validity_info_json", JSON.stringify(validityInfo)),
      ]);
      setSaveMsg("저장 완료!");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch(e) { setSaveMsg("저장 실패: " + e.message); }
  };

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

  // ── NOTICE ADMIN ──
  if (showNoticeAdmin && isAdmin) {
    const slot = noticeAdminTab;
    const cur = notices[slot];
    return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
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
          <button type="button" onClick={saveNoticesOnly}
            style={{width:"100%",marginTop:16,padding:"12px",fontSize:13,fontWeight:700,color:"#fff",background:"#7c3aed",border:"none",borderRadius:8,cursor:"pointer"}}>
            {saveMsg || "💾 공지 3개 모두 저장"}
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
    <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:10,color:"#9ca3af"}}>{prefix?`${prefix} 20'`:"20'"}</div>
        <div style={{fontSize:14,fontWeight:700,color:ratePeriod==="future"?"#b45309":"#1d4ed8"}}>{d20.sell!=null?`$${n(d20.sell)}`:"—"}</div>
        {d20.cr&&<Bg k={d20.cr}/>}
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:10,color:"#9ca3af"}}>40'</div>
        <div style={{fontSize:14,fontWeight:700,color:ratePeriod==="future"?"#b45309":"#1d4ed8"}}>{d40.sell!=null?`$${n(d40.sell)}`:"—"}</div>
        {d40.cr&&<Bg k={d40.cr}/>}
      </div>
    </div>
  );

  const getValidityLabel = (cr) => {
    const info = validityInfo[cr];
    if (!info) return "";
    return ratePeriod === "future" ? (info.future || "") : (info.current || "");
  };

  const ValidityCell = ({carrierKey, compact}) => {
    const label = getValidityLabel(carrierKey);
    if (!label) return <span style={{fontSize:10,color:"#d1d5db"}}>—</span>;
    const isFuture = ratePeriod === "future";
    return (
      <span style={{
        fontSize: compact ? 9 : 10,
        fontWeight: 600,
        color: isFuture ? "#b45309" : "#166534",
        background: isFuture ? "#fffbeb" : "#f0fdf4",
        border: `1px solid ${isFuture ? "#fde68a" : "#bbf7d0"}`,
        padding: compact ? "1px 6px" : "2px 8px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        display: "inline-block",
      }}>{label}</span>
    );
  };

  const RatePeriodToggle = ({accentFuture}) => (
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
      <span style={{fontSize:10,color:ratePeriod==="future"?(accentFuture||"#b45309"):"#9ca3af"}}>
        {ratePeriod==="current" ? "Validity: Till 날짜 기준" : "Validity: From 날짜 기준"}
      </span>
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

  // ── CARRIER RATES ADMIN ──
  if (showCarrierAdmin && isAdmin) {
    const caPeriod = carrierAdminPeriod;
    const caCr = carrierAdminCr;
    const isFuture = caPeriod === "future";
    const applyCellSell = (row, type, sellStr) => {
      const sell = parseInt(sellStr, 10);
      if (!Number.isFinite(sell)) return;
      const cost = getCarrierRate(row, caCr, type, caPeriod);
      if (cost == null) return;
      applyPolMargin(row.pol, type, sell - cost);
    };
    const filteredCarrierAreaGroups = carrierAreaGroups
      .filter(({ area }) => !(marginTab === "area" && selArea) || area === selArea)
      .map(({ area, rows }) => ({
        area,
        rows: marginTab === "pol" && selPol ? rows.filter(r => r.pol === selPol) : rows,
      }))
      .filter(({ rows }) => rows.length > 0);
    const gridPolCount = filteredCarrierAreaGroups.reduce((n, g) => n + g.rows.length, 0);
    const gridFilterLabel = marginTab === "area" && selArea
      ? `${selArea} · ${gridPolCount}개 POL`
      : marginTab === "pol" && selPol
        ? `${selPol} · ${gridPolCount}개 POL`
        : `${gridPolCount}개 POL (전체)`;
    const renderGridCell = (row, type) => {
      const base = row.rates[caCr]?.[type];
      const cost = getCarrierRate(row, caCr, type, caPeriod);
      if (base == null && cost == null) {
        return <td className="cg-cell cg-empty">—</td>;
      }
      const margin = getM(row.pol, row.area, type);
      const sell = cost != null ? cost + margin : null;
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
                  <tr className="cg-mini-margin-tr">
                    <td className="cg-mini-label cg-mini-label-margin">마진</td>
                    <td className="cg-mini-val-margin">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-margin"
                        value={margin} onChange={e => applyPolMargin(row.pol, type, e.target.value)}/>
                    </td>
                  </tr>
                </tbody>
              </table>
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
              <div className="cg-margin-hint"><span className="cg-lbl-margin">마진</span> {n(margin)}</div>
            </button>
          )}
        </td>
      );
    };
    return (
      <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}} onClick={() => setCarrierEditCell(null)}>
        <div style={{position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:30}}>
          <button onClick={()=>setShowCarrierAdmin(false)} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
          <div style={{fontSize:14,fontWeight:700,color:"#1e40af"}}>선사별 운임</div>
          <button type="button" onClick={saveCarrierPricing}
            style={{fontSize:11,fontWeight:700,padding:"6px 12px",borderRadius:8,background:"#2563eb",color:"#fff",border:"none",cursor:"pointer"}}>
            {saveMsg ? saveMsg : "저장"}
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
          <div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3,marginBottom:10}}>
            {[["current","현재 운임"],["future","향후 운임"]].map(([k,l])=>(
              <button key={k} type="button" onClick={()=>{setCarrierAdminPeriod(k);setCarrierEditCell(null);}}
                style={{flex:1,padding:"8px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                  background:carrierAdminPeriod===k?"#fff":"transparent",
                  color:carrierAdminPeriod===k?(k==="future"?"#b45309":"#111"):"#9ca3af"}}>
                {l}
              </button>
            ))}
          </div>
          <MarginPanel
            onSave={saveCarrierPricing}
            saveMsg={saveMsg}
            filterHint={
              marginTab === "area" && selArea ? `운임표: ${selArea} 지역만 표시` :
              marginTab === "pol" && selPol ? `운임표: ${selPol} 만 표시` :
              marginTab === "area" ? "지역 선택 시 해당 지역 운임만 표시" : null
            }
            marginTab={marginTab} setMarginTab={setMarginTab}
            margins={margins} applyGlobalMargin={applyGlobalMargin}
            selArea={selArea} setSelArea={setSelArea}
            areaM={areaM} applyAreaMarginType={applyAreaMarginType} applyAreaMargins={applyAreaMargins}
            selPol={selPol} setSelPol={setSelPol}
            polM={polM} applyPolMargins={applyPolMargins} clearPolMargins={clearPolMargins}
            polEdit={polEdit} setPolEdit={setPolEdit}
            areas={areas} fData={fData} getM={getM}
          />
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10,background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:10}}>
            {CRS.map(k=>(
              <div key={k} style={{opacity:caCr===k?1:0.45}}>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}><Bg k={k}/><span style={{fontSize:10,fontWeight:700}}>{CN_KR[k]}</span></div>
                <div style={{fontSize:9,color:"#166534",marginBottom:2}}>Till</div>
                <ValidityDateInput kind="till" compact value={validityInfo[k]?.current??""}
                  onChange={v=>updateCarrierValidity(k,"current",v)}/>
                <div style={{fontSize:9,color:"#b45309",marginBottom:2,marginTop:4}}>From</div>
                <ValidityDateInput kind="from" compact value={validityInfo[k]?.future??""}
                  min={getFromMinDate(validityInfo[k]?.current)}
                  onChange={v=>updateCarrierValidity(k,"future",v)}/>
              </div>
            ))}
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
        <button onClick={()=>setExp(open?null:`o${idx}`)} className={isAdmin?"admin-card-btn":""} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:isAdmin?"10px 12px":"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",gap:8}}>
          <div className={isAdmin?"admin-card-top":undefined} style={isAdmin?undefined:{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1,width:"100%"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
              <span style={{fontSize:10,color:"#9ca3af",background:"#f3f4f6",padding:"2px 8px",borderRadius:4,flexShrink:0}}>{row.area}</span>
              <span style={{fontSize:14,fontWeight:600,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.pol}</span>
            </div>
            {!isAdmin && <GuestPricePair d20={d20} d40={d40}/>}
            <span style={{fontSize:14,color:"#9ca3af",transform:open?"rotate(180deg)":"none",display:"inline-block",flexShrink:0}}>&#8964;</span>
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
                  const cd20=mkPrice(cv20,getM(row.pol,row.area,t20),k);
                  const cd40=mkPrice(cv40,getM(row.pol,row.area,t40),k);
                  const fd20=mkPrice(fv20,getM(row.pol,row.area,t20),k);
                  const fd40=mkPrice(fv40,getM(row.pol,row.area,t40),k);
                  return (
                    <div key={k} style={{padding:"10px 0",borderBottom:"1px solid #f9fafb"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                        <Bg k={k}/><span style={{fontSize:11,color:"#6b7280",fontWeight:600}}>{CN[k]}</span>
                        <ValidityCell carrierKey={k} compact/>
                      </div>
                      <div style={{fontSize:9,fontWeight:700,color:"#166534",marginBottom:4}}>현재 운임 · {validityInfo[k]?.current||"Till"}</div>
                      <AdminPriceCols d20={cd20} d40={cd40} editable
                        onCost20={v=>applyCarrierRate(row.pol,k,t20,v,"current")}
                        onCost40={v=>applyCarrierRate(row.pol,k,t40,v,"current")}/>
                      <div style={{fontSize:9,fontWeight:700,color:"#b45309",margin:"10px 0 4px"}}>향후 운임 · {validityInfo[k]?.future||"From"}</div>
                      <AdminPriceCols d20={fd20} d40={fd40} editable
                        onCost20={v=>applyCarrierRate(row.pol,k,t20,v,"future")}
                        onCost40={v=>applyCarrierRate(row.pol,k,t40,v,"future")}/>
                    </div>
                  ); })}
              </div>
            ) : (
            <table style={{width:"100%",marginTop:12,fontSize:12,borderCollapse:"collapse"}}>
              <thead><tr style={{color:"#9ca3af",borderBottom:"1px solid #f3f4f6"}}>
                <th style={{textAlign:"left",padding:"4px 0",fontWeight:500}}>Carrier</th>
                <th style={{textAlign:"left",padding:"4px 0",fontWeight:500}}>Validity</th>
                <th style={{textAlign:"right",padding:"4px 0",fontWeight:500}}>20'</th>
                <th style={{textAlign:"right",padding:"4px 0",fontWeight:500}}>40'</th>
              </tr></thead>
              <tbody>
                {CRS.map(k=>{ const v20=getCarrierRate(row,k,t20),v40=getCarrierRate(row,k,t40); if(v20==null&&v40==null)return null; const b20=bNet(row,t20),b40=bNet(row,t40);
                  const priceColor = ratePeriod==="future"?"#b45309":"#1d4ed8";
                  const m20=getM(row.pol,row.area,t20), m40=getM(row.pol,row.area,t40);
                  const s20=v20!=null?v20+m20:null, s40=v40!=null?v40+m40:null;
                  const best20=b20.val!=null?b20.val+m20:null, best40=b40.val!=null?b40.val+m40:null;
                  return <tr key={k} style={{borderBottom:"1px solid #f9fafb"}}>
                    <td style={{padding:"8px 0"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <Bg k={k}/>
                        <span style={{fontSize:11,color:"#6b7280"}}>{CN[k]}</span>
                      </div>
                    </td>
                    <td style={{padding:"8px 4px 8px 0"}}><ValidityCell carrierKey={k}/></td>
                    <td style={{textAlign:"right",padding:"8px 0",fontFamily:"monospace",fontWeight:s20===best20?700:400,color:s20!=null?(s20===best20?priceColor:"#6b7280"):"#d1d5db",cursor:s20?"pointer":"default"}} onClick={()=>s20&&openSC(k,t20,row.pol+" > VVO")}>{s20!=null?n(s20):"—"}</td>
                    <td style={{textAlign:"right",padding:"8px 0",fontFamily:"monospace",fontWeight:s40===best40?700:400,color:s40!=null?(s40===best40?priceColor:"#6b7280"):"#d1d5db",cursor:s40?"pointer":"default"}} onClick={()=>s40&&openSC(k,t40,row.pol+" > VVO")}>{s40!=null?n(s40):"—"}</td>
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
        <button onClick={()=>{setExp(open?null:`d${idx}`);setDoCityOpen(null);}} className={isAdmin?"admin-card-btn":""} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:isAdmin?"10px 12px":"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",gap:8}}>
          <div className={isAdmin?"admin-card-top":undefined} style={isAdmin?undefined:{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1,width:"100%"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
              <span style={{fontSize:10,color:"#9ca3af",background:"#f3f4f6",padding:"2px 8px",borderRadius:4,flexShrink:0}}>{row.area}</span>
              <span style={{fontSize:14,fontWeight:600,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.pol}</span>
            </div>
            {!isAdmin && d20.sell!=null && <GuestPricePair d20={d20} d40={d40} prefix="MOW"/>}
            <span style={{fontSize:14,color:"#9ca3af",transform:open?"rotate(180deg)":"none",display:"inline-block",flexShrink:0}}>&#8964;</span>
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
                      {!isAdmin && carrierRows.length > 0 && (
                        <div style={{display:"grid",gridTemplateColumns:"28% 32% 20% 20%",padding:"6px 12px 0 20px",fontSize:10,color:"#9ca3af",fontWeight:500}}>
                          <span>Carrier</span><span>Validity</span><span style={{textAlign:"right"}}>20'</span><span style={{textAlign:"right"}}>40'</span>
                        </div>
                      )}
                      {carrierRows.length===0
                        ? <div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No service</div>
                        : carrierRows.map(({cr,cdC20,cdC40,fdC20,fdC40})=>(
                          isAdmin ? (
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
                          ) : (
                          <div key={cr} style={{padding:"0 12px 0 20px",borderBottom:"1px solid #e0f2fe"}}>
                            <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                              <tbody>
                                <tr>
                                  <td style={{padding:"8px 0",width:"28%"}}>
                                    <div style={{display:"flex",alignItems:"center",gap:6}}><Bg k={cr}/><span style={{fontSize:11,color:"#6b7280"}}>{CN[cr]}</span></div>
                                  </td>
                                  <td style={{padding:"8px 4px 8px 0",width:"32%"}}><ValidityCell carrierKey={cr}/></td>
                                  <td style={{textAlign:"right",padding:"8px 0",cursor:cdC20.sell?"pointer":"default",width:"20%"}} onClick={()=>cdC20.sell&&openSC(cr,"coc20",row.pol+" > "+l)}>
                                    <div style={{fontSize:10,color:"#9ca3af"}}>20'</div>
                                    <div style={{fontSize:13,fontWeight:700,color:cdC20.sell?(ratePeriod==="future"?"#b45309":"#0369a1"):"#d1d5db",textDecoration:cdC20.sell?"underline":"none"}}>{cdC20.sell?`$${n(cdC20.sell)}`:"—"}</div>
                                  </td>
                                  <td style={{textAlign:"right",padding:"8px 0",cursor:cdC40.sell?"pointer":"default",width:"20%"}} onClick={()=>cdC40.sell&&openSC(cr,"coc40",row.pol+" > "+l)}>
                                    <div style={{fontSize:10,color:"#9ca3af"}}>40'</div>
                                    <div style={{fontSize:13,fontWeight:700,color:cdC40.sell?(ratePeriod==="future"?"#b45309":"#0369a1"):"#d1d5db",textDecoration:cdC40.sell?"underline":"none"}}>{cdC40.sell?`$${n(cdC40.sell)}`:"—"}</div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          )
                        ))}
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
        <button onClick={()=>{setExp(open?null:`r${idx}`);setCityOpen(null);}} className={isAdmin?"admin-card-btn":""} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:isAdmin?"10px 12px":"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",gap:8}}>
          <div className={isAdmin?"admin-card-top":undefined} style={isAdmin?undefined:{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1,width:"100%"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
              <span style={{fontSize:10,color:"#9ca3af",background:"#f3f4f6",padding:"2px 8px",borderRadius:4,flexShrink:0}}>{row.area}</span>
              <span style={{fontSize:14,fontWeight:600,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.displayPol || row.pol}</span>
            </div>
            {!isAdmin && <GuestPricePair d20={d20} d40={d40} prefix="MOW"/>}
            <span style={{fontSize:14,color:"#9ca3af",transform:open?"rotate(180deg)":"none",display:"inline-block",flexShrink:0}}>&#8964;</span>
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
                      {carriers.length===0?<div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No SOC data</div>
                        :carriers.map(c=>{
                        const cdC20=mkPrice(c.cost20,c.m20,c.k);
                        const cdC40=mkPrice(c.cost40,c.m40,c.k);
                        return (
                        <div key={c.k} style={{display:"flex",flexWrap:"wrap",alignItems:"flex-start",padding:"8px 12px 8px 20px",borderBottom:"1px solid #ede9fe",gap:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                            <Bg k={c.k}/>
                            <span style={{fontSize:11,color:"#6b7280"}}>{CN[c.k]}</span>
                            <ValidityCell carrierKey={c.k} compact/>
                          </div>
                          {isAdmin
                            ? <AdminPriceCols d20={cdC20} d40={cdC40} prefix="" editable
                                onCost20={v=>fp&&applyCarrierRate(fp,c.k,"soc20",v)}
                                onCost40={v=>fp&&applyCarrierRate(fp,c.k,"soc40",v)}/>
                            : <>
                          <div style={{textAlign:"right",marginRight:20,cursor:c.t20?"pointer":"default"}} onClick={()=>c.t20&&openSC(c.k,"soc20",row.pol+" > "+city)}>
                            <div style={{fontSize:10,color:"#9ca3af"}}>20'</div>
                            <div style={{fontSize:14,fontWeight:700,color:"#7c3aed",textDecoration:c.t20?"underline":"none"}}>{c.t20?`$${n(c.t20)}`:"—"}</div>
                            {c.t20&&<div style={{fontSize:9,color:"#9ca3af"}}>Rental ${n(row.r20[city])}</div>}
                          </div>
                          <div style={{textAlign:"right",cursor:c.t40?"pointer":"default"}} onClick={()=>c.t40&&openSC(c.k,"soc40",row.pol+" > "+city)}>
                            <div style={{fontSize:10,color:"#9ca3af"}}>40'</div>
                            <div style={{fontSize:14,fontWeight:700,color:"#7c3aed",textDecoration:c.t40?"underline":"none"}}>{c.t40?`$${n(c.t40)}`:"—"}</div>
                            {c.t40&&<div style={{fontSize:9,color:"#9ca3af"}}>Rental ${n(row.r40[city])}</div>}
                          </div>
                          </>}
                        </div>
                      );})}
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
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>

      {/* HEADER */}
      <div style={{position:"sticky",top:0,zIndex:30,background:"#fff",borderBottom:"1px solid #e5e7eb",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
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
                <button onClick={()=>setShowNoticeAdmin(true)} style={{fontSize:11,fontWeight:600,padding:"6px 10px",borderRadius:20,background:"#faf5ff",color:"#7c3aed",border:"1px solid #e9d5ff",cursor:"pointer",whiteSpace:"nowrap"}}>Notice</button>
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

      {/* ADMIN MARGIN PANEL */}
      {isAdmin && (
        <div style={{maxWidth:640,margin:"12px auto 0",padding:"0 16px"}}>
          <button type="button" onClick={()=>setShowCarrierAdmin(true)}
            style={{width:"100%",padding:"12px 14px",marginBottom:10,fontSize:13,fontWeight:700,color:"#fff",background:"#1e40af",border:"none",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            선사별 운임 관리 (매입 · 매출 · 마진)
          </button>
          <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:12,marginBottom:8,fontSize:11,color:"#92400e",lineHeight:1.5}}>
            MARGIN 설정은 <b>선사운임</b> 메뉴에서 관리합니다. 지역/POL 선택 시 운임표가 함께 필터됩니다.
          </div>
          <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{fontSize:10,fontWeight:700,color:"#166534",marginBottom:4}}>VALIDITY (선사별)</div>
            <div style={{fontSize:9,color:"#6b7280",marginBottom:10}}>Till / From 날짜만 · 매입·매출·마진은 <b>선사운임</b> 메뉴</div>
            {CRS.map(k=>(
              <div key={k} style={{marginBottom:8,padding:10,background:"#fff",border:"1px solid #bbf7d0",borderRadius:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <Bg k={k}/><span style={{fontSize:12,fontWeight:700,color:"#374151"}}>{CN[k]}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div>
                    <div style={{fontSize:9,color:"#166534",marginBottom:2}}>Till</div>
                    <ValidityDateInput kind="till" value={validityInfo[k]?.current??""}
                      onChange={v=>updateCarrierValidity(k,"current",v)}/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:"#b45309",marginBottom:2}}>From</div>
                    <ValidityDateInput kind="from" value={validityInfo[k]?.future??""}
                      min={getFromMinDate(validityInfo[k]?.current)}
                      onChange={v=>updateCarrierValidity(k,"future",v)}/>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={saveAllSettings}
              style={{width:"100%",marginTop:4,padding:"7px",fontSize:11,fontWeight:700,color:"#fff",background:"#16a34a",border:"none",borderRadius:6,cursor:"pointer"}}>
              {saveMsg || "💾 저장"}
            </button>
          </div>
        </div>
      )}

      {/* SEARCH + FILTERS */}
      <div style={{maxWidth:640,margin:"12px auto 0",padding:"0 16px 8px"}}>
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

      {/* COC/SOC TOGGLE */}
      {tab==="ocean" && (
        <div style={{maxWidth:640,margin:"10px auto 0",padding:"0 16px"}}>
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
        <div style={{maxWidth:640,margin:"10px auto 0",padding:"0 16px"}}>
          <RatePeriodToggle accentFuture="#0369a1"/>
        </div>
      )}

      {/* CONTENT */}
      <div style={{maxWidth:640,margin:"12px auto",padding:"0 16px 120px"}}>
        <div style={{fontSize:10,color:"#9ca3af",marginBottom:8}}>{`${tab==="rental"?rFilt.length:filt.length} routes`}</div>
        {tab==="ocean" && filt.map((row,i)=><OCard key={i} row={row} idx={i}/>)}
        {tab==="dropoff" && filt.map((row,i)=><DOCrd key={i} row={row} idx={i}/>)}
        {tab==="rental" && rFilt.map((row,i)=><RCrd key={i} row={row} idx={i}/>)}
      </div>

      <div style={{maxWidth:640,margin:"0 auto",padding:16,textAlign:"center"}}>
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
