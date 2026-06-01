import { useState, useMemo, useEffect, useRef } from "react";

const SB_URL = "https://mmswsopevmyreoygovpa.supabase.co";
const SB_KEY = "sb_publishable_XaUcvApLXTrJ5lRhte7YXQ_Bqmj_IEq";
const ADMIN_PIN = "0000";

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
const CN = {SNK:"Sinokor",DY:"Dongyoung",CK:"CK Line"};
const DOC = [{k:"mow",l:"Moscow"},{k:"spb",l:"SPB"},{k:"nsb",l:"Novosibirsk"},{k:"ekb",l:"Ekaterinburg"}];
const F_TO_R = Object.fromEntries(Object.entries(PM).map(([rental, freight]) => [freight, rental]));
const DOC_RC = {mow:"Moscow",spb:"St.Petersburg",nsb:"Novosibirsk",ekb:"Ekaterinburg"};
const RC_LABEL = Object.fromEntries(DOC.map(d => [DOC_RC[d.k], d.l]));
const RENT_CITY_ORDER = [...DOC.map(d => DOC_RC[d.k]), ...RC.filter(c => !Object.values(DOC_RC).includes(c))];
const n = v => v != null ? v.toLocaleString() : "—";

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

export default function App() {
  const fData = useMemo(() => FR.map(r => ({area:r[0],pol:r[1],rates:{SNK:{coc20:r[2],coc40:r[3],soc20:r[4],soc40:r[5]},DY:{coc20:r[6],coc40:r[7],soc20:r[8],soc40:r[9]},CK:{coc20:r[10],coc40:r[11],soc20:r[12],soc40:r[13]}}})), []);
  const rData = useMemo(() => RN.map(r => { const r20={},r40={}; RC.forEach((c,i)=>{r20[c]=r[1+i];r40[c]=r[13+i];}); return {pol:r[0],r20,r40}; }), []);
  const areas = useMemo(() => [...new Set(fData.map(d=>d.area))], [fData]);
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
  const [areaM, setAreaM] = useState({});
  const [polM, setPolM] = useState({});
  const [polCostO, setPolCostO] = useState({});
  const [marginTab, setMarginTab] = useState("global");
  const [selArea, setSelArea] = useState("");
  const [selPol, setSelPol] = useState("");
  const [areaEdit, setAreaEdit] = useState({coc20:"",coc40:"",soc20:"",soc40:""});
  const [polEdit, setPolEdit] = useState({coc20:"",coc40:"",soc20:"",soc40:""});
  const [validity, setValidity] = useState({SNK:"June 1-30, 2026", DY:"June 1-30, 2026", CK:"June 1-30, 2026"});
  const [notice, setNotice] = useState("");
  const [noticeOn, setNoticeOn] = useState(false);
  const [showNotice, setShowNotice] = useState(true);
  const [noticeFileUrl, setNoticeFileUrl] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // App state
  const [search, setSearch] = useState("");
  const [areaF, setAreaF] = useState("ALL");
  const [tab, setTab] = useState("ocean");
  const [ctype, setCtype] = useState("coc");
  const [exp, setExp] = useState(null);
  const [cityOpen, setCityOpen] = useState(null);
  const [sc, setSc] = useState(null);

  // Client mgmt
  const [showMgr, setShowMgr] = useState(false);
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
    if (pin === ADMIN_PIN) { setMode("admin"); setShowLoginModal(false); setPin(""); setMargins({coc20:80,coc40:100,soc20:80,soc40:100}); }
    else { setLoginErr("Wrong PIN"); }
  };

  const logout = () => { setMode("guest"); setClient(null); setMargins({coc20:80,coc40:100,soc20:80,soc40:100}); };

  const loadClients = async () => { const d = await api("clients?select=*&order=created_at.desc"); setClients(d); };
  const saveClient = async () => { await api("clients",{method:"POST",body:JSON.stringify(newC)}); setAddForm(false); setNewC({company_name:"",email:"",password_hash:"",margin_coc20:80,margin_coc40:100,margin_soc20:80,margin_soc40:100,notes:""}); loadClients(); };
  const updateMargins = async (id,data) => { await api(`clients?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(data)}); setEditC(null); loadClients(); };
  const toggleClient = async (id,cur) => { await api(`clients?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({is_active:!cur})}); loadClients(); };

  const getM = (pol, area, type) => {
    if (polM[pol]?.[type] != null) return polM[pol][type];
    if (areaM[area]?.[type] != null) return areaM[area][type];
    return margins[type];
  };
  const applyPolMargin = (pol, type, value) => {
    const v = parseInt(value, 10);
    setPolM(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: Number.isFinite(v) ? v : 0 } }));
  };

  const uploadNoticeFile = async (file) => {
    setUploadLoading(true); setUploadMsg("");
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const fname = `notice_${Date.now()}.${ext}`;
      const res = await fetch(`${SB_URL}/storage/v1/object/Notices/${fname}`, {
        method: "POST",
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": file.type, "x-upsert": "true" },
        body: file,
      });
      if (!res.ok) throw new Error(await res.text());
      const url = `${SB_URL}/storage/v1/object/public/Notices/${fname}`;
      setNoticeFileUrl(url);
      setUploadMsg("업로드 완료!");
      setTimeout(() => setUploadMsg(""), 2000);
    } catch(e) { setUploadMsg("업로드 실패: " + e.message); }
    setUploadLoading(false);
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
        saveSetting("notice_text", notice),
        saveSetting("notice_on", noticeOn),
        saveSetting("notice_file_url", noticeFileUrl),
        saveSetting("validity_snk", validity.SNK),
        saveSetting("validity_dy", validity.DY),
        saveSetting("validity_ck", validity.CK),
        saveSetting("global_margins", JSON.stringify(margins)),
        saveSetting("area_margins", JSON.stringify(areaM)),
        saveSetting("pol_margins", JSON.stringify(polM)),
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
      if (s.notice_text !== undefined) setNotice(s.notice_text);
      if (s.notice_on !== undefined) setNoticeOn(s.notice_on === "true");
      if (s.notice_file_url !== undefined) setNoticeFileUrl(s.notice_file_url);
      if (s.validity_snk !== undefined) setValidity(p=>({...p, SNK: s.validity_snk}));
      if (s.validity_dy !== undefined) setValidity(p=>({...p, DY: s.validity_dy}));
      if (s.validity_ck !== undefined) setValidity(p=>({...p, CK: s.validity_ck}));
      if (s.global_margins) { try { setMargins(JSON.parse(s.global_margins)); } catch(e){} }
      if (s.area_margins) { try { setAreaM(JSON.parse(s.area_margins)); } catch(e){} }
      if (s.pol_margins) { try { setPolM(JSON.parse(s.pol_margins)); } catch(e){} }
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
  const getCarrierRate = (row, cr, t) => {
    const ov = polCostO[row.pol]?.carrier?.[cr]?.[t];
    return ov != null ? ov : row.rates[cr][t];
  };
  const applyCarrierRate = (pol, cr, t, value) => {
    const v = parseInt(value, 10);
    if (!Number.isFinite(v)) return;
    setPolCostO(p => ({
      ...p,
      [pol]: {
        ...(p[pol] || {}),
        carrier: { ...(p[pol]?.carrier || {}), [cr]: { ...(p[pol]?.carrier?.[cr] || {}), [t]: v } },
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
  const dropCarrierDetail = (row, cityKey, cr, si) => {
    const t = si === 0 ? "coc20" : "coc40";
    const o = getCarrierRate(row, cr, t);
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
        <div style={{fontSize:14,fontWeight:700,color:"#1d4ed8"}}>{d20.sell!=null?`$${n(d20.sell)}`:"—"}</div>
        {d20.cr&&<Bg k={d20.cr}/>}
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:10,color:"#9ca3af"}}>40'</div>
        <div style={{fontSize:14,fontWeight:700,color:"#1d4ed8"}}>{d40.sell!=null?`$${n(d40.sell)}`:"—"}</div>
        {d40.cr&&<Bg k={d40.cr}/>}
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
                {CRS.map(k=>{ const v20=getCarrierRate(row,k,t20),v40=getCarrierRate(row,k,t40); if(v20==null&&v40==null)return null;
                  const cd20=mkPrice(v20,getM(row.pol,row.area,t20),k);
                  const cd40=mkPrice(v40,getM(row.pol,row.area,t40),k);
                  return (
                    <div key={k} style={{display:"flex",flexWrap:"wrap",alignItems:"flex-start",gap:6,padding:"8px 0",borderBottom:"1px solid #f9fafb"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flex:"1 1 120px",minWidth:0}}>
                        <Bg k={k}/><span style={{fontSize:11,color:"#6b7280"}}>{CN[k]}</span>
                        {validity[k] && <span style={{fontSize:9,fontWeight:600,color:"#16a34a",background:"#dcfce7",padding:"1px 6px",borderRadius:20}}>Valid: {validity[k]}</span>}
                      </div>
                      <AdminPriceCols d20={cd20} d40={cd40} editable
                        onCost20={v=>applyCarrierRate(row.pol,k,t20,v)}
                        onCost40={v=>applyCarrierRate(row.pol,k,t40,v)}/>
                    </div>
                  ); })}
              </div>
            ) : (
            <table style={{width:"100%",marginTop:12,fontSize:12,borderCollapse:"collapse"}}>
              <thead><tr style={{color:"#9ca3af",borderBottom:"1px solid #f3f4f6"}}>
                <th style={{textAlign:"left",padding:"4px 0",fontWeight:500}}>Carrier</th>
                <th style={{textAlign:"right",padding:"4px 0",fontWeight:500}}>20'</th>
                <th style={{textAlign:"right",padding:"4px 0",fontWeight:500}}>40'</th>
              </tr></thead>
              <tbody>
                {CRS.map(k=>{ const v20=row.rates[k][t20],v40=row.rates[k][t40]; if(!v20&&!v40)return null; const b20=bNet(row,t20),b40=bNet(row,t40);
                  return <tr key={k} style={{borderBottom:"1px solid #f9fafb"}}>
                    <td style={{padding:"8px 0"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <Bg k={k}/>
                        <span style={{fontSize:11,color:"#6b7280"}}>{CN[k]}</span>
                        {validity[k] && <span style={{fontSize:9,fontWeight:600,color:"#16a34a",background:"#dcfce7",padding:"1px 6px",borderRadius:20}}>Valid: {validity[k]}</span>}
                      </div>
                    </td>
                    <td style={{textAlign:"right",padding:"8px 0",fontFamily:"monospace",fontWeight:v20===b20.val?700:400,color:v20===b20.val?"#1d4ed8":"#6b7280",cursor:v20?"pointer":"default"}} onClick={()=>v20&&openSC(k,t20,row.pol+" > VVO")}>{v20?n(v20+getM(row.pol,row.area,t20)):"—"}</td>
                    <td style={{textAlign:"right",padding:"8px 0",fontFamily:"monospace",fontWeight:v40===b40.val?700:400,color:v40===b40.val?"#1d4ed8":"#6b7280",cursor:v40?"pointer":"default"}} onClick={()=>v40&&openSC(k,t40,row.pol+" > VVO")}>{v40?n(v40+getM(row.pol,row.area,t40)):"—"}</td>
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

  const [doCityOpen, setDoCityOpen] = useState(null);

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
                const cdC20=dropCarrierDetail(row,k,cr,0),cdC40=dropCarrierDetail(row,k,cr,1);
                return {cr,cdC20,cdC40};
              }).filter(x=>x.cdC20.cost!=null||x.cdC40.cost!=null);
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
                      {carrierRows.length===0
                        ? <div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No service</div>
                        : carrierRows.map(({cr,cdC20,cdC40})=>(
                          <div key={cr} style={{display:"flex",flexWrap:"wrap",alignItems:"flex-start",padding:"7px 12px 7px 20px",borderBottom:"1px solid #e0f2fe",gap:6}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                              <Bg k={cr}/><span style={{fontSize:11,color:"#6b7280"}}>{CN[cr]}</span>
                              {validity[cr] && <span style={{fontSize:9,fontWeight:600,color:"#16a34a",background:"#dcfce7",padding:"1px 6px",borderRadius:20}}>Valid: {validity[cr]}</span>}
                            </div>
                            {isAdmin
                              ? <AdminPriceCols d20={cdC20} d40={cdC40} prefix="" editable
                                  onCost20={v=>{applyCarrierRate(row.pol,cr,"coc20",v);}}
                                  onCost40={v=>{applyCarrierRate(row.pol,cr,"coc40",v);}}/>
                              : <>
                            <div style={{textAlign:"right",marginRight:20,cursor:cdC20.sell?"pointer":"default"}} onClick={()=>cdC20.sell&&openSC(cr,"coc20",row.pol+" > "+l)}>
                              <div style={{fontSize:10,color:"#9ca3af"}}>20'</div>
                              <div style={{fontSize:14,fontWeight:700,color:cdC20.sell?"#0369a1":"#d1d5db",textDecoration:cdC20.sell?"underline":"none"}}>{cdC20.sell?`$${n(cdC20.sell)}`:"—"}</div>
                            </div>
                            <div style={{textAlign:"right",cursor:cdC40.sell?"pointer":"default"}} onClick={()=>cdC40.sell&&openSC(cr,"coc40",row.pol+" > "+l)}>
                              <div style={{fontSize:10,color:"#9ca3af"}}>40'</div>
                              <div style={{fontSize:14,fontWeight:700,color:cdC40.sell?"#0369a1":"#d1d5db",textDecoration:cdC40.sell?"underline":"none"}}>{cdC40.sell?`$${n(cdC40.sell)}`:"—"}</div>
                            </div>
                            </>}
                          </div>
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
                            {validity[c.k] && <span style={{fontSize:9,fontWeight:600,color:"#16a34a",background:"#dcfce7",padding:"1px 6px",borderRadius:20}}>Valid: {validity[c.k]}</span>}
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
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {isAdmin && (
              <button onClick={()=>{setShowMgr(true);loadClients();}} style={{fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:20,background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",cursor:"pointer"}}>Clients</button>
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
          <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{fontSize:10,fontWeight:700,color:"#92400e",marginBottom:8}}>MARGIN (USD)</div>
            {/* Tab selector */}
            <div style={{display:"flex",background:"#fef3c7",borderRadius:8,padding:2,marginBottom:10}}>
              {[["global","전체"],["area","지역별"],["pol","도시별"]].map(([k,l])=>(
                <button key={k} onClick={()=>setMarginTab(k)} style={{flex:1,padding:"6px",fontSize:11,fontWeight:600,borderRadius:6,background:marginTab===k?"#fff":"transparent",border:"none",cursor:"pointer",color:marginTab===k?"#92400e":"#b45309"}}>{l}</button>
              ))}
            </div>

            {/* 전체 마진 */}
            {marginTab==="global" && (
              <div>
                <div style={{fontSize:10,color:"#b45309",marginBottom:6}}>모든 구간에 적용되는 기본 마진</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
                  {["coc20","coc40","soc20","soc40"].map(t=>(
                    <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{t.toUpperCase()}</div>
                      <input type="number" value={margins[t]} onChange={e=>setMargins(p=>({...p,[t]:parseInt(e.target.value)||0}))}
                        style={{width:"100%",padding:"6px 8px",fontSize:13,fontWeight:700,color:"#92400e",background:"#fff",border:"1px solid #fcd34d",borderRadius:6,boxSizing:"border-box"}}/></div>
                  ))}
                </div>
              </div>
            )}

            {/* 지역별 마진 */}
            {marginTab==="area" && (
              <div>
                <div style={{fontSize:10,color:"#b45309",marginBottom:6}}>지역별 마진 (전체 마진보다 우선 적용)</div>
                <select value={selArea} onChange={e=>{setSelArea(e.target.value); const m=areaM[e.target.value]; setAreaEdit(m||{coc20:"",coc40:"",soc20:"",soc40:""}); }}
                  style={{width:"100%",padding:"8px",fontSize:13,border:"1px solid #fcd34d",borderRadius:6,marginBottom:8,background:"#fff"}}>
                  <option value="">-- 지역 선택 --</option>
                  {areas.map(a=><option key={a} value={a}>{a} {areaM[a]?"✅":""}</option>)}
                </select>
                {selArea && <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
                    {["coc20","coc40","soc20","soc40"].map(t=>(
                      <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{t.toUpperCase()}</div>
                        <input type="number" placeholder={String(margins[t])} value={areaEdit[t]} onChange={e=>setAreaEdit(p=>({...p,[t]:e.target.value}))}
                          style={{width:"100%",padding:"6px 8px",fontSize:13,fontWeight:700,color:"#92400e",background:"#fff",border:"1px solid #fcd34d",borderRadius:6,boxSizing:"border-box"}}/></div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{const m={coc20:parseInt(areaEdit.coc20)||margins.coc20,coc40:parseInt(areaEdit.coc40)||margins.coc40,soc20:parseInt(areaEdit.soc20)||margins.soc20,soc40:parseInt(areaEdit.soc40)||margins.soc40}; setAreaM(p=>({...p,[selArea]:m}));}}
                      style={{flex:1,padding:"7px",fontSize:11,fontWeight:700,color:"#fff",background:"#d97706",border:"none",borderRadius:6,cursor:"pointer"}}>적용</button>
                    <button onClick={()=>{setAreaM(p=>{const n={...p};delete n[selArea];return n;});setAreaEdit({coc20:"",coc40:"",soc20:"",soc40:""});}}
                      style={{flex:1,padding:"7px",fontSize:11,color:"#dc2626",background:"#fee2e2",border:"none",borderRadius:6,cursor:"pointer"}}>초기화</button>
                  </div>
                </>}
                {Object.keys(areaM).length>0 && (
                  <div style={{marginTop:8,padding:"8px",background:"#fef3c7",borderRadius:6}}>
                    <div style={{fontSize:10,color:"#92400e",fontWeight:700,marginBottom:4}}>적용된 지역 마진:</div>
                    {Object.entries(areaM).map(([area,m])=>(
                      <div key={area} style={{fontSize:11,color:"#78350f",marginBottom:2}}>
                        <b>{area}</b>: COC {m.coc20}/{m.coc40} SOC {m.soc20}/{m.soc40}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 도시별 마진 */}
            {marginTab==="pol" && (
              <div>
                <div style={{fontSize:10,color:"#b45309",marginBottom:6}}>도시별 마진 (최우선 적용)</div>
                <select value={selPol} onChange={e=>{setSelPol(e.target.value); const m=polM[e.target.value]; setPolEdit(m||{coc20:"",coc40:"",soc20:"",soc40:""});}}
                  style={{width:"100%",padding:"8px",fontSize:13,border:"1px solid #fcd34d",borderRadius:6,marginBottom:8,background:"#fff"}}>
                  <option value="">-- POL 선택 --</option>
                  {fData.map(d=><option key={d.pol} value={d.pol}>{d.pol} {polM[d.pol]?"✅":""}</option>)}
                </select>
                {selPol && <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
                    {["coc20","coc40","soc20","soc40"].map(t=>(
                      <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{t.toUpperCase()}</div>
                        <input type="number" placeholder={String(getM(selPol,fData.find(d=>d.pol===selPol)?.area||"",t))} value={polEdit[t]} onChange={e=>setPolEdit(p=>({...p,[t]:e.target.value}))}
                          style={{width:"100%",padding:"6px 8px",fontSize:13,fontWeight:700,color:"#92400e",background:"#fff",border:"1px solid #fcd34d",borderRadius:6,boxSizing:"border-box"}}/></div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{const area=fData.find(d=>d.pol===selPol)?.area||""; const m={coc20:parseInt(polEdit.coc20)||getM(selPol,area,"coc20"),coc40:parseInt(polEdit.coc40)||getM(selPol,area,"coc40"),soc20:parseInt(polEdit.soc20)||getM(selPol,area,"soc20"),soc40:parseInt(polEdit.soc40)||getM(selPol,area,"soc40")}; setPolM(p=>({...p,[selPol]:m}));}}
                      style={{flex:1,padding:"7px",fontSize:11,fontWeight:700,color:"#fff",background:"#d97706",border:"none",borderRadius:6,cursor:"pointer"}}>적용</button>
                    <button onClick={()=>{setPolM(p=>{const n={...p};delete n[selPol];return n;});setPolEdit({coc20:"",coc40:"",soc20:"",soc40:""});}}
                      style={{flex:1,padding:"7px",fontSize:11,color:"#dc2626",background:"#fee2e2",border:"none",borderRadius:6,cursor:"pointer"}}>초기화</button>
                  </div>
                </>}
                {Object.keys(polM).length>0 && (
                  <div style={{marginTop:8,padding:"8px",background:"#fef3c7",borderRadius:6,maxHeight:120,overflowY:"auto"}}>
                    <div style={{fontSize:10,color:"#92400e",fontWeight:700,marginBottom:4}}>적용된 도시 마진:</div>
                    {Object.entries(polM).map(([pol,m])=>(
                      <div key={pol} style={{fontSize:11,color:"#78350f",marginBottom:2}}>
                        <b>{pol}</b>: COC {m.coc20}/{m.coc40} SOC {m.soc20}/{m.soc40}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={saveAllSettings}
              style={{width:"100%",marginTop:10,padding:"8px",fontSize:11,fontWeight:700,color:"#fff",background:"#d97706",border:"none",borderRadius:6,cursor:"pointer"}}>
              {saveMsg || "💾 전체 설정 저장"}
            </button>
          </div>
          <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{fontSize:10,fontWeight:700,color:"#166534",marginBottom:8}}>VALIDITY (선사별)</div>
            {CRS.map(k=>(
              <div key={k} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <Bg k={k}/>
                <span style={{fontSize:11,color:"#374151",width:60}}>{CN[k]}</span>
                <input value={validity[k]} onChange={e=>setValidity(p=>({...p,[k]:e.target.value}))} placeholder="e.g. June 1-30, 2026"
                  style={{flex:1,padding:"6px 10px",fontSize:12,fontWeight:600,color:"#166534",background:"#fff",border:"1px solid #86efac",borderRadius:6,boxSizing:"border-box"}}/>
              </div>
            ))}
            <button onClick={saveAllSettings}
              style={{width:"100%",marginTop:4,padding:"7px",fontSize:11,fontWeight:700,color:"#fff",background:"#16a34a",border:"none",borderRadius:6,cursor:"pointer"}}>
              {saveMsg || "💾 저장"}
            </button>
          </div>
          <div style={{background:"#faf5ff",border:"1px solid #e9d5ff",borderRadius:10,padding:12,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6b21a8"}}>NOTICE / GRI 공지</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:"#7c3aed"}}>{noticeOn?"ON":"OFF"}</span>
                <div onClick={()=>setNoticeOn(p=>!p)} style={{width:36,height:20,borderRadius:10,background:noticeOn?"#7c3aed":"#d1d5db",cursor:"pointer",position:"relative"}}>
                  <div style={{position:"absolute",top:2,left:noticeOn?18:2,width:16,height:16,borderRadius:8,background:"#fff",transition:"left 0.2s"}}/>
                </div>
              </div>
            </div>
            <textarea value={notice} onChange={e=>setNotice(e.target.value)} placeholder="공지 텍스트 입력 (선사 GRI, 스케줄 변경 등)"
              style={{width:"100%",padding:"8px 12px",fontSize:13,color:"#4c1d95",background:"#fff",border:"1px solid #c4b5fd",borderRadius:6,boxSizing:"border-box",minHeight:80,resize:"vertical",fontFamily:"inherit",marginBottom:8}}/>
            <div style={{fontSize:10,fontWeight:700,color:"#6b21a8",marginBottom:6}}>공문 파일 첨부 (PDF / 이미지)</div>
            <label
              onDragOver={e=>{e.preventDefault();setDragOver(true);}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)uploadNoticeFile(f);}}
              style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:"16px 12px",background:dragOver?"#ede9fe":"#fff",border:`2px dashed ${dragOver?"#7c3aed":"#c4b5fd"}`,borderRadius:8,cursor:"pointer",transition:"all 0.2s"}}>
              <span style={{fontSize:24}}>📎</span>
              <span style={{fontSize:12,color:"#7c3aed",fontWeight:600}}>{uploadLoading?"업로드 중...":"파일 선택 또는 드래그 앤 드롭"}</span>
              <span style={{fontSize:11,color:"#a78bfa"}}>PDF, JPG, PNG 지원</span>
              <input type="file" accept=".pdf,image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&uploadNoticeFile(e.target.files[0])} disabled={uploadLoading}/>
            </label>
            {uploadMsg && <div style={{fontSize:11,marginTop:6,color:uploadMsg.includes("완료")?"#16a34a":"#dc2626"}}>{uploadMsg}</div>}
            {noticeFileUrl && (
              <div style={{marginTop:8,padding:"8px 10px",background:"#fff",border:"1px solid #c4b5fd",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:11,color:"#7c3aed",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"80%"}}>✅ {noticeFileUrl.split("/").pop()}</span>
                <button onClick={()=>setNoticeFileUrl("")} style={{fontSize:11,color:"#dc2626",background:"none",border:"none",cursor:"pointer",flexShrink:0}}>삭제</button>
              </div>
            )}
            <button onClick={saveAllSettings}
              style={{width:"100%",marginTop:10,padding:"9px",fontSize:12,fontWeight:700,color:"#fff",background:"#7c3aed",border:"none",borderRadius:8,cursor:"pointer"}}>
              {saveMsg || "💾 설정 저장"}
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

      {/* NOTICE POPUP */}
      {noticeOn && (notice || noticeFileUrl) && showNotice && (
        <div style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:480,maxHeight:"85vh",boxShadow:"0 20px 60px rgba(0,0,0,0.25)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{background:"#1D2B4F",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18}}>📢</span>
                <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>Notice</span>
              </div>
              <button onClick={()=>setShowNotice(false)} style={{color:"#9ca3af",background:"none",border:"none",cursor:"pointer",fontSize:20,lineHeight:1}}>✕</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
              {notice && <div style={{fontSize:13,color:"#374151",lineHeight:1.8,whiteSpace:"pre-wrap",marginBottom:noticeFileUrl?16:0}}>{notice}</div>}
              {noticeFileUrl && (() => {
                const ext = noticeFileUrl.split(".").pop().toLowerCase();
                if (ext==="pdf") return (
                  <div style={{width:"100%",borderRadius:8,overflow:"hidden",border:"1px solid #e5e7eb"}}>
                    <iframe src={noticeFileUrl} style={{width:"100%",height:400,border:"none"}} title="notice"/>
                  </div>
                );
                return <img src={noticeFileUrl} alt="notice" style={{width:"100%",borderRadius:8,border:"1px solid #e5e7eb"}}/>;
              })()}
            </div>
            <div style={{padding:"12px 20px",borderTop:"1px solid #f3f4f6",flexShrink:0}}>
              <button onClick={()=>setShowNotice(false)}
                style={{width:"100%",padding:"11px",fontSize:13,fontWeight:600,color:"#fff",background:"#1D2B4F",border:"none",borderRadius:10,cursor:"pointer"}}>
                확인
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
