import { useState, useMemo, useEffect, useRef } from "react";
import { AD_ROTATE_MS } from "../config.js";
import { CARRIER_CALL_PORTS, CRS, FURTHER_NOTICE_LABEL, formatValidityDate, normalizeValiditySlot, parseValidityToISO } from "../data/staticData.js";

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

function RatesLoading() {
  return (
    <div className="rates-loading" role="status" aria-live="polite">
      운임 정보 불러오는 중…
    </div>
  );
}

const MAIN_TABS = [
  {id:"ocean",label:"Ocean Freight",Icon:TabIconOcean},
  {id:"dropoff",label:"Ocean+Drop off",Icon:TabIconDropoff},
  {id:"rental",label:"Rental+Ocean",Icon:TabIconRental},
];

export { AdminSaveToast, Bg, CarrierPortGuide, FooterAdSlot, Logo, MAIN_TABS, RatesLoading, TabIconDropoff, TabIconOcean, TabIconRental, ValidityDateInput, ValidityPeriodFields, tabIconStyle };
