import { useState, useMemo, useEffect, useRef } from "react";
import { AD_ROTATE_MS } from "../config.js";
import { CARRIER_CALL_PORTS, CN, CRS, FURTHER_NOTICE_LABEL, formatValidityDate, normalizeValiditySlot, parseValidityToISO } from "../data/staticData.js";

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
            aria-label="Close ad"
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

const TabIconOcean = ({ active }) => (
  <svg width="54" height="44" viewBox="0 0 54 44" fill="none" aria-hidden style={tabIconStyle(active)}>
    {/* 굴뚝 */}
    <rect x="33" y="2" width="7" height="18" rx="2" fill={active ? "#1E3A5F" : "#94A3B8"}/>
    <rect x="31" y="2" width="11" height="5" rx="1" fill={active ? "#334155" : "#CBD5E1"}/>
    {/* 컨테이너 2열 */}
    <rect x="2"  y="8"  width="13" height="9" rx="1" fill={active ? "#1E3A5F" : "#94A3B8"}/>
    <rect x="16" y="8"  width="13" height="9" rx="1" fill={active ? "#334155" : "#CBD5E1"}/>
    <line x1="8"  y1="8" x2="8"  y2="17" stroke={active ? "#475569" : "#E2E8F0"} strokeWidth="0.8"/>
    <line x1="22" y1="8" x2="22" y2="17" stroke={active ? "#475569" : "#E2E8F0"} strokeWidth="0.8"/>
    {/* 컨테이너 1열 */}
    <rect x="0"  y="18" width="13" height="10" rx="1" fill={active ? "#334155" : "#CBD5E1"}/>
    <rect x="14" y="18" width="13" height="10" rx="1" fill={active ? "#1E3A5F" : "#94A3B8"}/>
    <rect x="28" y="18" width="13" height="10" rx="1" fill={active ? "#334155" : "#CBD5E1"}/>
    <line x1="6"  y1="18" x2="6"  y2="28" stroke={active ? "#475569" : "#E2E8F0"} strokeWidth="0.8"/>
    <line x1="20" y1="18" x2="20" y2="28" stroke={active ? "#475569" : "#E2E8F0"} strokeWidth="0.8"/>
    <line x1="34" y1="18" x2="34" y2="28" stroke={active ? "#475569" : "#E2E8F0"} strokeWidth="0.8"/>
    {/* 선체 */}
    <path d="M -2,28 L -2,38 L 44,38 L 52,30 L -2,28 Z" fill={active ? "#1E3A5F" : "#94A3B8"}/>
    <line x1="2" y1="33" x2="44" y2="33" stroke={active ? "#475569" : "#CBD5E1"} strokeWidth="0.8"/>
    <path d="M 44,38 L 52,30 L 52,38 Z" fill={active ? "#334155" : "#CBD5E1"}/>
    {/* 수면 */}
    <path d="M -6,38 Q 8,41 22,38 Q 36,35 50,38 Q 58,40 60,38"
          fill="none" stroke={active ? "#93C5FD" : "#BAE6FD"} strokeWidth="1.5"/>
  </svg>
);

const TabIconDropoff = ({ active }) => (
  <svg width="100" height="40" viewBox="0 0 100 40" fill="none" aria-hidden style={tabIconStyle(active)}>
    {/* 소형 선박 */}
    <g transform="scale(0.62)">
      <rect x="0"  y="10" width="10" height="7" rx="1" fill={active ? "#334155" : "#CBD5E1"}/>
      <rect x="11" y="10" width="10" height="7" rx="1" fill={active ? "#1E3A5F" : "#94A3B8"}/>
      <rect x="22" y="10" width="10" height="7" rx="1" fill={active ? "#334155" : "#CBD5E1"}/>
      <rect x="5"  y="4"  width="10" height="7" rx="1" fill={active ? "#1E3A5F" : "#94A3B8"}/>
      <rect x="16" y="4"  width="10" height="7" rx="1" fill={active ? "#334155" : "#CBD5E1"}/>
      <rect x="28" y="0"  width="5"  height="17" rx="1" fill={active ? "#1E3A5F" : "#94A3B8"}/>
      <path d="M -2,17 L -2,25 L 34,25 L 40,19 L -2,17 Z" fill={active ? "#1E3A5F" : "#94A3B8"}/>
      <path d="M -4,25 Q 6,28 18,25 Q 30,22 42,25"
            fill="none" stroke={active ? "#93C5FD" : "#BAE6FD"} strokeWidth="1.5"/>
    </g>
    {/* + 기호 */}
    <text x="32" y="19" textAnchor="middle"
          fontSize="11" fill={active ? "#64748B" : "#CBD5E1"}>+</text>
    {/* 트럭 */}
    <g transform="translate(40, 4)">
      {/* 컨테이너 트레일러 */}
      <rect x="0" y="0" width="38" height="20" rx="2" fill={active ? "#334155" : "#CBD5E1"}/>
      <line x1="9"  y1="0" x2="9"  y2="20" stroke={active ? "#475569" : "#E2E8F0"} strokeWidth="0.8"/>
      <line x1="19" y1="0" x2="19" y2="20" stroke={active ? "#475569" : "#E2E8F0"} strokeWidth="0.8"/>
      <line x1="29" y1="0" x2="29" y2="20" stroke={active ? "#475569" : "#E2E8F0"} strokeWidth="0.8"/>
      <rect x="0" y="0" width="38" height="3" rx="1" fill={active ? "#475569" : "#E2E8F0"}/>
      {/* 운전석 */}
      <rect x="38" y="5"  width="20" height="15" rx="2" fill={active ? "#1E3A5F" : "#94A3B8"}/>
      <rect x="42" y="7"  width="12" height="8"  rx="1" fill={active ? "#64748B" : "#CBD5E1"} opacity="0.7"/>
      <rect x="40" y="2"  width="16" height="5"  rx="1" fill={active ? "#334155" : "#CBD5E1"}/>
      {/* 바퀴 */}
      <circle cx="10" cy="23" r="4" fill={active ? "#1E293B" : "#94A3B8"}/>
      <circle cx="10" cy="23" r="2" fill={active ? "#475569" : "#CBD5E1"}/>
      <circle cx="28" cy="23" r="4" fill={active ? "#1E293B" : "#94A3B8"}/>
      <circle cx="28" cy="23" r="2" fill={active ? "#475569" : "#CBD5E1"}/>
      <circle cx="50" cy="23" r="4" fill={active ? "#1E293B" : "#94A3B8"}/>
      <circle cx="50" cy="23" r="2" fill={active ? "#475569" : "#CBD5E1"}/>
    </g>
  </svg>
);

