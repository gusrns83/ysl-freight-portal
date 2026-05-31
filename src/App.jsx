import { useState, useMemo } from "react";

const CARRIERS = { SNK: "장금상선", DY: "동영", CK: "천경" };
const CK_KEYS = ["SNK", "DY", "CK"];
const TYPE_LABELS = { coc20:"COC 20'", coc40:"COC 40'", soc20:"SOC 20'", soc40:"SOC 40'" };
const DO_CITIES = ["mow","spb","nsb","ekb"];
const DO_LABELS = { mow:"Moscow", spb:"SPB", nsb:"Novosibirsk", ekb:"Ekaterinburg" };
const DROPOFF = {
  mow:{ SNK:[1100,1400], DY:[800,1400], CK:[950,1300] },
  spb:{ SNK:[700,1000], DY:null, CK:null },
  nsb:{ SNK:[700,1000], DY:[400,600], CK:[400,600] },
  ekb:{ SNK:null, DY:null, CK:[550,800] },
};
const FREIGHT=[
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
const RENT_CITIES=["Moscow","Chelyabinsk","Novosibirsk","Irkutsk","Krasnoyarsk","Ekaterinburg","Vladivostok","St.Petersburg","Samara","Tolyatti","Kazan","Minsk"];
const RENTAL=[
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
const POL_MAP={
  "Shanghai":"SHANGHAI","Ningbo":"NINGBO","Qingdao":"QINGDAO","Tianjin":"TIANJIN","Dalian":"DALIAN",
  "Shenzhen":"SHEKOU","Xiamen":"XIAMEN","Huangpu":"HUANGPU/PRD","Nansha":"NANSHA",
  "Chongqing":"CHONGQING","Keelung":"KEELUNG","Kaohsiung":"KAOHSIUNG",
  "Busan":"BUSAN","Yokohama":"YOKOHAMA","Kobe":"KOBE","Osaka":"OSAKA","Nagoya":"NAGOYA",
  "Ho Chi Minh":"HOCHIMINH","Haiphong":"HAIPHONG","Jakarta":"JAKARTA","Surabaya":"SURABAYA",
  "Laem Chabang":"LAEM CHABANG","Bangkok":"BANGKOK",
  "Port Kelang":"MALAYSIA (P.KLANG)","Mundra":"INDIA (MUNDRA)","Chennai":"INDIA (CHENNAI)",
};
const $n=v=>v!=null?v.toLocaleString():"—";
const Badge=({k})=>{ if(!k) return null; const c={SNK:"bg-blue-100 text-blue-700",DY:"bg-emerald-100 text-emerald-700",CK:"bg-orange-100 text-orange-700"}; return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c[k]}`}>{k}</span>; };
const PIN="0000";

export default function App(){
  const freight=useMemo(()=>FREIGHT.map(r=>({area:r[0],pol:r[1],rates:{SNK:{coc20:r[2],coc40:r[3],soc20:r[4],soc40:r[5]},DY:{coc20:r[6],coc40:r[7],soc20:r[8],soc40:r[9]},CK:{coc20:r[10],coc40:r[11],soc20:r[12],soc40:r[13]}}})),[]);
  const rental=useMemo(()=>RENTAL.map(r=>{const r20={},r40={};RENT_CITIES.forEach((c,i)=>{r20[c]=r[1+i];r40[c]=r[13+i];});return{pol:r[0],r20,r40};}),[]);
  const areas=useMemo(()=>[...new Set(freight.map(d=>d.area))],[freight]);
  const fByPol=useMemo(()=>Object.fromEntries(freight.map(d=>[d.pol,d])),[freight]);

  const [isAdmin,setIsAdmin]=useState(false);
  const [pinInput,setPinInput]=useState("");
  const [pinModal,setPinModal]=useState(false);
  const [search,setSearch]=useState("");
  const [areaF,setAreaF]=useState("ALL");
  const [tab,setTab]=useState("ocean");
  const [ctype,setCtype]=useState("coc");
  const [margins,setMargins]=useState({coc20:80,coc40:100,soc20:80,soc40:100});
  const [expanded,setExpanded]=useState(null);
  const [cityOpen,setCityOpen]=useState(null);
  const [sc,setSc]=useState(null);

  const bestNet=(row,type)=>{let b=null,cr=null;CK_KEYS.forEach(k=>{const v=row.rates[k][type];if(v!=null&&(b===null||v<b)){b=v;cr=k;}});return{val:b,cr};};
  const bestDO=(row,city,si)=>{const t=si===0?"coc20":"coc40";let b=null,cr=null;CK_KEYS.forEach(k=>{const o=row.rates[k][t],d=DROPOFF[city]?.[k];if(o!=null&&d){const tot=o+d[si];if(b===null||tot<b){b=tot;cr=k;}}});return{val:b,cr};};

  const carrierRentals=(rPol,city,rRow)=>{
    const fp=POL_MAP[rPol]; if(!fp||!fByPol[fp]) return [];
    const fRow=fByPol[fp];
    return CK_KEYS.map(k=>{
      const s20=fRow.rates[k].soc20, s40=fRow.rates[k].soc40;
      const sell20=s20!=null?s20+margins.soc20:null, sell40=s40!=null?s40+margins.soc40:null;
      const r20=rRow.r20[city], r40=rRow.r40[city];
      return{k, t20:sell20!=null&&r20!=null?sell20+r20:null, t40:sell40!=null&&r40!=null?sell40+r40:null};
    }).filter(x=>x.t20!=null||x.t40!=null);
  };
  const bestRental=(rPol,city,rRow,si)=>{
    const all=carrierRentals(rPol,city,rRow); let b=null,cr=null;
    all.forEach(x=>{const v=si===0?x.t20:x.t40;if(v!=null&&(b===null||v<b)){b=v;cr=x.k;}});
    return{val:b,cr};
  };

  const openSC=(k,type,route)=>setSc({sc:`${k}-${type.includes("coc")?"COC":"SOC"}-123456`,k,route,type:type.includes("coc")?"COC":"SOC",size:type.includes("20")?"20'":"40'"});
  const copySC=()=>{
    if(!sc)return;
    try{const t=document.createElement("textarea");t.value=sc.sc;t.style.position="fixed";t.style.left="-9999px";document.body.appendChild(t);t.select();document.execCommand("copy");document.body.removeChild(t);}catch(e){}
    setSc({...sc,copied:true});setTimeout(()=>setSc(null),1500);
  };

  const filtered=useMemo(()=>{let d=freight;if(areaF!=="ALL")d=d.filter(r=>r.area===areaF);if(search)d=d.filter(r=>r.pol.toLowerCase().includes(search.toLowerCase())||r.area.toLowerCase().includes(search.toLowerCase()));return d;},[freight,areaF,search]);
  const filteredRental=useMemo(()=>search?rental.filter(r=>r.pol.toLowerCase().includes(search.toLowerCase())):rental,[rental,search]);

  // ─── Ocean Card ───────────────────────────────────────────────────────────
  const OceanCard=({row,idx})=>{
    const types=ctype==="coc"?["coc20","coc40"]:["soc20","soc40"];
    const open=expanded===`o${idx}`;
    return <div className="border border-gray-200 rounded-lg mb-2 bg-white overflow-hidden" style={{boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
      <button onClick={()=>setExpanded(open?null:`o${idx}`)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded shrink-0">{row.area}</span>
          <span className="font-semibold text-gray-800 text-sm truncate">{row.pol}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {types.map(t=>{const b=bestNet(row,t);const v=b.val!=null?b.val+margins[t]:null;const d=isAdmin?b.val:v;
            return <div key={t} className="text-right">
              <div className="text-[10px] text-gray-400">{t.includes("20")?"20'":"40'"}</div>
              <div className={`text-sm font-bold ${isAdmin?"text-gray-800":"text-blue-700"}`}>{d!=null?`$${$n(d)}`:"—"}</div>
              <div className="mt-0.5"><Badge k={b.cr}/></div>
            </div>;
          })}
          <svg className={`w-4 h-4 text-gray-400 ${open?"rotate-180":""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </div>
      </button>
      {open&&<div className="px-4 pb-4 border-t border-gray-100">
        <table className="w-full mt-3 text-xs"><thead><tr className="text-gray-400 border-b border-gray-100">
          <th className="text-left py-1">Carrier</th><th className="text-right py-1">20'</th><th className="text-right py-1">40'</th>
        </tr></thead><tbody>
          {CK_KEYS.map(k=>{
            const t20=ctype==="coc"?"coc20":"soc20",t40=ctype==="coc"?"coc40":"soc40";
            const v20=row.rates[k][t20],v40=row.rates[k][t40];
            if(!v20&&!v40)return null;
            const b20=bestNet(row,t20),b40=bestNet(row,t40);
            return <tr key={k} className="border-b border-gray-50">
              <td className="py-2"><Badge k={k}/><span className="text-gray-500 ml-1 text-[11px]">{CARRIERS[k]}</span></td>
              <td className={`text-right py-2 font-mono ${v20===b20.val?"font-bold text-blue-700":"text-gray-600"}`} onClick={()=>v20!=null&&openSC(k,t20,row.pol+" → VVO")}>
                <span className={v20!=null?"cursor-pointer underline decoration-dotted underline-offset-2":""}>{isAdmin?$n(v20):(v20!=null?$n(v20+margins[t20]):"—")}</span>
              </td>
              <td className={`text-right py-2 font-mono ${v40===b40.val?"font-bold text-blue-700":"text-gray-600"}`} onClick={()=>v40!=null&&openSC(k,t40,row.pol+" → VVO")}>
                <span className={v40!=null?"cursor-pointer underline decoration-dotted underline-offset-2":""}>{isAdmin?$n(v40):(v40!=null?$n(v40+margins[t40]):"—")}</span>
              </td>
            </tr>;
          })}
        </tbody></table>
        {isAdmin&&<div className="mt-3 pt-3 border-t border-dashed border-gray-200">
          <div className="text-[10px] text-gray-400 mb-1">SELLING</div>
          <div className="flex gap-4">{types.map(t=>{const b=bestNet(row,t);return <div key={t} className="flex items-center gap-1 text-xs">
            <span className="text-gray-400">{t.includes("20")?"20'":"40'"}:</span>
            <span className="font-bold text-red-600">${b.val!=null?$n(b.val+margins[t]):"—"}</span><Badge k={b.cr}/>
          </div>;})}</div>
        </div>}
      </div>}
    </div>;
  };

  // ─── Drop-off Card ────────────────────────────────────────────────────────
  const DOCard=({row,idx})=>{
    const open=expanded===`d${idx}`;
    const b20=bestDO(row,"mow",0),b40=bestDO(row,"mow",1);
    return <div className="border border-gray-200 rounded-lg mb-2 bg-white overflow-hidden" style={{boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
      <button onClick={()=>setExpanded(open?null:`d${idx}`)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded shrink-0">{row.area}</span>
          <span className="font-semibold text-gray-800 text-sm truncate">{row.pol}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {b20.val&&<><div className="text-right">
            <div className="text-[10px] text-gray-400">MOW 20'</div>
            <div className="text-sm font-bold text-gray-800">${$n(b20.val)}</div>
            <div className="mt-0.5"><Badge k={b20.cr}/></div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400">40'</div>
            <div className="text-sm font-bold text-gray-800">${$n(b40.val)}</div>
            <div className="mt-0.5"><Badge k={b40.cr}/></div>
          </div></>}
          <svg className={`w-4 h-4 text-gray-400 shrink-0 ${open?"rotate-180":""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </div>
      </button>
      {open&&<div className="px-4 pb-4 border-t border-gray-100">
        <div className="mt-3 mb-2 text-[11px] font-bold text-gray-600">🚢+🚛 Ocean + Drop off 합산</div>
        <table className="w-full text-xs"><thead><tr className="text-gray-400 border-b border-gray-100">
          <th className="text-left py-1.5">City</th><th className="text-right py-1.5">20'</th>
          <th className="text-center py-1.5 w-9">선사</th><th className="text-right py-1.5">40'</th>
          <th className="text-center py-1.5 w-9">선사</th>
        </tr></thead><tbody>
          {DO_CITIES.map(city=>{
            const c20=bestDO(row,city,0),c40=bestDO(row,city,1);
            return <tr key={city} className="border-b border-gray-50">
              <td className="py-2.5 font-semibold text-gray-700">{DO_LABELS[city]}</td>
              {c20.val?<>
                <td className="text-right py-2.5 font-mono font-bold text-gray-800 cursor-pointer" onClick={()=>openSC(c20.cr,"coc20",row.pol+" → "+DO_LABELS[city])}>
                  <span className="underline decoration-dotted underline-offset-2">${$n(c20.val)}</span></td>
                <td className="text-center py-2.5"><Badge k={c20.cr}/></td>
              </>:<><td className="text-right py-2.5 text-gray-300">—</td><td/></>}
              {c40.val?<>
                <td className="text-right py-2.5 font-mono font-bold text-gray-800 cursor-pointer" onClick={()=>openSC(c40.cr,"coc40",row.pol+" → "+DO_LABELS[city])}>
                  <span className="underline decoration-dotted underline-offset-2">${$n(c40.val)}</span></td>
                <td className="text-center py-2.5"><Badge k={c40.cr}/></td>
              </>:<><td className="text-right py-2.5 text-gray-300">—</td><td/></>}
            </tr>;
          })}
        </tbody></table>
      </div>}
    </div>;
  };

  // ─── Rental Card ──────────────────────────────────────────────────────────
  // 1단계: collapsed → MOW best total + 선사
  // 2단계: city list → best total + 선사 + 렌탈비 작은글씨
  // 3단계: carrier breakdown → 각 선사 total + 렌탈비 작은글씨 + S/C 팝업
  const RentalCard=({row,idx})=>{
    const open=expanded===`r${idx}`;
    // 1단계: MOW 기준
    const mow20=bestRental(row.pol,"Moscow",row,0);
    const mow40=bestRental(row.pol,"Moscow",row,1);
    return <div className="border border-gray-200 rounded-lg mb-2 bg-white overflow-hidden" style={{boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
      {/* ── 1단계: 접힌 상태 (MOW 기준) ── */}
      <button onClick={()=>{setExpanded(open?null:`r${idx}`);setCityOpen(null);}} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="font-semibold text-gray-800 text-sm">{row.pol}</span>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-[10px] text-gray-400">MOW 20'</div>
            <div className="text-sm font-bold text-purple-700">{mow20.val!=null?`$${$n(mow20.val)}`:`$${$n(row.r20["Moscow"])}`}</div>
            {mow20.cr&&<div className="mt-0.5"><Badge k={mow20.cr}/></div>}
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400">40'</div>
            <div className="text-sm font-bold text-purple-700">{mow40.val!=null?`$${$n(mow40.val)}`:`$${$n(row.r40["Moscow"])}`}</div>
            {mow40.cr&&<div className="mt-0.5"><Badge k={mow40.cr}/></div>}
          </div>
          <svg className={`w-4 h-4 text-gray-400 ${open?"rotate-180":""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </div>
      </button>
      {/* ── 2단계: 도시 목록 ── */}
      {open&&<div className="border-t border-gray-100 pb-2">
        <div className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-500">📦 SOC 매출운임 + 렌탈 합산 · 반납지 선택</div>
        {RENT_CITIES.map(city=>{
          const b20=bestRental(row.pol,city,row,0);
          const b40=bestRental(row.pol,city,row,1);
          const key=`${idx}-${city}`;
          const cOpen=cityOpen===key;
          const carriers=cOpen?carrierRentals(row.pol,city,row):[];
          return <div key={city}>
            {/* 도시 행 — best 합산 + 선사 + 렌탈비(작은글씨) */}
            <button onClick={()=>setCityOpen(cOpen?null:key)}
              className={`w-full flex items-center px-4 py-2.5 border-b border-gray-50 text-left transition-colors ${cOpen?"bg-purple-50":""}`}>
              <span className="flex-1 text-[12px] font-semibold text-gray-700">{city}</span>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-[10px] text-gray-400">20'</div>
                  <div className="text-sm font-bold text-gray-800">{b20.val!=null?`$${$n(b20.val)}`:"—"}</div>
                  {b20.val!=null&&<div className="text-[9px] text-gray-400">렌탈 ${$n(row.r20[city])}</div>}
                  {b20.cr&&<div className="mt-0.5"><Badge k={b20.cr}/></div>}
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-400">40'</div>
                  <div className="text-sm font-bold text-gray-800">{b40.val!=null?`$${$n(b40.val)}`:"—"}</div>
                  {b40.val!=null&&<div className="text-[9px] text-gray-400">렌탈 ${$n(row.r40[city])}</div>}
                  {b40.cr&&<div className="mt-0.5"><Badge k={b40.cr}/></div>}
                </div>
                <svg className={`w-3.5 h-3.5 text-gray-400 ${cOpen?"rotate-180":""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </div>
            </button>
            {/* ── 3단계: 선사별 금액 + 렌탈비(작은글씨) + S/C 팝업 ── */}
            {cOpen&&<div className="bg-purple-50/50 border-b border-purple-100">
              {carriers.length===0
                ?<div className="px-6 py-2 text-[11px] text-gray-400 italic">SOC 해상운임 데이터 없음</div>
                :carriers.map(c=><div key={c.k} className="flex items-center px-6 py-2.5 border-b border-purple-100/40 last:border-0">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge k={c.k}/><span className="text-[11px] text-gray-500 truncate">{CARRIERS[c.k]}</span>
                  </div>
                  {/* 20' */}
                  <div className="text-right mr-5" onClick={()=>c.t20!=null&&openSC(c.k,"soc20",row.pol+" → "+city)}>
                    <div className="text-[10px] text-gray-400">20'</div>
                    <div className={`text-sm font-bold text-purple-700 ${c.t20!=null?"cursor-pointer underline decoration-dotted underline-offset-2":""}`}>
                      {c.t20!=null?`$${$n(c.t20)}`:"—"}
                    </div>
                    {c.t20!=null&&<div className="text-[9px] text-gray-400">렌탈 ${$n(row.r20[city])}</div>}
                  </div>
                  {/* 40' */}
                  <div className="text-right" onClick={()=>c.t40!=null&&openSC(c.k,"soc40",row.pol+" → "+city)}>
                    <div className="text-[10px] text-gray-400">40'</div>
                    <div className={`text-sm font-bold text-purple-700 ${c.t40!=null?"cursor-pointer underline decoration-dotted underline-offset-2":""}`}>
                      {c.t40!=null?`$${$n(c.t40)}`:"—"}
                    </div>
                    {c.t40!=null&&<div className="text-[9px] text-gray-400">렌탈 ${$n(row.r40[city])}</div>}
                  </div>
                </div>)
              }
            </div>}
          </div>;
        })}
      </div>}
    </div>;
  };

  // ─── Main ─────────────────────────────────────────────────────────────────
  return <div className="min-h-screen bg-gray-50" style={{fontFamily:"-apple-system,'Apple SD Gothic Neo',sans-serif"}}>
    <div className="sticky top-0 z-30 bg-white border-b border-gray-200" style={{boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="32" height="32" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="49" fill="#1D2B4F" stroke="#2C3E6B" strokeWidth="2"/>
            <circle cx="50" cy="50" r="40" fill="#E8A817"/>
            <polygon points="50,10 55,40 50,32 45,40" fill="#C0392B"/>
            <polygon points="50,90 55,60 50,68 45,60" fill="#C0392B"/>
            <polygon points="10,50 40,45 32,50 40,55" fill="#C0392B"/>
            <polygon points="90,50 60,45 68,50 60,55" fill="#C0392B"/>
            <polygon points="22,22 40,40 34,36 36,34" fill="#C0392B"/>
            <polygon points="78,78 60,60 66,64 64,66" fill="#C0392B"/>
            <polygon points="78,22 60,40 64,34 66,36" fill="#C0392B"/>
            <polygon points="22,78 40,60 36,66 34,64" fill="#C0392B"/>
            <circle cx="50" cy="50" r="7" fill="white"/>
            <circle cx="50" cy="50" r="3.5" fill="#C0392B"/>
          </svg>
          <div><h1 className="text-sm font-bold text-gray-900 leading-none">YSL Agency</h1>
            <p className="text-[10px] text-gray-400 mt-0.5">Freight Rate Portal · June 2026</p></div>
        </div>
        <button onClick={()=>{if(isAdmin){setIsAdmin(false);}else{setPinModal(true);setPinInput("");}}}
          className={`text-[11px] font-medium px-3 py-1.5 rounded-full ${isAdmin?"bg-red-50 text-red-600 border border-red-200":"bg-gray-100 text-gray-500 border border-gray-200"}`}>
          {isAdmin?"🔓 Admin":"🔒"}</button>
      </div>
    </div>

    {isAdmin&&<div className="max-w-2xl mx-auto px-4 pt-3">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="text-[10px] font-bold text-amber-700 mb-2">MARGIN (USD)</div>
        <div className="grid grid-cols-4 gap-2">{Object.keys(margins).map(t=><div key={t}>
          <label className="text-[10px] text-amber-600">{TYPE_LABELS[t]}</label>
          <input type="number" value={margins[t]} onChange={e=>setMargins(p=>({...p,[t]:parseInt(e.target.value)||0}))}
            className="w-full mt-0.5 px-2 py-1.5 text-sm font-bold text-amber-800 bg-white border border-amber-300 rounded focus:outline-none"/>
        </div>)}</div>
      </div>
    </div>}

    <div className="max-w-2xl mx-auto px-4 pt-3 pb-2">
      <input placeholder="Search POL..." value={search} onChange={e=>setSearch(e.target.value)}
        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none placeholder-gray-300"/>
      {tab!=="rental"&&<div className="flex gap-1.5 mt-2 overflow-x-auto pb-1" style={{scrollbarWidth:"none"}}>
        {["ALL",...areas].map(a=><button key={a} onClick={()=>setAreaF(a)}
          className={`text-[11px] font-medium px-3 py-1.5 rounded-full whitespace-nowrap ${a===areaF?"bg-gray-900 text-white":"bg-white text-gray-500 border border-gray-200"}`}>
          {a==="ALL"?"All":a}</button>)}
      </div>}
    </div>

    <div className="max-w-2xl mx-auto px-4">
      <div className="flex border-b border-gray-200">
        {[["ocean","🚢 Ocean\nFreight"],["dropoff","🚛 Ocean+\nDrop off"]].map(([k,l])=>
          <button key={k} onClick={()=>{setTab(k);setExpanded(null);setCityOpen(null);}}
            className={`flex-1 text-center py-2 text-[11px] font-semibold border-b-2 leading-tight whitespace-pre-line ${tab===k?"border-gray-900 text-gray-900":"border-transparent text-gray-400"}`}>{l}</button>
        )}
        <button onClick={()=>{setTab("rental");setExpanded(null);setCityOpen(null);}}
          className={`flex-1 text-center py-2 text-[11px] font-semibold border-b-2 leading-tight ${tab==="rental"?"border-gray-900 text-gray-900":"border-transparent text-gray-400"}`}>
          <div className="flex flex-col items-center gap-0.5">
            <svg width="18" height="12" viewBox="0 0 36 22" fill="none" className="text-blue-500">
              <rect x="1" y="4" width="34" height="16" rx="1" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="1" y1="4" x2="1" y2="20" stroke="currentColor" strokeWidth="2"/>
              <line x1="35" y1="4" x2="35" y2="20" stroke="currentColor" strokeWidth="2"/>
              <line x1="8" y1="4" x2="8" y2="20" stroke="currentColor" strokeWidth="1"/>
              <line x1="15" y1="4" x2="15" y2="20" stroke="currentColor" strokeWidth="1"/>
              <line x1="22" y1="4" x2="22" y2="20" stroke="currentColor" strokeWidth="1"/>
              <line x1="29" y1="4" x2="29" y2="20" stroke="currentColor" strokeWidth="1"/>
              <rect x="1" y="4" width="34" height="3" rx="0" fill="currentColor" opacity="0.3"/>
              <circle cx="4" cy="21" r="1.5" fill="currentColor"/>
              <circle cx="32" cy="21" r="1.5" fill="currentColor"/>
            </svg>
            <span>Rental+Ocean</span>
          </div>
        </button>
      </div>
    </div>

    {tab==="ocean"&&<div className="max-w-2xl mx-auto px-4 pt-3">
      <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
        {["coc","soc"].map(t=><button key={t} onClick={()=>setCtype(t)}
          className={`text-[11px] font-semibold px-4 py-1.5 rounded-md ${ctype===t?"bg-white text-gray-900 shadow-sm":"text-gray-400"}`}>{t.toUpperCase()}</button>)}
      </div>
      <span className="text-[10px] text-gray-400 ml-2">{ctype==="coc"?"Carrier Owned":"Shipper Owned"}</span>
    </div>}

    <div className="max-w-2xl mx-auto px-4 pt-3 pb-32">
      <div className="text-[10px] text-gray-400 mb-2">{tab==="rental"?`${filteredRental.length} origins`:`${filtered.length} routes`}</div>
      {tab==="ocean"&&filtered.map((row,i)=><OceanCard key={i} row={row} idx={i}/>)}
      {tab==="dropoff"&&filtered.map((row,i)=><DOCard key={i} row={row} idx={i}/>)}
      {tab==="rental"&&filteredRental.map((row,i)=><RentalCard key={i} row={row} idx={i}/>)}
    </div>

    <div className="max-w-2xl mx-auto px-4 py-4 text-center">
      <span className="text-[10px] text-gray-300">YSL Agency Far East · Rates subject to change</span>
    </div>

    {sc&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={()=>setSc(null)}>
      <div className="w-full max-w-md bg-white rounded-t-2xl p-5 pb-8 shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4"/>
        <div className="text-[10px] text-gray-400 font-medium mb-1">S/C NUMBER · {sc.k} · {sc.type} {sc.size}</div>
        <div className="text-xs text-gray-500 mb-3">{sc.route}</div>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <span className="flex-1 text-lg font-mono font-bold text-gray-800 tracking-wide">{sc.sc}</span>
          <button onClick={copySC} className={`px-4 py-2 rounded-lg text-xs font-semibold ${sc.copied?"bg-green-500 text-white":"bg-gray-900 text-white"}`}>
            {sc.copied?"✓ Copied":"Copy"}</button>
        </div>
        <p className="text-[10px] text-gray-400 mt-3">선적지 에이전트에게 해당 S/C Number를 전달해 주세요.</p>
      </div>
    </div>}

    {pinModal&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl p-6 w-72 shadow-2xl">
        <h3 className="text-sm font-bold text-gray-800 mb-1">Admin Access</h3>
        <p className="text-[11px] text-gray-400 mb-4">PIN 입력</p>
        <input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"){ if(pinInput===PIN){setIsAdmin(true);setPinModal(false);}else{alert("PIN 오류");setPinInput("");} }}}
          autoFocus placeholder="PIN"
          className="w-full px-4 py-2.5 text-center text-lg font-bold tracking-[0.5em] border border-gray-200 rounded-lg focus:outline-none"/>
        <div className="flex gap-2 mt-4">
          <button onClick={()=>setPinModal(false)} className="flex-1 py-2 text-xs font-medium text-gray-400 bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={()=>{ if(pinInput===PIN){setIsAdmin(true);setPinModal(false);}else{alert("PIN 오류");setPinInput("");} }}
            className="flex-1 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg">Confirm</button>
        </div>
      </div>
    </div>}
  </div>;
}
