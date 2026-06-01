import { useState, useMemo } from "react";

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
const CN = {SNK:"Janggeum",DY:"Dongyoung",CK:"Cheonkyung"};
const DOC = [{k:"mow",l:"Moscow"},{k:"spb",l:"SPB"},{k:"nsb",l:"Novosibirsk"},{k:"ekb",l:"Ekaterinburg"}];
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

const TabIconOcean = ({color}) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 17h18"/><path d="M5 17l1.5-6.5h11L19 17"/><path d="M12 11V7"/><path d="M9.5 7 12 4l2.5 3"/>
  </svg>
);
const TabIconDropoff = ({color}) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 13.5 3.2 9h4.3l.9 4.5H2z"/><path d="M5.5 9V7.2L7 6v3"/><path d="M9.5 12h2.5"/><path d="M12 12v-1l1 1-1 1"/><path d="M15.5 12.5H20l1.2 2v2.5H14v-5z"/><path d="M20.5 14.5H22l1-1.8V11h-2.5l-.5 3.5"/><circle cx="16" cy="17" r="1" fill={color} stroke="none"/><circle cx="21" cy="17" r="1" fill={color} stroke="none"/>
  </svg>
);
const TabIconRental = ({color}) => (
  <svg width="20" height="13" viewBox="0 0 36 22" fill="none" aria-hidden>
    <rect x="1" y="4" width="34" height="16" rx="1" fill={color} opacity="0.12" stroke={color} strokeWidth="1.5"/>
    <line x1="1" y1="4" x2="1" y2="20" stroke={color} strokeWidth="2"/><line x1="35" y1="4" x2="35" y2="20" stroke={color} strokeWidth="2"/>
    <line x1="8" y1="4" x2="8" y2="20" stroke={color} strokeWidth="1"/><line x1="15" y1="4" x2="15" y2="20" stroke={color} strokeWidth="1"/>
    <line x1="22" y1="4" x2="22" y2="20" stroke={color} strokeWidth="1"/><line x1="29" y1="4" x2="29" y2="20" stroke={color} strokeWidth="1"/>
    <rect x="1" y="4" width="34" height="3" fill={color} opacity="0.28"/><circle cx="4" cy="21" r="1.5" fill={color}/><circle cx="32" cy="21" r="1.5" fill={color}/>
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

  const bNet = (row,t) => { let b=null,cr=null; CRS.forEach(k=>{const v=row.rates[k][t]; if(v!=null&&(b===null||v<b)){b=v;cr=k;}}); return {val:b,cr}; };
  const bDO = (row,city,si) => { const t=si===0?"coc20":"coc40"; let b=null,cr=null; CRS.forEach(k=>{const o=row.rates[k][t],d=DO[city]?.[k]; if(o!=null&&d){const tot=o+d[si]; if(b===null||tot<b){b=tot;cr=k;}}}); return {val:b,cr}; };
  const cRent = (rPol,city,rRow) => { const fp=PM[rPol]; if(!fp||!fMap[fp])return []; const fr=fMap[fp]; return CRS.map(k=>{const s20=fr.rates[k].soc20,s40=fr.rates[k].soc40; const e20=s20!=null?s20+margins.soc20:null,e40=s40!=null?s40+margins.soc40:null; const r20=rRow.r20[city],r40=rRow.r40[city]; return {k,t20:e20!=null&&r20!=null?e20+r20:null,t40:e40!=null&&r40!=null?e40+r40:null};}).filter(x=>x.t20!=null||x.t40!=null); };
  const bRent = (rPol,city,rRow,si) => { const all=cRent(rPol,city,rRow); let b=null,cr=null; all.forEach(x=>{const v=si===0?x.t20:x.t40; if(v!=null&&(b===null||v<b)){b=v;cr=x.k;}}); return {val:b,cr}; };
  const openSC = (k,type,route) => setSc({sc:`${k}-${type.includes("coc")?"COC":"SOC"}-123456`,k,route,size:type.includes("20")?"20'":"40'"});
  const copySC = () => { try{const t=document.createElement("textarea");t.value=sc.sc;t.style.cssText="position:fixed;left:-9999px";document.body.appendChild(t);t.select();document.execCommand("copy");document.body.removeChild(t);}catch(e){} setSc({...sc,copied:true}); setTimeout(()=>setSc(null),1500); };

  const filt = useMemo(()=>{ let d=fData; if(areaF!=="ALL")d=d.filter(r=>r.area===areaF); if(search)d=d.filter(r=>r.pol.toLowerCase().includes(search.toLowerCase())); return d; },[fData,areaF,search]);
  const rFilt = useMemo(()=>search?rData.filter(r=>r.pol.toLowerCase().includes(search.toLowerCase())):rData,[rData,search]);

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

  // ── CARDS ──
  const OCard = ({row,idx}) => {
    const types = ctype==="coc"?["coc20","coc40"]:["soc20","soc40"];
    const open = exp===`o${idx}`;
    return (
      <div style={{border:"1px solid #e5e7eb",borderRadius:10,marginBottom:8,background:"#fff",overflow:"hidden"}}>
        <button onClick={()=>setExp(open?null:`o${idx}`)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
            <span style={{fontSize:10,color:"#9ca3af",background:"#f3f4f6",padding:"2px 8px",borderRadius:4,flexShrink:0}}>{row.area}</span>
            <span style={{fontSize:14,fontWeight:600,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.pol}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            {types.map(t=>{ const b=bNet(row,t); const sell=b.val!=null?b.val+margins[t]:null; const show=isAdmin?b.val:sell;
              return <div key={t} style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:"#9ca3af"}}>{t.includes("20")?"20'":"40'"}</div>
                <div style={{fontSize:14,fontWeight:700,color:isAdmin?"#374151":"#1d4ed8"}}>{show!=null?`$${n(show)}`:"—"}</div>
                <Bg k={b.cr}/>
              </div>; })}
            <span style={{fontSize:14,color:"#9ca3af",transform:open?"rotate(180deg)":"none",display:"inline-block"}}>&#8964;</span>
          </div>
        </button>
        {open && (
          <div style={{padding:"0 16px 16px",borderTop:"1px solid #f3f4f6"}}>
            <table style={{width:"100%",marginTop:12,fontSize:12,borderCollapse:"collapse"}}>
              <thead><tr style={{color:"#9ca3af",borderBottom:"1px solid #f3f4f6"}}>
                <th style={{textAlign:"left",padding:"4px 0",fontWeight:500}}>Carrier</th>
                <th style={{textAlign:"right",padding:"4px 0",fontWeight:500}}>20'</th>
                <th style={{textAlign:"right",padding:"4px 0",fontWeight:500}}>40'</th>
              </tr></thead>
              <tbody>
                {CRS.map(k=>{ const t20=ctype==="coc"?"coc20":"soc20",t40=ctype==="coc"?"coc40":"soc40"; const v20=row.rates[k][t20],v40=row.rates[k][t40]; if(!v20&&!v40)return null; const b20=bNet(row,t20),b40=bNet(row,t40);
                  return <tr key={k} style={{borderBottom:"1px solid #f9fafb"}}>
                    <td style={{padding:"8px 0"}}><Bg k={k}/><span style={{fontSize:11,color:"#6b7280",marginLeft:4}}>{CN[k]}</span></td>
                    <td style={{textAlign:"right",padding:"8px 0",fontFamily:"monospace",fontWeight:v20===b20.val?700:400,color:v20===b20.val?"#1d4ed8":"#6b7280",cursor:v20?"pointer":"default"}} onClick={()=>v20&&openSC(k,t20,row.pol+" > VVO")}>{isAdmin?n(v20):(v20?n(v20+margins[t20]):"—")}</td>
                    <td style={{textAlign:"right",padding:"8px 0",fontFamily:"monospace",fontWeight:v40===b40.val?700:400,color:v40===b40.val?"#1d4ed8":"#6b7280",cursor:v40?"pointer":"default"}} onClick={()=>v40&&openSC(k,t40,row.pol+" > VVO")}>{isAdmin?n(v40):(v40?n(v40+margins[t40]):"—")}</td>
                  </tr>; })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const DOCrd = ({row,idx}) => {
    const open = exp===`d${idx}`;
    const b20=bDO(row,"mow",0),b40=bDO(row,"mow",1);
    return (
      <div style={{border:"1px solid #e5e7eb",borderRadius:10,marginBottom:8,background:"#fff",overflow:"hidden"}}>
        <button onClick={()=>setExp(open?null:`d${idx}`)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
            <span style={{fontSize:10,color:"#9ca3af",background:"#f3f4f6",padding:"2px 8px",borderRadius:4,flexShrink:0}}>{row.area}</span>
            <span style={{fontSize:14,fontWeight:600,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.pol}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            {b20.val&&<><div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#9ca3af"}}>MOW 20'</div><div style={{fontSize:14,fontWeight:700,color:"#111"}}>${n(b20.val)}</div><Bg k={b20.cr}/></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#9ca3af"}}>40'</div><div style={{fontSize:14,fontWeight:700,color:"#111"}}>${n(b40.val)}</div><Bg k={b40.cr}/></div></>}
            <span style={{fontSize:14,color:"#9ca3af",transform:open?"rotate(180deg)":"none",display:"inline-block"}}>&#8964;</span>
          </div>
        </button>
        {open && (
          <div style={{padding:"0 16px 16px",borderTop:"1px solid #f3f4f6"}}>
            <table style={{width:"100%",marginTop:12,fontSize:12,borderCollapse:"collapse"}}>
              <thead><tr style={{color:"#9ca3af",borderBottom:"1px solid #f3f4f6"}}>
                <th style={{textAlign:"left",fontWeight:500,padding:"4px 0"}}>City</th>
                <th style={{textAlign:"right",fontWeight:500,padding:"4px 0"}}>20'</th><th style={{width:36,textAlign:"center",fontWeight:500,padding:"4px 0"}}>Cr</th>
                <th style={{textAlign:"right",fontWeight:500,padding:"4px 0"}}>40'</th><th style={{width:36,textAlign:"center",fontWeight:500,padding:"4px 0"}}>Cr</th>
              </tr></thead>
              <tbody>
                {DOC.map(({k,l})=>{ const c20=bDO(row,k,0),c40=bDO(row,k,1);
                  return <tr key={k} style={{borderBottom:"1px solid #f9fafb"}}>
                    <td style={{padding:"10px 0",fontWeight:600,color:"#374151"}}>{l}</td>
                    {c20.val?<><td style={{textAlign:"right",padding:"10px 0",fontFamily:"monospace",fontWeight:700,color:"#111",cursor:"pointer"}} onClick={()=>openSC(c20.cr,"coc20",row.pol+" > "+l)}>${n(c20.val)}</td><td style={{textAlign:"center",padding:"10px 0"}}><Bg k={c20.cr}/></td></>:<><td style={{textAlign:"right",color:"#d1d5db"}}>—</td><td/></>}
                    {c40.val?<><td style={{textAlign:"right",padding:"10px 0",fontFamily:"monospace",fontWeight:700,color:"#111",cursor:"pointer"}} onClick={()=>openSC(c40.cr,"coc40",row.pol+" > "+l)}>${n(c40.val)}</td><td style={{textAlign:"center",padding:"10px 0"}}><Bg k={c40.cr}/></td></>:<><td style={{textAlign:"right",color:"#d1d5db"}}>—</td><td/></>}
                  </tr>; })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const RCrd = ({row,idx}) => {
    const open = exp===`r${idx}`;
    const m20=bRent(row.pol,"Moscow",row,0),m40=bRent(row.pol,"Moscow",row,1);
    return (
      <div style={{border:"1px solid #e5e7eb",borderRadius:10,marginBottom:8,background:"#fff",overflow:"hidden"}}>
        <button onClick={()=>{setExp(open?null:`r${idx}`);setCityOpen(null);}} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
          <span style={{fontSize:14,fontWeight:600,color:"#111"}}>{row.pol}</span>
          <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#9ca3af"}}>MOW 20'</div><div style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>{m20.val?`$${n(m20.val)}`:`$${n(row.r20["Moscow"])}`}</div>{m20.cr&&<Bg k={m20.cr}/>}</div>
            <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#9ca3af"}}>40'</div><div style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>{m40.val?`$${n(m40.val)}`:`$${n(row.r40["Moscow"])}`}</div>{m40.cr&&<Bg k={m40.cr}/>}</div>
            <span style={{fontSize:14,color:"#9ca3af",transform:open?"rotate(180deg)":"none",display:"inline-block"}}>&#8964;</span>
          </div>
        </button>
        {open && (
          <div style={{borderTop:"1px solid #f3f4f6",paddingBottom:8}}>
            <div style={{padding:"12px 16px 4px",fontSize:11,fontWeight:700,color:"#6b7280"}}>SOC + Rental by Return City</div>
            {RC.map(city=>{
              const b20=bRent(row.pol,city,row,0),b40=bRent(row.pol,city,row,1);
              const key=`${idx}-${city}`,cOpen=cityOpen===key;
              const carriers=cOpen?cRent(row.pol,city,row):[];
              return (
                <div key={city}>
                  <button onClick={()=>setCityOpen(cOpen?null:key)} style={{width:"100%",display:"flex",alignItems:"center",padding:"10px 16px",background:cOpen?"#faf5ff":"none",border:"none",borderBottom:"1px solid #f9fafb",cursor:"pointer",textAlign:"left"}}>
                    <span style={{flex:1,fontSize:12,fontWeight:600,color:"#374151"}}>{city}</span>
                    <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
                      <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#9ca3af"}}>20'</div><div style={{fontSize:14,fontWeight:700,color:"#111"}}>{b20.val?`$${n(b20.val)}`:"—"}</div>{b20.val&&<div style={{fontSize:9,color:"#9ca3af"}}>Rental ${n(row.r20[city])}</div>}{b20.cr&&<Bg k={b20.cr}/>}</div>
                      <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#9ca3af"}}>40'</div><div style={{fontSize:14,fontWeight:700,color:"#111"}}>{b40.val?`$${n(b40.val)}`:"—"}</div>{b40.val&&<div style={{fontSize:9,color:"#9ca3af"}}>Rental ${n(row.r40[city])}</div>}{b40.cr&&<Bg k={b40.cr}/>}</div>
                      <span style={{fontSize:12,color:"#9ca3af",transform:cOpen?"rotate(180deg)":"none",display:"inline-block"}}>&#8964;</span>
                    </div>
                  </button>
                  {cOpen && (
                    <div style={{background:"#faf5ff",borderBottom:"1px solid #ede9fe"}}>
                      {carriers.length===0?<div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No SOC data</div>
                        :carriers.map(c=>(
                        <div key={c.k} style={{display:"flex",alignItems:"center",padding:"10px 24px",borderBottom:"1px solid #ede9fe"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}><Bg k={c.k}/><span style={{fontSize:11,color:"#6b7280"}}>{CN[c.k]}</span></div>
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
          <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:12}}>
            <div style={{fontSize:10,fontWeight:700,color:"#92400e",marginBottom:8}}>MARGIN (USD) — Admin</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
              {["coc20","coc40","soc20","soc40"].map(t=>(
                <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{t.toUpperCase()}</div>
                  <input type="number" value={margins[t]} onChange={e=>setMargins(p=>({...p,[t]:parseInt(e.target.value)||0}))}
                    style={{width:"100%",padding:"6px 8px",fontSize:13,fontWeight:700,color:"#92400e",background:"#fff",border:"1px solid #fcd34d",borderRadius:6,boxSizing:"border-box"}}/></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SEARCH + FILTERS */}
      <div style={{maxWidth:640,margin:"12px auto 0",padding:"0 16px 8px"}}>
        <input placeholder="Search POL..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{width:"100%",padding:"10px 16px",fontSize:14,border:"1px solid #e5e7eb",borderRadius:10,outline:"none",background:"#fff",boxSizing:"border-box"}}/>
        {tab!=="rental" && (
          <div style={{display:"flex",gap:6,marginTop:8,overflowX:"auto",paddingBottom:4}}>
            {["ALL",...areas].map(a=>(
              <button key={a} onClick={()=>setAreaF(a)} style={{fontSize:11,fontWeight:500,padding:"6px 12px",borderRadius:20,whiteSpace:"nowrap",background:a===areaF?"#111":"#fff",color:a===areaF?"#fff":"#6b7280",border:`1px solid ${a===areaF?"#111":"#e5e7eb"}`,cursor:"pointer"}}>
                {a==="ALL"?"All":a}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TABS */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"0 16px"}}>
        <div style={{display:"flex",borderBottom:"1px solid #e5e7eb"}}>
          {MAIN_TABS.map(({id,label,Icon})=>{
            const active=tab===id;
            const color=active?"#111":"#9ca3af";
            return (
              <button key={id} onClick={()=>{setTab(id);setExp(null);setCityOpen(null);}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:"10px 4px",fontSize:11,fontWeight:600,background:"none",border:"none",borderBottom:`2px solid ${active?"#111":"transparent"}`,color,cursor:"pointer"}}>
                <Icon color={color}/>
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
        <div style={{fontSize:10,color:"#9ca3af",marginBottom:8}}>{tab==="rental"?`${rFilt.length} origins`:`${filt.length} routes`}</div>
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