const TabIconRental = ({ active }) => (
  <svg width="90" height="74" viewBox="0 0 90 74" fill="none" aria-hidden style={tabIconStyle(active)}>
    {/* 앞면 */}
    <rect x="4" y="12" width="68" height="38" rx="2" fill={active ? "#1E3A5F" : "#94A3B8"}/>
    {/* 골(corrugation) */}
    {[15,26,37,48,59].map(x => (
      <line key={x} x1={x} y1="12" x2={x} y2="50"
            stroke={active ? "#475569" : "#CBD5E1"} strokeWidth="1.5"/>
    ))}
    {/* 윗면 */}
    <path d="M 4,12 L 16,3 L 84,3 L 72,12 Z" fill={active ? "#475569" : "#CBD5E1"}/>
    {/* 옆면 */}
    <path d="M 72,12 L 84,3 L 84,41 L 72,50 Z" fill={active ? "#1E293B" : "#64748B"}/>
    {/* 도어 분리선 */}
    <line x1="38" y1="12" x2="38" y2="50" stroke={active ? "#0F172A" : "#64748B"} strokeWidth="1.2"/>
    {/* YSL Agency 라벨 */}
    <rect x="8" y="16" width="58" height="14" rx="2" fill={active ? "#E2E8F0" : "#F1F5F9"}/>
    <text x="22" y="26" textAnchor="middle"
          fontFamily="Arial" fontWeight="700" fontSize="8"
          fill={active ? "#1E3A5F" : "#64748B"}>YSL</text>
    <line x1="34" y1="17" x2="34" y2="29"
          stroke={active ? "#64748B" : "#94A3B8"} strokeWidth="0.8"/>
    <text x="49" y="26" textAnchor="middle"
          fontFamily="Arial" fontWeight="400" fontSize="7"
          fill={active ? "#334155" : "#94A3B8"}>Agency</text>
    {/* 하단 레일 */}
    <rect x="4" y="48" width="68" height="3" rx="1" fill={active ? "#1E293B" : "#64748B"}/>
    {/* 소형 배 실루엣 */}
    <g transform="translate(48,56)" opacity="0.5">
      <path d="M 0,8 L 0,14 L 30,14 L 35,9 L 0,8 Z"
            fill={active ? "#475569" : "#94A3B8"}/>
      <rect x="3"  y="2" width="8" height="7" rx="0.5" fill={active ? "#475569" : "#94A3B8"}/>
      <rect x="13" y="2" width="8" height="7" rx="0.5" fill={active ? "#475569" : "#94A3B8"}/>
      <rect x="23" y="0" width="4" height="9" rx="0.5" fill={active ? "#475569" : "#94A3B8"}/>
      <path d="M -2,14 Q 8,17 18,14 Q 26,11 36,14"
            fill="none" stroke={active ? "#93C5FD" : "#BAE6FD"} strokeWidth="1.2"/>
    </g>
  </svg>
);

function RatesLoading() {
  return (
    <div className="rates-loading" role="status" aria-live="polite">
      Loading rates…
    </div>
  );
}

const MAIN_TABS = [
  {id:"ocean",label:"Ocean Freight",Icon:TabIconOcean},
  {id:"dropoff",label:"Ocean+Drop off",Icon:TabIconDropoff},
  {id:"rental",label:"Rental+Ocean",Icon:TabIconRental},
];

export { AdminSaveToast, Bg, CarrierPortGuide, FooterAdSlot, Logo, MAIN_TABS, RatesLoading, TabIconDropoff, TabIconOcean, TabIconRental, ValidityDateInput, ValidityPeriodFields, tabIconStyle };
