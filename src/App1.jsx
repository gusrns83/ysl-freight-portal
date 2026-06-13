import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { GriAdjustPanel, MarginPanel } from "./components/adminPanels.jsx";
import { AdminSaveToast, Bg, CarrierPortGuide, FooterAdSlot, Logo, MAIN_TABS, RatesLoading, ValidityPeriodFields } from "./components/common.jsx";
import { ADMIN_PIN, ADMIN_SAVE_REV, ADMIN_SESSION_KEY, ADMIN_SKIP_PIN, DB_DROP, DB_LABEL, DB_OCEAN, DB_RENTAL, DEFAULT_MARGINS, PRICING_CACHE_KEY, PUBLIC_RATES_ENABLED, PUBLIC_RATES_FALLBACK_RAW, PUBLIC_RATES_KEY, RENT_COMBO_KEYS, RENT_COMBO_SHORT, SAVE_UI_MAX_MS, SB_KEY, SB_URL, mkAds, mkNotices, normalizeRentalCityBucket, parseAdsFromSettings, parseNoticeOn, readStoredPricingCache, rentComboMarginType, rentComboSk, rentSocType } from "./config.js";
import { CARRIER_CALL_PORTS, CN, CN_KR, CRS, DO, DOC, F_TO_R, FR, PM, RATE_TYPES, RC, RC_LABEL, RENTAL_CITY_ALIASES, RENTAL_EXTRA_CITIES, RENTAL_RATE_TYPES, RENT_CITY_ORDER, RN, VALIDITY_KEYS, addDaysToISO, buildDefaultRentalRates, carrierDropValidityKey, defaultCarrierDropMargins, defaultCarrierDropRates, defaultCarrierRates, defaultRentalMargins, defaultValidityInfo, defaultValiditySlot, formatValidityCompact, formatValidityDate, formatValiditySlotLabel, countDropMissingFuture, countOceanMissingFuture, countRentalMissingFuture, isValiditySlotExpired, mergeCarrierDropMargins, mergeCarrierDropRates, mergeRentalRates, n, normalizeRentalCityName, normalizeRentalMargins, normalizeValidityCarrier, normalizeValiditySlot, parseValidityToISO, rentalRateLabel, repairValiditySlot, serializeCarrierDropRatesForSave, serializeValidityInfo, syncFromAfterTill, validitySlotDaysLeft } from "./data/staticData.js";
import { DROP_DB_KEYS, EXCEL_UPLOAD_MAX_MS, MISC_SETTINGS_KEYS, OCEAN_DB_KEYS, RENTAL_DB_KEYS, api, enqueueNetworkWrite, extractPortalOverrides, fetchSettingsInKeys, mergePortalOverridesIntoPolCostO, postSettingsRows, resetNetworkWriteQueue, saveOceanPolCostsBundle, saveOneSettingWithRetry, saveSettingDirect, saveSettingValue, saveSettingsEntries, saveSettingsEntriesDirect, serializeOceanPolCosts, settingsMapFromRows, withTimeout } from "./lib/api.js";
import { LEGACY_VALIDITY_KEY, UPLOAD_FORMATS, applyFreightServiceFilterToUpload, applyRateHistoryDeletesToStores, backfillPolCostSells, buildDyDropRates, buildRentalRatesFromBases, buildRentalRatesFromCityRates, carrierUploadServesRate, cell, clearRentalPeriodRates, compactRentalRates, countCarrierDropValidityArchive, countCarrierValidityArchive, excelUploadCarrierKey, hydrateRateHistoryRowSells, mergeCarrierDropRateCell, mergePolCostsUploadByValidity, mergeRentalRatesPatch, mergeUploadValidity, parseByFormat, polCostSiblingMargin, previewSummary, readExcelFile, stripPolCostsOutsideFreightService, suggestSheet, suggestYslSheet, validityStorageKey } from "./lib/excelParsers.js";
import { bootPricingFromCache, buildBuyingGriCosts, buildCopyCurrentToFutureCosts, buildRateHistoryQuery, buildSellingGriSells, copyCarrierDropRatesPeriod, copyCarrierRatesPeriod, deleteRateHistoryByIds, diffRateHistoryRows, displayMarginFromPrices, fetchRateHistoryExcelUploadOcean, flattenRateSnapshot, getPolStoredMargin, griPeriodLabel, marginNowTs, marginNum, mergePolCostODeep, parsePricingFromSettings, pickLatestMargin, pickRateHistoryDuplicatesToRemove, postRateHistoryRows, pricingCacheFromSnapshot, pruneRateHistoryOutsideService, rateHistoryEntryKey, resolveCarrierEffectiveSell, resolveCarrierExplicitSell, resolveMarginCandidates, settingBundleHas, sortRateHistoryRowsByCity, uploadExcelRateHistory } from "./lib/pricing.js";
import { applyRentalUploadChanges, buildRentalUploadChanges, downloadRentalTemplate, parseRentalUploadRows } from "./lib/rentalUpload.js";

const QUOTE_FN_URL = `${SB_URL}/functions/v1/send-quote-request`;
const QUOTE_COOLDOWN_MS = 60000;

const QUOTE_POD_OPTIONS = ["VMTP", "Fishery", "pacific-logistic", "VMPP"];

function QuoteRequestModal({ info, onClose }) {
  const [pod, setPod] = useState(() => (QUOTE_POD_OPTIONS.includes(info.pod) ? info.pod : QUOTE_POD_OPTIONS[0]));
  const [email, setEmail] = useState("");
  const [qty, setQty] = useState("");
  const [cargo, setCargo] = useState("");
  const [target, setTarget] = useState("");
  const [etdFrom, setEtdFrom] = useState("");
  const [etdTo, setEtdTo] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // {type:"ok"|"err", msg}
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - nowTick) / 1000));
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    if (!emailValid) { setStatus({ type: "err", msg: "Please enter a valid email address." }); return; }
    if (cooldownLeft > 0 || sending) return;
    setSending(true);
    setStatus(null);
    try {
      // staffEmails: settings.quote_staff_emails (JSON 배열, 없으면 빈 배열)
      let staffEmails = [];
      try {
        const rows = await fetchSettingsInKeys(["quote_staff_emails"]);
        const raw = rows?.find(r => r.key === "quote_staff_emails")?.value;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) staffEmails = parsed.filter(e => typeof e === "string" && e.trim());
        }
      } catch {}

      const payload = {
        customerEmail: email.trim(),
        containerQty: qty.trim(),
        cargoName: cargo.trim(),
        targetRate: target.trim(),
        pol: info.pol,
        pod,
        etdFrom: etdFrom || "",
        etdTo: etdTo || "",
        carrier: info.carrier,
        rateType: info.dropCity ? `${info.rateType} · Drop off: ${info.dropCity}` : info.rateType,
        currentRate: info.currentRate,
        comment: comment.trim(),
        staffEmails,
      };

      const insertRow = {
        customer_email: payload.customerEmail,
        container_qty: payload.containerQty || null,
        cargo_name: payload.cargoName || null,
        target_rate: payload.targetRate || null,
        pol: payload.pol || null,
        pod: payload.pod || null,
        carrier: payload.carrier || null,
        rate_type: payload.rateType || null,
        current_rate: payload.currentRate || null,
        etd_from: etdFrom || null,
        etd_to: etdTo || null,
        comment: payload.comment || null,
      };

      const [, fnRes] = await Promise.all([
        api("quote_requests", {
          method: "POST",
          body: JSON.stringify([insertRow]),
          headers: { Prefer: "return=minimal" },
        }),
        fetch(QUOTE_FN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then(r => r.json()),
      ]);

      if (fnRes && (fnRes.id || fnRes.error == null && fnRes.statusCode == null)) {
        setStatus({ type: "ok", msg: "Your quote request has been received. Our team will contact you shortly." });
        setComment("");
        setCooldownUntil(Date.now() + QUOTE_COOLDOWN_MS);
        setNowTick(Date.now());
      } else {
        setStatus({ type: "err", msg: `Failed to send email: ${fnRes?.message || fnRes?.error || "unknown error"}` });
      }
    } catch (e) {
      setStatus({ type: "err", msg: `Send failed: ${e.message || e}` });
    } finally {
      setSending(false);
    }
  };

  const fieldStyle = { display: "block", width: "100%", marginTop: 4, padding: "9px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" };
  const labelStyle = { fontSize: 11, color: "#6b7280", display: "block", marginBottom: 10 };

  return (
    <div style={{position:"fixed",inset:0,zIndex:60,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:420,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}} onClick={e=>e.stopPropagation()}>
        <div style={{background:"#1D2B4F",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"16px 16px 0 0"}}>
          <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>📋 Request Quote</span>
          <button onClick={onClose} style={{color:"#9ca3af",background:"none",border:"none",cursor:"pointer",fontSize:20,lineHeight:1}}>✕</button>
        </div>
        <div style={{padding:"16px 20px 20px"}}>
          <div style={{background:"#f8fafc",border:"1px solid #e5e7eb",borderRadius:10,padding:12,marginBottom:14,fontSize:12,color:"#374151",lineHeight:1.7}}>
            <div><b>POL</b> · {info.pol}</div>
            {info.dropCity && <div><b>Drop off</b> · {info.dropCity}</div>}
            <div><b>Carrier</b> · {CN[info.carrier] || info.carrier}</div>
            <div><b>Type</b> · {info.rateType}</div>
            <div><b>Current Rate</b> · {info.currentRate}</div>
          </div>
          <label style={labelStyle}>POD
            <select value={pod} onChange={e=>setPod(e.target.value)} style={fieldStyle}>
              {QUOTE_POD_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Email <span style={{color:"#dc2626"}}>*</span>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com"
              style={{...fieldStyle, borderColor: email && !emailValid ? "#fca5a5" : "#d1d5db"}}/>
          </label>
          <label style={labelStyle}>Container Q'ty
            <input type="text" value={qty} onChange={e=>setQty(e.target.value)} placeholder="20'x2, 40'x1" style={fieldStyle}/>
          </label>
          <label style={labelStyle}>Cargo
            <input type="text" value={cargo} onChange={e=>setCargo(e.target.value)} placeholder="Frozen fish, General cargo…" style={fieldStyle}/>
          </label>
          <label style={labelStyle}>Target Rate (USD)
            <input type="text" inputMode="numeric" value={target} onChange={e=>setTarget(e.target.value)} placeholder="1800" style={fieldStyle}/>
          </label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <label style={{...labelStyle,marginBottom:0}}>ETD From
              <input type="date" value={etdFrom} onChange={e=>setEtdFrom(e.target.value)} style={fieldStyle}/>
            </label>
            <label style={{...labelStyle,marginBottom:0}}>ETD To
              <input type="date" value={etdTo} onChange={e=>setEtdTo(e.target.value)} min={etdFrom || undefined} style={fieldStyle}/>
            </label>
          </div>
          <label style={labelStyle}>Comment
            <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3}
              placeholder="Any additional requests or notes…"
              style={{...fieldStyle, resize:"vertical", minHeight:64, lineHeight:1.5}}/>
          </label>
          {status && (
            <div style={{fontSize:12,padding:10,borderRadius:8,marginBottom:10,
              color: status.type === "ok" ? "#166534" : "#dc2626",
              background: status.type === "ok" ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${status.type === "ok" ? "#bbf7d0" : "#fecaca"}`}}>
              {status.msg}
            </div>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={sending || cooldownLeft > 0}
            style={{width:"100%",padding:"12px",fontSize:13,fontWeight:700,color:"#fff",
              background: sending || cooldownLeft > 0 ? "#94a3b8" : "#1D2B4F",
              border:"none",borderRadius:10,cursor: sending || cooldownLeft > 0 ? "not-allowed" : "pointer"}}
          >
            {sending ? "Sending…" : cooldownLeft > 0 ? `Resend available in ${cooldownLeft}s` : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

const QUOTE_STATUS_OPTIONS = ["new", "replied", "closed"];

function QuoteAdminScreen({ onClose, onSaveStaffEmails }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showStaffEditor, setShowStaffEditor] = useState(false);
  const [staffInput, setStaffInput] = useState("");
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffMsg, setStaffMsg] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("quote_requests?select=*&order=created_at.desc&limit=200");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(`목록 로드 실패: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    (async () => {
      try {
        const sRows = await fetchSettingsInKeys(["quote_staff_emails"]);
        const raw = sRows?.find(r => r.key === "quote_staff_emails")?.value;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setStaffInput(parsed.join(", "));
        }
      } catch {}
    })();
  }, []);

  const updateStatus = async (id, status) => {
    const prev = rows;
    setRows(rs => rs.map(r => r.id === id ? { ...r, status } : r));
    try {
      await api(`quote_requests?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        headers: { Prefer: "return=minimal" },
      });
    } catch (e) {
      setRows(prev);
      setError(`상태 변경 실패: ${e.message || e}`);
    }
  };

  const saveStaff = async () => {
    setStaffSaving(true);
    setStaffMsg("");
    try {
      const arr = staffInput.split(",").map(s => s.trim()).filter(Boolean);
      await onSaveStaffEmails(arr);
      setStaffMsg(`✅ 저장 완료 (${arr.length}명)`);
    } catch (e) {
      setStaffMsg(`❌ 저장 실패: ${e.message || e}`);
    } finally {
      setStaffSaving(false);
    }
  };

  const fmtDt = (iso) => {
    try { return new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };

  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Pretendard','Noto Sans KR',-apple-system,sans-serif"}}>
      <div style={{position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:30}}>
        <button onClick={onClose} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
        <div style={{fontSize:14,fontWeight:700,color:"#0f766e"}}>견적 요청 관리</div>
        <button onClick={load} disabled={loading} style={{fontSize:11,fontWeight:700,padding:"6px 10px",borderRadius:8,background:loading?"#99f6e4":"#0d9488",color:"#fff",border:"none",cursor:loading?"not-allowed":"pointer"}}>
          {loading ? "…" : "새로고침"}
        </button>
      </div>
      <div style={{maxWidth:960,margin:"0 auto",padding:"16px 16px 80px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:"#6b7280"}}>
            {rows.length}건 · 미처리(new) <strong style={{color:"#dc2626"}}>{rows.filter(r=>r.status==="new").length}</strong>건
          </span>
          <button
            type="button"
            onClick={() => setShowStaffEditor(v => !v)}
            style={{marginLeft:"auto",fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:8,border:"1px solid #99f6e4",background:"#f0fdfa",color:"#0f766e",cursor:"pointer"}}
          >
            직원 이메일 설정
          </button>
        </div>
        {showStaffEditor && (
          <div style={{background:"#fff",border:"1px solid #99f6e4",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#0f766e",marginBottom:6}}>견적 요청 수신 직원 이메일 (쉼표로 구분)</div>
            <input
              type="text"
              value={staffInput}
              onChange={e=>setStaffInput(e.target.value)}
              placeholder="kevin@yslagency.com, chkun@yslagency.com"
              style={{display:"block",width:"100%",padding:"9px 10px",fontSize:13,border:"1px solid #d1d5db",borderRadius:8,boxSizing:"border-box",marginBottom:8}}
            />
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button type="button" onClick={saveStaff} disabled={staffSaving}
                style={{fontSize:11,fontWeight:700,padding:"7px 14px",borderRadius:8,border:"none",background:staffSaving?"#99f6e4":"#0d9488",color:"#fff",cursor:staffSaving?"not-allowed":"pointer"}}>
                {staffSaving ? "저장 중…" : "저장"}
              </button>
              {staffMsg && <span style={{fontSize:11,color:staffMsg.startsWith("✅")?"#166534":"#dc2626"}}>{staffMsg}</span>}
            </div>
            <div style={{fontSize:10,color:"#9ca3af",marginTop:6}}>
              ※ Resend 도메인 인증 전에는 계정 이메일(gusrns83@gmail.com)로만 발송됩니다.
            </div>
          </div>
        )}
        {error && (
          <div style={{fontSize:12,color:"#dc2626",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:10,marginBottom:12}}>{error}</div>
        )}
        <div style={{overflowX:"auto",background:"#fff",border:"1px solid #e5e7eb",borderRadius:12}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:820}}>
            <thead>
              <tr style={{background:"#f0fdfa",borderBottom:"1px solid #e5e7eb"}}>
                {["일시","고객 이메일","POL","POD","선사","수량","화물명","Target","현재운임","Comment","상태"].map(h => (
                  <th key={h} style={{padding:"8px 6px",textAlign:"left",fontWeight:700,color:"#0f766e",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={11} style={{padding:24,textAlign:"center",color:"#9ca3af"}}>견적 요청 없음</td></tr>
              )}
              {rows.map(r => (
                <tr key={r.id} style={{borderBottom:"1px solid #f3f4f6",background:r.status==="new"?"#fffbeb":"#fff"}}>
                  <td style={{padding:"7px 6px",whiteSpace:"nowrap",color:"#374151"}}>{fmtDt(r.created_at)}</td>
                  <td style={{padding:"7px 6px",fontWeight:600}}>{r.customer_email}</td>
                  <td style={{padding:"7px 6px"}}>{r.pol || "—"}</td>
                  <td style={{padding:"7px 6px"}}>{r.pod || "—"}</td>
                  <td style={{padding:"7px 6px"}}>{CN_KR[r.carrier] || r.carrier || "—"}</td>
                  <td style={{padding:"7px 6px"}}>{r.container_qty || "—"}</td>
                  <td style={{padding:"7px 6px"}}>{r.cargo_name || "—"}</td>
                  <td style={{padding:"7px 6px",textAlign:"right"}}>{r.target_rate || "—"}</td>
                  <td style={{padding:"7px 6px",fontSize:10,color:"#6b7280"}}>{r.current_rate || "—"}</td>
                  <td style={{padding:"7px 6px",fontSize:10,color:"#374151",maxWidth:200,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{r.comment || "—"}</td>
                  <td style={{padding:"7px 6px",whiteSpace:"nowrap"}}>
                    {r.status === "new" && (
                      <span style={{display:"inline-block",fontSize:9,fontWeight:700,color:"#fff",background:"#dc2626",padding:"1px 6px",borderRadius:4,marginRight:4}}>NEW</span>
                    )}
                    <select
                      value={r.status || "new"}
                      onChange={e => updateStatus(r.id, e.target.value)}
                      style={{fontSize:10,padding:"3px 4px",border:"1px solid #d1d5db",borderRadius:5,background:"#fff"}}
                    >
                      {QUOTE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const fData = useMemo(() => FR.map(r => ({area:r[0],pol:r[1],rates:{SNK:{coc20:r[2],coc40:r[3],soc20:r[4],soc40:r[5]},DY:{coc20:r[6],coc40:r[7],soc20:r[8],soc40:r[9]},CK:{coc20:r[10],coc40:r[11],soc20:r[12],soc40:r[13]}}})), []);
  const rData = useMemo(() => RN.map(r => {
    const r20 = {}, r40 = {}, r40dv = {}, r40hc = {};
    RC.forEach((c, i) => {
      r20[c] = r[1 + i];
      r40[c] = r[13 + i];
      r40dv[c] = r[13 + i];
      r40hc[c] = r[13 + i];
    });
    return { pol: r[0], r20, r40, r40dv, r40hc };
  }), []);
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
  const rentalRows = useMemo(() => rData.map(row => {
    const fp = PM[row.pol];
    const fr = fp ? fMap[fp] : null;
    return {
      rentalPol: row.pol,
      freightPol: fp || row.pol,
      displayPol: fp || row.pol,
      area: fr?.area || "OTHERS",
    };
  }), [rData, fMap]);
  const rentalAreaGroups = useMemo(() => {
    const groups = [];
    rentalRows.forEach(row => {
      const last = groups[groups.length - 1];
      if (!last || last.area !== row.area) groups.push({ area: row.area, rows: [row] });
      else last.rows.push(row);
    });
    return groups;
  }, [rentalRows]);

  const rentalPolData = useMemo(
    () => rentalRows.map(r => ({ area: r.area, pol: r.freightPol })),
    [rentalRows]
  );

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

  // Default margins — localStorage 캐시로 첫 렌더부터 복원 (깜빡임 방지)
  const [pricingBoot] = useState(() => bootPricingFromCache());
  const [settingsLoaded, setSettingsLoaded] = useState(() => !!pricingBoot);
  // 고객용 매출 스냅샷 (public_rates_json) — 비admin은 raw 대신 이걸로 렌더 (매입·마진 미수신)
  const [publicRates, setPublicRates] = useState(null);
  const [margins, setMargins] = useState(() => pricingBoot?.margins ?? { ...DEFAULT_MARGINS });
  const [marginTs, setMarginTs] = useState(() => pricingBoot?.marginTs ?? Object.fromEntries(RATE_TYPES.map(t => [t, marginNowTs()])));
  const [areaM, setAreaM] = useState(() => pricingBoot?.areaM ?? {});
  const [areaTs, setAreaTs] = useState(() => pricingBoot?.areaTs ?? {});
  const [polM, setPolM] = useState(() => pricingBoot?.polM ?? {});
  const [polMFuture, setPolMFuture] = useState(() => pricingBoot?.polMFuture ?? {});
  const [polTs, setPolTs] = useState(() => pricingBoot?.polTs ?? {});
  const [polTsFuture, setPolTsFuture] = useState(() => pricingBoot?.polTsFuture ?? {});
  const [rentalMargins, setRentalMargins] = useState(() => normalizeRentalMargins(pricingBoot?.rentalMargins));
  const [rentalMarginTs, setRentalMarginTs] = useState(() => pricingBoot?.rentalMarginTs ?? Object.fromEntries(RENTAL_RATE_TYPES.map(t => [t, marginNowTs()])));
  const [rentalAreaM, setRentalAreaM] = useState(() => pricingBoot?.rentalAreaM ?? {});
  const [rentalAreaTs, setRentalAreaTs] = useState(() => pricingBoot?.rentalAreaTs ?? {});
  const [rentalPolM, setRentalPolM] = useState(() => pricingBoot?.rentalPolM ?? {});
  const [rentalPolTs, setRentalPolTs] = useState(() => pricingBoot?.rentalPolTs ?? {});
  const [polCostO, setPolCostO] = useState(() => pricingBoot?.polCostO ?? {});
  const [griBuyUndo, setGriBuyUndo] = useState(null);
  const [griSellUndo, setGriSellUndo] = useState(null);
  const [importFreightUndo, setImportFreightUndo] = useState(null);
  const [griScopeTab, setGriScopeTab] = useState("all");
  const [griSelAreas, setGriSelAreas] = useState([]);
  const toggleGriArea = (area) => {
    setGriSelAreas(prev => (prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]));
  };
  const [marginTab, setMarginTab] = useState("global");
  const [rentalMarginTab, setRentalMarginTab] = useState("global");
  const [selArea, setSelArea] = useState("");
  const [rentalSelArea, setRentalSelArea] = useState("");
  const [selPol, setSelPol] = useState("");
  const [rentalSelPol, setRentalSelPol] = useState("");
  const [polEdit, setPolEdit] = useState({coc20:"",coc40:"",soc20:"",soc40:""});
  const [rentalPolEdit, setRentalPolEdit] = useState({ r20: "", r40dv: "", r40hc: "" });
  const [validityInfo, setValidityInfo] = useState(() => pricingBoot?.validityInfo ?? defaultValidityInfo());
  const [carrierRates, setCarrierRates] = useState(() => pricingBoot?.carrierRates ?? defaultCarrierRates());
  const [carrierDropRates, setCarrierDropRates] = useState(
    () => pricingBoot?.carrierDropRates ?? defaultCarrierDropRates()
  );
  const [carrierDropMargins, setCarrierDropMargins] = useState(
    () => pricingBoot?.carrierDropMargins ?? defaultCarrierDropMargins()
  );
  const [rentalRates, setRentalRates] = useState(() => pricingBoot?.rentalRates ?? buildDefaultRentalRates());
  const [ratePeriod, setRatePeriod] = useState("current"); // current | future
  const [notices, setNotices] = useState(mkNotices);
  const NOTICE_HIDE_TODAY_KEY = "ysl_notice_hide_today";
  const noticeTodayStr = () => new Date().toLocaleDateString("sv-SE");
  const [dismissedNotices, setDismissedNotices] = useState(() => {
    try {
      const raw = localStorage.getItem(NOTICE_HIDE_TODAY_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.date === noticeTodayStr() && Array.isArray(saved.ids)) return new Set(saved.ids);
      }
    } catch {}
    return new Set();
  });
  const [noticeHideToday, setNoticeHideToday] = useState(false);
  const [noticeAdminTab, setNoticeAdminTab] = useState(0);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState({ type: null, message: "" });
  const saveFeedbackTimerRef = useRef(null);
  const skipAutoSaveRef = useRef(true);
  const autoSaveTimerRef = useRef(null);
  const autoSaveInFlightRef = useRef(false);
  const publicRatesAtRef = useRef(0); // 매출 스냅샷 저장 throttle
  const rawLoadedRef = useRef(false); // raw 운임(매입·마진) 로드 여부 — admin 또는 스냅샷 부재 fallback 시에만
  const backfilledRef = useRef(false); // admin 진입 후 스냅샷 1회 백필 여부
  const saveQueueRef = useRef(Promise.resolve());
  const pricingSaveRef = useRef({});
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [adBanners, setAdBanners] = useState(mkAds);
  const [adAdminTab, setAdAdminTab] = useState(0);
  const [adUploadLoading, setAdUploadLoading] = useState(false);
  const [adUploadMsg, setAdUploadMsg] = useState("");
  const [adDragOver, setAdDragOver] = useState(false);
  const [adDismissed, setAdDismissed] = useState(() => sessionStorage.getItem("ysl_ad_dismissed") === "1");

  // App state
  const [search, setSearch] = useState("");
  const [areaF, setAreaF] = useState("ALL");
  const [tab, setTab] = useState("ocean");
  const [ctype, setCtype] = useState("coc");
  const [exp, setExp] = useState(null);
  const [cityOpen, setCityOpen] = useState(null);
  const [doCityOpen, setDoCityOpen] = useState(null);
  const [quoteReq, setQuoteReq] = useState(null);
  const [showQuoteAdmin, setShowQuoteAdmin] = useState(false);
  const quoteBtnEl = (info) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setQuoteReq(info); }}
      title="Request quote"
      style={{display:"block",marginTop:3,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,border:"1px solid #bfdbfe",background:"#eff6ff",color:"#1d4ed8",cursor:"pointer"}}
    >
      Quote
    </button>
  );

  // Client mgmt
  const [showMgr, setShowMgr] = useState(false);
  const [showNoticeAdmin, setShowNoticeAdmin] = useState(false);
  const [showAdAdmin, setShowAdAdmin] = useState(false);
  const [showFreightAdmin, setShowFreightAdmin] = useState(false);
  const [freightAdminTab, setFreightAdminTab] = useState("grid");
  const [showRentalAdmin, setShowRentalAdmin] = useState(false);
  const [rentalAdminTab, setRentalAdminTab] = useState("grid");
  const [excelFormat, setExcelFormat] = useState("SNK");
  const [excelPeriod, setExcelPeriod] = useState("current");
  const [excelSheet, setExcelSheet] = useState("");
  const [excelYslCarrier, setExcelYslCarrier] = useState("SNK");
  const [excelWorkbook, setExcelWorkbook] = useState(null);
  const [excelPreview, setExcelPreview] = useState(null);
  const [excelUploading, setExcelUploading] = useState(false);
  const [excelUploadStep, setExcelUploadStep] = useState("idle");
  const [excelMsg, setExcelMsg] = useState("");
  const [excelDragOver, setExcelDragOver] = useState(false);
  const [excelValidityDraft, setExcelValidityDraft] = useState(defaultValiditySlot);
  const [excelSaveValidity, setExcelSaveValidity] = useState(true);
  const rateHistoryBaselineRef = useRef(null);
  const rhAutoPruneRef = useRef(false);
  const rhBackfillInFlightRef = useRef(false);
  const rateHistoryLastLogAtRef = useRef(0);
  const [rhRows, setRhRows] = useState([]);
  const [rhLoading, setRhLoading] = useState(false);
  const [rhError, setRhError] = useState("");
  const [rhCarrier, setRhCarrier] = useState("ALL");
  const [rhArea, setRhArea] = useState("ALL");
  const [rhPeriod, setRhPeriod] = useState("ALL");
  const [rhCategory, setRhCategory] = useState("ALL");
  const [rhScope, setRhScope] = useState("freight");
  const [rhPol, setRhPol] = useState("");
  const [rhDateFrom, setRhDateFrom] = useState("");
  const [rhDateTo, setRhDateTo] = useState("");
  const [rhSelectedIds, setRhSelectedIds] = useState([]);
  const [rhDuplicateIds, setRhDuplicateIds] = useState(() => new Set());
  const [rhShowDuplicatesOnly, setRhShowDuplicatesOnly] = useState(false);
  const RH_COL_FILTERS_EMPTY = { carrier: "ALL", area: "ALL", pol: "", type: "ALL", period: "ALL", validity: "ALL" };
  const [rhColFilters, setRhColFilters] = useState(RH_COL_FILTERS_EMPTY);
  const [rhSort, setRhSort] = useState({ key: "", dir: 1 });
  const [rhSelectMsg, setRhSelectMsg] = useState("");
  const [carrierAdminCr, setCarrierAdminCr] = useState("SNK");
  const [carrierAdminPeriod, setCarrierAdminPeriod] = useState("current");
  const [carrierAdminMode, setCarrierAdminMode] = useState("ocean");
  const [carrierAdminPolFilter, setCarrierAdminPolFilter] = useState("");
  const [carrierEditCell, setCarrierEditCell] = useState(null);
  const [gridEditUnlocked, setGridEditUnlocked] = useState(false);
  const gridEditSnapshotRef = useRef(null);
  const [rentalAdminPeriod, setRentalAdminPeriod] = useState("current");
  // 렌탈 Excel 업로드 — 기본 반영 대상: 향후 운임
  const [rentalUploadPeriod, setRentalUploadPeriod] = useState("future");
  const [rentalUpload, setRentalUpload] = useState(null); // {fileName, entries, errors, changes}
  const [rentalUploadBusy, setRentalUploadBusy] = useState(false);
  const [rentalUploadMsg, setRentalUploadMsg] = useState("");
  const [selReturnCity, setSelReturnCity] = useState("");
  const [rentalEditCell, setRentalEditCell] = useState(null);
  const [clients, setClients] = useState([]);
  const [addForm, setAddForm] = useState(false);
  const [editC, setEditC] = useState(null);
  const [newC, setNewC] = useState({company_name:"",email:"",password_hash:"",margin_coc20:80,margin_coc40:100,margin_soc20:80,margin_soc40:100,notes:""});

  const isAdmin = mode === "admin";
  const isClient = mode === "client";
  const isGuest = mode === "guest";

  // ── 고객용 매출 스냅샷 조회 (비admin + publicRates 있을 때만 raw 대신 사용) ──
  const usePublic = PUBLIC_RATES_ENABLED && !isAdmin && !!publicRates;
  const periodKey = (p) => (p === "future" ? "future" : "current");
  // 스냅샷 생성 이후 만료된 현재 운임은 실시간 validity로 한 번 더 차단 (스케줄러 지연 대비)
  const curExpiredLive = (vKey, p) => p === "current" && isValiditySlotExpired(validityInfo[vKey]?.current);
  const pubOcean = (pol, cr, t, p) => (curExpiredLive(cr, periodKey(p)) ? null : publicRates?.ocean?.[pol]?.[cr]?.[periodKey(p)]?.[t] ?? null);
  const pubDrop = (pol, cr, cityKey, si, p) => (curExpiredLive(carrierDropValidityKey(cr), periodKey(p)) ? null : publicRates?.drop?.[pol]?.[cr]?.[cityKey]?.[periodKey(p)]?.[si === 0 ? "c20" : "c40"] ?? null);
  const pubRentTotal = (rPol, cr, city, sk, p) => (curExpiredLive("RENTAL", periodKey(p)) ? null : publicRates?.rental?.[rPol]?.carriers?.[cr]?.[city]?.[periodKey(p)]?.[sk] ?? null);
  const pubRentSub = (rPol, city, sk, p) => (curExpiredLive("RENTAL", periodKey(p)) ? null : publicRates?.rental?.[rPol]?.rent?.[city]?.[periodKey(p)]?.[sk] ?? null);
  // 고객용 가격 객체: cost는 화면에 표시되지 않으며 sell과 동일값(매입 미노출). 일부 JSX가 .cost로 행 표시를 판단하므로 sell을 넣음
  const guestPrice = (sell, cr) => ({ cost: sell ?? null, margin: sell == null ? null : 0, sell: sell ?? null, cr: cr ?? null });

  const carrierGridAreaGroups = useMemo(() => {
    const q = carrierAdminPolFilter.trim().toLowerCase();
    if (!q) return carrierAreaGroups;
    return carrierAreaGroups
      .map(g => ({ ...g, rows: g.rows.filter(r => r.pol.toLowerCase().includes(q)) }))
      .filter(g => g.rows.length);
  }, [carrierAreaGroups, carrierAdminPolFilter]);

  const closeFreightAdmin = () => setShowFreightAdmin(false);

  pricingSaveRef.current = {
    polCostO,
    polM,
    polMFuture,
    polTs,
    polTsFuture,
    margins,
    areaM,
    marginTs,
    areaTs,
    carrierRates,
    carrierDropRates,
    carrierDropMargins,
    validityInfo,
    rentalRates,
    rentalMargins,
    rentalAreaM,
    rentalPolM,
    rentalMarginTs,
    rentalAreaTs,
    rentalPolTs,
  };

  const cancelPendingPricingSave = () => {
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  };

  const resetSaveQueue = () => {
    saveQueueRef.current = Promise.resolve();
  };

  const syncRateHistoryBaseline = () => {
    const s = pricingSaveRef.current;
    rateHistoryBaselineRef.current = flattenRateSnapshot({ ...s, fData, rData });
  };

  const recordRateHistory = (opts = {}, snapOverride = null) => {
    const base = snapOverride || pricingSaveRef.current;
    const nextMap = flattenRateSnapshot({ ...base, fData, rData });
    const rows = diffRateHistoryRows(rateHistoryBaselineRef.current, nextMap, opts);
    if (!rows.length) return Promise.resolve(0);
    return postRateHistoryRows(rows)
      .then(count => {
        rateHistoryBaselineRef.current = nextMap;
        rateHistoryLastLogAtRef.current = Date.now();
        return count;
      })
      .catch(err => {
        console.warn("rate history save failed", err);
        return 0;
      });
  };

  const loadRateHistory = async (overrides = {}) => {
    setRhLoading(true);
    setRhError("");
    try {
      // 서비스外 자동 정리는 백그라운드로 실행해 화면 로딩을 블로킹하지 않음
      if (isAdmin && !rhAutoPruneRef.current) {
        rhAutoPruneRef.current = true;
        (async () => {
          try {
            const base = pricingSaveRef.current;
            const pruned = await pruneRateHistoryOutsideService(fData, base, rData);
            if (pruned.historyCleared > 0) {
              if (pruned.polCostsChanged) {
                setPolCostO(pruned.polCostO);
                pricingSaveRef.current = {
                  ...base,
                  polCostO: pruned.polCostO,
                  carrierDropRates: pruned.dropChanged ? pruned.carrierDropRates : base.carrierDropRates,
                  rentalRates: pruned.rentalChanged ? pruned.rentalRates : base.rentalRates,
                };
                skipAutoSaveRef.current = true;
                await saveOceanPolCostsBundle(pruned.polCostO);
                setTimeout(() => { skipAutoSaveRef.current = false; }, 2000);
              }
              setRhSelectMsg(`✅ 서비스外 ${pruned.historyCleared}건 자동 정리${pruned.dbCleared ? ` · 운임 DB ${pruned.dbCleared}셀` : ""}`);
            }
          } catch (e) {
            console.warn("rate_history 서비스外 자동 정리 skip", e);
          }
        })();
      }

      const costsForHydrate = pricingSaveRef.current?.polCostO ?? polCostO;
      let hydrateCosts = costsForHydrate;
      if (isAdmin) {
        const bf = backfillPolCostSells(hydrateCosts, {
          polM: pricingSaveRef.current?.polM ?? polM,
          polMFuture: pricingSaveRef.current?.polMFuture ?? polMFuture,
          margins: pricingSaveRef.current?.margins ?? margins,
        });
        if (bf.filled > 0) {
          hydrateCosts = bf.polCostO;
          setPolCostO(bf.polCostO);
          pricingSaveRef.current = { ...pricingSaveRef.current, polCostO: bf.polCostO };
          skipAutoSaveRef.current = true;
          await saveOceanPolCostsBundle(bf.polCostO);
          setTimeout(() => { skipAutoSaveRef.current = false; }, 2000);
          setRhSelectMsg(`✅ 매출 ${bf.filled}셀 보완 (SNK 일본 포함)`);
        }
      }

      const data = await api(buildRateHistoryQuery({
        scope: overrides.scope ?? rhScope,
        carrier: overrides.carrier ?? rhCarrier,
        area: rhArea,
        period: rhPeriod,
        category: rhCategory,
        pol: rhPol,
        dateFrom: rhDateFrom,
        dateTo: rhDateTo,
      }));
      setRhRows(sortRateHistoryRowsByCity(Array.isArray(data)
        ? hydrateRateHistoryRowSells(
          data.filter(row => row.cost != null && row.cost > 0 && row.source !== "excel_delete"),
          hydrateCosts,
          pricingSaveRef.current?.polM ?? polM,
          pricingSaveRef.current?.polMFuture ?? polMFuture,
        )
        : []));
      setRhSelectedIds([]);
      setRhDuplicateIds(new Set());
      setRhShowDuplicatesOnly(false);
    } catch (e) {
      const msg = String(e.message || e);
      setRhRows([]);
      setRhError(/rate_history|42P01|relation|does not exist/i.test(msg)
        ? "rate_history 테이블 없음 · supabase-rate-history.sql 을 Supabase SQL Editor에서 실행하세요."
        : msg);
    } finally {
      setRhLoading(false);
    }
  };

  const jumpToFreightGridFromRh = (row) => {
    if (row.category !== "ocean" || !CRS.includes(row.carrier)) return;
    setFreightAdminTab("grid");
    setCarrierAdminCr(row.carrier);
    setCarrierAdminPeriod(row.period === "future" ? "future" : "current");
    setCarrierAdminMode("ocean");
    setCarrierAdminPolFilter(row.pol || "");
    if (RATE_TYPES.includes(row.rate_type)) {
      setCarrierEditCell(`${row.pol}:${row.rate_type}`);
    }
    setRhSelectMsg(`→ 현재 운임: ${CN_KR[row.carrier] || row.carrier} · ${row.pol} · ${row.rate_type}`);
  };

  const jumpToRentalGridFromRh = (row) => {
    if (row.category !== "rental") return;
    setRentalAdminTab("grid");
    setRentalAdminPeriod(row.period === "future" ? "future" : "current");
    setRentalMarginTab("pol");
    setRentalSelPol(row.pol || "");
    setRentalEditCell(null);
    const city = row.route?.includes(" > ") ? row.route.split(" > ").slice(1).join(" > ").trim() : "";
    if (city && RENT_CITY_ORDER.includes(city)) setSelReturnCity(city);
    else setSelReturnCity("");
    setRhSelectMsg(`→ Rental 운임: ${row.pol} · ${row.rate_type}${city ? ` · ${city}` : ""}`);
  };

  const ensurePolCostSellsBackfill = async (opts = {}) => {
    if (!isAdmin || saveBusy) return 0;
    const base = pricingSaveRef.current;
    const { polCostO: next, filled } = backfillPolCostSells(base?.polCostO ?? polCostO, {
      polM: base?.polM ?? polM,
      polMFuture: base?.polMFuture ?? polMFuture,
      margins: base?.margins ?? margins,
    });
    if (!filled) return 0;
    setPolCostO(next);
    pricingSaveRef.current = { ...base, polCostO: next };
    if (opts.persist !== false) {
      skipAutoSaveRef.current = true;
      await saveOceanPolCostsBundle(next);
      setTimeout(() => { skipAutoSaveRef.current = false; }, 2000);
    }
    return filled;
  };

  const openFreightAdmin = (tab = "grid") => {
    setShowFreightAdmin(true);
    setFreightAdminTab(tab);
    if (tab === "grid") {
      setCarrierAdminPolFilter("");
      setCarrierEditCell(null);
      if (!saveBusy) {
        ensurePolCostSellsBackfill().then(filled => {
          if (filled > 0) setRhSelectMsg(`✅ 매출 ${filled}셀 자동 보완 · 현재 운임 반영`);
        }).catch(e => console.warn("pol_costs 매출 보완 skip", e));
      }
    }
    if (tab === "history") {
      setRhScope("freight");
      loadRateHistory({ scope: "freight" });
    }
  };

  const freightAdminTabBar = (
    <div style={{ padding: "10px 0 12px", background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
      <div className="carrier-admin-page" style={{ display: "flex", gap: 6, paddingTop: 0, paddingBottom: 0 }}>
      {[["grid", "현재 운임", "#1e40af"], ["history", "변경 이력", "#0f766e"], ["upload", "Excel 업로드", "#b45309"]].map(([id, label, color]) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            setFreightAdminTab(id);
            if (id === "history") {
              setRhScope("freight");
              loadRateHistory({ scope: "freight" });
            }
            if (id === "grid" && !saveBusy) {
              ensurePolCostSellsBackfill().then(filled => {
                if (filled > 0) setRhSelectMsg(`✅ 매출 ${filled}셀 자동 보완 · 현재 운임 반영`);
              }).catch(e => console.warn("pol_costs 매출 보완 skip", e));
            }
          }}
          style={{
            flex: 1, padding: "10px 8px", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "none", cursor: "pointer",
            background: freightAdminTab === id ? color : "#f3f4f6",
            color: freightAdminTab === id ? "#fff" : "#6b7280",
            boxShadow: freightAdminTab === id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          {label}
        </button>
      ))}
      </div>
    </div>
  );

  const rentalAdminTabBar = (
    <div style={{ padding: "10px 0 12px", background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
      <div className="carrier-admin-page" style={{ display: "flex", gap: 6, paddingTop: 0, paddingBottom: 0 }}>
      {[["grid", "현재 운임", "#7c3aed"], ["upload", "Excel 업로드", "#9333ea"], ["history", "변경 이력", "#6d28d9"]].map(([id, label, color]) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            setRentalAdminTab(id);
            if (id === "history") {
              setRhScope("rental");
              setRhCarrier("RENTAL");
              loadRateHistory({ scope: "rental", carrier: "RENTAL" });
            }
          }}
          style={{
            flex: 1, padding: "10px 8px", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "none", cursor: "pointer",
            background: rentalAdminTab === id ? color : "#f3f4f6",
            color: rentalAdminTab === id ? "#fff" : "#6b7280",
            boxShadow: rentalAdminTab === id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          {label}
        </button>
      ))}
      </div>
    </div>
  );

  // ── Admin 만료 임박 배너 — 선사별 요약, 해상/Drop off/렌탈 구분 ──
  const expiryAlerts = useMemo(() => {
    if (!isAdmin) return [];
    const out = [];
    const pushAlert = (vKey, name, threshold, missing, target) => {
      const entry = validityInfo[vKey];
      const slot = normalizeValiditySlot(entry?.current);
      if (slot.furtherNotice) return;
      const d = validitySlotDaysLeft(slot);
      if (d == null || d > threshold) return;
      const hasFutureFrom = !!parseValidityToISO(normalizeValiditySlot(entry?.future).from);
      if (missing === 0 && hasFutureFrom) return; // 차기 운임 입력 완료 → 문제 없음
      const till = parseValidityToISO(slot.till);
      const [, mo, dd] = till.split("-");
      const tillLabel = `${parseInt(mo, 10)}/${parseInt(dd, 10)}`;
      out.push({
        key: vKey,
        target,
        text: `${name}: ${tillLabel} 만료${d < 0 ? " (지남)" : ""}, 차기 미입력 ${missing}건`,
      });
    };
    CRS.forEach(cr => {
      pushAlert(cr, `${cr} 해상`, 3, countOceanMissingFuture(polCostO, cr), { type: "ocean", cr });
      pushAlert(carrierDropValidityKey(cr), `${cr} Drop off`, 3, countDropMissingFuture(carrierDropRates, cr), { type: "dropoff", cr });
    });
    pushAlert("RENTAL", "렌탈", 2, countRentalMissingFuture(rentalRates), { type: "rental" });
    return out;
  }, [isAdmin, validityInfo, polCostO, carrierDropRates, rentalRates]);

  const openExpiryTarget = (target) => {
    if (target.type === "rental") {
      setShowFreightAdmin(false);
      setShowRentalAdmin(true);
      setRentalAdminTab("grid");
      setRentalAdminPeriod("future");
      return;
    }
    setShowRentalAdmin(false);
    setCarrierAdminCr(target.cr);
    setCarrierAdminMode(target.type === "dropoff" ? "dropoff" : "ocean");
    setCarrierAdminPeriod("future");
    openFreightAdmin("grid");
  };

  const expiryBannerEl = isAdmin && expiryAlerts.length > 0 ? (
    <div style={{ padding: "8px 16px 0", background: "#fff" }}>
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "8px 10px", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 13 }} aria-hidden>⚠️</span>
        {expiryAlerts.map(a => (
          <button
            key={a.key}
            type="button"
            onClick={() => openExpiryTarget(a.target)}
            title="클릭하면 해당 운임 목록(향후 운임)으로 이동"
            style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", background: "#fff", border: "1px solid #fecaca", borderRadius: 8, padding: "4px 8px", cursor: "pointer" }}
          >
            {a.text}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const parseExcelWorkbook = (workbook, format, sheetName, period, yslCarrier) => {
    const sheet = sheetName || suggestSheet(format, workbook.sheetNames);
    const rows = workbook.sheets[sheet];
    if (!rows?.length) throw new Error(`시트 "${sheet}" 가 비어 있습니다`);
    const parsed = parseByFormat(format, rows, { carrier: yslCarrier });
    const { parsed: serviceFiltered } = applyFreightServiceFilterToUpload(parsed, fData);
    const polCount = Object.keys(serviceFiltered.netRows || serviceFiltered.oceanRows || serviceFiltered.bases || {}).length;
    if (format !== "RENTAL" && polCount === 0) {
      const skipped = (serviceFiltered.skipped || []).slice(0, 5).join(", ");
      throw new Error(`포털 POL과 매칭된 행이 없습니다${skipped ? ` · 예: ${skipped}` : ""}`);
    }
    return { ...serviceFiltered, period, fileName: workbook.fileName, sheet };
  };

  const handleExcelFile = async (file) => {
    if (!file) return;
    setExcelMsg("");
    setExcelPreview(null);
    setExcelUploading(true);
    try {
      const workbook = await readExcelFile(file);
      setExcelWorkbook(workbook);
      const sheet = excelFormat === "YSL"
        ? suggestYslSheet(excelYslCarrier, excelPeriod, workbook.sheetNames)
        : (excelSheet && workbook.sheetNames.includes(excelSheet)
          ? excelSheet
          : suggestSheet(excelFormat, workbook.sheetNames));
      setExcelSheet(sheet);
      const preview = parseExcelWorkbook(workbook, excelFormat, sheet, excelPeriod, excelYslCarrier);
      setExcelPreview(preview);
      const sum = previewSummary(preview, excelPeriod);
      setExcelMsg(`✅ ${sum.title} · ${sum.detail}`);
    } catch (e) {
      setExcelWorkbook(null);
      setExcelMsg("파싱 실패: " + e.message);
    } finally {
      setExcelUploading(false);
    }
  };

  const refreshExcelPreview = (sheetOverride) => {
    if (!excelWorkbook) return;
    try {
      let sheet = sheetOverride ?? excelSheet;
      if (!sheet || !excelWorkbook.sheetNames.includes(sheet)) {
        sheet = excelFormat === "YSL"
          ? suggestYslSheet(excelYslCarrier, excelPeriod, excelWorkbook.sheetNames)
          : suggestSheet(excelFormat, excelWorkbook.sheetNames);
        setExcelSheet(sheet);
      } else if (sheetOverride && sheetOverride !== excelSheet) {
        setExcelSheet(sheetOverride);
      }
      const preview = parseExcelWorkbook(excelWorkbook, excelFormat, sheet, excelPeriod, excelYslCarrier);
      setExcelPreview(preview);
      const sum = previewSummary(preview, excelPeriod);
      setExcelMsg(`✅ ${sum.title} · ${sum.detail}`);
    } catch (e) {
      setExcelPreview(null);
      setExcelMsg("파싱 실패: " + e.message);
    }
  };

  const applyExcelUpload = () => {
    if (!excelPreview) return;
    if (saveBusy) {
      setExcelMsg("다른 저장이 진행 중입니다. 잠시 후 다시 시도하세요.");
      return;
    }

    const parsed = excelPreview;
    const period = excelPeriod;
    const validityLabel = formatValiditySlotLabel(excelValidityDraft) || validityStorageKey(excelValidityDraft);
    const note = `${parsed.fileName} · ${parsed.sheet} · ${validityLabel}`;
    const batchId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `batch-${Date.now()}`;

    resetSaveQueue();
    resetNetworkWriteQueue();
    clearTimeout(autoSaveTimerRef.current);
    skipAutoSaveRef.current = true;
    setSaveBusy(true);
    setExcelUploadStep("costs");
    setExcelMsg("운임 DB 저장 중…");

    const finishUpload = (ok, msg) => {
      setSaveBusy(false);
      setExcelUploadStep(ok ? "done" : "error");
      setExcelMsg(msg);
      setTimeout(() => { skipAutoSaveRef.current = false; }, 2500);
    };

    withTimeout((async () => {
      const baseCosts = pricingSaveRef.current.polCostO ?? polCostO;
      let nextCosts = baseCosts;

      let rentalRhLogged = 0;

      if (parsed.format === "RENTAL") {
        const baseRental = pricingSaveRef.current.rentalRates ?? rentalRates;
        const { rentalRates: clearedRental } = clearRentalPeriodRates(baseRental, period);
        const patch = parsed.cityRates
          ? buildRentalRatesFromCityRates(parsed.cityRates, period)
          : buildRentalRatesFromBases(parsed.bases, period);
        const merged = compactRentalRates(mergeRentalRatesPatch(clearedRental, patch));
        pricingSaveRef.current = { ...pricingSaveRef.current, rentalRates: merged };
        setRentalRates(merged);
        setExcelMsg("Rental 운임 DB 저장 중…");
        await saveSettingDirect("rental_rates_json", JSON.stringify(merged));
        rentalRhLogged = await recordRateHistory(
          { source: "excel_upload", note, batchId },
          { ...pricingSaveRef.current, rentalRates: merged },
        );
        rateHistoryBaselineRef.current = flattenRateSnapshot({ ...pricingSaveRef.current, fData, rData });
      } else if (parsed.format === "DY") {
        nextCosts = mergePolCostsUploadByValidity(baseCosts, parsed.oceanRows, parsed.sellRows, "DY", period, excelValidityDraft);
        nextCosts = backfillPolCostSells(nextCosts, {
          polM: pricingSaveRef.current.polM ?? polM,
          polMFuture: pricingSaveRef.current.polMFuture ?? polMFuture,
          margins: pricingSaveRef.current.margins ?? margins,
        }).polCostO;
        const nextDrop = buildDyDropRates(
          JSON.stringify(carrierDropRates),
          parsed.oceanRows,
          parsed.dropRows,
          period,
        );
        setPolCostO(nextCosts);
        setCarrierDropRates(nextDrop);
        await saveSettingsEntriesDirect([
          ["pol_costs", serializeOceanPolCosts(nextCosts)],
          ["pol_portal_overrides_json", JSON.stringify(extractPortalOverrides(nextCosts))],
          ["carrier_drop_rates_json", JSON.stringify(nextDrop)],
        ]);
        pricingSaveRef.current = { ...pricingSaveRef.current, polCostO: nextCosts, carrierDropRates: nextDrop };
      } else {
        const cr = parsed.carrier || parsed.format;
        const netRows = parsed.netRows || {};
        nextCosts = mergePolCostsUploadByValidity(baseCosts, netRows, parsed.sellRows || {}, cr, period, excelValidityDraft);
        nextCosts = backfillPolCostSells(nextCosts, {
          polM: pricingSaveRef.current.polM ?? polM,
          polMFuture: pricingSaveRef.current.polMFuture ?? polMFuture,
          margins: pricingSaveRef.current.margins ?? margins,
        }).polCostO;
        setPolCostO(nextCosts);
        await saveSettingDirect("pol_costs", serializeOceanPolCosts(nextCosts));
        await saveSettingDirect("pol_portal_overrides_json", JSON.stringify(extractPortalOverrides(nextCosts)));
        pricingSaveRef.current = { ...pricingSaveRef.current, polCostO: nextCosts };
      }

      if (excelSaveValidity) {
        setExcelUploadStep("validity");
        setExcelMsg("Validity 저장 중…");
        const carrierKey = excelUploadCarrierKey(excelFormat, excelYslCarrier, parsed);
        const baseValidity = pricingSaveRef.current.validityInfo ?? validityInfo;
        const nextValidityInfo = mergeUploadValidity(baseValidity, carrierKey, period, excelValidityDraft);
        setValidityInfo(nextValidityInfo);
        pricingSaveRef.current = { ...pricingSaveRef.current, validityInfo: nextValidityInfo };
        const validitySaves = [["validity_info_json", serializeValidityInfo(nextValidityInfo)]];
        const legacyKey = LEGACY_VALIDITY_KEY[carrierKey];
        if (legacyKey) {
          validitySaves.push([legacyKey, formatValiditySlotLabel(nextValidityInfo[carrierKey]?.current)]);
        }
        try {
          await saveSettingsEntriesDirect(validitySaves);
        } catch (validityErr) {
          console.warn("validity save skip", validityErr);
        }
      }

      writePricingCache({
        v: 1,
        polCostO: nextCosts,
        margins: pricingSaveRef.current.margins,
        areaM: pricingSaveRef.current.areaM,
        polM: pricingSaveRef.current.polM,
        polMFuture: pricingSaveRef.current.polMFuture,
        marginTs: pricingSaveRef.current.marginTs,
        areaTs: pricingSaveRef.current.areaTs,
        polTs: pricingSaveRef.current.polTs,
        polTsFuture: pricingSaveRef.current.polTsFuture,
        carrierRates: pricingSaveRef.current.carrierRates,
        carrierDropRates: pricingSaveRef.current.carrierDropRates,
        carrierDropMargins: pricingSaveRef.current.carrierDropMargins,
        validityInfo: pricingSaveRef.current.validityInfo,
        rentalRates: pricingSaveRef.current.rentalRates,
        rentalMargins: pricingSaveRef.current.rentalMargins,
        rentalAreaM: pricingSaveRef.current.rentalAreaM,
        rentalPolM: pricingSaveRef.current.rentalPolM,
        rentalMarginTs: pricingSaveRef.current.rentalMarginTs,
        rentalAreaTs: pricingSaveRef.current.rentalAreaTs,
        rentalPolTs: pricingSaveRef.current.rentalPolTs,
        pricingSavedAt: Date.now(),
        serverSyncedAt: Date.now(),
      });

      const archiveCarrier = parsed.format === "DY" ? "DY" : (parsed.carrier || parsed.format);
      const slotLabel = period === "future" ? "향후" : "현재";
      const archiveN = parsed.format !== "RENTAL" ? countCarrierValidityArchive(nextCosts, archiveCarrier) : 0;
      finishUpload(
        true,
        parsed.format === "RENTAL"
          ? `✅ Rental 저장 완료 · ${validityLabel} (${slotLabel}) · ${Object.keys(parsed.cityRates || parsed.bases || {}).length} POL${rentalRhLogged ? ` · 이력 ${rentalRhLogged}건` : ""}`
          : `✅ 저장 완료 · ${validityLabel} (${slotLabel} 탭) · DB에 validity ${archiveN}구간 누적`,
      );
      persistPublicRates();

      if (parsed.format !== "RENTAL") {
        uploadExcelRateHistory(parsed, period, fData, note, batchId, nextCosts)
          .then(rhResult => {
            if (rhResult.sent > 0) {
              rateHistoryBaselineRef.current = flattenRateSnapshot({ ...pricingSaveRef.current, fData, rData });
              setExcelMsg(`✅ 저장 완료 · Rate History ${rhResult.sent}건`);
            } else if (rhResult.error) {
              setExcelMsg(`✅ 운임 DB 저장됨 · Rate History: ${rhResult.error}`);
            }
          })
          .catch(e => console.warn("Rate History background skip", e));
      }
    })(), EXCEL_UPLOAD_MAX_MS, "업로드 시간 초과 (90초) · 네트워크 확인 후 다시 시도")
      .catch(e => {
        resetSaveQueue();
        resetNetworkWriteQueue();
        finishUpload(false, `저장 실패: ${e.message}`);
      });
  };

  const applyPruneNoServiceRates = () => {
    runSave("서비스外 정리", async () => {
      setRhSelectMsg("");
      const all = await fetchRateHistoryExcelUploadOcean();
      const invalid = all.filter(row => !carrierUploadServesRate(fData, row.carrier, row.pol, row.rate_type));
      if (!invalid.length) {
        setRhSelectMsg("서비스外 기록이 없습니다.");
        return;
      }
      const sample = invalid.slice(0, 5).map(r => `${r.carrier} ${r.pol} ${r.rate_type}`).join("\n");
      if (!window.confirm(
        `포털 서비스 구간 밖 Excel 업로드 기록 ${invalid.length}건을 삭제할까요?\n\n(SNK 일본·CK 양식 POL은 서비스로 인정)\n\n예:\n${sample}${invalid.length > 5 ? "\n…" : ""}\n\n· Rate History에서 제거\n· pol_costs에 남아 있으면 함께 제거`,
      )) return;

      clearTimeout(autoSaveTimerRef.current);
      skipAutoSaveRef.current = true;
      const base = pricingSaveRef.current;
      const applied = applyRateHistoryDeletesToStores(invalid, base, rData);

      if (applied.polCostsChanged) {
        setPolCostO(applied.polCostO);
        await saveOceanPolCostsBundle(applied.polCostO);
      }
      if (applied.dropChanged) {
        setCarrierDropRates(applied.carrierDropRates);
        await saveOneSettingWithRetry("carrier_drop_rates_json", JSON.stringify(applied.carrierDropRates));
      }
      if (applied.rentalChanged) {
        setRentalRates(applied.rentalRates);
        await saveOneSettingWithRetry("rental_rates_json", JSON.stringify(applied.rentalRates));
      }
      pricingSaveRef.current = {
        ...base,
        polCostO: applied.polCostO,
        carrierDropRates: applied.carrierDropRates,
        rentalRates: applied.rentalRates,
      };

      await deleteRateHistoryByIds(invalid.map(r => r.id));
      writePricingCache({
        ...buildPricingCache(),
        polCostO: applied.polCostO,
        pricingSavedAt: Date.now(),
        serverSyncedAt: Date.now(),
      });
      setRhSelectedIds([]);
      const dbNote = applied.dbCleared ? ` · 운임 DB ${applied.dbCleared}셀` : "";
      setRhSelectMsg(`✅ 서비스外 ${invalid.length}건 정리${dbNote}`);
      loadRateHistory();
      setTimeout(() => { skipAutoSaveRef.current = false; }, 2000);
    });
  };

  const applyBackfillSells = () => {
    const base = pricingSaveRef.current;
    const { polCostO: next, filled } = backfillPolCostSells(base.polCostO ?? polCostO, {
      polM: base.polM ?? polM,
      polMFuture: base.polMFuture ?? polMFuture,
      margins: base.margins ?? margins,
    });
    if (!filled) {
      setRhSelectMsg("보완할 매출이 없습니다.");
      return;
    }
    if (!window.confirm(`매출 없는 ${filled}개 셀을 보완할까요?\n\n· 향후 ← 현재 매출 복사\n· Excel '-' 등 누락분 → POL/전역 마진 적용`)) return;
    runSave("매출 보완", async () => {
      clearTimeout(autoSaveTimerRef.current);
      skipAutoSaveRef.current = true;
      setPolCostO(next);
      await saveOceanPolCostsBundle(next);
      pricingSaveRef.current = { ...base, polCostO: next };
      writePricingCache({
        ...buildPricingCache(),
        polCostO: next,
        pricingSavedAt: Date.now(),
        serverSyncedAt: Date.now(),
      });
      setRhSelectMsg(`✅ 매출 ${filled}셀 보완 · pol_costs 저장`);
      loadRateHistory();
      setTimeout(() => { skipAutoSaveRef.current = false; }, 2000);
    });
  };

  const applyBackfillDropRateHistory = async () => {
    if (rhBackfillInFlightRef.current) {
      setRhSelectMsg("Drop off 보완 처리 중…");
      return;
    }
    if (!window.confirm(
      "Admin Drop off 화면의 현재값 중, 변경 이력에 없는 셀만 등록합니다.\n\n"
      + "· 자동 생성 아님 · 버튼을 눌렀을 때만 실행\n"
      + "· 이미 이력에 있는 Moscow 20' 등은 건너뜀\n\n계속할까요?",
    )) return;

    setRhSelectMsg("");
    rhBackfillInFlightRef.current = true;
    setRhLoading(true);
    try {
      const freshRows = await api(buildRateHistoryQuery({
        scope: rhScope,
        carrier: rhCarrier,
        area: rhArea,
        period: rhPeriod,
        category: rhCategory,
        pol: rhPol,
        dateFrom: rhDateFrom,
        dateTo: rhDateTo,
      }));
      const existingKeys = new Set(
        (Array.isArray(freshRows) ? freshRows : []).map(r => rateHistoryEntryKey(r)),
      );
      const snap = flattenRateSnapshot({ ...pricingSaveRef.current, fData, rData });
      const batch_id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `batch-${Date.now()}`;
      const rows = [];
      snap.forEach((entry) => {
        if (entry.category !== "dropoff") return;
        if (existingKeys.has(rateHistoryEntryKey(entry))) return;
        rows.push({
          batch_id,
          source: "history_backfill",
          note: "Drop off 누락 보완",
          carrier: entry.carrier,
          area: entry.area || null,
          pol: entry.pol,
          route: entry.route || entry.pol,
          rate_type: entry.rate_type,
          period: entry.period,
          category: entry.category,
          cost: entry.cost,
          sell: entry.sell,
          margin: entry.margin,
        });
      });
      if (!rows.length) {
        setRhSelectMsg("Drop off 누락 이력 없음 · 화면·DB와 이력 키가 일치합니다");
        return;
      }
      const preview = rows.slice(0, 4).map(r =>
        `${r.pol} ${r.rate_type === "drop20" ? "20'" : "40'"} ${r.period === "future" ? "향후" : "현재"}`,
      ).join(", ");
      setRhSelectMsg(`Drop off ${rows.length}건 이력 보완 중… (${preview}${rows.length > 4 ? " …" : ""})`);
      const count = await postRateHistoryRows(rows);
      rateHistoryBaselineRef.current = snap;
      rateHistoryLastLogAtRef.current = Date.now();
      setRhSelectMsg(`✅ Drop off ${count || rows.length}건 이력 보완 · 출처「이력 보완」`);
      loadRateHistory();
    } catch (e) {
      setRhSelectMsg(`Drop off 보완 실패: ${e.message}`);
    } finally {
      rhBackfillInFlightRef.current = false;
      setRhLoading(false);
    }
  };

  const applyFindRhDuplicates = () => {
    setRhSelectMsg("");
    const { removeIds, keepIds, groupCount, removeCount, highlightIds } = pickRateHistoryDuplicatesToRemove(rhRows);
    if (!removeCount) {
      setRhDuplicateIds(new Set());
      setRhSelectedIds([]);
      setRhShowDuplicatesOnly(false);
      setRhSelectMsg("중복 기록 없음 (동일 POL·타입·매입·매출·마진 기준)");
      return;
    }
    setRhDuplicateIds(new Set(highlightIds));
    setRhSelectedIds(removeIds);
    setRhShowDuplicatesOnly(true);
    const keepLabels = keepIds.map(id => {
      const r = rhRows.find(x => x.id === id);
      if (!r) return "";
      const src = { excel_upload: "Excel", auto_save: "자동저장", admin_save: "Admin" }[r.source] || r.source;
      return `${r.pol} ${r.rate_type}→${src}`;
    }).slice(0, 3);
    setRhSelectMsg(
      `🔍 중복 ${removeCount}건 (${groupCount}그룹) · 삭제 예정 행 선택됨 · 유지 우선: Excel > Admin > 자동저장`
      + (keepLabels.length ? `\n예: ${keepLabels.join(", ")}${groupCount > 3 ? " …" : ""}` : ""),
    );
  };

  const applyDeleteSelectedRhHistoryOnly = async () => {
    if (!rhSelectedIds.length) {
      setRhSelectMsg("선택된 항목이 없습니다.");
      return;
    }
    const n = rhSelectedIds.length;
    if (!window.confirm(
      `선택한 ${n}건을 Rate History에서만 삭제할까요?\n\n· 운임 DB(pol_costs 등)는 변경하지 않습니다\n· 자동저장·Excel 중복 이력 정리용`,
    )) return;
    setRhSelectMsg("이력 삭제 중…");
    try {
      await api(`rate_history?id=in.(${rhSelectedIds.join(",")})`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      setRhSelectedIds([]);
      setRhDuplicateIds(new Set());
      setRhShowDuplicatesOnly(false);
      setRhSelectMsg(`✅ 이력 ${n}건 삭제 완료 (운임 DB 유지)`);
      loadRateHistory();
    } catch (e) {
      setRhSelectMsg(`이력 삭제 실패: ${e.message}`);
    }
  };

  const applyDeleteSelectedRhRows = () => {
    if (!rhSelectedIds.length) {
      setRhSelectMsg("선택된 항목이 없습니다.");
      return;
    }
    const selected = rhRows.filter(r => rhSelectedIds.includes(r.id));
    const n = selected.length;
    if (!window.confirm(
      `선택한 ${n}건을 삭제할까요?\n\n· Rate History 기록 제거\n· Supabase 운임 DB(pol_costs 등)에서 해당 요율 제거`,
    )) return;
    runSave("운임 삭제", async () => {
      clearTimeout(autoSaveTimerRef.current);
      skipAutoSaveRef.current = true;
      setRhSelectMsg("");

      const base = pricingSaveRef.current;
      const applied = applyRateHistoryDeletesToStores(selected, base, rData);

      if (applied.polCostsChanged) {
        setPolCostO(applied.polCostO);
        await saveOceanPolCostsBundle(applied.polCostO);
      }
      if (applied.dropChanged) {
        setCarrierDropRates(applied.carrierDropRates);
        await saveOneSettingWithRetry("carrier_drop_rates_json", JSON.stringify(applied.carrierDropRates));
      }
      if (applied.rentalChanged) {
        setRentalRates(applied.rentalRates);
        await saveOneSettingWithRetry("rental_rates_json", JSON.stringify(applied.rentalRates));
      }

      pricingSaveRef.current = {
        ...base,
        polCostO: applied.polCostO,
        carrierDropRates: applied.carrierDropRates,
        rentalRates: applied.rentalRates,
      };

      await api(`rate_history?id=in.(${rhSelectedIds.join(",")})`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });

      writePricingCache({
        ...buildPricingCache(),
        pricingSavedAt: Date.now(),
        serverSyncedAt: Date.now(),
      });

      const dbNote = applied.dbCleared ? ` · 운임 DB ${applied.dbCleared}셀` : "";
      setRhSelectedIds([]);
      setRhDuplicateIds(new Set());
      setRhShowDuplicatesOnly(false);
      setRhSelectMsg(`✅ ${n}건 삭제 완료${dbNote}`);
      loadRateHistory();
      setTimeout(() => { skipAutoSaveRef.current = false; }, 2000);
    });
  };

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
      try { sessionStorage.setItem(ADMIN_SESSION_KEY, "1"); } catch (_) {}
    } else { setLoginErr("Wrong PIN"); }
  };

  const logout = () => {
    setMode("guest");
    setClient(null);
    try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch (_) {}
  };

  useEffect(() => {
    if (ADMIN_SKIP_PIN && sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
      setMode("admin");
    }
  }, []);

  const loadClients = async () => { const d = await api("clients?select=*&order=created_at.desc"); setClients(d); };
  const saveClient = async () => { await api("clients",{method:"POST",body:JSON.stringify(newC)}); setAddForm(false); setNewC({company_name:"",email:"",password_hash:"",margin_coc20:80,margin_coc40:100,margin_soc20:80,margin_soc40:100,notes:""}); loadClients(); };
  const updateMargins = async (id,data) => { await api(`clients?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(data)}); setEditC(null); loadClients(); };
  const toggleClient = async (id,cur) => { await api(`clients?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({is_active:!cur})}); loadClients(); };

  const stripPolMarginType = (type, polNames = null) => {
    const allowed = polNames ? new Set(polNames) : null;
    setPolM(p => {
      const n = { ...p };
      Object.keys(n).forEach(pol => {
        if (allowed && !allowed.has(pol)) return;
        if (n[pol]?.[type] == null) return;
        const next = { ...n[pol] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
      });
      return n;
    });
    setPolTs(p => {
      const n = { ...p };
      Object.keys(n).forEach(pol => {
        if (allowed && !allowed.has(pol)) return;
        if (n[pol]?.[type] == null) return;
        const next = { ...n[pol] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
      });
      return n;
    });
  };

  const stripAreaMarginType = (type, areaName = null) => {
    setAreaM(p => {
      const n = { ...p };
      Object.keys(n).forEach(area => {
        if (areaName && area !== areaName) return;
        if (n[area]?.[type] == null) return;
        const next = { ...n[area] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[area];
        else n[area] = next;
      });
      return n;
    });
    setAreaTs(p => {
      const n = { ...p };
      Object.keys(n).forEach(area => {
        if (areaName && area !== areaName) return;
        if (n[area]?.[type] == null) return;
        const next = { ...n[area] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[area];
        else n[area] = next;
      });
      return n;
    });
  };

  const getM = (pol, area, type, period = "current") =>
    pickLatestMargin(resolveMarginCandidates(pol, area, type, period, {
      margins, marginTs, areaM, areaTs, polM, polTs, polMFuture, polTsFuture,
    }));

  /** 선사 Admin 단가표: sell 저장값 → POL 마진 → 동일 POL 마진(형제 타입) */
  const getCarrierAdminSell = (pol, cr, type, period, cost) => {
    if (cost == null) return null;
    const explicit = resolveCarrierExplicitSell(polCostO, pol, cr, type, period);
    if (explicit != null) return explicit;
    const polMargin = getPolStoredMargin(pol, type, period, polM, polMFuture);
    if (polMargin != null) return cost + polMargin;
    const sibling = polCostSiblingMargin(polCostO, pol, cr, period, type);
    if (sibling != null) return cost + sibling;
    return null;
  };

  /** 게스트·포털: sell 저장값 → POL 마진 → getM() 전체 마진 */
  const getGuestCarrierSell = (pol, cr, type, period, cost, area) => {
    if (usePublic) return pubOcean(pol, cr, type, period);
    return resolveCarrierEffectiveSell(polCostO, pol, cr, type, period, cost, {
      polM,
      polMFuture,
      fullMargin: getM(pol, area, type, period),
    });
  };

  const applyBuyingGriBulk = (deltas, rows, carrier, period) => {
    if (!rows?.length || !Object.keys(deltas).length) return;
    setGriBuyUndo({ carrier, period, polCostO: JSON.parse(JSON.stringify(polCostO)) });
    const nextCosts = buildBuyingGriCosts(polCostO, {
      deltas, rows, carrier, period, carrierRates, fData,
    });
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    setPolCostO(nextCosts);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: nextCosts,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveOceanPolCostsBundle(nextCosts);
    })
      .then(() => {
        writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
        recordRateHistory({ source: "gri", note: `매입 GRI ${griPeriodLabel(period)}` }, { ...pricingSaveRef.current, polCostO: nextCosts });
        persistPublicRates();
        flashSaveFeedback("success", `✅ 매입 GRI (${griPeriodLabel(period)}) · 저장 완료`);
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const undoBuyingGriBulk = () => {
    if (!griBuyUndo) return;
    const restored = griBuyUndo.polCostO;
    setGriBuyUndo(null);
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    setPolCostO(restored);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: restored,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveOceanPolCostsBundle(restored);
    })
      .then(() => {
        writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
        recordRateHistory({ source: "gri", note: "매입 GRI 되돌리기" }, { ...pricingSaveRef.current, polCostO: restored });
        flashSaveFeedback("success", "✅ 매입 GRI 되돌리기 · 저장 완료");
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const applySellingGriBulk = (deltas, rows, carrier, period) => {
    if (!rows?.length || !Object.keys(deltas).length) return;
    setGriSellUndo({
      carrier,
      period,
      polCostO: JSON.parse(JSON.stringify(polCostO)),
    });
    const nextCosts = buildSellingGriSells(polCostO, {
      deltas,
      rows,
      carrier,
      period,
      carrierRates,
      fData,
      polM,
      polMFuture,
    });
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    setPolCostO(nextCosts);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: nextCosts,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveOceanPolCostsBundle(nextCosts);
    })
      .then(() => {
        writePricingCache({
          ...(readStoredPricingCache() || {}),
          polCostO: nextCosts,
          pricingSavedAt: Date.now(),
          serverSyncedAt: Date.now(),
        });
        recordRateHistory({ source: "gri", note: `매출 GRI ${griPeriodLabel(period)}` }, { ...pricingSaveRef.current, polCostO: nextCosts });
        persistPublicRates();
        flashSaveFeedback("success", `✅ 매출 GRI (${griPeriodLabel(period)}) · 저장 완료`);
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const undoSellingGriBulk = () => {
    if (!griSellUndo) return;
    const { polCostO: restoredCosts } = griSellUndo;
    setGriSellUndo(null);
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    setPolCostO(restoredCosts);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: restoredCosts,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveOceanPolCostsBundle(restoredCosts);
    })
      .then(() => {
        writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
        recordRateHistory({ source: "gri", note: "매출 GRI 되돌리기" }, { ...pricingSaveRef.current, polCostO: restoredCosts });
        flashSaveFeedback("success", "✅ 매출 GRI 되돌리기 · 저장 완료");
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const importCurrentToFutureFreight = (carrier, dropoffMode) => {
    if (!window.confirm(`${CN_KR[carrier]} 현재 운임을 향후 운임에 복사합니다.\n기존 향후 운임 값은 덮어씁니다. 계속할까요?`)) return;
    setImportFreightUndo({
      carrier,
      dropoffMode,
      polCostO: JSON.parse(JSON.stringify(polCostO)),
      carrierRates: JSON.parse(JSON.stringify(carrierRates)),
      carrierDropRates: JSON.parse(JSON.stringify(carrierDropRates)),
    });
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    setCarrierEditCell(null);

    if (dropoffMode) {
      const nextDrop = copyCarrierDropRatesPeriod(carrierDropRates, carrier);
      setCarrierDropRates(nextDrop);
      writePricingCache({
        ...(readStoredPricingCache() || { v: 1 }),
        v: 1,
        carrierDropRates: nextDrop,
        pricingSavedAt: Date.now(),
      });
      enqueueSave(async () => {
        await saveOneSettingWithRetry("carrier_drop_rates_json", JSON.stringify(nextDrop));
      })
        .then(() => {
          writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
          recordRateHistory({ source: "import", note: `${CN_KR[carrier]} Drop off 향후 복사` }, { ...pricingSaveRef.current, carrierDropRates: nextDrop });
          flashSaveFeedback("success", `✅ ${CN_KR[carrier]} Drop off · 기존운임 → 향후 복사 완료`);
        })
        .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
        .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
      return;
    }

    const nextCosts = buildCopyCurrentToFutureCosts(polCostO, {
      rows: fData, carrier, carrierRates, fData,
    });
    const nextRates = copyCarrierRatesPeriod(carrierRates, carrier);
    setPolCostO(nextCosts);
    setCarrierRates(nextRates);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: nextCosts,
      carrierRates: nextRates,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveOceanPolCostsBundle(nextCosts);
      await saveOneSettingWithRetry("carrier_rates_json", JSON.stringify(nextRates));
    })
      .then(() => {
        writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
        recordRateHistory({ source: "import", note: `${CN_KR[carrier]} 향후 복사` }, { ...pricingSaveRef.current, polCostO: nextCosts, carrierRates: nextRates });
        flashSaveFeedback("success", `✅ ${CN_KR[carrier]} · 기존운임 → 향후 복사 완료 · GRI로 조정하세요`);
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const undoImportFreight = () => {
    if (!importFreightUndo) return;
    const {
      carrier, dropoffMode,
      polCostO: restoredCosts, carrierRates: restoredRates, carrierDropRates: restoredDrop,
    } = importFreightUndo;
    setImportFreightUndo(null);
    cancelPendingPricingSave();
    resetSaveQueue();
    skipAutoSaveRef.current = true;
    if (dropoffMode) {
      setCarrierDropRates(restoredDrop);
      writePricingCache({
        ...(readStoredPricingCache() || { v: 1 }),
        v: 1,
        carrierDropRates: restoredDrop,
        pricingSavedAt: Date.now(),
      });
      enqueueSave(async () => {
        await saveOneSettingWithRetry("carrier_drop_rates_json", JSON.stringify(restoredDrop));
      })
        .then(() => {
          writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
          recordRateHistory({ source: "import_undo" }, { ...pricingSaveRef.current, carrierDropRates: restoredDrop });
          flashSaveFeedback("success", "✅ 기존운임 가져오기 되돌리기 · 저장 완료");
        })
        .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
        .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
      return;
    }
    setPolCostO(restoredCosts);
    setCarrierRates(restoredRates);
    writePricingCache({
      ...(readStoredPricingCache() || { v: 1 }),
      v: 1,
      polCostO: restoredCosts,
      carrierRates: restoredRates,
      pricingSavedAt: Date.now(),
    });
    enqueueSave(async () => {
      await saveOceanPolCostsBundle(restoredCosts);
      await saveOneSettingWithRetry("carrier_rates_json", JSON.stringify(restoredRates));
    })
      .then(() => {
        writePricingCache({ ...(readStoredPricingCache() || {}), serverSyncedAt: Date.now() });
        recordRateHistory({ source: "import_undo" }, { ...pricingSaveRef.current, polCostO: restoredCosts, carrierRates: restoredRates });
        flashSaveFeedback("success", "✅ 기존운임 가져오기 되돌리기 · 저장 완료");
      })
      .catch(e => flashSaveFeedback("error", `저장 실패: ${e.message}`))
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
  };

  const applyPolMargin = (pol, type, value, period = "current") => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    const isFuture = period === "future";
    const setStore = isFuture ? setPolMFuture : setPolM;
    const setTsStore = isFuture ? setPolTsFuture : setPolTs;
    if (raw === "") {
      setStore(p => {
        if (p[pol]?.[type] == null) return p;
        const next = { ...p[pol] };
        delete next[type];
        const n = { ...p };
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
        return n;
      });
      setTsStore(p => {
        if (p[pol]?.[type] == null) return p;
        const next = { ...p[pol] };
        delete next[type];
        const n = { ...p };
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
        return n;
      });
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setStore(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: v } }));
    setTsStore(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: ts } }));
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
    const raw = String(value).trim();
    const ts = marginNowTs();
    if (raw === "") {
      setMargins(p => ({ ...p, [type]: "" }));
      setMarginTs(p => ({ ...p, [type]: ts }));
      stripPolMarginType(type);
      stripAreaMarginType(type);
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setMargins(p => ({ ...p, [type]: v }));
    setMarginTs(p => ({ ...p, [type]: ts }));
    stripPolMarginType(type);
    stripAreaMarginType(type);
  };

  const applyAreaMarginType = (area, type, value) => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    if (raw === "") {
      setAreaM(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: "" } }));
      setAreaTs(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: ts } }));
      stripPolMarginType(type, fData.filter(d => d.area === area).map(d => d.pol));
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setAreaM(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: v } }));
    setAreaTs(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: ts } }));
    stripPolMarginType(type, fData.filter(d => d.area === area).map(d => d.pol));
  };

  const applyAreaMargins = (area, m) => {
    if (m) {
      const ts = marginNowTs();
      const pols = fData.filter(d => d.area === area).map(d => d.pol);
      setAreaM(p => ({ ...p, [area]: m }));
      setAreaTs(p => ({
        ...p,
        [area]: {
          ...(p[area] || {}),
          ...Object.fromEntries(Object.keys(m).map(t => [t, ts])),
        },
      }));
      Object.keys(m).forEach(t => stripPolMarginType(t, pols));
    } else {
      setAreaM(p => { const n = { ...p }; delete n[area]; return n; });
      setAreaTs(p => { const n = { ...p }; delete n[area]; return n; });
    }
  };

  const stripRentalPolMarginType = (type, polNames = null) => {
    const allowed = polNames ? new Set(polNames) : null;
    setRentalPolM(p => {
      const n = { ...p };
      Object.keys(n).forEach(pol => {
        if (allowed && !allowed.has(pol)) return;
        if (n[pol]?.[type] == null) return;
        const next = { ...n[pol] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
      });
      return n;
    });
    setRentalPolTs(p => {
      const n = { ...p };
      Object.keys(n).forEach(pol => {
        if (allowed && !allowed.has(pol)) return;
        if (n[pol]?.[type] == null) return;
        const next = { ...n[pol] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
      });
      return n;
    });
  };

  const stripRentalAreaMarginType = (type, areaName = null) => {
    setRentalAreaM(p => {
      const n = { ...p };
      Object.keys(n).forEach(area => {
        if (areaName && area !== areaName) return;
        if (n[area]?.[type] == null) return;
        const next = { ...n[area] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[area];
        else n[area] = next;
      });
      return n;
    });
    setRentalAreaTs(p => {
      const n = { ...p };
      Object.keys(n).forEach(area => {
        if (areaName && area !== areaName) return;
        if (n[area]?.[type] == null) return;
        const next = { ...n[area] };
        delete next[type];
        if (Object.keys(next).length === 0) delete n[area];
        else n[area] = next;
      });
      return n;
    });
  };

  const getRentalM = (pol, area, type) => {
    const types = (type === "r40dv" || type === "r40hc") ? [type, "r40"] : [type];
    const candidates = [];
    types.forEach(t => {
      candidates.push({ value: marginNum(rentalMargins[t]), ts: rentalMarginTs[t] ?? 0 });
      const areaVal = rentalAreaM[area]?.[t];
      if (areaVal != null && areaVal !== "") {
        candidates.push({ value: marginNum(areaVal), ts: rentalAreaTs[area]?.[t] ?? 0 });
      }
      const polVal = rentalPolM[pol]?.[t];
      if (polVal != null && polVal !== "") {
        candidates.push({ value: marginNum(polVal), ts: rentalPolTs[pol]?.[t] ?? 0 });
      }
    });
    return pickLatestMargin(candidates);
  };

  const applyRentalPolMargin = (pol, type, value) => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    if (raw === "") {
      setRentalPolM(p => {
        if (p[pol]?.[type] == null) return p;
        const next = { ...p[pol] };
        delete next[type];
        const n = { ...p };
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
        return n;
      });
      setRentalPolTs(p => {
        if (p[pol]?.[type] == null) return p;
        const next = { ...p[pol] };
        delete next[type];
        const n = { ...p };
        if (Object.keys(next).length === 0) delete n[pol];
        else n[pol] = next;
        return n;
      });
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setRentalPolM(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: v } }));
    setRentalPolTs(p => ({ ...p, [pol]: { ...(p[pol] || {}), [type]: ts } }));
  };

  const applyRentalPolMargins = (pol, m) => {
    const ts = marginNowTs();
    setRentalPolM(p => ({ ...p, [pol]: m }));
    setRentalPolTs(p => ({
      ...p,
      [pol]: { ...(p[pol] || {}), ...Object.fromEntries(Object.keys(m).map(t => [t, ts])) },
    }));
  };

  const clearRentalPolMargins = (pol) => {
    setRentalPolM(p => { const n = { ...p }; delete n[pol]; return n; });
    setRentalPolTs(p => { const n = { ...p }; delete n[pol]; return n; });
  };

  const applyRentalGlobalMargin = (type, value) => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    if (raw === "") {
      setRentalMargins(p => ({ ...p, [type]: "" }));
      setRentalMarginTs(p => ({ ...p, [type]: ts }));
      stripRentalPolMarginType(type);
      stripRentalAreaMarginType(type);
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setRentalMargins(p => ({ ...p, [type]: v }));
    setRentalMarginTs(p => ({ ...p, [type]: ts }));
    stripRentalPolMarginType(type);
    stripRentalAreaMarginType(type);
  };

  const applyRentalAreaMarginType = (area, type, value) => {
    const raw = String(value).trim();
    const ts = marginNowTs();
    if (raw === "") {
      setRentalAreaM(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: "" } }));
      setRentalAreaTs(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: ts } }));
      stripRentalPolMarginType(type, rentalPolData.filter(d => d.area === area).map(d => d.pol));
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setRentalAreaM(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: v } }));
    setRentalAreaTs(p => ({ ...p, [area]: { ...(p[area] || {}), [type]: ts } }));
    stripRentalPolMarginType(type, rentalPolData.filter(d => d.area === area).map(d => d.pol));
  };

  const applyRentalAreaMargins = (area, m) => {
    if (m) {
      const ts = marginNowTs();
      const pols = rentalPolData.filter(d => d.area === area).map(d => d.pol);
      setRentalAreaM(p => ({ ...p, [area]: m }));
      setRentalAreaTs(p => ({
        ...p,
        [area]: { ...(p[area] || {}), ...Object.fromEntries(Object.keys(m).map(t => [t, ts])) },
      }));
      Object.keys(m).forEach(t => stripRentalPolMarginType(t, pols));
    } else {
      setRentalAreaM(p => { const n = { ...p }; delete n[area]; return n; });
      setRentalAreaTs(p => { const n = { ...p }; delete n[area]; return n; });
    }
  };

  const rentalType = (comboIdx) => rentComboMarginType(comboIdx);

  const patchValiditySlot = (entry, period, field, value) => {
    const slot = { ...normalizeValiditySlot(entry[period]) };
    if (field === "furtherNotice") {
      slot.furtherNotice = !!value;
      if (slot.furtherNotice) slot.till = "";
    } else {
      slot[field] = value;
      if (field === "till") slot.furtherNotice = false;
      if (period === "current" && field === "till" && value) {
        const fut = { ...entry.future };
        if (!fut.furtherNotice) {
          entry.future = { ...fut, from: syncFromAfterTill(value, fut.from) };
        }
      }
    }
    entry[period] = slot;
    if (period === "future" || period === "current") {
      entry[period] = repairValiditySlot(entry[period]);
    }
    return entry;
  };

  const updateValiditySlot = async (carrier, period, field, value) => {
    const entry = normalizeValidityCarrier(validityInfo[carrier] || {});
    patchValiditySlot(entry, period, field, value);
    const next = { ...validityInfo, [carrier]: normalizeValidityCarrier(entry) };

    // 1. 화면 state + ref 업데이트
    setValidityInfo(next);
    pricingSaveRef.current = { ...pricingSaveRef.current, validityInfo: next };

    // 2. 캐시 즉시 업데이트 (새로고침 대비)
    const cachedNow = readStoredPricingCache() || { v: 1 };
    writePricingCache({ ...cachedNow, validityInfo: next, pricingSavedAt: Date.now() });

    // 3. 서버 저장
    const serialized = serializeValidityInfo(next);
    const saves = [["validity_info_json", serialized]];
    const legacyKey = LEGACY_VALIDITY_KEY[carrier];
    if (legacyKey) saves.push([legacyKey, formatValiditySlotLabel(next[carrier]?.current)]);
    try {
      for (const [k, v] of saves) await saveSettingValue(k, v);
      // 4. 서버 저장 성공 시 캐시에 serverSyncedAt 갱신
      writePricingCache({ ...readStoredPricingCache(), serverSyncedAt: Date.now() });
      flashSaveFeedback("ok", "Validity 저장됨");
    } catch (e) {
      console.warn("validity save failed", e);
      flashSaveFeedback("error", `Validity 저장 실패: ${e?.message ?? e}`);
    }
  };

  const syncExcelValidityDraft = useCallback(() => {
    const key = excelUploadCarrierKey(excelFormat, excelYslCarrier);
    setExcelValidityDraft(normalizeValiditySlot(validityInfo[key]?.[excelPeriod]));
  }, [excelFormat, excelPeriod, excelYslCarrier, validityInfo]);

  useEffect(() => {
    if (showFreightAdmin && freightAdminTab === "upload") syncExcelValidityDraft();
  }, [showFreightAdmin, freightAdminTab, syncExcelValidityDraft]);

  // validityInfo 변경 시 탭과 무관하게 독립적으로 저장 (1초 debounce)
  useEffect(() => {
    if (!isAdmin || skipAutoSaveRef.current) return;
    const timer = setTimeout(() => {
      saveSettingValue("validity_info_json", serializeValidityInfo(validityInfo))
        .catch(e => console.warn("validity debounce save failed", e));
    }, 1000);
    return () => clearTimeout(timer);
  }, [validityInfo, isAdmin]);

  const updateExcelValidityDraft = (_carrier, period, field, value) => {
    setExcelValidityDraft(prev => {
      const entry = normalizeValidityCarrier({ [period]: prev });
      patchValiditySlot(entry, period, field, value);
      return entry[period];
    });
  };

  const getFutureFromMinDate = () => undefined;

  const legacyValidityCurrent = (carrierKey) =>
    formatValiditySlotLabel(validityInfo[carrierKey]?.current);

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
    await saveSettingsEntries([
      ["notices_json", JSON.stringify(notices)],
      ["notice_text", notices[0].text],
      ["notice_on", notices[0].on],
      ["notice_file_url", notices[0].fileUrl],
    ]);
  };

  const saveAdBannersSetting = async (banners) => {
    await saveSetting("ad_banners_json", JSON.stringify(banners));
  };

  const patchAd = (idx, patch) => setAdBanners(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a));

  const uploadAdFile = async (file, slotIdx) => {
    setAdUploadLoading(true);
    setAdUploadMsg("");
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const fname = `ad_banner_${slotIdx + 1}_${Date.now()}.${ext}`;
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
      let next;
      setAdBanners(prev => {
        next = prev.map((a, i) => i === slotIdx ? { ...a, imageUrl: url, on: true } : a);
        return next;
      });
      await saveAdBannersSetting(next);
      setAdUploadMsg(`광고 ${slotIdx + 1} 업로드 완료 — 하단에 즉시 반영!`);
      setTimeout(() => setAdUploadMsg(""), 2500);
    } catch (e) {
      setAdUploadMsg("업로드 실패: " + e.message);
    }
    setAdUploadLoading(false);
  };

  const persistAdBanners = (banners) => runSave("광고", () => saveAdBannersSetting(banners));

  const dismissAd = () => {
    setAdDismissed(true);
    sessionStorage.setItem("ysl_ad_dismissed", "1");
  };

  const saveSetting = async (key, value) => {
    await saveOneSettingWithRetry(key, value);
  };

  const enqueueSave = (task) => {
    const job = saveQueueRef.current.then(task);
    saveQueueRef.current = job.catch(() => {});
    return job;
  };

  const dismissSaveFeedback = () => {
    if (saveFeedbackTimerRef.current) clearTimeout(saveFeedbackTimerRef.current);
    setSaveFeedback({ type: null, message: "" });
    autoSaveInFlightRef.current = false;
    setSaveBusy(false);
  };

  const flashSaveFeedback = (type, message) => {
    if (saveFeedbackTimerRef.current) clearTimeout(saveFeedbackTimerRef.current);
    setSaveFeedback({ type, message });
    if (type === "success") {
      saveFeedbackTimerRef.current = setTimeout(() => {
        setSaveFeedback({ type: null, message: "" });
      }, 5000);
    }
  };

  const runSave = async (successLabel, fn) => {
    if (saveBusy) {
      flashSaveFeedback("error", "다른 저장이 진행 중입니다. 완료 후 다시 시도하세요.");
      return;
    }
    cancelPendingPricingSave();
    resetSaveQueue();
    setSaveBusy(true);
    setSaveFeedback({ type: null, message: "" });
    try {
      await withTimeout(
        Promise.resolve().then(fn),
        SAVE_UI_MAX_MS,
        "저장 시간 초과 (3분) · 네트워크 확인 후 💾 저장 재시도",
      );
      writePricingCache({
        ...buildPricingCache(),
        pricingSavedAt: Date.now(),
        serverSyncedAt: Date.now(),
      });
      flashSaveFeedback("success", `✅ ${successLabel} 저장 완료`);
      persistPublicRates();
      if (!String(successLabel).includes("Excel")) {
        const isRoutinePricingSave = [DB_LABEL[DB_DROP], DB_LABEL[DB_OCEAN], DB_LABEL[DB_RENTAL]].includes(successLabel);
        const recentAutoLog = Date.now() - rateHistoryLastLogAtRef.current < 10000;
        if (!isRoutinePricingSave || !recentAutoLog) {
          recordRateHistory({ source: "admin_save", note: successLabel });
        } else {
          rateHistoryBaselineRef.current = flattenRateSnapshot({ ...pricingSaveRef.current, fData, rData });
        }
      }
    } catch (e) {
      resetSaveQueue();
      flashSaveFeedback("error", `저장 실패: ${e.message}`);
    } finally {
      setSaveBusy(false);
    }
  };

  const adminSaveToastEl = isAdmin && (saveBusy || saveFeedback.type)
    ? createPortal(<AdminSaveToast busy={saveBusy} feedback={saveFeedback} onDismiss={dismissSaveFeedback} />, document.body)
    : null;

  const getDropOffSaveEntries = () => {
    const s = pricingSaveRef.current;
    return [
      ["carrier_drop_rates_json", JSON.stringify(serializeCarrierDropRatesForSave(s.carrierDropRates))],
      ["carrier_drop_margins_json", JSON.stringify(s.carrierDropMargins)],
      ["validity_info_json", serializeValidityInfo(s.validityInfo)],
    ];
  };

  const getOceanSaveEntries = () => {
    const s = pricingSaveRef.current;
    return [
      ["pol_costs", serializeOceanPolCosts(s.polCostO)],
      ["pol_portal_overrides_json", JSON.stringify(extractPortalOverrides(s.polCostO))],
      ["pol_margins", JSON.stringify(s.polM)],
      ["pol_margins_future", JSON.stringify(s.polMFuture)],
      ["global_margins", JSON.stringify(s.margins)],
      ["area_margins", JSON.stringify(s.areaM)],
      ["margin_timestamps", JSON.stringify(s.marginTs)],
      ["area_margin_timestamps", JSON.stringify(s.areaTs)],
      ["pol_margin_timestamps", JSON.stringify(s.polTs)],
      ["pol_margin_timestamps_future", JSON.stringify(s.polTsFuture)],
      ["carrier_rates_json", JSON.stringify(s.carrierRates)],
      ["validity_info_json", serializeValidityInfo(s.validityInfo)],
    ];
  };

  /** @deprecated — 해상+Drop 혼합 저장 금지. getOceanSaveEntries / getDropOffSaveEntries 사용 */
  const getCarrierSaveEntries = () => getOceanSaveEntries();

  const getRentalSaveEntries = () => {
    const s = pricingSaveRef.current;
    return [
      ["rental_rates_json", JSON.stringify(s.rentalRates)],
      ["rental_global_margins", JSON.stringify(s.rentalMargins)],
      ["rental_area_margins", JSON.stringify(s.rentalAreaM)],
      ["rental_pol_margins", JSON.stringify(s.rentalPolM)],
      ["rental_margin_timestamps", JSON.stringify(s.rentalMarginTs)],
      ["rental_area_margin_timestamps", JSON.stringify(s.rentalAreaTs)],
      ["rental_pol_margin_timestamps", JSON.stringify(s.rentalPolTs)],
      ["validity_info_json", serializeValidityInfo(s.validityInfo)],
    ];
  };

  const getPricingSaveEntries = () => [
    ...getOceanSaveEntries(),
    ...getDropOffSaveEntries().filter(([k]) => k !== "validity_info_json"),
    ...getRentalSaveEntries().filter(([k]) => k !== "validity_info_json"),
  ];

  const saveOceanDb = () => saveSettingsEntriesDirect(getOceanSaveEntries());
  const saveDropDb = async () => {
    const rows = getDropOffSaveEntries().map(([key, value]) => ({ key, value: String(value) }));
    await postSettingsRows(rows, DB_LABEL[DB_DROP]);
  };
  const saveRentalDb = () => saveSettingsEntriesDirect(getRentalSaveEntries());
  const saveAllPricingDbs = async () => {
    await saveOceanDb();
    await saveDropDb();
    await saveRentalDb();
  };

  const persistOceanQuiet = () => enqueueSave(() => saveOceanDb());
  const persistDropQuiet = () => enqueueSave(() => saveDropDb());
  const persistRentalQuiet = () => enqueueSave(() => saveRentalDb());
  const persistCarrierQuiet = persistOceanQuiet;

  const buildPricingCache = () => {
    const s = pricingSaveRef.current;
    return {
      v: 1,
      polCostO: s.polCostO,
      margins: s.margins,
      areaM: s.areaM,
      polM: s.polM,
      polMFuture: s.polMFuture,
      marginTs: s.marginTs,
      areaTs: s.areaTs,
      polTs: s.polTs,
      polTsFuture: s.polTsFuture,
      carrierRates: s.carrierRates,
      carrierDropRates: s.carrierDropRates,
      carrierDropMargins: s.carrierDropMargins,
      validityInfo: s.validityInfo,
      rentalRates: s.rentalRates,
      rentalMargins: s.rentalMargins,
      rentalAreaM: s.rentalAreaM,
      rentalPolM: s.rentalPolM,
      rentalMarginTs: s.rentalMarginTs,
      rentalAreaTs: s.rentalAreaTs,
      rentalPolTs: s.rentalPolTs,
    };
  };

  const applyPricingSnapshot = (snap, s = {}) => {
    if (!snap) return;
    if (settingBundleHas(s, "validity_info_json")) {
      setValidityInfo(snap.validityInfo);
    }
    if (settingBundleHas(s, "carrier_rates_json")) setCarrierRates(snap.carrierRates);
    if (settingBundleHas(s, "rental_rates_json")) setRentalRates(snap.rentalRates);
    if (settingBundleHas(s, "global_margins")) setMargins(snap.margins);
    if (settingBundleHas(s, "area_margins")) setAreaM(snap.areaM);
    if (settingBundleHas(s, "pol_margins")) setPolM(snap.polM || {});
    if (settingBundleHas(s, "pol_margins_future")) setPolMFuture(snap.polMFuture || {});
    if (settingBundleHas(s, "margin_timestamps")) setMarginTs(snap.marginTs);
    if (settingBundleHas(s, "area_margin_timestamps")) setAreaTs(snap.areaTs);
    if (settingBundleHas(s, "pol_margin_timestamps")) setPolTs(snap.polTs);
    if (settingBundleHas(s, "pol_margin_timestamps_future")) setPolTsFuture(snap.polTsFuture);
    if (settingBundleHas(s, "rental_global_margins")) setRentalMargins(snap.rentalMargins);
    if (settingBundleHas(s, "rental_area_margins")) setRentalAreaM(snap.rentalAreaM);
    if (settingBundleHas(s, "rental_pol_margins")) setRentalPolM(snap.rentalPolM);
    if (settingBundleHas(s, "rental_margin_timestamps")) setRentalMarginTs(snap.rentalMarginTs);
    if (settingBundleHas(s, "rental_area_margin_timestamps")) setRentalAreaTs(snap.rentalAreaTs);
    if (settingBundleHas(s, "rental_pol_margin_timestamps")) setRentalPolTs(snap.rentalPolTs);
    if (settingBundleHas(s, "pol_costs")) {
      setPolCostO(prev => {
        const server = snap.polCostO || {};
        const cached = readStoredPricingCache()?.polCostO;
        return mergePolCostODeep(mergePolCostODeep(server, prev), cached);
      });
    }
    if (settingBundleHas(s, "pol_portal_overrides_json")) {
      try {
        const overrides = JSON.parse(s.pol_portal_overrides_json);
        setPolCostO(prev => mergePortalOverridesIntoPolCostO(prev, overrides));
      } catch (e) {}
    }
    if (settingBundleHas(s, "carrier_drop_rates_json")) {
      setCarrierDropRates(snap.carrierDropRates ?? defaultCarrierDropRates());
    }
    if (settingBundleHas(s, "carrier_drop_margins_json")) {
      setCarrierDropMargins(snap.carrierDropMargins ?? defaultCarrierDropMargins());
    }
  };

  const applyPricingFromSettings = (s, opts = {}) => {
    const snap = parsePricingFromSettings(s);
    applyPricingSnapshot(snap, s);
    const prev = readStoredPricingCache();
    const patch = pricingCacheFromSnapshot(snap);
    const cacheKeys = [
      ["pol_costs", "polCostO"],
      ["global_margins", "margins"],
      ["area_margins", "areaM"],
      ["pol_margins", "polM"],
      ["pol_margins_future", "polMFuture"],
      ["margin_timestamps", "marginTs"],
      ["area_margin_timestamps", "areaTs"],
      ["pol_margin_timestamps", "polTs"],
      ["pol_margin_timestamps_future", "polTsFuture"],
      ["carrier_rates_json", "carrierRates"],
      ["carrier_drop_rates_json", "carrierDropRates"],
      ["carrier_drop_margins_json", "carrierDropMargins"],
      ["rental_rates_json", "rentalRates"],
      ["rental_global_margins", "rentalMargins"],
      ["rental_area_margins", "rentalAreaM"],
      ["rental_pol_margins", "rentalPolM"],
      ["rental_margin_timestamps", "rentalMarginTs"],
      ["rental_area_margin_timestamps", "rentalAreaTs"],
      ["rental_pol_margin_timestamps", "rentalPolTs"],
      ["validity_info_json", "validityInfo"],
    ];
    const merged = { v: 1, ...(prev || {}) };
    cacheKeys.forEach(([settingKey, cacheKey]) => {
      if (settingBundleHas(s, settingKey)) merged[cacheKey] = patch[cacheKey];
    });
    if (["validity_snk", "validity_dy", "validity_ck", "validity_rental"].some(k => settingBundleHas(s, k))) {
      merged.validityInfo = patch.validityInfo;
    }
    if (settingBundleHas(s, "pol_costs") || settingBundleHas(s, "pol_margins") || settingBundleHas(s, "pol_margins_future")) {
      merged.pricingSavedAt = merged.pricingSavedAt || Date.now();
    }
    const markSynced = opts.markServerSynced !== false;
    if (markSynced && (settingBundleHas(s, "pol_costs") || settingBundleHas(s, "pol_margins") || settingBundleHas(s, "global_margins"))) {
      merged.serverSyncedAt = Date.now();
    }
    writePricingCache(merged);
  };

  const writePricingCache = (payload) => {
    try {
      localStorage.setItem(PRICING_CACHE_KEY, JSON.stringify(payload ?? buildPricingCache()));
    } catch (_) {}
  };

  const saveAllSettings = () => runSave("전체 설정", async () => {
    await saveAllPricingDbs();
    await saveSettingsEntries([
      ["notices_json", JSON.stringify(notices)],
      ["notice_text", notices[0].text],
      ["notice_on", notices[0].on],
      ["notice_file_url", notices[0].fileUrl],
      ["ad_banners_json", JSON.stringify(adBanners)],
    ]);
  });

  const applyNoticesAndAdsFromSettings = (s) => {
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
      } catch (e) {}
    } else if (s.notice_text !== undefined || s.notice_on !== undefined || s.notice_file_url !== undefined) {
      setNotices(prev => prev.map((n, i) => i === 0 ? {
        ...n,
        text: s.notice_text ?? "",
        on: s.notice_on === "true",
        fileUrl: s.notice_file_url ?? "",
      } : n));
    }
    if (s.ad_banners_json || s.ad_banner_json) {
      setAdBanners(parseAdsFromSettings(s));
    }
  };

  const applySettingsBundle = (s, opts = {}) => {
    applyPricingFromSettings(s, opts);
    applyNoticesAndAdsFromSettings(s);
  };

  // raw 운임(매입·마진) 로드 — admin 진입 시 또는 (스냅샷 없음 + fallback) 일 때만 호출
  const loadRawPricing = async () => {
    if (rawLoadedRef.current) return;
    rawLoadedRef.current = true;
    try {
      {
        const [oceanRows] = await Promise.all([
          fetchSettingsInKeys(OCEAN_DB_KEYS),
        ]);

        const priority = {
          ...settingsMapFromRows(oceanRows),
        };
        const cached = readStoredPricingCache();
        const serverSnap = parsePricingFromSettings(priority);
        const cacheCosts = cached?.polCostO;
        const serverCosts = serverSnap.polCostO || {};
        let mergedCosts = mergePolCostODeep(serverCosts, cacheCosts || {});
        let cacheMargins = cached?.polM;
        const serverMargins = serverSnap.polM || {};
        let cacheMarginsFuture = cached?.polMFuture;
        const serverMarginsFuture = serverSnap.polMFuture || {};
        const serverMarginsEmpty = !Object.keys(serverMargins).length;
        const serverMarginsFutureEmpty = !Object.keys(serverMarginsFuture).length;
        const cacheWouldRestoreMargins =
          (serverMarginsEmpty && cacheMargins && Object.keys(cacheMargins).length > 0)
          || (serverMarginsFutureEmpty && cacheMarginsFuture && Object.keys(cacheMarginsFuture).length > 0);

        if (cacheWouldRestoreMargins && cached) {
          writePricingCache({
            ...cached,
            v: 1,
            polM: {},
            polMFuture: {},
            polTs: {},
            polTsFuture: {},
            serverSyncedAt: Date.now(),
          });
          cacheMargins = {};
          cacheMarginsFuture = {};
        }

        const pendingSellPurge = false;
        const sellBackfill = backfillPolCostSells(mergedCosts, {
          polM: cacheMargins || serverMargins,
          polMFuture: cacheMarginsFuture || serverMarginsFuture,
          margins: serverSnap.margins,
        });
        let pendingSellBackfill = false;
        if (sellBackfill.filled > 0) {
          mergedCosts = sellBackfill.polCostO;
          pendingSellBackfill = true;
        }
        const servicePurge = stripPolCostsOutsideFreightService(mergedCosts, fData);
        let pendingServicePurge = false;
        if (servicePurge.cleared > 0) {
          mergedCosts = servicePurge.polCostO;
          pendingServicePurge = true;
          console.info(`pol_costs: 서비스外 매입·매출 ${servicePurge.cleared}셀 정리`);
        }
        const costsDiffer = cacheCosts && JSON.stringify(cacheCosts) !== JSON.stringify(serverCosts);
        const mergedDiffersFromServer = JSON.stringify(mergedCosts) !== JSON.stringify(serverCosts);
        const marginsDiffer = cacheMargins && JSON.stringify(cacheMargins) !== JSON.stringify(serverMargins);
        const marginsFutureDiffer = cacheMarginsFuture && JSON.stringify(cacheMarginsFuture) !== JSON.stringify(serverMarginsFuture);
        const cacheNewer = (cached?.pricingSavedAt || 0) > (cached?.serverSyncedAt || 0);
        const pendingCostResync = pendingSellBackfill || pendingServicePurge || (cacheNewer && (costsDiffer || mergedDiffersFromServer));
        const pendingMarginCacheFix = cacheWouldRestoreMargins;
        const pendingMarginResync = !pendingMarginCacheFix
          && (marginsDiffer || marginsFutureDiffer) && cacheNewer;

        priority.pol_costs = serializeOceanPolCosts(mergedCosts);
        priority.pol_portal_overrides_json = JSON.stringify(extractPortalOverrides(mergedCosts));
        if (pendingMarginCacheFix || serverMarginsEmpty) {
          priority.pol_margins = "{}";
        } else if (pendingMarginResync && cacheMargins) {
          priority.pol_margins = JSON.stringify(cacheMargins);
        }
        if (pendingMarginCacheFix || serverMarginsFutureEmpty) {
          priority.pol_margins_future = "{}";
        } else if (pendingMarginResync && cacheMarginsFuture) {
          priority.pol_margins_future = JSON.stringify(cacheMarginsFuture);
        }
        if (pendingMarginCacheFix) {
          priority.pol_margin_timestamps = "{}";
          priority.pol_margin_timestamps_future = "{}";
        }

        applySettingsBundle(priority, { markServerSynced: !pendingCostResync && !pendingMarginResync && !pendingMarginCacheFix });

        if (pendingCostResync || pendingMarginResync || pendingMarginCacheFix) {
          skipAutoSaveRef.current = true;
          enqueueNetworkWrite(async () => {
            try {
              if (pendingCostResync) {
                await saveOceanPolCostsBundle(mergedCosts);
              }
              if (pendingMarginCacheFix) {
                await saveSettingsEntries([
                  ["pol_margins", "{}"],
                  ["pol_margins_future", "{}"],
                  ["pol_margin_timestamps", "{}"],
                  ["pol_margin_timestamps_future", "{}"],
                ]);
              } else if (pendingMarginResync) {
                await saveSettingsEntries([
                  ...(cacheMargins ? [["pol_margins", JSON.stringify(cacheMargins)]] : []),
                  ...(cached?.polTs ? [["pol_margin_timestamps", JSON.stringify(cached.polTs)]] : []),
                  ...(cacheMarginsFuture ? [["pol_margins_future", JSON.stringify(cacheMarginsFuture)]] : []),
                  ...(cached?.polTsFuture ? [["pol_margin_timestamps_future", JSON.stringify(cached.polTsFuture)]] : []),
                ]);
              }
              writePricingCache({
                ...(readStoredPricingCache() || {}),
                v: 1,
                polCostO: mergedCosts,
                polM: {},
                polMFuture: {},
                polTs: {},
                polTsFuture: {},
                serverSyncedAt: Date.now(),
                pricingSavedAt: Date.now(),
              });
            } catch (e) {
              console.warn("cache re-sync failed", e);
            }
          });
          setTimeout(() => { skipAutoSaveRef.current = false; }, 4000);
        } else {
          setTimeout(() => { skipAutoSaveRef.current = false; }, 4000);
        }

        setSettingsLoaded(true);

        const [dropRows, rentalRows, miscRows] = await Promise.all([
          fetchSettingsInKeys(DROP_DB_KEYS),
          fetchSettingsInKeys(RENTAL_DB_KEYS),
          fetchSettingsInKeys(MISC_SETTINGS_KEYS),
        ]);

        applySettingsBundle({
          ...settingsMapFromRows(dropRows),
          ...settingsMapFromRows(rentalRows),
          ...settingsMapFromRows(miscRows),
        });

        // Drop/Rental DB 로드 후 baseline
        setTimeout(() => syncRateHistoryBaseline(), 400);
      }
    } catch (err) {
      console.error("settings load failed", err);
      setSettingsLoaded(true);
      skipAutoSaveRef.current = false;
      rawLoadedRef.current = false; // 실패 시 재시도 허용
    }
  };

  // 마운트: 고객용 매출 스냅샷 + validity + 공지/광고만 로드 (매입·마진 미수신)
  useEffect(() => {
    let cancelled = false;
    const loadGuest = async () => {
      // 마스터 스위치 OFF → 기존처럼 모두 raw 로드·렌더 (전면 롤백)
      if (!PUBLIC_RATES_ENABLED) { await loadRawPricing(); setSettingsLoaded(true); return; }
      try {
        const rows = await fetchSettingsInKeys([PUBLIC_RATES_KEY, "validity_info_json", ...MISC_SETTINGS_KEYS]);
        if (cancelled) return;
        const map = settingsMapFromRows(rows);
        let snap = null;
        try { snap = map[PUBLIC_RATES_KEY] ? JSON.parse(map[PUBLIC_RATES_KEY]) : null; } catch (e) { snap = null; }
        setPublicRates(snap);
        applySettingsBundle(map); // validity + 공지/광고 적용 (pol_costs·마진 키는 없음)
        setSettingsLoaded(true);
        skipAutoSaveRef.current = false;
        // 스냅샷 없음 + fallback 허용 → raw 로드 (롤아웃 중 화면 정상)
        if (!snap && PUBLIC_RATES_FALLBACK_RAW) await loadRawPricing();
      } catch (err) {
        console.error("public rates load failed", err);
        if (PUBLIC_RATES_FALLBACK_RAW) { try { await loadRawPricing(); } catch (e2) {} }
        setSettingsLoaded(true);
      }
    };
    loadGuest();
    return () => { cancelled = true; };
  }, []);

  // admin 진입 시 raw(매입·마진) 1회 로드
  useEffect(() => {
    if (isAdmin) loadRawPricing();
  }, [isAdmin]);

  // admin: raw 로드 완료(polCostO 채워짐) 후 매출 스냅샷 1회 백필 — 누락 저장 경로 안전망
  useEffect(() => {
    if (!isAdmin || !settingsLoaded || backfilledRef.current) return undefined;
    if (!Object.keys(polCostO || {}).length) return undefined; // raw 아직 → 대기
    backfilledRef.current = true;
    const t = setTimeout(() => { persistPublicRates({ force: true }); }, 1500);
    return () => clearTimeout(t);
  }, [isAdmin, settingsLoaded, polCostO]);

  useEffect(() => {
    if (skipAutoSaveRef.current || !isAdmin || saveBusy) return;
    if (showFreightAdmin && freightAdminTab !== "grid") return;
    // 단가 수정 모드 중에는 자동 저장 보류 — 💾 저장 버튼으로만 저장
    if (gridEditUnlocked && showFreightAdmin && freightAdminTab === "grid") {
      writePricingCache(buildPricingCache());
      return;
    }
    writePricingCache(buildPricingCache());
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (autoSaveInFlightRef.current || saveBusy) return;
      const task = showRentalAdmin
        ? () => saveRentalDb()
        : showFreightAdmin && freightAdminTab === "grid" && carrierAdminMode === "dropoff"
          ? () => saveDropDb()
          : showFreightAdmin && freightAdminTab === "grid"
            ? () => saveOceanDb()
            : () => saveAllPricingDbs();
      autoSaveInFlightRef.current = true;
      enqueueSave(task)
        .then(() => {
          writePricingCache({
            ...buildPricingCache(),
            pricingSavedAt: Date.now(),
            serverSyncedAt: Date.now(),
          });
          if (!(showFreightAdmin && freightAdminTab === "grid" && carrierAdminMode === "dropoff")) {
            recordRateHistory({ source: "auto_save" });
          } else {
            recordRateHistory({ source: "auto_save", note: "Drop off" });
          }
          persistPublicRates();
        })
        .catch(err => {
          console.error("auto-save failed", err);
          writePricingCache({ ...buildPricingCache(), pricingSavedAt: Date.now() });
          const dropAuto = showFreightAdmin && freightAdminTab === "grid" && carrierAdminMode === "dropoff";
          flashSaveFeedback("error", `${dropAuto ? "Drop off" : "운임"} 자동 저장 실패: ${err.message}`);
        })
        .finally(() => { autoSaveInFlightRef.current = false; });
    }, 2500);
    return () => clearTimeout(autoSaveTimerRef.current);
  }, [
    isAdmin,
    saveBusy,
    showFreightAdmin,
    freightAdminTab,
    showRentalAdmin,
    carrierAdminMode,
    gridEditUnlocked,
    polCostO,
    margins,
    areaM,
    polM,
    polMFuture,
    marginTs,
    areaTs,
    polTs,
    polTsFuture,
    carrierRates,
    carrierDropRates,
    carrierDropMargins,
    validityInfo,
    rentalRates,
    rentalMargins,
    rentalAreaM,
    rentalPolM,
    rentalMarginTs,
    rentalAreaTs,
    rentalPolTs,
  ]);

  const sz = si => (si === 0 ? "c20" : "c40");
  const mkPrice = (cost, margin, cr) => ({
    cost: cost ?? null,
    margin: margin ?? 0,
    sell: cost != null ? cost + (margin ?? 0) : null,
    cr,
  });
  const mkAdminPrice = (cost, sell, cr) => ({
    cost: cost ?? null,
    margin: cost != null && sell != null ? sell - cost : null,
    sell: sell ?? null,
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
    // 고객(스냅샷) 모드: raw 대신 스냅샷 매출 반환 (행 표시 판단·매출 계산에 사용, 매입 미사용)
    if (usePublic) return pubOcean(row.pol, cr, t, p);
    // 고객 화면: validity 종료일이 지난(만료) 현재 운임은 비표시
    if (!isAdmin && p === "current" && isValiditySlotExpired(validityInfo[cr]?.current)) return null;
    const ov = getCarrierCostOverride(row.pol, cr, t, p);
    return ov != null ? ov : row.rates[cr][t];
  };

  const getRentalBase = (rPol, city, comboIdx, period = ratePeriod) => {
    const p = period === "future" ? "future" : "current";
    // 고객 화면: 만료된 렌탈 운임 비표시
    if (!isAdmin && p === "current" && isValiditySlotExpired(validityInfo.RENTAL?.current)) return null;
    const sk = rentComboSk(comboIdx);
    const bucket = normalizeRentalCityBucket(rentalRates[rPol]?.[p]?.[city]);
    if (bucket[sk] === "x") return null; // 명시적 미서비스 — 기본값 fallback 차단
    if (bucket[sk] != null && bucket[sk] !== "") return Number(bucket[sk]);
    if (p === "future") {
      const cur = normalizeRentalCityBucket(rentalRates[rPol]?.current?.[city]);
      if (cur[sk] === "x") return null;
      if (cur[sk] != null && cur[sk] !== "") return Number(cur[sk]);
    }
    // 정적 기본 운임표(RN) fallback 제거 — 업로드(저장)된 값만 진실. 미입력/미서비스(x)는 가격 없음
    return null;
  };

  // 렌탈 매출가(렌탈 매입 + 렌탈 마진) — 고객 노출용. 매입가 자체는 절대 반환하지 않음
  const getRentalSell = (rPol, city, comboIdx, period = ratePeriod) => {
    if (usePublic) return pubRentSub(rPol, city, comboIdx === 0 ? "c20" : comboIdx === 1 ? "c40dv" : "c40hc", period);
    const base = getRentalBase(rPol, city, comboIdx, period);
    if (base == null) return null;
    const fp = PM[rPol] || rPol;
    const area = fMap[fp]?.area;
    if (!area) return null;
    return base + getRentalM(fp, area, rentComboMarginType(comboIdx));
  };

  const applyRentalRate = (rPol, city, comboIdx, value, period = "current") => {
    const raw = String(value).trim();
    const sk = rentComboSk(comboIdx);
    const p = period === "future" ? "future" : "current";
    clearRentCostOverrides(PM[rPol] || null, city);
    setRentalRates(prev => {
      const polBucket = { current: { ...(prev[rPol]?.current || {}) }, future: { ...(prev[rPol]?.future || {}) } };
      const periodBucket = { ...polBucket[p] };
      const cityBucket = normalizeRentalCityBucket(periodBucket[city] || {});
      if (raw === "") delete cityBucket[sk];
      else {
        const v = parseInt(raw, 10);
        if (!Number.isFinite(v)) return prev;
        cityBucket[sk] = v;
      }
      if (!Object.keys(cityBucket).length) delete periodBucket[city];
      else periodBucket[city] = cityBucket;
      return { ...prev, [rPol]: { ...polBucket, [p]: periodBucket } };
    });
  };

  const clearRentCostOverrides = (freightPol, city = null) => {
    if (!freightPol) return;
    setPolCostO(p => {
      const rent = p[freightPol]?.rent;
      if (!rent) return p;
      const next = { ...p, [freightPol]: { ...p[freightPol], rent: { ...rent } } };
      if (city) {
        delete next[freightPol].rent[city];
        if (Object.keys(next[freightPol].rent).length === 0) delete next[freightPol].rent;
      } else {
        delete next[freightPol].rent;
      }
      return next;
    });
  };

  const applyCarrierRate = (pol, cr, t, value, period = "current") => {
    const raw = String(value).trim();
    if (t === "soc20" || t === "soc40") clearRentCostOverrides(pol);
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

  const applyCarrierSell = (pol, cr, t, value, period = "current") => {
    const raw = String(value).trim();
    setPolCostO(p => {
      const prev = { ...(p[pol]?.carrier?.[cr] || {}) };
      const bucket = { ...(prev[period] || {}) };
      const sellBucket = { ...(bucket.sell || {}) };
      if (raw === "") delete sellBucket[t];
      else {
        const v = parseInt(raw, 10);
        if (!Number.isFinite(v)) return p;
        sellBucket[t] = v;
      }
      if (Object.keys(sellBucket).length === 0) delete bucket.sell;
      else bucket.sell = sellBucket;
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

  const getCarrierDropAddon = (cr, cityKey, si, period) => {
    const p = period === "future" ? "future" : period === "current" ? "current" : ratePeriod;
    // 고객 화면: 만료된 Drop off 운임 비표시
    if (!isAdmin && p === "current" && isValiditySlotExpired(validityInfo[carrierDropValidityKey(cr)]?.current)) return null;
    const sk = sz(si);
    const stored = carrierDropRates[cr]?.[p]?.[cityKey]?.[sk];
    if (stored != null && stored !== "") return Number(stored);
    const d = DO[cityKey]?.[cr];
    return d ? d[si] : null;
  };

  const getDropM = (cr, cityKey, si) => {
    const sk = sz(si);
    const v = carrierDropMargins[cr]?.[cityKey]?.[sk];
    return v != null && v !== "" ? Number(v) : 0;
  };

  const getCarrierDropTotalCost = (row, cr, cityKey, si, period) => {
    const p = period === "future" ? "future" : period === "current" ? "current" : ratePeriod;
    const t = si === 0 ? "coc20" : "coc40";
    const ocean = getCarrierRate(row, cr, t, p);
    const addon = getCarrierDropAddon(cr, cityKey, si, p);
    if (ocean == null || addon == null) return null;
    return ocean + addon;
  };

  const applyCarrierDropRate = (cr, cityKey, si, value, period = "current") => {
    const raw = String(value).trim();
    const sk = sz(si);
    const p = period === "future" ? "future" : "current";
    const dropVKey = carrierDropValidityKey(cr);
    const validityDraft = validityInfo[dropVKey]?.[p] || defaultValiditySlot();
    setCarrierDropRates(prev => {
      const next = mergeCarrierDropRateCell(prev, cr, cityKey, sk, raw, p, validityDraft);
      return next ?? prev;
    });
  };

  const applyCarrierDropMargin = (cr, cityKey, si, value) => {
    const raw = String(value).trim();
    const sk = sz(si);
    setCarrierDropMargins(prev => {
      const crBucket = { ...(prev[cr] || {}) };
      const cityBucket = { ...(crBucket[cityKey] || { c20: 0, c40: 0 }) };
      if (raw === "") cityBucket[sk] = 0;
      else {
        const v = parseInt(raw, 10);
        if (!Number.isFinite(v)) return prev;
        cityBucket[sk] = v;
      }
      return { ...prev, [cr]: { ...crBucket, [cityKey]: cityBucket } };
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
  const getRentCombinedCost = (freightPol, rPol, city, comboIdx, carrierCr = null) => {
    const fp = PM[rPol] || freightPol;
    const fr = fMap[fp];
    const t = rentSocType(comboIdx);
    const rental = getRentalBase(rPol, city, comboIdx);
    if (!fr) return rental ?? null;
    if (carrierCr) {
      const soc = getCarrierRate(fr, carrierCr, t);
      return soc != null && rental != null ? soc + rental : null;
    }
    let best = null;
    CRS.forEach(k => {
      const soc = getCarrierRate(fr, k, t);
      if (soc == null || rental == null) return;
      const cost = soc + rental;
      if (best === null || cost < best) best = cost;
    });
    return best;
  };

  const getRentCityCost = (freightPol, rPol, city, rRow, comboIdx) => {
    const manual = polCostO[freightPol]?.rent?.[city]?.[rentComboSk(comboIdx)];
    if (manual != null && manual !== "") return manual;
    return getRentCombinedCost(freightPol, rPol, city, comboIdx);
  };

  const getRentSellMargin = (freightPol, rPol, area, comboIdx) => {
    const fp = PM[rPol] || freightPol;
    if (!fp || !area) return 0;
    return getM(fp, area, rentSocType(comboIdx), ratePeriod) + getRentalM(fp, area, rentComboMarginType(comboIdx));
  };

  const applyRentCityCost = (freightPol, city, comboIdx, value) => {
    const raw = String(value).trim();
    const sk = rentComboSk(comboIdx);
    if (raw === "") {
      setPolCostO(p => {
        const rent = { ...(p[freightPol]?.rent || {}) };
        const cityBucket = { ...(rent[city] || {}) };
        delete cityBucket[sk];
        const next = { ...p, [freightPol]: { ...(p[freightPol] || {}), rent: { ...rent } } };
        if (Object.keys(cityBucket).length === 0) delete next[freightPol].rent[city];
        else next[freightPol].rent[city] = cityBucket;
        if (Object.keys(next[freightPol].rent || {}).length === 0) delete next[freightPol].rent;
        return next;
      });
      return;
    }
    const v = parseInt(raw, 10);
    if (!Number.isFinite(v)) return;
    setPolCostO(p => ({
      ...p,
      [freightPol]: {
        ...(p[freightPol] || {}),
        rent: { ...(p[freightPol]?.rent || {}), [city]: { ...(p[freightPol]?.rent?.[city] || {}), [sk]: v } },
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
    if (usePublic) {
      let b = null, cr = null;
      CRS.forEach(k => { const v = pubOcean(row.pol, k, t, ratePeriod); if (v != null && (b === null || v < b)) { b = v; cr = k; } });
      return { val: b, cr };
    }
    let b = null, cr = null;
    CRS.forEach(k => {
      const v = getCarrierRate(row, k, t);
      if (v != null && (b === null || v < b)) { b = v; cr = k; }
    });
    return { val: b, cr };
  };
  const bDO = (row, city, si, period) => {
    const p = period === "future" ? "future" : period === "current" ? "current" : ratePeriod;
    if (usePublic) {
      let b = null, cr = null;
      CRS.forEach(k => { const v = pubDrop(row.pol, k, city, si, p); if (v != null && (b === null || v < b)) { b = v; cr = k; } });
      return { val: b, cr };
    }
    let b = null, cr = null;
    CRS.forEach(k => {
      const tot = getCarrierDropTotalCost(row, k, city, si, p);
      if (tot != null && (b === null || tot < b)) { b = tot; cr = k; }
    });
    return { val: b, cr };
  };
  const cRent = (rPol, city, rRow, period = ratePeriod) => {
    if (usePublic) {
      return CRS.map(k => ({
        k,
        t20: pubRentTotal(rPol, k, city, "c20", period),
        t40dv: pubRentTotal(rPol, k, city, "c40dv", period),
        t40hc: pubRentTotal(rPol, k, city, "c40hc", period),
      })).filter(x => x.t20 != null || x.t40dv != null || x.t40hc != null);
    }
    const fp = PM[rPol];
    if (!fp || !fMap[fp]) return [];
    const fr = fMap[fp];
    const rentals = RENT_COMBO_KEYS.map((_, ci) => getRentalBase(rPol, city, ci, period));
    return CRS.map(k => {
      const s20 = getCarrierRate(fr, k, "soc20", period);
      const s40 = getCarrierRate(fr, k, "soc40", period);
      const cost20 = s20 != null && rentals[0] != null ? s20 + rentals[0] : null;
      const cost40dv = s40 != null && rentals[1] != null ? s40 + rentals[1] : null;
      const cost40hc = s40 != null && rentals[2] != null ? s40 + rentals[2] : null;
      const socSell20 = s20 != null ? getGuestCarrierSell(fp, k, "soc20", period, s20, fr.area) : null;
      const socSell40 = s40 != null ? getGuestCarrierSell(fp, k, "soc40", period, s40, fr.area) : null;
      const rentM20 = getRentalM(fp, fr.area, "r20");
      const rentM40dv = getRentalM(fp, fr.area, "r40dv");
      const rentM40hc = getRentalM(fp, fr.area, "r40hc");
      const rentSell20 = rentals[0] != null ? rentals[0] + rentM20 : null;
      const rentSell40dv = rentals[1] != null ? rentals[1] + rentM40dv : null;
      const rentSell40hc = rentals[2] != null ? rentals[2] + rentM40hc : null;
      const t20 = socSell20 != null && rentSell20 != null ? socSell20 + rentSell20 : null;
      const t40dv = socSell40 != null && rentSell40dv != null ? socSell40 + rentSell40dv : null;
      const t40hc = socSell40 != null && rentSell40hc != null ? socSell40 + rentSell40hc : null;
      const m20 = cost20 != null && t20 != null ? t20 - cost20 : rentM20 + getM(fp, fr.area, "soc20", period);
      const m40dv = cost40dv != null && t40dv != null ? t40dv - cost40dv : rentM40dv + getM(fp, fr.area, "soc40", period);
      const m40hc = cost40hc != null && t40hc != null ? t40hc - cost40hc : rentM40hc + getM(fp, fr.area, "soc40", period);
      return {
        k,
        cost20, cost40dv, cost40hc,
        soc20: s20, soc40: s40,
        rent20: rentals[0], rent40dv: rentals[1], rent40hc: rentals[2],
        m20, m40dv, m40hc,
        t20, t40dv, t40hc,
      };
    }).filter(x => x.t20 != null || x.t40dv != null || x.t40hc != null);
  };
  const bRent = (rPol, city, rRow, comboIdx) => {
    const all = cRent(rPol, city, rRow);
    const totalKey = comboIdx === 0 ? "t20" : comboIdx === 1 ? "t40dv" : "t40hc";
    let b = null, cr = null;
    all.forEach(x => {
      const v = x[totalKey];
      if (v != null && (b === null || v < b)) { b = v; cr = x.k; }
    });
    return { val: b, cr };
  };
  const rentDetail = (rPol, city, rRow, comboIdx) => {
    if (usePublic) {
      const b = bRent(rPol, city, rRow, comboIdx);
      const sk = comboIdx === 0 ? "c20" : comboIdx === 1 ? "c40dv" : "c40hc";
      return guestPrice(b.cr ? pubRentTotal(rPol, b.cr, city, sk, ratePeriod) : null, b.cr);
    }
    const fp = PM[rPol];
    const freightPol = fp || rPol;
    const fr = fp ? fMap[fp] : null;
    const b = bRent(rPol, city, rRow, comboIdx);
    const cost = getRentCityCost(freightPol, rPol, city, rRow, comboIdx);
    const rt = rentComboMarginType(comboIdx);
    const t = rentSocType(comboIdx);
    if (fr && b.cr) {
      const soc = getCarrierRate(fr, b.cr, t);
      const rental = getRentalBase(rPol, city, comboIdx);
      if (isAdmin) {
        const socSell = soc != null ? getCarrierAdminSell(freightPol, b.cr, t, ratePeriod, soc) : null;
        const totalSell = socSell != null && rental != null
          ? socSell + rental + getRentalM(freightPol, fr.area, rt)
          : null;
        return mkAdminPrice(cost, totalSell, b.cr);
      }
      const socSell = soc != null ? getGuestCarrierSell(freightPol, b.cr, t, ratePeriod, soc, fr.area) : null;
      const totalSell = socSell != null && rental != null
        ? socSell + rental + getRentalM(freightPol, fr.area, rt)
        : null;
      return mkPrice(cost, totalSell != null && cost != null ? totalSell - cost : null, b.cr);
    }
    // 매출 산정에 필요한 freight/area 컨텍스트가 없으면, 고객에겐 매입가를 노출하지 말고 "—" 처리
    if (!fr) return isAdmin ? mkAdminPrice(cost, null, b.cr) : mkPrice(null, 0, b.cr);
    const margin = getRentSellMargin(freightPol, rPol, fr.area, comboIdx);
    return mkPrice(cost, margin, b.cr);
  };
  const oceanDetail = (row, t) => {
    const b = bNet(row, t);
    if (usePublic) return guestPrice(b.cr ? pubOcean(row.pol, b.cr, t, ratePeriod) : null, b.cr);
    const cost = b.val;
    const cr = b.cr;
    if (cost != null && cr) {
      if (isAdmin) {
        const sell = getCarrierAdminSell(row.pol, cr, t, ratePeriod, cost);
        return mkAdminPrice(cost, sell, cr);
      }
      const sell = getGuestCarrierSell(row.pol, cr, t, ratePeriod, cost, row.area);
      return mkPrice(cost, sell - cost, cr);
    }
    if (isAdmin) return mkAdminPrice(cost, null, cr);
    return mkPrice(cost, getM(row.pol, row.area, t, ratePeriod), cr);
  };
  const doDetail = (row, cityKey, si) => {
    const b = bDO(row, cityKey, si, ratePeriod);
    if (!b.cr) {
      const cost = getDropCityCost(row, cityKey, si);
      return isAdmin ? mkAdminPrice(cost, null, null) : mkPrice(cost, null, null);
    }
    return dropCarrierDetail(row, cityKey, b.cr, si, ratePeriod);
  };
  const dropCarrierDetail = (row, cityKey, cr, si, period = ratePeriod) => {
    if (usePublic) return guestPrice(pubDrop(row.pol, cr, cityKey, si, period), cr);
    const t = si === 0 ? "coc20" : "coc40";
    const cost = getCarrierDropTotalCost(row, cr, cityKey, si, period);
    if (cost == null) return isAdmin ? mkAdminPrice(null, null, cr) : mkPrice(null, 0, cr);
    const oceanCost = getCarrierRate(row, cr, t, period);
    const dropM = getDropM(cr, cityKey, si);
    if (isAdmin) {
      const oceanSell = oceanCost != null
        ? getCarrierAdminSell(row.pol, cr, t, period, oceanCost)
        : null;
      const totalSell = oceanSell != null && oceanCost != null ? oceanSell - oceanCost + cost : null;
      return mkAdminPrice(cost, totalSell, cr);
    }
    if (oceanCost != null) {
      const oceanSell = getGuestCarrierSell(row.pol, cr, t, period, oceanCost, row.area);
      return mkPrice(cost, (oceanSell - oceanCost) + dropM, cr);
    }
    return mkPrice(cost, getM(row.pol, row.area, t, period) + dropM, cr);
  };

  // ── 고객용 매출 스냅샷 (public_rates_json) — 매입·마진 없이 매출가만 ──
  // 모든 값은 기존 고객 매출 함수와 동일하게 산출(period 명시). 빈/미서비스는 생략.
  const guestDropSell = (row, cityKey, cr, si, period) => {
    const t = si === 0 ? "coc20" : "coc40";
    const cost = getCarrierDropTotalCost(row, cr, cityKey, si, period);
    if (cost == null) return null;
    const oceanCost = getCarrierRate(row, cr, t, period);
    const dropM = getDropM(cr, cityKey, si);
    if (oceanCost != null) {
      const oceanSell = getGuestCarrierSell(row.pol, cr, t, period, oceanCost, row.area);
      if (oceanSell == null) return null;
      return cost + (oceanSell - oceanCost) + dropM;
    }
    const m = getM(row.pol, row.area, t, period);
    return m == null ? null : cost + m + dropM;
  };

  const buildPublicRatesSnapshot = () => {
    const periods = ["current", "future"];
    const ocean = {}, drop = {}, rental = {};
    const set = (obj, path, val) => {
      let o = obj;
      for (let i = 0; i < path.length - 1; i++) { o[path[i]] = o[path[i]] || {}; o = o[path[i]]; }
      o[path[path.length - 1]] = val;
    };
    // 고객 화면과 동일하게: 만료된 현재 운임은 스냅샷에서 제외 (admin 빌더라 expiry 가드를 명시 적용)
    const curExpired = (vKey) => isValiditySlotExpired(validityInfo[vKey]?.current);
    fData.forEach(row => {
      CRS.forEach(cr => {
        periods.forEach(p => {
          if (p === "current" && curExpired(cr)) { /* 해상 만료 → 스냅샷 제외 */ } else {
            RATE_TYPES.forEach(t => {
              const cost = getCarrierRate(row, cr, t, p);
              if (cost == null) return;
              const sell = getGuestCarrierSell(row.pol, cr, t, p, cost, row.area);
              if (sell == null) return;
              set(ocean, [row.pol, cr, p, t], sell);
            });
          }
          if (p === "current" && curExpired(carrierDropValidityKey(cr))) return; // Drop off 만료 → 제외
          DOC.forEach(({ k: cityKey }) => {
            [0, 1].forEach(si => {
              const sell = guestDropSell(row, cityKey, cr, si, p);
              if (sell == null) return;
              set(drop, [row.pol, cr, cityKey, p, si === 0 ? "c20" : "c40"], sell);
            });
          });
        });
      });
    });
    rData.forEach(row => {
      const rPol = row.pol;
      periods.forEach(p => {
        if (p === "current" && curExpired("RENTAL")) return; // 렌탈 만료 → 제외
        RENT_CITY_ORDER.forEach(city => {
          cRent(rPol, city, row, p).forEach(c => {
            [["c20", c.t20], ["c40dv", c.t40dv], ["c40hc", c.t40hc]].forEach(([sk, v]) => {
              if (v != null) set(rental, [rPol, "carriers", c.k, city, p, sk], v);
            });
          });
          [0, 1, 2].forEach(ci => {
            const rs = getRentalSell(rPol, city, ci, p);
            if (rs != null) set(rental, [rPol, "rent", city, p, ci === 0 ? "c20" : ci === 1 ? "c40dv" : "c40hc"], rs);
          });
        });
      });
    });
    return { rev: 1, generatedAt: new Date().toISOString(), ocean, drop, rental };
  };

  const persistPublicRates = async ({ force = false } = {}) => {
    if (!force && Date.now() - publicRatesAtRef.current < 4000) return; // 잦은 대용량 쓰기 방지
    publicRatesAtRef.current = Date.now();
    try {
      const snap = buildPublicRatesSnapshot();
      await saveOneSettingWithRetry(PUBLIC_RATES_KEY, JSON.stringify(snap));
    } catch (e) {
      console.warn("public_rates 저장 실패", e);
    }
  };

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
  const activeAds = useMemo(
    () => adBanners.filter(a => a.on && a.imageUrl),
    [adBanners]
  );
  const adVisible = activeAds.length > 0 && !adDismissed;
  const currentNoticePopup = activeNoticeQueue.find(n => !dismissedNotices.has(n.i));
  const dismissCurrentNotice = () => {
    if (!currentNoticePopup) return;
    const next = new Set([...dismissedNotices, currentNoticePopup.i]);
    setDismissedNotices(next);
    if (noticeHideToday) {
      try {
        localStorage.setItem(NOTICE_HIDE_TODAY_KEY, JSON.stringify({ date: noticeTodayStr(), ids: [...next] }));
      } catch {}
    }
  };

  const saveNoticesOnly = () => runSave("공지", () => saveNoticeSettings());

  const saveCarrierPricing = () => {
    if (carrierAdminMode === "dropoff") {
      return runSave(DB_LABEL[DB_DROP], () => saveDropDb());
    }
    return runSave(DB_LABEL[DB_OCEAN], () => saveOceanDb());
  };

  const saveRentalPricing = () => runSave(DB_LABEL[DB_RENTAL], async () => {
    clearTimeout(autoSaveTimerRef.current);
    await saveRentalDb();
    writePricingCache(buildPricingCache());
  });

  // ── 렌탈 Excel 업로드 (매입만 갱신 · 마진 유지 → 매출 자동 재계산) ──
  const rentalUploadMargin = (rentalPol, type) => {
    const fp = PM[rentalPol] || rentalPol;
    const area = fMap[fp]?.area || "OTHERS";
    return { fp, area, margin: getRentalM(fp, area, type) };
  };

  const handleRentalUploadFile = async (file) => {
    if (!file) return;
    setRentalUploadMsg("");
    setRentalUploadBusy(true);
    try {
      const workbook = await readExcelFile(file);
      // "③ Rental Fee (업로드용)" 같은 업로드용 시트 우선 선택
      const sheetName = workbook.sheetNames.find(s => /업로드|rental/i.test(s)) || workbook.sheetNames[0];
      const { entries, errors } = parseRentalUploadRows(workbook.sheets[sheetName] || [], rentalRows);
      const changes = buildRentalUploadChanges(entries, rentalRates, rentalUploadPeriod);
      setRentalUpload({ fileName: workbook.fileName, sheetName, entries, errors, changes });
      if (!entries.length) {
        setRentalUploadMsg("매칭된 행이 없습니다 — 양식 다운로드 후 도시/POL 이름을 그대로 사용해 주세요");
      } else if (!changes.length) {
        setRentalUploadMsg(`기존 값과 모두 동일합니다 (${entries.length}행 매칭 · 변경 0건)`);
      }
    } catch (e) {
      setRentalUpload(null);
      setRentalUploadMsg(`파싱 실패: ${e.message}`);
    } finally {
      setRentalUploadBusy(false);
    }
  };

  const cancelRentalUpload = () => {
    setRentalUpload(null);
    setRentalUploadMsg("");
  };

  const confirmRentalUpload = () => {
    if (!rentalUpload?.changes?.length) return;
    const period = rentalUploadPeriod;
    const { changes, fileName } = rentalUpload;
    const next = applyRentalUploadChanges(rentalRates, changes, period);
    const batchId = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `rental-${Date.now()}`;
    const historyRows = changes.map(c => {
      const { fp, area, margin } = rentalUploadMargin(c.pol, c.type);
      return {
        batch_id: batchId, carrier: "RENTAL", area, pol: fp, route: `${fp} > ${c.city}`,
        rate_type: c.type, period, category: "rental",
        cost: c.remove ? null : c.next,
        sell: c.remove ? null : c.next + margin,
        margin: c.remove ? null : margin,
        source: "excel-upload",
        note: c.remove
          ? `Excel 업로드 (${fileName}): ${c.old} → 미서비스(x) 삭제`
          : `Excel 업로드 (${fileName}): ${c.old ?? "—"} → ${c.next}`,
      };
    });
    cancelPendingPricingSave();
    skipAutoSaveRef.current = true;
    setRentalRates(next);
    setRentalUpload(null);
    runSave("Rental Excel 업로드", async () => {
      await saveOneSettingWithRetry("rental_rates_json", JSON.stringify(next));
      try {
        await postRateHistoryRows(historyRows);
      } catch (e) {
        console.warn("rental upload history skip", e);
      }
    })
      .then(() => {
        setRentalUploadMsg(`✅ ${changes.length}개 셀 반영 완료 (${period === "future" ? "향후" : "현재"} 운임) · 이력 ${historyRows.length}건 기록`);
      })
      .finally(() => { setTimeout(() => { skipAutoSaveRef.current = false; }, 2000); });
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
      {adminSaveToastEl}
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

  // ── EXCEL UPLOAD (운임 관리 · Excel 탭) ──
  if (showFreightAdmin && freightAdminTab === "upload" && isAdmin) {
    const fmt = UPLOAD_FORMATS.find(f => f.id === excelFormat);
    const sum = excelPreview ? previewSummary(excelPreview, excelPeriod) : null;
    const uploadCarrierKey = excelUploadCarrierKey(excelFormat, excelYslCarrier, excelPreview);
    const uploadCarrierLabel = CN_KR[uploadCarrierKey] || uploadCarrierKey;
    const uploadValidityPreview = formatValiditySlotLabel(excelValidityDraft);
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: ff }}>
        {adminSaveToastEl}
        <div style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #e5e7eb", zIndex: 30 }}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button type="button" onClick={closeFreightAdmin} style={{ fontSize: 13, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>운임 관리</div>
            <button type="button" onClick={applyExcelUpload} disabled={!excelPreview || saveBusy || excelUploading}
              style={{ fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8, background: !excelPreview || saveBusy ? "#fcd34d" : "#d97706", color: "#fff", border: "none", cursor: !excelPreview || saveBusy ? "not-allowed" : "pointer" }}>
              {saveBusy ? "저장 중…" : "업로드"}
            </button>
          </div>
          {freightAdminTabBar}
        </div>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 80px" }}>
          <div style={{ fontSize: 11, color: "#92400e", marginBottom: 12, lineHeight: 1.5 }}>
            선사 원본 Excel **「업로드용」** 시트 기준 · POL 자동 매칭 · **NET(매입)+매출** 함께 저장 (Drop off는 DY Import 원본 시트).
            <span style={{ display: "block", marginTop: 4 }}>Validity 날짜별로 DB에 **누적** 저장 · **적용 기간**은 포털 **현재/향후** 탭 지정 (이전 validity 구간은 삭제되지 않음)</span>
            <span style={{ display: "block", marginTop: 4, fontSize: 10, color: "#9ca3af" }}>저장 엔진 {ADMIN_SAVE_REV}</span>
          </div>

          <div style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", marginBottom: 8 }}>양식 선택</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {UPLOAD_FORMATS.map(f => (
                <label key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 8, background: excelFormat === f.id ? "#fffbeb" : "#fafafa", border: `1px solid ${excelFormat === f.id ? "#fbbf24" : "#e5e7eb"}`, cursor: "pointer" }}>
                  <input type="radio" name="excelFmt" checked={excelFormat === f.id} onChange={() => { setExcelFormat(f.id); setExcelPreview(null); setExcelMsg(""); if (excelWorkbook) setTimeout(refreshExcelPreview, 0); }} style={{ marginTop: 3 }}/>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>{f.label}</div>
                    <div style={{ fontSize: 10, color: "#a16207" }}>{f.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: "#6b7280" }}>적용 기간 (포털 탭)
              <select value={excelPeriod} onChange={e => { setExcelPeriod(e.target.value); if (excelWorkbook) setTimeout(refreshExcelPreview, 0); }}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" }}>
                <option value="current">현재 운임</option>
                <option value="future">향후 운임 (GRI)</option>
              </select>
            </label>
            {excelFormat === "YSL" ? (
              <label style={{ fontSize: 10, color: "#6b7280" }}>선사 시트
                <select value={excelYslCarrier} onChange={e => { setExcelYslCarrier(e.target.value); if (excelWorkbook) setTimeout(refreshExcelPreview, 0); }}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" }}>
                  {CRS.map(c => <option key={c} value={c}>{CN_KR[c]} ({c})</option>)}
                </select>
              </label>
            ) : (
              <label style={{ fontSize: 10, color: "#6b7280" }}>시트
                <select value={excelSheet} onChange={e => { const next = e.target.value; setExcelSheet(next); if (excelWorkbook) refreshExcelPreview(next); }} disabled={!excelWorkbook}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" }}>
                  {(excelWorkbook?.sheetNames || []).map(s => <option key={s} value={s}>{s}</option>)}
                  {!excelWorkbook && <option value="">파일 선택 후</option>}
                </select>
              </label>
            )}
          </div>

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0f766e" }}>
                Validity · {uploadCarrierLabel} · {excelPeriod === "future" ? "향후 운임" : "현재 운임"}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#6b7280", cursor: "pointer" }}>
                <input type="checkbox" checked={excelSaveValidity} onChange={e => setExcelSaveValidity(e.target.checked)} />
                업로드 시 저장
              </label>
            </div>
            <ValidityPeriodFields
              carrierKey={uploadCarrierKey}
              period={excelPeriod}
              periodLabel={excelPeriod === "future" ? "향후 (From ~ Till)" : "현재 (From ~ Till)"}
              compact
              validityInfo={{ [uploadCarrierKey]: { [excelPeriod]: excelValidityDraft } }}
              onUpdate={updateExcelValidityDraft}
              futureFromMin={excelPeriod === "future" ? getFutureFromMinDate(uploadCarrierKey) : undefined}
            />
            {uploadValidityPreview && (
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                저장 키: {validityStorageKey(excelValidityDraft)} · 표시: {uploadValidityPreview}
              </div>
            )}
          </div>

          {excelFormat === "YSL" && excelWorkbook && (
            <label style={{ fontSize: 10, color: "#6b7280", display: "block", marginBottom: 12 }}>시트
              <select value={excelSheet} onChange={e => { const next = e.target.value; setExcelSheet(next); refreshExcelPreview(next); }}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" }}>
                {excelWorkbook.sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}

          <label
            onDragOver={e => { e.preventDefault(); setExcelDragOver(true); }}
            onDragLeave={() => setExcelDragOver(false)}
            onDrop={e => { e.preventDefault(); setExcelDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleExcelFile(f); }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "28px 16px", background: excelDragOver ? "#fffbeb" : "#fff", border: `2px dashed ${excelDragOver ? "#f59e0b" : "#fcd34d"}`, borderRadius: 12, cursor: "pointer", marginBottom: 12 }}>
            <span style={{ fontSize: 32 }}>📊</span>
            <span style={{ fontSize: 13, color: "#b45309", fontWeight: 700 }}>{excelUploading ? "읽는 중…" : "Excel 파일 선택 또는 드래그"}</span>
            <span style={{ fontSize: 11, color: "#d97706" }}>.xlsx · {fmt?.hint}</span>
            <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleExcelFile(e.target.files[0]); e.target.value = ""; }} disabled={excelUploading}/>
          </label>

          {excelMsg && (
            <div style={{ fontSize: 12, marginBottom: 12, padding: 10, borderRadius: 8, color: excelMsg.startsWith("✅") ? "#166534" : "#dc2626", background: excelMsg.startsWith("✅") ? "#f0fdf4" : "#fef2f2", border: `1px solid ${excelMsg.startsWith("✅") ? "#bbf7d0" : "#fecaca"}` }}>{excelMsg}</div>
          )}

          {sum && excelPreview && (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 6 }}>{sum.title}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>{sum.detail}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 6 }}>샘플 (최대 3 POL)</div>
              {sum.sample.map(([pol, rates]) => (
                <div key={pol} style={{ fontSize: 11, padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontFamily: "monospace" }}>
                  <strong>{pol}</strong> {JSON.stringify(rates)}
                </div>
              ))}
              {(excelPreview.skipped || []).length > 0 && (
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 10 }}>
                  스킵: {(excelPreview.skipped || []).slice(0, 8).join(", ")}{(excelPreview.skipped.length > 8 ? " …" : "")}
                </div>
              )}
              <button type="button" onClick={applyExcelUpload} disabled={saveBusy}
                style={{ width: "100%", marginTop: 14, padding: "12px", fontSize: 13, fontWeight: 700, color: "#fff", background: saveBusy ? "#fcd34d" : "#d97706", border: "none", borderRadius: 8, cursor: saveBusy ? "not-allowed" : "pointer" }}>
                {saveBusy
                  ? (excelUploadStep === "validity" ? "Validity 저장 중…" : "운임 DB 저장 중…")
                  : "✅ Supabase에 업로드"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RATE HISTORY (운임 관리 · Rental 관리 · 이력 탭) ──
  if (isAdmin && ((showFreightAdmin && freightAdminTab === "history") || (showRentalAdmin && rentalAdminTab === "history"))) {
    const rhIsRental = rhScope === "rental";
    const fmtRhDate = (iso) => {
      if (!iso) return "—";
      try {
        return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      } catch { return iso; }
    };
    const rhSourceLabel = (s) => ({
      admin_save: "Admin 저장", auto_save: "자동 저장", excel_upload: "Excel 업로드", excel_delete: "운임 삭제",
      history_backfill: "이력 보완", gri: "GRI", import: "기존운임 복사", import_undo: "복사 되돌리기", rental_save: "렌탈 저장",
    }[s] || s || "—");
    const rhSourceCell = (row) => {
      const label = rhSourceLabel(row.source);
      const note = String(row.note || "").trim();
      if (note && !label.includes(note)) {
        return (
          <>
            <div>{label}</div>
            <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>{note}</div>
          </>
        );
      }
      return label;
    };
    const rhValidityForRow = (row) => {
      const cr = row.carrier;
      if (!VALIDITY_KEYS.includes(cr)) return "—";
      const slot = validityInfo[cr]?.[row.period === "future" ? "future" : "current"];
      return formatValidityCompact(slot) || formatValiditySlotLabel(slot) || "—";
    };
    const rhTypeLabel = (row) => (row.category === "dropoff"
      ? (row.rate_type === "drop40" ? "40' Drop" : "20' Drop")
      : row.rate_type);
    const rhBaseRows = rhShowDuplicatesOnly && rhDuplicateIds.size
      ? rhRows.filter(r => rhDuplicateIds.has(r.id))
      : rhRows;
    const rhColOptions = {
      carrier: [...new Set(rhBaseRows.map(r => r.carrier).filter(Boolean))].sort(),
      area: [...new Set(rhBaseRows.map(r => r.area || "—"))].sort(),
      type: [...new Set(rhBaseRows.map(rhTypeLabel).filter(Boolean))].sort(),
      validity: [...new Set(rhBaseRows.map(rhValidityForRow))].sort(),
    };
    const rhColFilterActive = rhColFilters.carrier !== "ALL" || rhColFilters.area !== "ALL"
      || rhColFilters.pol.trim() !== "" || rhColFilters.type !== "ALL"
      || rhColFilters.period !== "ALL" || rhColFilters.validity !== "ALL";
    const rhPolQuery = rhColFilters.pol.trim().toUpperCase();
    const rhFilteredRows = rhBaseRows.filter(r =>
      (rhColFilters.carrier === "ALL" || r.carrier === rhColFilters.carrier)
      && (rhColFilters.area === "ALL" || (r.area || "—") === rhColFilters.area)
      && (!rhPolQuery
        || String(r.pol || "").toUpperCase().includes(rhPolQuery)
        || String(r.route || "").toUpperCase().includes(rhPolQuery))
      && (rhColFilters.type === "ALL" || rhTypeLabel(r) === rhColFilters.type)
      && (rhColFilters.period === "ALL" || (r.period === "future" ? "future" : "current") === rhColFilters.period)
      && (rhColFilters.validity === "ALL" || rhValidityForRow(r) === rhColFilters.validity));
    let rhDisplayRows = sortRateHistoryRowsByCity(rhFilteredRows);
    if (rhSort.key) {
      rhDisplayRows = [...rhDisplayRows].sort((a, b) => {
        const av = a[rhSort.key]; const bv = b[rhSort.key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (Number(av) - Number(bv)) * rhSort.dir;
      });
    }
    const toggleRhSort = (key) => {
      setRhSort(prev => (prev.key !== key ? { key, dir: -1 } : prev.dir === -1 ? { key, dir: 1 } : { key: "", dir: 1 }));
    };
    const rhSortMark = (key) => (rhSort.key !== key ? "" : rhSort.dir === -1 ? " ▼" : " ▲");
    const rhAllSelected = rhDisplayRows.length > 0 && rhSelectedIds.length === rhDisplayRows.length;
    const toggleRhRowSelect = (id) => {
      setRhSelectMsg("");
      setRhSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    };
    const toggleRhSelectAll = () => {
      setRhSelectMsg("");
      setRhSelectedIds(rhAllSelected ? [] : rhDisplayRows.map(r => r.id));
    };
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: ff }}>
        {adminSaveToastEl}
        <div style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #e5e7eb", zIndex: 30 }}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button type="button" onClick={rhIsRental ? () => setShowRentalAdmin(false) : closeFreightAdmin} style={{ fontSize: 13, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
            <div style={{ fontSize: 14, fontWeight: 700, color: rhIsRental ? "#7c3aed" : "#111" }}>
              {rhIsRental ? "컨테이너 Rental · 변경 이력" : "운임 관리"}
            </div>
            <button type="button" onClick={loadRateHistory} disabled={rhLoading} style={{ fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 8, background: rhLoading ? (rhIsRental ? "#c4b5fd" : "#99f6e4") : (rhIsRental ? "#7c3aed" : "#0d9488"), color: "#fff", border: "none", cursor: rhLoading ? "not-allowed" : "pointer" }}>
              {rhLoading ? "…" : "검색"}
            </button>
          </div>
          {rhIsRental ? rentalAdminTabBar : freightAdminTabBar}
        </div>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 16px 80px" }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: rhIsRental ? "#6d28d9" : "#0f766e", marginBottom: 10 }}>
              {rhIsRental ? "Rental 운임 변경 이력" : "검색 조건"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: "#6b7280" }}>시작일
                <input type="date" value={rhDateFrom} onChange={e => setRhDateFrom(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }} />
              </label>
              <label style={{ fontSize: 10, color: "#6b7280" }}>종료일
                <input type="date" value={rhDateTo} onChange={e => setRhDateTo(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }} />
              </label>
              {!rhIsRental && (
                <label style={{ fontSize: 10, color: "#6b7280" }}>선사
                  <select value={rhCarrier} onChange={e => setRhCarrier(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}>
                    {["ALL", ...CRS].map(c => <option key={c} value={c}>{c === "ALL" ? "전체" : (CN_KR[c] || c)}</option>)}
                  </select>
                </label>
              )}
              <label style={{ fontSize: 10, color: "#6b7280" }}>구간(Area)
                <select value={rhArea} onChange={e => setRhArea(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}>
                  <option value="ALL">전체</option>
                  {areas.map(a => <option key={a} value={a}>{a}</option>)}
                  {!rhIsRental && <option value="DROP">DROP</option>}
                </select>
              </label>
              <label style={{ fontSize: 10, color: "#6b7280" }}>기간
                <select value={rhPeriod} onChange={e => setRhPeriod(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}>
                  <option value="ALL">전체</option>
                  <option value="current">현재</option>
                  <option value="future">향후</option>
                </select>
              </label>
              {!rhIsRental && (
                <label style={{ fontSize: 10, color: "#6b7280" }}>유형
                  <select value={rhCategory} onChange={e => setRhCategory(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}>
                    <option value="ALL">전체 (해상+Drop)</option>
                    <option value="ocean">해상</option>
                    <option value="dropoff">Drop off</option>
                  </select>
                </label>
              )}
            </div>
            <label style={{ fontSize: 10, color: "#6b7280", display: "block" }}>{rhIsRental ? "POL / 반납지 검색" : "POL / 구간 검색"}
              <input type="text" value={rhPol} onChange={e => setRhPol(e.target.value)} placeholder={rhIsRental ? "BUSAN, Moscow, Shanghai…" : "BUSAN, SHANGHAI, Moscow…"} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box" }} />
            </label>
          </div>

          {rhError && (
            <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 10, marginBottom: 12 }}>{rhError}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>
              {rhLoading ? "불러오는 중…" : rhShowDuplicatesOnly
                ? `중복 ${rhDisplayRows.length}건 / 전체 ${rhRows.length}건`
                : rhColFilterActive
                  ? `필터 ${rhDisplayRows.length}건 / 전체 ${rhRows.length}건`
                  : `${rhRows.length}건 (최대 400건)`}
            </span>
            <span style={{ fontSize: 11, color: rhSelectedIds.length ? "#b45309" : "#9ca3af", fontWeight: rhSelectedIds.length ? 700 : 400 }}>
              선택 {rhSelectedIds.length}건
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {!rhIsRental && (
                <>
                  <button
                    type="button"
                    onClick={applyPruneNoServiceRates}
                    disabled={saveBusy || rhLoading}
                    style={{ fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: "1px solid #fcd34d", background: "#fffbeb", color: "#b45309", cursor: saveBusy ? "not-allowed" : "pointer" }}
                  >
                    서비스外 정리
                  </button>
                  <button
                    type="button"
                    onClick={applyBackfillSells}
                    disabled={saveBusy || rhLoading}
                    style={{ fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: "1px solid #5eead4", background: "#f0fdfa", color: "#0f766e", cursor: saveBusy ? "not-allowed" : "pointer" }}
                  >
                    매출 보완
                  </button>
                </>
              )}
              {!rhIsRental && (
                <button
                  type="button"
                  onClick={applyBackfillDropRateHistory}
                  disabled={rhLoading}
                  style={{ fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: "1px solid #a7f3d0", background: "#ecfdf5", color: "#047857", cursor: rhLoading ? "not-allowed" : "pointer" }}
                >
                  Drop 누락 보완
                </button>
              )}
              <button
                type="button"
                onClick={applyFindRhDuplicates}
                disabled={rhLoading || !rhRows.length}
                style={{ fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 8, border: "1px solid #93c5fd", background: "#eff6ff", color: "#1d4ed8", cursor: rhLoading || !rhRows.length ? "not-allowed" : "pointer" }}
              >
                🔍 중복 찾기
              </button>
              {rhShowDuplicatesOnly && (
                <button
                  type="button"
                  onClick={() => { setRhShowDuplicatesOnly(false); setRhSelectMsg(""); }}
                  style={{ fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer" }}
                >
                  전체 보기
                </button>
              )}
              <button
                type="button"
                onClick={toggleRhSelectAll}
                disabled={!rhDisplayRows.length || rhLoading}
                style={{ fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: rhDisplayRows.length ? "pointer" : "not-allowed" }}
              >
                {rhAllSelected ? "전체 해제" : "전체 선택"}
              </button>
              <button
                type="button"
                onClick={applyDeleteSelectedRhHistoryOnly}
                disabled={!rhSelectedIds.length}
                style={{
                  fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "1px solid #fdba74",
                  color: !rhSelectedIds.length ? "#fdba74" : "#c2410c", background: !rhSelectedIds.length ? "#fff7ed" : "#ffedd5",
                  cursor: !rhSelectedIds.length ? "not-allowed" : "pointer",
                }}
              >
                이력만 삭제 (DB 유지)
              </button>
              <button
                type="button"
                onClick={applyDeleteSelectedRhRows}
                disabled={saveBusy || !rhSelectedIds.length}
                style={{
                  fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "none",
                  color: "#fff", background: saveBusy || !rhSelectedIds.length ? "#fca5a5" : "#dc2626",
                  cursor: saveBusy || !rhSelectedIds.length ? "not-allowed" : "pointer",
                }}
              >
                {saveBusy ? "처리 중…" : "🗑 선택 기록 삭제"}
              </button>
            </div>
          </div>
          {rhSelectMsg && (
            <div style={{
              fontSize: 11, marginBottom: 8, padding: 8, borderRadius: 6, whiteSpace: "pre-line",
              color: rhSelectMsg.startsWith("✅") ? "#166534" : rhSelectMsg.startsWith("🔍") ? "#1d4ed8" : "#dc2626",
              background: rhSelectMsg.startsWith("✅") ? "#f0fdf4" : rhSelectMsg.startsWith("🔍") ? "#eff6ff" : "#fef2f2",
            }}>{rhSelectMsg}</div>
          )}
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 860 }}>
              <thead>
                <tr style={{ background: "#f0fdfa", borderBottom: "1px solid #e5e7eb" }}>
                  {["일시", "선사", "Area", "POL/구간", "타입", "기간", "Validity"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: h === "Validity" ? "center" : "left", fontWeight: 700, color: "#0f766e", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                  {[["cost", "매입"], ["sell", "매출"], ["margin", "마진"]].map(([key, h]) => (
                    <th
                      key={key}
                      onClick={() => toggleRhSort(key)}
                      title="클릭하여 정렬 (▼ 큰순 → ▲ 작은순 → 해제)"
                      style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, color: rhSort.key === key ? "#b45309" : "#0f766e", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    >{h}{rhSortMark(key)}</th>
                  ))}
                  <th style={{ padding: "8px 6px", textAlign: "left", fontWeight: 700, color: "#0f766e", whiteSpace: "nowrap" }}>출처</th>
                  <th style={{ padding: "8px 6px", textAlign: "center", fontWeight: 700, color: "#0f766e", width: 44 }}>
                    <input
                      type="checkbox"
                      checked={rhAllSelected}
                      onChange={toggleRhSelectAll}
                      disabled={!rhDisplayRows.length}
                      title="전체 선택"
                      style={{ width: 16, height: 16, cursor: rhDisplayRows.length ? "pointer" : "not-allowed" }}
                    />
                  </th>
                </tr>
                <tr style={{ background: "#fafdfb", borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "4px 6px" }} />
                  <td style={{ padding: "4px 4px" }}>
                    <select value={rhColFilters.carrier} onChange={e => setRhColFilters(f => ({ ...f, carrier: e.target.value }))} style={{ width: "100%", fontSize: 10, padding: "3px 2px", border: `1px solid ${rhColFilters.carrier !== "ALL" ? "#f59e0b" : "#d1d5db"}`, borderRadius: 5, background: rhColFilters.carrier !== "ALL" ? "#fffbeb" : "#fff" }}>
                      <option value="ALL">전체</option>
                      {rhColOptions.carrier.map(c => <option key={c} value={c}>{CN_KR[c] || c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <select value={rhColFilters.area} onChange={e => setRhColFilters(f => ({ ...f, area: e.target.value }))} style={{ width: "100%", fontSize: 10, padding: "3px 2px", border: `1px solid ${rhColFilters.area !== "ALL" ? "#f59e0b" : "#d1d5db"}`, borderRadius: 5, background: rhColFilters.area !== "ALL" ? "#fffbeb" : "#fff" }}>
                      <option value="ALL">전체</option>
                      {rhColOptions.area.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input
                      type="text"
                      value={rhColFilters.pol}
                      onChange={e => setRhColFilters(f => ({ ...f, pol: e.target.value }))}
                      placeholder="검색…"
                      style={{ width: "100%", fontSize: 10, padding: "3px 5px", border: `1px solid ${rhColFilters.pol.trim() ? "#f59e0b" : "#d1d5db"}`, borderRadius: 5, boxSizing: "border-box", background: rhColFilters.pol.trim() ? "#fffbeb" : "#fff" }}
                    />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <select value={rhColFilters.type} onChange={e => setRhColFilters(f => ({ ...f, type: e.target.value }))} style={{ width: "100%", fontSize: 10, padding: "3px 2px", border: `1px solid ${rhColFilters.type !== "ALL" ? "#f59e0b" : "#d1d5db"}`, borderRadius: 5, background: rhColFilters.type !== "ALL" ? "#fffbeb" : "#fff" }}>
                      <option value="ALL">전체</option>
                      {rhColOptions.type.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <select value={rhColFilters.period} onChange={e => setRhColFilters(f => ({ ...f, period: e.target.value }))} style={{ width: "100%", fontSize: 10, padding: "3px 2px", border: `1px solid ${rhColFilters.period !== "ALL" ? "#f59e0b" : "#d1d5db"}`, borderRadius: 5, background: rhColFilters.period !== "ALL" ? "#fffbeb" : "#fff" }}>
                      <option value="ALL">전체</option>
                      <option value="current">현재</option>
                      <option value="future">향후</option>
                    </select>
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <select value={rhColFilters.validity} onChange={e => setRhColFilters(f => ({ ...f, validity: e.target.value }))} style={{ width: "100%", fontSize: 10, padding: "3px 2px", border: `1px solid ${rhColFilters.validity !== "ALL" ? "#f59e0b" : "#d1d5db"}`, borderRadius: 5, background: rhColFilters.validity !== "ALL" ? "#fffbeb" : "#fff" }}>
                      <option value="ALL">전체</option>
                      {rhColOptions.validity.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td colSpan={4} style={{ padding: "4px 6px", textAlign: "right" }}>
                    {(rhColFilterActive || rhSort.key) && (
                      <button
                        type="button"
                        onClick={() => { setRhColFilters(RH_COL_FILTERS_EMPTY); setRhSort({ key: "", dir: 1 }); }}
                        style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, border: "1px solid #fcd34d", background: "#fffbeb", color: "#b45309", cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        ✕ 필터 초기화
                      </button>
                    )}
                  </td>
                  <td />
                </tr>
              </thead>
              <tbody>
                {rhDisplayRows.length === 0 && !rhLoading && (
                  <tr><td colSpan={12} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
                    {rhShowDuplicatesOnly ? "중복 기록 없음 · 전체 보기로 돌아가세요" : "기록 없음 · 저장 후 자동 적재됩니다"}
                  </td></tr>
                )}
                {rhDisplayRows.map(row => {
                  const selected = rhSelectedIds.includes(row.id);
                  const dupHighlight = rhDuplicateIds.has(row.id);
                  const dupRemove = dupHighlight && selected;
                  const dupKeep = dupHighlight && !selected;
                  return (
                  <tr
                    key={row.id}
                    onClick={() => toggleRhRowSelect(row.id)}
                    onDoubleClick={() => (rhIsRental ? jumpToRentalGridFromRh(row) : jumpToFreightGridFromRh(row))}
                    title={
                      dupRemove ? "중복 · 삭제 예정 (이력만 삭제 권장)"
                        : dupKeep ? "중복 · 유지 (Excel > Admin > 자동저장 우선)"
                        : rhIsRental && row.category === "rental"
                          ? "더블클릭 → Rental 운임 탭에서 편집"
                          : row.category === "ocean" && CRS.includes(row.carrier)
                            ? "더블클릭 → 현재 운임 탭에서 편집"
                            : undefined
                    }
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      background: selected && !dupHighlight ? "#fffbeb"
                        : dupRemove ? "#fee2e2"
                        : dupKeep ? "#ecfdf5"
                        : selected ? "#fffbeb" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "7px 6px", whiteSpace: "nowrap", color: "#374151" }}>{fmtRhDate(row.created_at)}</td>
                    <td style={{ padding: "7px 6px", fontWeight: 600 }}>{CN_KR[row.carrier] || row.carrier}</td>
                    <td style={{ padding: "7px 6px", color: "#6b7280" }}>{row.area || "—"}</td>
                    <td style={{ padding: "7px 6px" }}>
                      <div style={{ fontWeight: 600 }}>{row.pol}</div>
                      {row.route && row.route !== row.pol && <div style={{ fontSize: 9, color: "#9ca3af" }}>{row.route}</div>}
                    </td>
                    <td style={{ padding: "7px 6px" }} title={row.category === "dropoff" ? "Drop off 추가요금 (해상운임 제외)" : row.rate_type}>
                      {row.category === "dropoff"
                        ? (row.rate_type === "drop40" ? "40' Drop" : "20' Drop")
                        : row.rate_type}
                    </td>
                    <td style={{ padding: "7px 6px" }}>{row.period === "future" ? "향후" : "현재"}</td>
                    <td style={{ padding: "7px 6px", textAlign: "center", whiteSpace: "nowrap", fontSize: 10, color: "#0f766e", fontWeight: 600 }} title={formatValiditySlotLabel(validityInfo[row.carrier]?.[row.period === "future" ? "future" : "current"])}>
                      {rhValidityForRow(row)}
                    </td>
                    <td style={{ padding: "7px 6px", textAlign: "right" }}>{row.cost != null ? n(row.cost) : "—"}</td>
                    <td style={{ padding: "7px 6px", textAlign: "right" }}>{row.sell != null ? n(row.sell) : "—"}</td>
                    <td style={{ padding: "7px 6px", textAlign: "right", color: "#059669" }}>{row.margin != null ? n(row.margin) : "—"}</td>
                    <td style={{ padding: "7px 6px", fontSize: 10, color: "#6b7280" }} title={row.note || ""}>{rhSourceCell(row)}</td>
                    <td style={{ padding: "7px 6px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRhRowSelect(row.id)}
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 12, lineHeight: 1.5 }}>
            {rhIsRental ? (
              <>행 클릭·체크박스로 선택 · <strong>더블클릭</strong> → Rental 운임 탭에서 해당 POL·반납지 편집 · <strong>중복 찾기</strong>는 동일 POL·타입·매입·매출·마진 기록을 묶어 삭제 후보를 선택합니다 · <strong>이력만 삭제</strong>는 Rate History만 지우고 Rental DB는 유지 · <strong>선택 기록 삭제</strong>는 이력 + Rental DB 셀 제거.</>
            ) : (
              <>행 클릭·체크박스로 선택 · <strong>더블클릭</strong> → 현재 운임 탭에서 해당 POL 편집 · Drop 이력 <strong>20'/40' Drop</strong> = Admin Drop off 표의 매입·매출(해상운임 합산 아님) · <strong>Drop 누락 보완</strong> = Admin에 있는데 이력에 없는 Drop 셀 등록 · <strong>중복 찾기</strong> · <strong>이력만 삭제</strong>는 DB 유지.</>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── QUOTE REQUEST ADMIN ──
  if (showQuoteAdmin && isAdmin) {
    return (
      <QuoteAdminScreen
        onClose={() => setShowQuoteAdmin(false)}
        onSaveStaffEmails={(arr) => saveSetting("quote_staff_emails", JSON.stringify(arr))}
      />
    );
  }

  // ── NOTICE ADMIN ──
  if (showNoticeAdmin && isAdmin) {
    const slot = noticeAdminTab;
    const cur = notices[slot] ?? mkNotices()[slot];
    return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
      {adminSaveToastEl}
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
          <button type="button" onClick={saveNoticesOnly} disabled={saveBusy}
            style={{width:"100%",marginTop:16,padding:"12px",fontSize:13,fontWeight:700,color:"#fff",background:saveBusy?"#c4b5fd":"#7c3aed",border:"none",borderRadius:8,cursor:saveBusy?"not-allowed":"pointer"}}>
            {saveBusy ? "저장 중…" : "💾 공지 3개 모두 저장"}
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

  // ── AD BANNER ADMIN ──
  if (showAdAdmin && isAdmin) {
    const slot = adAdminTab;
    const cur = adBanners[slot] ?? mkAds()[slot];
    return (
      <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
        {adminSaveToastEl}
        <div style={{position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:30}}>
          <button onClick={()=>setShowAdAdmin(false)} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
          <div style={{fontSize:14,fontWeight:700,color:"#c2410c"}}>하단 광고 배너 (최대 3개)</div>
          <div style={{width:48}}/>
        </div>
        <div style={{maxWidth:600,margin:"0 auto",padding:"16px 16px 80px"}}>
          <div style={{fontSize:11,color:"#c2410c",marginBottom:10}}>
            ON인 광고가 10초마다 순환 · X로 닫으면 탭을 닫을 때까지 숨김
          </div>
          <div style={{display:"flex",background:"#ffedd5",borderRadius:10,padding:3,marginBottom:12}}>
            {adBanners.map((a, i) => (
              <button key={i} type="button" onClick={() => { setAdAdminTab(i); setAdUploadMsg(""); }}
                style={{flex:1,padding:"8px 4px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                  background:adAdminTab===i?"#fff":"transparent",color:adAdminTab===i?"#c2410c":"#ea580c",
                  boxShadow:adAdminTab===i?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
                광고 {i + 1}{a.on && a.imageUrl ? " ●" : ""}
              </button>
            ))}
          </div>
          <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:12,padding:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#9a3412"}}>광고 {slot + 1} 표시</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:"#c2410c",fontWeight:600}}>{cur.on ? "ON" : "OFF"}</span>
                <div onClick={async () => {
                  const next = adBanners.map((a, i) => i === slot ? { ...a, on: !a.on } : a);
                  setAdBanners(next);
                  try { await saveAdBannersSetting(next); } catch (e) { setAdUploadMsg("저장 실패: " + e.message); }
                }} style={{width:40,height:22,borderRadius:11,background:cur.on?"#ea580c":"#d1d5db",cursor:"pointer",position:"relative"}}>
                  <div style={{position:"absolute",top:2,left:cur.on?20:2,width:18,height:18,borderRadius:9,background:"#fff",transition:"left 0.2s"}}/>
                </div>
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:700,color:"#9a3412",marginBottom:4}}>클릭 링크 URL</div>
            <input
              type="url"
              value={cur.linkUrl}
              onChange={e => patchAd(slot, { linkUrl: e.target.value })}
              onBlur={e => {
                const next = adBanners.map((a, i) => i === slot ? { ...a, linkUrl: e.target.value.trim() } : a);
                setAdBanners(next);
                persistAdBanners(next);
              }}
              placeholder="https://example.com"
              style={{width:"100%",padding:"8px 12px",fontSize:13,color:"#7c2d12",background:"#fff",border:"1px solid #fdba74",borderRadius:8,boxSizing:"border-box",marginBottom:12}}
            />
            <div style={{fontSize:11,fontWeight:700,color:"#9a3412",marginBottom:8}}>배너 이미지 (JPG · PNG · GIF · WebP)</div>
            <label
              onDragOver={e => { e.preventDefault(); setAdDragOver(true); }}
              onDragLeave={() => setAdDragOver(false)}
              onDrop={e => { e.preventDefault(); setAdDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadAdFile(f, slot); }}
              style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,padding:"20px 12px",background:adDragOver?"#ffedd5":"#fff",border:`2px dashed ${adDragOver?"#ea580c":"#fdba74"}`,borderRadius:10,cursor:"pointer",transition:"all 0.2s"}}>
              <span style={{fontSize:28}}>🖼️</span>
              <span style={{fontSize:13,color:"#c2410c",fontWeight:600}}>{adUploadLoading ? "업로드 중..." : "이미지 선택 또는 드래그 앤 드롭"}</span>
              <span style={{fontSize:11,color:"#fb923c"}}>Supabase Storage (Notices 버킷)</span>
              <input type="file" accept="image/*,.gif" style={{display:"none"}} onChange={e => { if (e.target.files[0]) uploadAdFile(e.target.files[0], slot); e.target.value = ""; }} disabled={adUploadLoading}/>
            </label>
            {adUploadMsg && <div style={{fontSize:12,marginTop:8,color:adUploadMsg.includes("실패")?"#dc2626":"#16a34a"}}>{adUploadMsg}</div>}
            {cur.imageUrl && (
              <div style={{marginTop:12,padding:"10px 12px",background:"#fff",border:"1px solid #fdba74",borderRadius:8}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8}}>
                  <span style={{fontSize:12,color:"#c2410c",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>✅ {cur.imageUrl.split("/").pop()}</span>
                  <button type="button" onClick={async () => {
                    const next = adBanners.map((a, i) => i === slot ? { ...a, imageUrl: "", on: false } : a);
                    setAdBanners(next);
                    await persistAdBanners(next);
                  }} style={{fontSize:12,color:"#dc2626",background:"none",border:"none",cursor:"pointer",flexShrink:0}}>삭제</button>
                </div>
                <img src={cur.imageUrl} alt="" style={{width:"100%",maxHeight:120,objectFit:"contain",borderRadius:6,background:"#f8fafc"}}/>
              </div>
            )}
            <button type="button" onClick={() => persistAdBanners(adBanners)} disabled={saveBusy}
              style={{width:"100%",marginTop:16,padding:"12px",fontSize:13,fontWeight:700,color:"#fff",background:saveBusy?"#fdba74":"#ea580c",border:"none",borderRadius:8,cursor:saveBusy?"not-allowed":"pointer"}}>
              {saveBusy ? "저장 중…" : "💾 광고 3개 모두 저장"}
            </button>
          </div>
          <div style={{marginTop:12,padding:12,background:"#fff",border:"1px solid #e5e7eb",borderRadius:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#6b7280",marginBottom:8}}>전체 요약</div>
            {adBanners.map((a, i) => (
              <div key={i} style={{fontSize:12,color:"#374151",marginBottom:4}}>
                광고 {i + 1}: {a.on ? "ON" : "OFF"} · {a.imageUrl ? "이미지 있음" : "비어 있음"}{a.linkUrl ? " · 링크 설정됨" : ""}
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
    <div className="guest-price-pair">
      <div className="guest-price-col">
        <div className="guest-price-lbl">{prefix?`${prefix} 20'`:"20'"}</div>
        <div className={`guest-price-val${ratePeriod==="future"?" guest-price-val--future":""}`}>{d20.sell!=null?`$${n(d20.sell)}`:"—"}</div>
        {d20.cr&&<Bg k={d20.cr}/>}
      </div>
      <div className="guest-price-col">
        <div className="guest-price-lbl">40'</div>
        <div className={`guest-price-val${ratePeriod==="future"?" guest-price-val--future":""}`}>{d40.sell!=null?`$${n(d40.sell)}`:"—"}</div>
        {d40.cr&&<Bg k={d40.cr}/>}
      </div>
    </div>
  );

  // 고객 화면: 총 매출가(d.sell)만 노출. rentalSells는 렌탈 매출가(매입+마진) — 매입가/마진은 절대 표시하지 않음
  const GuestRentTriple = ({d20, d40dv, d40hc, prefix = "", hideLabels = false, rentalSells = null}) => {
    const showRental = !!rentalSells && rentalSells.some(v => v != null);
    const grid = (
      <div className={`guest-price-pair guest-rent-triple${hideLabels ? " guest-rent-triple--no-lbl" : ""}`}>
        {[d20, d40dv, d40hc].map((d, i) => (
          <div key={RENT_COMBO_SHORT[i]} className="guest-price-col">
            {!hideLabels && (
              <div className="guest-price-lbl">{prefix ? `${prefix} ${RENT_COMBO_SHORT[i]}` : RENT_COMBO_SHORT[i]}</div>
            )}
            <div className={`guest-price-val${ratePeriod === "future" ? " guest-price-val--future" : ""}`}>{d.sell != null ? `$${n(d.sell)}` : "—"}</div>
            {showRental && (
              <div className="guest-rent-sub">{rentalSells[i] != null ? `$${n(rentalSells[i])}` : " "}</div>
            )}
            {d.cr && <Bg k={d.cr}/>}
          </div>
        ))}
      </div>
    );
    // 렌탈 매출 표시 시: "Rental" 라벨을 그리드 밖(왼쪽)에 한 번만 — 3열 정렬이 상단 요약행과 일치하도록
    if (!showRental) return grid;
    return (
      <div className="guest-rent-labeled">
        <span className="guest-rent-label">Rental</span>
        {grid}
      </div>
    );
  };

  const AdminRentTriple = ({d20, d40dv, d40hc, prefix = "", editable, onCost20, onCost40dv, onCost40hc}) => {
    const combos = [d20, d40dv, d40hc];
    const onCosts = [onCost20, onCost40dv, onCost40hc];
    return (
      <div className="admin-price-cols admin-rent-triple" onClick={e => e.stopPropagation()}>
        {[{ l: "매출가", c: "#b45309", k: "sell", cr: d20.cr, vc: "#111" },
          { l: "매입가", c: "#2563eb", k: "cost", cr: null, vc: "#374151" },
          { l: "마진", c: "#7c3aed", k: "margin", cr: null, vc: "#7c3aed" }].map(col => (
          <div key={col.l} className="apc-col">
            <div className="apc-label" style={{ color: col.c }}>{col.l}</div>
            {combos.map((d, i) => (
              <div key={i}>
                <div className="apc-size">{prefix ? `${prefix} ${RENT_COMBO_SHORT[i]}` : RENT_COMBO_SHORT[i]}</div>
                {col.k === "cost" && editable ? (
                  <input type="number" inputMode="numeric" value={d.cost ?? ""} placeholder="—"
                    onChange={e => onCosts[i]?.(e.target.value)} className="apc-inp"/>
                ) : (
                  <div className="apc-val" style={{ color: col.vc }}>{d[col.k] != null ? `$${n(d[col.k])}` : "—"}</div>
                )}
              </div>
            ))}
            {col.cr && <div style={{ marginTop: 2 }}><Bg k={col.cr}/></div>}
          </div>
        ))}
      </div>
    );
  };

  const RouteCardLabel = ({area, pol}) => (
    <div className="route-card-label">
      <span className="route-card-area">{area}</span>
      <span className="route-card-pol">{pol}</span>
    </div>
  );

  const getValidityLabel = (cr) => {
    const period = ratePeriod === "future" ? "future" : "current";
    return formatValidityCompact(validityInfo[cr]?.[period]);
  };

  const getValidityLabelFull = (cr) => {
    const period = ratePeriod === "future" ? "future" : "current";
    return formatValiditySlotLabel(validityInfo[cr]?.[period]);
  };

  const ValidityCell = ({carrierKey, compact}) => {
    const label = getValidityLabel(carrierKey);
    if (!label) return <span style={{fontSize:10,color:"#d1d5db"}}>—</span>;
    const isFuture = ratePeriod === "future";
    const tone = isFuture ? "future" : "current";
    return (
      <span
        className={`validity-badge validity-badge--${tone}${compact ? " validity-badge--compact" : ""} validity-compact-text`}
        title={getValidityLabelFull(carrierKey) || label}
      >
        {label}
      </span>
    );
  };

  const RatePeriodToggle = ({showCocSoc=false}) => (
    <div className="rate-period-row" style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginTop:10}}>
      <div className="rate-period-toggle" style={{display:"inline-flex",background:"#f3f4f6",borderRadius:8,padding:2}}>
        {[["current","Current Rates"],["future","Upcoming Rates"]].map(([k,l])=>(
          <button key={k} type="button" onClick={()=>setRatePeriod(k)}
            style={{padding:"6px 14px",fontSize:11,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",
              background:ratePeriod===k?"#fff":"transparent",
              color:ratePeriod===k?(k==="future"?"#b45309":"#111"):"#9ca3af",
              boxShadow:ratePeriod===k?"0 1px 2px rgba(0,0,0,0.06)":"none"}}>
            {l}
          </button>
        ))}
      </div>
      {showCocSoc && (
        <div className="coc-soc-toggle" style={{display:"inline-flex",background:"#f3f4f6",borderRadius:8,padding:2}}>
          {["coc","soc"].map(t=>(
            <button key={t} type="button" onClick={()=>setCtype(t)}
              style={{padding:"6px 14px",fontSize:11,fontWeight:600,borderRadius:6,border:"none",cursor:"pointer",
                background:ctype===t?"#fff":"transparent",
                color:ctype===t?"#111":"#9ca3af",
                boxShadow:ctype===t?"0 1px 2px rgba(0,0,0,0.06)":"none"}}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const PolAdjustBar = ({pol,area,types,costHint,onCost20,onCost40,onCost40dv,onCost40hc,onClearCost,tripleRent}) => (
    <div style={{padding:"10px 16px",background:"#fffbeb",borderBottom:"1px solid #fde68a"}} onClick={e=>e.stopPropagation()}>
      <div style={{fontSize:10,fontWeight:700,color:"#1e40af",marginBottom:6}}>{pol} · 매입가 조정 (USD)</div>
      {costHint && <div style={{fontSize:9,color:"#6b7280",marginBottom:6}}>{costHint}</div>}
      {onCost20 ? (
        <div style={{display:"grid",gridTemplateColumns:tripleRent?"1fr 1fr 1fr":"1fr 1fr",gap:8,marginBottom:10}}>
          <div><div style={{fontSize:10,color:"#2563eb",marginBottom:2}}>20' 매입</div>
            <input type="number" placeholder="자동" onChange={e=>onCost20(e.target.value)} style={{...costInp,width:"100%"}}/></div>
          {tripleRent ? (
            <>
              <div><div style={{fontSize:10,color:"#2563eb",marginBottom:2}}>40'DV 매입</div>
                <input type="number" placeholder="자동" onChange={e=>onCost40dv?.(e.target.value)} style={{...costInp,width:"100%"}}/></div>
              <div><div style={{fontSize:10,color:"#2563eb",marginBottom:2}}>40'HC 매입</div>
                <input type="number" placeholder="자동" onChange={e=>onCost40hc?.(e.target.value)} style={{...costInp,width:"100%"}}/></div>
            </>
          ) : (
            <div><div style={{fontSize:10,color:"#2563eb",marginBottom:2}}>40' 매입</div>
              <input type="number" placeholder="자동" onChange={e=>onCost40(e.target.value)} style={{...costInp,width:"100%"}}/></div>
          )}
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

  // ── RENTAL RATES ADMIN ──
  if (showRentalAdmin && isAdmin) {
    if (!settingsLoaded) {
      return (
        <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
          {adminSaveToastEl}
          <div style={{position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:30}}>
            <button onClick={()=>setShowRentalAdmin(false)} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
            <div style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>컨테이너 Rental 운임</div>
            <div style={{width:48}}/>
          </div>
          <RatesLoading />
        </div>
      );
    }
    const raPeriod = rentalAdminPeriod;
    const isFuture = raPeriod === "future";
    const visibleReturnCities = selReturnCity
      ? RENT_CITY_ORDER.filter(c => c === selReturnCity)
      : RENT_CITY_ORDER;
    const rentalCityCount = visibleReturnCities.length;
    const rentalGridCols = 2 + rentalCityCount * 3;
    const applyRentalCellSell = (row, city, comboIdx, sellStr) => {
      const sell = parseInt(sellStr, 10);
      if (!Number.isFinite(sell)) return;
      const type = rentalType(comboIdx);
      const margin = getRentalM(row.freightPol, row.area, type);
      applyRentalRate(row.rentalPol, city, comboIdx, sell - margin, raPeriod);
    };
    const filteredRentalAreaGroups = rentalAreaGroups
      .filter(({ area }) => !(rentalMarginTab === "area" && rentalSelArea) || area === rentalSelArea)
      .map(({ area, rows }) => ({
        area,
        rows: rentalMarginTab === "pol" && rentalSelPol
          ? rows.filter(r => r.freightPol === rentalSelPol || r.displayPol === rentalSelPol)
          : rows,
      }))
      .filter(({ rows }) => rows.length > 0);
    const rentalGridPolCount = filteredRentalAreaGroups.reduce((n, g) => n + g.rows.length, 0);
    const rentalGridFilterLabel = rentalMarginTab === "area" && rentalSelArea
      ? `${rentalSelArea} · ${rentalGridPolCount}개 POL`
      : rentalMarginTab === "pol" && rentalSelPol
        ? `${rentalSelPol} · ${rentalGridPolCount}개 POL`
        : `${rentalGridPolCount}개 POL (전체)`;
    const rentalCityFilterLabel = selReturnCity
      ? RC_LABEL[selReturnCity] || selReturnCity
      : `전체 ${RENT_CITY_ORDER.length}개 반납지`;
    const renderRentalGridCell = (row, city, comboIdx) => {
      const cost = getRentalBase(row.rentalPol, city, comboIdx, raPeriod);
      if (cost == null) return <td className="cg-cell cg-empty">—</td>;
      const type = rentalType(comboIdx);
      const margin = getRentalM(row.freightPol, row.area, type);
      const sell = cost + margin;
      const cellKey = `${row.rentalPol}:${city}:${comboIdx}`;
      const isOpen = rentalEditCell === cellKey;
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
                        onChange={e => applyRentalRate(row.rentalPol, city, comboIdx, e.target.value, raPeriod)}/>
                    </td>
                  </tr>
                  <tr>
                    <td className="cg-mini-label cg-mini-label-sell">매출</td>
                    <td className="cg-mini-val-sell">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-sell"
                        value={sell ?? ""} placeholder="—"
                        onChange={e => applyRentalCellSell(row, city, comboIdx, e.target.value)}/>
                    </td>
                  </tr>
                  <tr className="cg-mini-margin-tr">
                    <td className="cg-mini-label cg-mini-label-margin">마진</td>
                    <td className="cg-mini-val-margin">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-margin"
                        value={margin} onChange={e => applyRentalPolMargin(row.freightPol, type, e.target.value)}/>
                    </td>
                  </tr>
                </tbody>
              </table>
              <button type="button" className="cg-close" onClick={() => setRentalEditCell(null)}>닫기</button>
            </div>
          ) : (
            <button type="button" className="cg-box" onClick={() => setRentalEditCell(cellKey)}>
              <div className="cg-pair-row cg-row-cost">
                <span className="cg-lbl cg-lbl-cost">매입</span>
                <span className="cg-val cg-val-cost">{n(cost)}</span>
              </div>
              <div className="cg-pair-row cg-row-sell">
                <span className="cg-lbl cg-lbl-sell">매출</span>
                <span className="cg-val cg-val-sell">{n(sell)}</span>
              </div>
              <div className="cg-margin-hint"><span className="cg-lbl-margin">마진</span> {margin != null ? n(margin) : "—"}</div>
            </button>
          )}
        </td>
      );
    };
    if (rentalAdminTab === "upload") {
      const upPeriodLabel = rentalUploadPeriod === "future" ? "향후 운임" : "현재 운임";
      const upChanges = rentalUpload?.changes || [];
      const upErrors = rentalUpload?.errors || [];
      const warnCount = upChanges.filter(c => c.bigJump || c.inverted).length;
      const removeCount = upChanges.filter(c => c.remove).length;
      return (
        <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
          {adminSaveToastEl}
          <div className="portal-sticky-top admin-sticky-top">
            <div style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <button onClick={()=>{setShowRentalAdmin(false);setRentalAdminTab("grid");}} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>컨테이너 Rental 운임</div>
                <div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>Excel 업로드 · 매입만 갱신 · 마진 유지 → 매출 자동 계산</div>
              </div>
              <div style={{width:48}}/>
            </div>
            {rentalAdminTabBar}
            {expiryBannerEl}
          </div>
          <div className="carrier-admin-page rental-admin-page">
            <div style={{background:"#fff",border:"1px solid #ddd6fe",borderRadius:10,padding:12,marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#5b21b6",marginBottom:6}}>반영 대상</div>
              <div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3,marginBottom:10}}>
                {[["current","현재 운임"],["future","향후 운임 (권장)"]].map(([k,l])=>(
                  <button key={k} type="button"
                    onClick={()=>{
                      setRentalUploadPeriod(k);
                      setRentalUpload(prev => prev
                        ? { ...prev, changes: buildRentalUploadChanges(prev.entries, rentalRates, k) }
                        : prev);
                    }}
                    style={{flex:1,padding:"8px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                      background:rentalUploadPeriod===k?"#fff":"transparent",
                      color:rentalUploadPeriod===k?(k==="future"?"#b45309":"#111"):"#9ca3af"}}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button type="button"
                  onClick={() => downloadRentalTemplate(rentalRates, rentalRows, rentalUploadPeriod).catch(e => setRentalUploadMsg(`양식 생성 실패: ${e.message}`))}
                  style={{fontSize:11,fontWeight:700,padding:"8px 12px",borderRadius:8,background:"#ede9fe",color:"#5b21b6",border:"1px solid #ddd6fe",cursor:"pointer"}}>
                  📥 양식 다운로드 (현재 도시·POL·매입가 포함)
                </button>
                <label style={{fontSize:11,fontWeight:700,padding:"8px 12px",borderRadius:8,background:rentalUploadBusy?"#c4b5fd":"#7c3aed",color:"#fff",cursor:rentalUploadBusy?"wait":"pointer"}}>
                  {rentalUploadBusy ? "읽는 중…" : "📤 Excel 파일 선택"}
                  <input type="file" accept=".xlsx,.xls" style={{display:"none"}} disabled={rentalUploadBusy}
                    onChange={e => { handleRentalUploadFile(e.target.files?.[0]); e.target.value = ""; }}/>
                </label>
              </div>
              <div style={{fontSize:9,color:"#9ca3af",marginTop:8}}>
                컬럼: Return City · AREA · POL · 20&apos; · 40&apos;DV · 40&apos;HC (매입가) — 빈 칸은 변경 없음으로 처리
              </div>
            </div>
            {rentalUploadMsg && (
              <div style={{marginBottom:10,padding:"8px 12px",borderRadius:8,fontSize:11,fontWeight:600,
                background:rentalUploadMsg.startsWith("✅")?"#f0fdf4":"#fef2f2",
                color:rentalUploadMsg.startsWith("✅")?"#166534":"#b91c1c",
                border:`1px solid ${rentalUploadMsg.startsWith("✅")?"#bbf7d0":"#fecaca"}`}}>
                {rentalUploadMsg}
              </div>
            )}
            {upErrors.length > 0 && (
              <div style={{marginBottom:10,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,padding:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#c2410c",marginBottom:6}}>매칭 실패 {upErrors.length}행 (반영 제외)</div>
                {upErrors.slice(0, 10).map((er, i) => (
                  <div key={i} style={{fontSize:10,color:"#9a3412"}}>
                    {er.row}행 · {er.city || "—"} / {er.pol || "—"} · {er.reason}
                  </div>
                ))}
                {upErrors.length > 10 && <div style={{fontSize:10,color:"#9a3412"}}>… 외 {upErrors.length - 10}행</div>}
              </div>
            )}
            {rentalUpload && upChanges.length > 0 && (
              <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:12,marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#111"}}>변경 미리보기 · {upChanges.length}개 셀</span>
                  <span style={{fontSize:10,color:"#6b7280"}}>{rentalUpload.fileName} → {upPeriodLabel}</span>
                  {warnCount > 0 && (
                    <span style={{fontSize:10,fontWeight:700,color:"#b91c1c"}}>⚠️ 경고 {warnCount}건 (±30% 변동 또는 20&apos;&gt;40&apos;DV 역전)</span>
                  )}
                  {removeCount > 0 && (
                    <span style={{fontSize:10,fontWeight:700,color:"#9a3412"}}>🗑 미서비스(x) 삭제 {removeCount}건</span>
                  )}
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
                    <thead>
                      <tr style={{color:"#9ca3af",borderBottom:"1px solid #e5e7eb",textAlign:"left"}}>
                        <th style={{padding:"4px 8px"}}>도시</th>
                        <th style={{padding:"4px 8px"}}>POL</th>
                        <th style={{padding:"4px 8px"}}>사이즈</th>
                        <th style={{padding:"4px 8px",textAlign:"right"}}>기존 매입</th>
                        <th style={{padding:"4px 8px",textAlign:"right"}}>새 매입</th>
                        <th style={{padding:"4px 8px",textAlign:"right"}}>새 매출 (마진 유지)</th>
                        <th style={{padding:"4px 8px"}}>경고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upChanges.map((c, i) => {
                        const { margin } = rentalUploadMargin(c.pol, c.type);
                        const warn = c.bigJump || c.inverted;
                        const pct = !c.remove && c.old ? Math.round((c.next - c.old) / c.old * 100) : null;
                        return (
                          <tr key={i} style={{borderBottom:"1px solid #f9fafb",background:c.remove?"#fff7ed":warn?"#fef2f2":i%2?"#fafafa":"#fff"}}>
                            <td style={{padding:"4px 8px"}}>{RC_LABEL[c.city] || c.city}</td>
                            <td style={{padding:"4px 8px"}}>{c.pol}</td>
                            <td style={{padding:"4px 8px"}}>{c.sk === "c20" ? "20'" : c.sk === "c40dv" ? "40'DV" : "40'HC"}</td>
                            <td style={{padding:"4px 8px",textAlign:"right",color:"#9ca3af"}}>{c.old != null ? n(c.old) : "—"}</td>
                            <td style={{padding:"4px 8px",textAlign:"right",fontWeight:700,color:c.remove?"#9a3412":"#1d4ed8"}}>{c.remove ? "미서비스(x)" : n(c.next)}</td>
                            <td style={{padding:"4px 8px",textAlign:"right",fontWeight:700,color:"#047857"}}>{c.remove ? "—" : <>{n(c.next + margin)} <span style={{fontWeight:400,color:"#9ca3af"}}>(+{n(margin)})</span></>}</td>
                            <td style={{padding:"4px 8px",fontSize:10,color:c.remove?"#9a3412":"#b91c1c",fontWeight:700}}>
                              {c.remove ? "🗑 삭제" : <>{c.bigJump ? `±30%↑ (${pct > 0 ? "+" : ""}${pct}%)` : ""}{c.bigJump && c.inverted ? " · " : ""}{c.inverted ? "20'>40'DV" : ""}</>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button type="button" onClick={confirmRentalUpload} disabled={saveBusy}
                    style={{flex:1,padding:"10px",fontSize:12,fontWeight:700,borderRadius:8,border:"none",cursor:saveBusy?"not-allowed":"pointer",background:saveBusy?"#c4b5fd":"#7c3aed",color:"#fff"}}>
                    {saveBusy ? "저장 중…" : `✓ ${upChanges.length}개 셀 ${upPeriodLabel}에 반영`}
                  </button>
                  <button type="button" onClick={cancelRentalUpload}
                    style={{padding:"10px 16px",fontSize:12,fontWeight:600,borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",color:"#6b7280",cursor:"pointer"}}>
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}} onClick={() => setRentalEditCell(null)}>
        {adminSaveToastEl}
        <div className="portal-sticky-top admin-sticky-top">
          <div style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <button onClick={()=>{setShowRentalAdmin(false);setRentalAdminTab("grid");}} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>컨테이너 Rental 운임</div>
              <div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>{ADMIN_SAVE_REV} · {DB_LABEL[DB_RENTAL]}</div>
            </div>
            {rentalAdminTab === "grid" ? (
              <button type="button" onClick={saveRentalPricing} disabled={saveBusy}
                style={{fontSize:11,fontWeight:700,padding:"6px 12px",borderRadius:8,background:saveBusy?"#c4b5fd":"#7c3aed",color:"#fff",border:"none",cursor:saveBusy?"not-allowed":"pointer"}}>
                {saveBusy ? "저장 중…" : "💾 저장"}
              </button>
            ) : (
              <div style={{width:48}}/>
            )}
          </div>
          {rentalAdminTabBar}
          {expiryBannerEl}
          {rentalAdminTab === "grid" && (
          <div className="carrier-admin-page rental-admin-page" onClick={e => e.stopPropagation()}>
            <div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3}}>
              {[["current","현재 운임"],["future","향후 운임"]].map(([k,l])=>(
                <button key={k} type="button" onClick={()=>{setRentalAdminPeriod(k);setRentalEditCell(null);}}
                  style={{flex:1,padding:"8px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                    background:rentalAdminPeriod===k?"#fff":"transparent",
                    color:rentalAdminPeriod===k?(k==="future"?"#b45309":"#111"):"#9ca3af"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          )}
        </div>
        <div className="carrier-admin-page rental-admin-page" onClick={e => e.stopPropagation()}>
          <div style={{marginBottom:10,background:"#fff",border:"1px solid #ddd6fe",borderRadius:10,padding:10}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <Bg k="RENTAL"/><span style={{fontSize:11,fontWeight:700,color:"#5b21b6"}}>{CN_KR.RENTAL} Validity</span>
            </div>
            <ValidityPeriodFields carrierKey="RENTAL" period="current" periodLabel="현재 운임" compact
              validityInfo={validityInfo} onUpdate={updateValiditySlot} />
            <ValidityPeriodFields carrierKey="RENTAL" period="future" periodLabel="향후 운임" compact
              validityInfo={validityInfo} onUpdate={updateValiditySlot}
              futureFromMin={getFutureFromMinDate("RENTAL")} />
          </div>
          <MarginPanel
            filterHint={
              rentalMarginTab === "area" && rentalSelArea ? `운임표: ${rentalSelArea} 지역만 표시` :
              rentalMarginTab === "pol" && rentalSelPol ? `운임표: ${rentalSelPol} 만 표시` :
              rentalMarginTab === "area" ? "지역 선택 시 해당 지역 운임만 표시" : null
            }
            marginTab={rentalMarginTab} setMarginTab={setRentalMarginTab}
            margins={rentalMargins} applyGlobalMargin={applyRentalGlobalMargin}
            selArea={rentalSelArea} setSelArea={setRentalSelArea}
            areaM={rentalAreaM} applyAreaMarginType={applyRentalAreaMarginType} applyAreaMargins={applyRentalAreaMargins}
            selPol={rentalSelPol} setSelPol={setRentalSelPol}
            polM={rentalPolM} applyPolMargins={applyRentalPolMargins} clearPolMargins={clearRentalPolMargins}
            polEdit={rentalPolEdit} setPolEdit={setRentalPolEdit}
            areas={areas} fData={fData} getM={getRentalM}
            rateTypes={RENTAL_RATE_TYPES}
            rateLabel={rentalRateLabel}
            gridCols="1fr 1fr 1fr"
            polData={rentalPolData}
            globalHint="렌탈 20'·40'DV·40'HC 기본 마진 · 마지막 수정 기준 우선"
            formatAreaSummary={(m, mg) => `${m.r20 ?? mg.r20} / ${m.r40dv ?? mg.r40dv} / ${m.r40hc ?? mg.r40hc}`}
          />
          <div style={{marginBottom:10,padding:10,background:"#faf5ff",border:"1px solid #ddd6fe",borderRadius:10}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6b21a8",marginBottom:6}}>반납지 (Return City) · 운임표 필터</div>
            <select value={selReturnCity} onChange={e=>{setSelReturnCity(e.target.value);setRentalEditCell(null);}}
              style={{width:"100%",padding:"8px 10px",fontSize:12,fontWeight:600,border:"1px solid #ddd6fe",borderRadius:8,background:"#fff",color:"#5b21b6",marginBottom:8}}>
              <option value="">-- 전체 반납지 --</option>
              {RENT_CITY_ORDER.map(city=>(
                <option key={city} value={city}>{RC_LABEL[city] || city}</option>
              ))}
            </select>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
              <button type="button" onClick={()=>{setSelReturnCity("");setRentalEditCell(null);}}
                style={{fontSize:10,fontWeight:600,padding:"5px 10px",borderRadius:16,whiteSpace:"nowrap",cursor:"pointer",border:`1px solid ${!selReturnCity?"#7c3aed":"#e9d5ff"}`,background:!selReturnCity?"#7c3aed":"#fff",color:!selReturnCity?"#fff":"#7c3aed"}}>
                전체
              </button>
              {RENT_CITY_ORDER.map(city=>{
                const on = selReturnCity === city;
                const label = RC_LABEL[city] || city;
                return (
                  <button key={city} type="button" onClick={()=>{setSelReturnCity(on?"":city);setRentalEditCell(null);}}
                    style={{fontSize:10,fontWeight:600,padding:"5px 10px",borderRadius:16,whiteSpace:"nowrap",cursor:"pointer",border:`1px solid ${on?"#7c3aed":"#e9d5ff"}`,background:on?"#7c3aed":"#fff",color:on?"#fff":"#7c3aed"}}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{fontSize:10,color:"#6b7280",marginBottom:8}}>
            {rentalCityFilterLabel} · {isFuture ? "향후" : "현재"} 렌탈 (USD) · 셀 클릭 → 매입·매출·마진 · {rentalGridFilterLabel}
          </div>
          <div className="carrier-grid-wrap rental-grid-wrap">
            <table className="carrier-grid rental-grid">
              <thead>
                <tr className="cg-carrier-row">
                  <th colSpan={2} className="cg-rental-corner"></th>
                  {visibleReturnCities.map(city => (
                    <th key={city} colSpan={3} className="cg-rental-city-head">{RC_LABEL[city] || city}</th>
                  ))}
                </tr>
                <tr className="cg-head-row">
                  <th className="cg-th-area cg-rental-sticky-area">AREA</th>
                  <th className="cg-th-pol cg-rental-sticky-pol">POL</th>
                  {visibleReturnCities.flatMap(city => (
                    RENT_COMBO_SHORT.map(label => (
                      <th key={`${city}-${label}`}>{label}</th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRentalAreaGroups.length === 0 ? (
                  <tr><td colSpan={rentalGridCols} style={{padding:20,color:"#9ca3af",fontSize:12}}>표시할 POL 없음 · 지역/POL·반납지 선택 확인</td></tr>
                ) : filteredRentalAreaGroups.map(({ area, rows }) => rows.map((row, ri) => (
                  <tr key={row.rentalPol} className={ri % 2 === 1 ? "cg-stripe" : ""}>
                    {ri === 0 && (
                      <td rowSpan={rows.length} className="cg-area cg-rental-sticky-area">{area}</td>
                    )}
                    <td className="cg-pol cg-rental-sticky-pol">{row.displayPol}</td>
                    {visibleReturnCities.flatMap(city => (
                      [0, 1, 2].map(comboIdx => renderRentalGridCell(row, city, comboIdx))
                    ))}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── CARRIER RATES (운임 관리 · 현재 운임 탭) ──
  if (showFreightAdmin && freightAdminTab === "grid" && isAdmin) {
    if (!settingsLoaded) {
      return (
        <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
          {adminSaveToastEl}
          <div style={{position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #e5e7eb",zIndex:30}}>
            <div style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <button onClick={closeFreightAdmin} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
              <div style={{fontSize:14,fontWeight:700,color:"#111"}}>운임 관리</div>
              <div style={{width:48}}/>
            </div>
            {freightAdminTabBar}
          </div>
          <RatesLoading />
        </div>
      );
    }
    const caPeriod = carrierAdminPeriod;
    const caCr = carrierAdminCr;
    const isDropAdmin = carrierAdminMode === "dropoff";
    const isFuture = caPeriod === "future";
    const applyCellSell = (row, type, sellStr) => {
      applyCarrierSell(row.pol, caCr, type, sellStr, caPeriod);
    };
    const applyDropAdminSell = (cityKey, si, sellStr) => {
      const sell = parseInt(sellStr, 10);
      if (!Number.isFinite(sell)) return;
      const cost = getCarrierDropAddon(caCr, cityKey, si, caPeriod);
      if (cost == null) return;
      applyCarrierDropMargin(caCr, cityKey, si, sell - cost);
    };
    const filteredCarrierAreaGroups = carrierGridAreaGroups;
    const gridPolCount = filteredCarrierAreaGroups.reduce((n, g) => n + g.rows.length, 0);
    const gridFilterLabel = `${gridPolCount}개 POL (전체)`;
    const griTargetRows = griScopeTab === "area" && griSelAreas.length > 0
      ? fData.filter(r => griSelAreas.includes(r.area))
      : fData;
    const griFilterLabel = griScopeTab === "area" && griSelAreas.length > 0
      ? `${griTargetRows.length}개 POL · ${griSelAreas.join(", ")}`
      : `${griTargetRows.length}개 POL (전체)`;
    const renderGridCell = (row, type) => {
      const base = row.rates[caCr]?.[type];
      const cost = getCarrierRate(row, caCr, type, caPeriod);
      if (base == null && cost == null) {
        return <td className="cg-cell cg-empty">—</td>;
      }
      const sell = cost != null ? getCarrierAdminSell(row.pol, caCr, type, caPeriod, cost) : null;
      const margin = displayMarginFromPrices(cost, sell);
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
                </tbody>
              </table>
              {margin != null && (
                <div className="cg-edit-margin-readonly">마진 {n(margin)}</div>
              )}
              <button type="button" className="cg-close" onClick={() => setCarrierEditCell(null)}>닫기</button>
            </div>
          ) : (
            <button
              type="button"
              className="cg-box"
              onClick={() => { if (gridEditUnlocked) setCarrierEditCell(cellKey); }}
              title={gridEditUnlocked ? undefined : "단가 수정 버튼을 눌러 수정 모드로 전환하세요"}
              style={gridEditUnlocked ? undefined : { cursor: "default" }}
            >
              <div className="cg-pair-row cg-row-cost">
                <span className="cg-lbl cg-lbl-cost">매입</span>
                <span className="cg-val cg-val-cost">{cost != null ? n(cost) : "—"}</span>
              </div>
              <div className="cg-pair-row cg-row-sell">
                <span className="cg-lbl cg-lbl-sell">매출</span>
                <span className="cg-val cg-val-sell">{sell != null ? n(sell) : "—"}</span>
              </div>
              <div className="cg-margin-hint"><span className="cg-lbl-margin">마진</span> {margin != null ? n(margin) : "—"}</div>
            </button>
          )}
        </td>
      );
    };
    const renderDropAdminCell = (cityKey, si) => {
      const cost = getCarrierDropAddon(caCr, cityKey, si, caPeriod);
      const sell = cost != null ? cost + getDropM(caCr, cityKey, si) : null;
      const margin = displayMarginFromPrices(cost, sell);
      const cellKey = `drop:${caCr}:${cityKey}:${caPeriod}:${si}`;
      const isOpen = carrierEditCell === cellKey;
      return (
        <td className={`cg-cell drop-admin-td${isFuture ? " cg-future" : ""}${isOpen ? " cg-active" : ""}`}>
          {isOpen ? (
            <div className="cg-edit-panel" onClick={e => e.stopPropagation()}>
              <table className="cg-mini">
                <tbody>
                  <tr>
                    <td className="cg-mini-label cg-mini-label-cost">매입</td>
                    <td className="cg-mini-val-cost">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-cost"
                        value={cost ?? ""} placeholder="—"
                        onChange={e => applyCarrierDropRate(caCr, cityKey, si, e.target.value, caPeriod)}/>
                    </td>
                  </tr>
                  <tr>
                    <td className="cg-mini-label cg-mini-label-sell">매출</td>
                    <td className="cg-mini-val-sell">
                      <input type="number" inputMode="numeric" className="cg-mini-inp cg-inp-sell"
                        value={sell ?? ""} placeholder="—"
                        onChange={e => applyDropAdminSell(cityKey, si, e.target.value)}/>
                    </td>
                  </tr>
                </tbody>
              </table>
              {margin != null && (
                <div className="cg-edit-margin-readonly">마진 {n(margin)}</div>
              )}
              <button type="button" className="cg-close" onClick={() => setCarrierEditCell(null)}>닫기</button>
            </div>
          ) : (
            <button type="button" className="cg-box drop-admin-box" onClick={() => setCarrierEditCell(cellKey)}>
              <div className="cg-pair-row cg-row-cost">
                <span className="cg-lbl cg-lbl-cost">매입</span>
                <span className="cg-val cg-val-cost">{cost != null ? n(cost) : "—"}</span>
              </div>
              <div className="cg-pair-row cg-row-sell">
                <span className="cg-lbl cg-lbl-sell">매출</span>
                <span className="cg-val cg-val-sell">{sell != null ? n(sell) : "—"}</span>
              </div>
              <div className="cg-margin-hint"><span className="cg-lbl-margin">마진</span> {margin != null ? n(margin) : "—"}</div>
            </button>
          )}
        </td>
      );
    };
    return (
      <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}} onClick={() => setCarrierEditCell(null)}>
        {adminSaveToastEl}
        <div className="portal-sticky-top admin-sticky-top">
          <div style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <button onClick={closeFreightAdmin} style={{fontSize:13,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>← Back</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#111"}}>운임 관리</div>
              <div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>{ADMIN_SAVE_REV} · {carrierAdminMode === "dropoff" ? DB_LABEL[DB_DROP] : DB_LABEL[DB_OCEAN]} · 변경 시 자동 저장</div>
            </div>
            <button type="button" onClick={saveCarrierPricing} disabled={saveBusy}
              style={{fontSize:11,fontWeight:700,padding:"6px 12px",borderRadius:8,background:saveBusy?"#93c5fd":"#2563eb",color:"#fff",border:"none",cursor:saveBusy?"not-allowed":"pointer"}}>
              {saveBusy ? "저장 중…" : "💾 저장"}
            </button>
          </div>
          {freightAdminTabBar}
          {expiryBannerEl}
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
            <div style={{display:"flex",background:"#ecfdf5",borderRadius:10,padding:3,marginBottom:8}}>
              {[["ocean","해상 운임"],["dropoff","Drop off"]].map(([k,l])=>(
                <button key={k} type="button" onClick={()=>{setCarrierAdminMode(k);setCarrierEditCell(null);}}
                  style={{flex:1,padding:"8px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                    background:carrierAdminMode===k?"#fff":"transparent",
                    color:carrierAdminMode===k?"#047857":"#6ee7b7",
                    boxShadow:carrierAdminMode===k?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{display:"flex",background:"#f3f4f6",borderRadius:10,padding:3}}>
              {[["current","현재 운임"],["future","향후 운임"]].map(([k,l])=>(
                <button key={k} type="button" onClick={()=>{setCarrierAdminPeriod(k);setCarrierEditCell(null);}}
                  style={{flex:1,padding:"8px",fontSize:11,fontWeight:600,borderRadius:8,border:"none",cursor:"pointer",
                    background:carrierAdminPeriod===k?"#fff":"transparent",
                    color:carrierAdminPeriod===k?(k==="future"?"#b45309":"#111"):"#9ca3af"}}>
                  {l}
                </button>
              ))}
            </div>
            {carrierAdminPolFilter && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "6px 10px", background: "#eff6ff", borderRadius: 8, fontSize: 11 }}>
                <span style={{ color: "#1e40af", fontWeight: 600 }}>POL 필터: {carrierAdminPolFilter}</span>
                <button type="button" onClick={() => { setCarrierAdminPolFilter(""); setCarrierEditCell(null); }}
                  style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid #93c5fd", background: "#fff", color: "#2563eb", cursor: "pointer" }}>
                  필터 해제
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="carrier-admin-page" onClick={e => e.stopPropagation()}>
          {!isDropAdmin && (
          <>
          {isFuture && (
            <div className="import-current-freight-box" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className="import-current-freight-btn"
                onClick={() => importCurrentToFutureFreight(caCr, false)}
              >
                <span className="import-current-freight-icon">📋</span>
                <span className="import-current-freight-text">
                  <strong>기존운임 가져오기</strong>
                  <span>현재 {CN_KR[caCr]} 매입 운임을 향후 운임에 복사 · 이후 GRI로 조정</span>
                </span>
              </button>
              {importFreightUndo?.carrier === caCr && !importFreightUndo?.dropoffMode && (
                <button type="button" className="import-current-freight-undo" onClick={undoImportFreight}>
                  되돌리기
                </button>
              )}
            </div>
          )}
          <GriAdjustPanel
            periodLabel={griPeriodLabel(caPeriod)}
            areas={areas}
            scopeTab={griScopeTab}
            setScopeTab={tab => {
              setGriScopeTab(tab);
              if (tab === "all") setGriSelAreas([]);
            }}
            selAreas={griSelAreas}
            toggleArea={toggleGriArea}
            clearAreas={() => setGriSelAreas([])}
            filterHint={`${griFilterLabel} · COC/SOC 타입별 금액 입력 후 적용`}
            onApplyBuying={deltas => applyBuyingGriBulk(deltas, griTargetRows, caCr, caPeriod)}
            onApplySelling={deltas => applySellingGriBulk(deltas, griTargetRows, caCr, caPeriod)}
            canUndoBuying={griBuyUndo?.carrier === caCr && griBuyUndo?.period === caPeriod}
            canUndoSelling={griSellUndo?.carrier === caCr && griSellUndo?.period === caPeriod}
            onUndoBuying={undoBuyingGriBulk}
            onUndoSelling={undoSellingGriBulk}
          />
          <div style={{marginBottom:10,background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:10}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <Bg k={caCr}/><span style={{fontSize:11,fontWeight:700}}>{CN_KR[caCr]} Validity</span>
            </div>
            <ValidityPeriodFields carrierKey={caCr} period="current" periodLabel="현재 운임" compact
              validityInfo={validityInfo} onUpdate={updateValiditySlot} />
            <ValidityPeriodFields carrierKey={caCr} period="future" periodLabel="향후 운임" compact
              validityInfo={validityInfo} onUpdate={updateValiditySlot}
              futureFromMin={getFutureFromMinDate(caCr)} />
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{fontSize:10,color:"#6b7280"}}>
              {gridEditUnlocked ? "수정 모드 · 셀 클릭 → 매입·매출 조정" : "조회 모드 · 수정하려면 단가 수정 클릭"} · {gridFilterLabel}
            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:6}}>
              {gridEditUnlocked ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const snap = gridEditSnapshotRef.current;
                      if (snap) {
                        setPolCostO(snap.polCostO);
                        setPolM(snap.polM);
                        setPolMFuture(snap.polMFuture);
                      }
                      gridEditSnapshotRef.current = null;
                      setGridEditUnlocked(false);
                      setCarrierEditCell(null);
                    }}
                    style={{fontSize:11,fontWeight:600,padding:"6px 14px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",color:"#374151",cursor:"pointer"}}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      gridEditSnapshotRef.current = null;
                      setGridEditUnlocked(false);
                      setCarrierEditCell(null);
                      saveCarrierPricing();
                    }}
                    disabled={saveBusy}
                    style={{fontSize:11,fontWeight:700,padding:"6px 14px",borderRadius:8,border:"none",background:saveBusy?"#93c5fd":"#2563eb",color:"#fff",cursor:saveBusy?"not-allowed":"pointer"}}
                  >
                    {saveBusy ? "저장 중…" : "💾 저장"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    gridEditSnapshotRef.current = { polCostO, polM, polMFuture };
                    setGridEditUnlocked(true);
                  }}
                  style={{fontSize:11,fontWeight:700,padding:"6px 14px",borderRadius:8,border:"1px solid #fcd34d",background:"#fffbeb",color:"#b45309",cursor:"pointer"}}
                >
                  ✏️ 단가 수정
                </button>
              )}
            </div>
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
          </>
          )}
          {isDropAdmin && (
            <div className="drop-admin-panel">
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <Bg k={caCr}/>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#047857"}}>
                    {CN_KR[caCr]} · Drop off · 전체 반납지
                  </div>
                  <div style={{fontSize:10,color:"#6b7280",marginTop:2}}>
                    {isFuture ? "향후" : "현재"} · {DB_LABEL[DB_DROP]} · Validity 설정 후 금액 입력 · 자동 저장 · 누적 {countCarrierDropValidityArchive(carrierDropRates, caCr)}구간
                  </div>
                </div>
              </div>
              <div style={{marginBottom:12,background:"#fff",border:"1px solid #d1fae5",borderRadius:10,padding:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#047857",marginBottom:8}}>
                  Drop off Validity · {CN_KR[caCr]}
                </div>
                <ValidityPeriodFields
                  carrierKey={carrierDropValidityKey(caCr)}
                  period={caPeriod}
                  periodLabel={isFuture ? "향후 (From ~ Till)" : "현재 (From ~ Till)"}
                  compact
                  validityInfo={validityInfo}
                  onUpdate={updateValiditySlot}
                  futureFromMin={isFuture ? getFutureFromMinDate(carrierDropValidityKey(caCr)) : undefined}
                />
                {(() => {
                  const slot = validityInfo[carrierDropValidityKey(caCr)]?.[caPeriod];
                  const preview = formatValiditySlotLabel(slot);
                  if (!preview) return null;
                  return (
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>
                      저장 키: {validityStorageKey(slot)} · {preview}
                    </div>
                  );
                })()}
              </div>
              {isFuture && (
                <div className="import-current-freight-box" style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    className="import-current-freight-btn import-current-freight-btn--drop"
                    onClick={() => importCurrentToFutureFreight(caCr, true)}
                  >
                    <span className="import-current-freight-icon">📋</span>
                    <span className="import-current-freight-text">
                      <strong>기존운임 가져오기</strong>
                      <span>현재 Drop off 운임을 향후 운임에 복사</span>
                    </span>
                  </button>
                  {importFreightUndo?.carrier === caCr && importFreightUndo?.dropoffMode && (
                    <button type="button" className="import-current-freight-undo" onClick={undoImportFreight}>
                      되돌리기
                    </button>
                  )}
                </div>
              )}
              <div className="carrier-grid-wrap drop-admin-table-wrap">
                <table className="carrier-grid drop-admin-table">
                  <thead>
                    <tr className="cg-carrier-row">
                      <th colSpan={3}>{caCr} {CN_KR[caCr]} · Drop off (USD)</th>
                    </tr>
                    <tr className="cg-head-row">
                      <th className="cg-th-pol drop-admin-city-col">반납지</th>
                      <th>20&apos;</th>
                      <th>40&apos;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DOC.map(({ k, l }, ri) => (
                      <tr key={k} className={ri % 2 === 1 ? "cg-stripe" : ""}>
                        <td className="cg-pol drop-admin-city-col">{l}</td>
                        {renderDropAdminCell(k, 0)}
                        {renderDropAdminCell(k, 1)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
        <button onClick={()=>setExp(open?null:`o${idx}`)} className={isAdmin?"admin-card-btn":"route-card-btn"} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:isAdmin?"10px 12px":"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",gap:8}}>
          <div className={isAdmin?"admin-card-top":"route-card-head"}>
            <RouteCardLabel area={row.area} pol={row.pol}/>
            {!isAdmin && <GuestPricePair d20={d20} d40={d40}/>}
            <span className="route-card-chevron" style={{transform:open?"rotate(180deg)":"none"}}>&#8964;</span>
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
                  const cs20=cv20!=null?getGuestCarrierSell(row.pol,k,t20,"current",cv20,row.area):null;
                  const cs40=cv40!=null?getGuestCarrierSell(row.pol,k,t40,"current",cv40,row.area):null;
                  const fs20=fv20!=null?getGuestCarrierSell(row.pol,k,t20,"future",fv20,row.area):null;
                  const fs40=fv40!=null?getGuestCarrierSell(row.pol,k,t40,"future",fv40,row.area):null;
                  const cd20=mkPrice(cv20,cs20!=null?cs20-cv20:0,k);
                  const cd40=mkPrice(cv40,cs40!=null?cs40-cv40:0,k);
                  const fd20=mkPrice(fv20,fs20!=null?fs20-fv20:0,k);
                  const fd40=mkPrice(fv40,fs40!=null?fs40-fv40:0,k);
                  return (
                    <div key={k} style={{padding:"10px 0",borderBottom:"1px solid #f9fafb"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                        <Bg k={k}/><span style={{fontSize:11,color:"#6b7280",fontWeight:600}}>{CN[k]}</span>
                      </div>
                      <div style={{fontSize:9,fontWeight:700,color:"#166534",marginBottom:4}}>Current Rates · {formatValiditySlotLabel(validityInfo[k]?.current) || "—"}</div>
                      <AdminPriceCols d20={cd20} d40={cd40} editable
                        onCost20={v=>applyCarrierRate(row.pol,k,t20,v,"current")}
                        onCost40={v=>applyCarrierRate(row.pol,k,t40,v,"current")}/>
                      <div style={{fontSize:9,fontWeight:700,color:"#b45309",margin:"10px 0 4px"}}>Upcoming Rates · {formatValiditySlotLabel(validityInfo[k]?.future) || "—"}</div>
                      <AdminPriceCols d20={fd20} d40={fd40} editable
                        onCost20={v=>applyCarrierRate(row.pol,k,t20,v,"future")}
                        onCost40={v=>applyCarrierRate(row.pol,k,t40,v,"future")}/>
                    </div>
                  ); })}
              </div>
            ) : (
            <table className="carrier-validity-table" style={{marginTop:12,fontSize:12}}>
              <colgroup>
                <col className="cvt-col-carrier"/>
                <col className="cvt-col-validity"/>
                <col className="cvt-col-price"/>
                <col className="cvt-col-price"/>
              </colgroup>
              <thead><tr style={{color:"#9ca3af",borderBottom:"1px solid #f3f4f6"}}>
                <th className="cvt-carrier" style={{textAlign:"left",padding:"4px 0",fontWeight:500}}>Carrier</th>
                <th className="cvt-validity" style={{padding:"4px 0",fontWeight:500}}>Validity</th>
                <th className="cvt-price" style={{padding:"4px 0",fontWeight:500}}>20'</th>
                <th className="cvt-price" style={{padding:"4px 0",fontWeight:500}}>40'</th>
              </tr></thead>
              <tbody>
                {CRS.map(k=>{ const v20=getCarrierRate(row,k,t20),v40=getCarrierRate(row,k,t40); if(v20==null&&v40==null)return null; const b20=bNet(row,t20),b40=bNet(row,t40);
                  const priceColor = ratePeriod==="future"?"#b45309":"#1d4ed8";
                  const s20=v20!=null?getGuestCarrierSell(row.pol,k,t20,ratePeriod,v20,row.area):null;
                  const s40=v40!=null?getGuestCarrierSell(row.pol,k,t40,ratePeriod,v40,row.area):null;
                  const best20=b20.val!=null?getGuestCarrierSell(row.pol,b20.cr,t20,ratePeriod,b20.val,row.area):null;
                  const best40=b40.val!=null?getGuestCarrierSell(row.pol,b40.cr,t40,ratePeriod,b40.val,row.area):null;
                  return <tr key={k} style={{borderBottom:"1px solid #f9fafb"}}>
                    <td className="cvt-carrier" style={{padding:"8px 0"}}>
                      <Bg k={k}/>
                      {(s20!=null||s40!=null) && quoteBtnEl({pol:row.pol,pod:"VVO",carrier:k,rateType:`${t20}/${t40}`,currentRate:`20' ${s20!=null?`$${n(s20)}`:"—"} / 40' ${s40!=null?`$${n(s40)}`:"—"}`})}
                    </td>
                    <td className="cvt-validity" style={{padding:"8px 0"}}><ValidityCell carrierKey={k}/></td>
                    <td className="cvt-price" style={{padding:"8px 0",fontWeight:s20===best20?700:400,color:s20!=null?(s20===best20?priceColor:"#6b7280"):"#d1d5db",cursor:s20?"pointer":"default"}} onClick={()=>s20&&setQuoteReq({pol:row.pol,pod:"VVO",carrier:k,rateType:t20,currentRate:`20' $${n(s20)}`})}>{s20!=null?`$${n(s20)}`:"—"}</td>
                    <td className="cvt-price" style={{padding:"8px 0",fontWeight:s40===best40?700:400,color:s40!=null?(s40===best40?priceColor:"#6b7280"):"#d1d5db",cursor:s40?"pointer":"default"}} onClick={()=>s40&&setQuoteReq({pol:row.pol,pod:"VVO",carrier:k,rateType:t40,currentRate:`40' $${n(s40)}`})}>{s40!=null?`$${n(s40)}`:"—"}</td>
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
        <button onClick={()=>{setExp(open?null:`d${idx}`);setDoCityOpen(null);}} className={isAdmin?"admin-card-btn":"route-card-btn"} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:isAdmin?"10px 12px":"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",gap:8}}>
          <div className={isAdmin?"admin-card-top":"route-card-head"}>
            <RouteCardLabel area={row.area} pol={row.pol}/>
            <span style={{fontSize:10,fontWeight:700,color:"#fff",background:"#2563eb",padding:"2px 8px",borderRadius:4,flexShrink:0}}>MOW</span>
            {!isAdmin && d20.sell!=null && <GuestPricePair d20={d20} d40={d40}/>}
            <span className="route-card-chevron" style={{transform:open?"rotate(180deg)":"none"}}>&#8964;</span>
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
            <div style={{padding:"12px 16px 4px",fontSize:11,fontWeight:700,color:"#6b7280"}}>Ocean + Drop off · Select City</div>
            {DOC.map(({k,l})=>{
              const cd20=doDetail(row,k,0),cd40=doDetail(row,k,1);
              const cityKey=`${idx}-${k}`,cOpen=doCityOpen===cityKey;
              const carrierRows = CRS.map(cr=>{
                const pd20=dropCarrierDetail(row,k,cr,0,ratePeriod);
                const pd40=dropCarrierDetail(row,k,cr,1,ratePeriod);
                const cdC20=dropCarrierDetail(row,k,cr,0,"current");
                const cdC40=dropCarrierDetail(row,k,cr,1,"current");
                const fdC20=dropCarrierDetail(row,k,cr,0,"future");
                const fdC40=dropCarrierDetail(row,k,cr,1,"future");
                return {cr,pd20,pd40,cdC20,cdC40,fdC20,fdC40};
              }).filter(x=>x.pd20.cost!=null||x.pd40.cost!=null||x.cdC20.cost!=null||x.cdC40.cost!=null||x.fdC20.cost!=null||x.fdC40.cost!=null);
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
                      {isAdmin ? (
                        carrierRows.length===0
                          ? <div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No service</div>
                          : carrierRows.map(({cr,cdC20,cdC40,fdC20,fdC40})=>(
                          <div key={cr} style={{padding:"10px 12px 10px 20px",borderBottom:"1px solid #e0f2fe"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                              <Bg k={cr}/><span style={{fontSize:11,color:"#6b7280",fontWeight:600}}>{CN[cr]}</span>
                              <ValidityCell carrierKey={cr} compact/>
                            </div>
                            <div style={{fontSize:9,fontWeight:700,color:"#166534",marginBottom:4}}>Current Rates</div>
                            <AdminPriceCols d20={cdC20} d40={cdC40} editable
                              onCost20={v=>applyCarrierRate(row.pol,cr,"coc20",v,"current")}
                              onCost40={v=>applyCarrierRate(row.pol,cr,"coc40",v,"current")}/>
                            <div style={{fontSize:9,fontWeight:700,color:"#b45309",margin:"8px 0 4px"}}>Upcoming Rates</div>
                            <AdminPriceCols d20={fdC20} d40={fdC40} editable
                              onCost20={v=>applyCarrierRate(row.pol,cr,"coc20",v,"future")}
                              onCost40={v=>applyCarrierRate(row.pol,cr,"coc40",v,"future")}/>
                          </div>
                          ))
                      ) : carrierRows.length===0 ? (
                        <div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No service</div>
                      ) : (
                        <div className="carrier-table-shell">
                          <table className="carrier-validity-table" style={{fontSize:12}}>
                            <colgroup>
                              <col className="cvt-col-carrier"/>
                              <col className="cvt-col-validity"/>
                              <col className="cvt-col-price"/>
                              <col className="cvt-col-price"/>
                            </colgroup>
                            <thead><tr style={{color:"#9ca3af",borderBottom:"1px solid #e0f2fe"}}>
                              <th className="cvt-carrier" style={{textAlign:"left",padding:"6px 0",fontWeight:500}}>Carrier</th>
                              <th className="cvt-validity" style={{padding:"6px 0",fontWeight:500}}>Validity</th>
                              <th className="cvt-price" style={{padding:"6px 0",fontWeight:500}}>20'</th>
                              <th className="cvt-price" style={{padding:"6px 0",fontWeight:500}}>40'</th>
                            </tr></thead>
                            <tbody>
                              {carrierRows.map(({cr,pd20,pd40})=>(
                                <tr key={cr} style={{borderBottom:"1px solid #e0f2fe"}}>
                                  <td className="cvt-carrier" style={{padding:"8px 0"}}>
                                    <Bg k={cr}/>
                                    {(pd20.sell||pd40.sell) && quoteBtnEl({pol:row.pol,pod:l,dropCity:l,carrier:cr,rateType:"coc20/coc40 (Ocean+Drop)",currentRate:`20' ${pd20.sell?`$${n(pd20.sell)}`:"—"} / 40' ${pd40.sell?`$${n(pd40.sell)}`:"—"}`})}
                                  </td>
                                  <td className="cvt-validity" style={{padding:"8px 0"}}><ValidityCell carrierKey={cr}/></td>
                                  <td className="cvt-price" style={{padding:"8px 0",cursor:pd20.sell?"pointer":"default",color:pd20.sell?(ratePeriod==="future"?"#b45309":"#0369a1"):"#d1d5db",textDecoration:pd20.sell?"underline":"none"}} onClick={()=>pd20.sell&&setQuoteReq({pol:row.pol,pod:l,dropCity:l,carrier:cr,rateType:"coc20 (Ocean+Drop)",currentRate:`20' $${n(pd20.sell)}`})}>
                                    {pd20.sell?`$${n(pd20.sell)}`:"—"}
                                  </td>
                                  <td className="cvt-price" style={{padding:"8px 0",cursor:pd40.sell?"pointer":"default",color:pd40.sell?(ratePeriod==="future"?"#b45309":"#0369a1"):"#d1d5db",textDecoration:pd40.sell?"underline":"none"}} onClick={()=>pd40.sell&&setQuoteReq({pol:row.pol,pod:l,dropCity:l,carrier:cr,rateType:"coc40 (Ocean+Drop)",currentRate:`40' $${n(pd40.sell)}`})}>
                                    {pd40.sell?`$${n(pd40.sell)}`:"—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
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
    const d20=rentDetail(row.pol,mow,row,0);
    const d40dv=rentDetail(row.pol,mow,row,1);
    const d40hc=rentDetail(row.pol,mow,row,2);
    return (
      <div style={{border:"1px solid #e5e7eb",borderRadius:10,marginBottom:8,background:"#fff",overflow:"hidden"}}>
        <button onClick={()=>{setExp(open?null:`r${idx}`);setCityOpen(null);}} className={isAdmin?"admin-card-btn":"route-card-btn"} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:isAdmin?"10px 12px":"12px 12px 12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left",gap:8}}>
          <div className={isAdmin?"admin-card-top":"route-card-head"}>
            <RouteCardLabel area={row.area} pol={row.displayPol || row.pol}/>
            {!isAdmin && <GuestRentTriple d20={d20} d40dv={d40dv} d40hc={d40hc}/>}
            <span className="route-card-chevron" style={{transform:open?"rotate(180deg)":"none",width:12,textAlign:"center"}}>&#8964;</span>
          </div>
          {isAdmin && (
            <div className="admin-card-prices">
              <AdminRentTriple d20={d20} d40dv={d40dv} d40hc={d40hc} prefix="MOW" editable
                onCost20={v=>applyRentCityCost(freightPol,"Moscow",0,v)}
                onCost40dv={v=>applyRentCityCost(freightPol,"Moscow",1,v)}
                onCost40hc={v=>applyRentCityCost(freightPol,"Moscow",2,v)}/>
            </div>
          )}
        </button>
        {open && (
          <div style={{borderTop:"1px solid #f3f4f6",paddingBottom:8}}>
            {isAdmin && <PolAdjustBar pol={freightPol} area={row.area} types={["soc20","soc40"]} costHint="Moscow 합계 매입가 (SOC+렌탈)" tripleRent
              onCost20={v=>applyRentCityCost(freightPol,"Moscow",0,v)}
              onCost40dv={v=>applyRentCityCost(freightPol,"Moscow",1,v)}
              onCost40hc={v=>applyRentCityCost(freightPol,"Moscow",2,v)}
              onClearCost={()=>clearPolCost(freightPol,"rent",null,"Moscow")}/>}
            <div style={{padding:"12px 16px 4px",fontSize:11,fontWeight:700,color:"#6b7280"}}>Ocean + Rental · Return City (Drop off order)</div>
            {RENT_CITY_ORDER.map(city=>{
              const cd20=rentDetail(row.pol,city,row,0);
              const cd40dv=rentDetail(row.pol,city,row,1);
              const cd40hc=rentDetail(row.pol,city,row,2);
              const key=`${idx}-${city}`,cOpen=cityOpen===key;
              const carriers=cOpen?cRent(row.pol,city,row):[];
              const cityLabel=RC_LABEL[city]||city;
              const fp=PM[row.pol],fr=fp?fMap[fp]:null;
              const cityRentalSells=[getRentalSell(row.pol,city,0),getRentalSell(row.pol,city,1),getRentalSell(row.pol,city,2)];
              return (
                <div key={city}>
                  <button onClick={()=>setCityOpen(cOpen?null:key)} className={isAdmin?"admin-card-btn":""} style={{width:"100%",display:"flex",alignItems:"center",padding:"7px 12px",background:cOpen?"#faf5ff":"none",border:"none",borderBottom:"1px solid #f9fafb",cursor:"pointer",textAlign:"left",gap:6}}>
                    <div className={isAdmin?"admin-card-top":"rent-city-row"} style={isAdmin?undefined:{display:"flex",alignItems:"center",width:"100%",gap:8}}>
                      <span style={{flex:1,fontSize:12,fontWeight:600,color:"#374151",minWidth:0}}>{cityLabel}</span>
                      {!isAdmin && <GuestRentTriple d20={cd20} d40dv={cd40dv} d40hc={cd40hc} rentalSells={cityRentalSells}/>}
                      <span style={{fontSize:12,color:"#9ca3af",transform:cOpen?"rotate(180deg)":"none",display:"inline-block",flexShrink:0,width:12,textAlign:"center"}}>&#8964;</span>
                    </div>
                    {isAdmin && (
                      <div className="admin-card-prices">
                        <AdminRentTriple d20={cd20} d40dv={cd40dv} d40hc={cd40hc} editable
                          onCost20={v=>applyRentCityCost(freightPol,city,0,v)}
                          onCost40dv={v=>applyRentCityCost(freightPol,city,1,v)}
                          onCost40hc={v=>applyRentCityCost(freightPol,city,2,v)}/>
                      </div>
                    )}
                  </button>
                  {cOpen && (
                    <div style={{background:"#faf5ff",borderBottom:"1px solid #ede9fe"}}>
                      {isAdmin ? (
                        carriers.length===0
                          ? <div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No SOC data</div>
                          : carriers.map(c=>{
                          const cdC20=mkPrice(c.cost20,c.m20,c.k);
                          const cdC40dv=mkPrice(c.cost40dv,c.m40dv,c.k);
                          const cdC40hc=mkPrice(c.cost40hc,c.m40hc,c.k);
                          const socC20=mkAdminPrice(c.soc20, c.soc20 != null ? getCarrierAdminSell(fp,c.k,"soc20",ratePeriod,c.soc20) : null, c.k);
                          const socC40=mkAdminPrice(c.soc40, c.soc40 != null ? getCarrierAdminSell(fp,c.k,"soc40",ratePeriod,c.soc40) : null, c.k);
                          const rentC20=mkPrice(c.rent20,getRentalM(fp,fr.area,"r20"),c.k);
                          const rentC40dv=mkPrice(c.rent40dv,getRentalM(fp,fr.area,"r40dv"),c.k);
                          const rentC40hc=mkPrice(c.rent40hc,getRentalM(fp,fr.area,"r40hc"),c.k);
                          return (
                          <div key={c.k} style={{padding:"8px 12px 8px 20px",borderBottom:"1px solid #ede9fe"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                              <Bg k={c.k}/>
                              <span style={{fontSize:11,color:"#6b7280",fontWeight:600}}>{CN[c.k]}</span>
                              <ValidityCell carrierKey={c.k} compact/>
                            </div>
                            <div style={{fontSize:9,fontWeight:700,color:"#1e40af",marginBottom:4}}>SOC 해상 매입</div>
                            <AdminRentTriple d20={socC20} d40dv={socC40} d40hc={socC40} editable
                              onCost20={v=>fp&&applyCarrierRate(fp,c.k,"soc20",v)}
                              onCost40dv={v=>fp&&applyCarrierRate(fp,c.k,"soc40",v)}
                              onCost40hc={v=>fp&&applyCarrierRate(fp,c.k,"soc40",v)}/>
                            <div style={{fontSize:9,fontWeight:700,color:"#7c3aed",margin:"8px 0 4px"}}>렌탈 매입</div>
                            <AdminRentTriple d20={rentC20} d40dv={rentC40dv} d40hc={rentC40hc} editable
                              onCost20={v=>applyRentalRate(row.pol,city,0,v)}
                              onCost40dv={v=>applyRentalRate(row.pol,city,1,v)}
                              onCost40hc={v=>applyRentalRate(row.pol,city,2,v)}/>
                            <div style={{fontSize:9,color:"#6b7280",marginTop:6}}>합계 매출 (SOC+렌탈+마진)</div>
                            <AdminRentTriple d20={cdC20} d40dv={cdC40dv} d40hc={cdC40hc} editable={false}/>
                          </div>
                          );})
                      ) : carriers.length===0 ? (
                        <div style={{padding:"8px 24px",fontSize:11,color:"#9ca3af",fontStyle:"italic"}}>No SOC data</div>
                      ) : (
                        <div className="carrier-table-shell">
                          <table className="carrier-validity-table carrier-rent-table carrier-rent-table--triple" style={{fontSize:12}}>
                            <colgroup>
                              <col className="cvt-col-carrier"/>
                              <col className="cvt-col-validity"/>
                              <col className="cvt-col-price"/>
                              <col className="cvt-col-price"/>
                              <col className="cvt-col-price"/>
                            </colgroup>
                            <thead><tr style={{color:"#9ca3af",borderBottom:"1px solid #ede9fe"}}>
                              <th className="cvt-carrier" style={{textAlign:"left",padding:"6px 0",fontWeight:500}} aria-hidden="true"></th>
                              <th className="cvt-validity" style={{padding:"6px 0",fontWeight:500}}>Validity</th>
                              {RENT_COMBO_SHORT.map(label => (
                                <th key={label} className="cvt-price" style={{padding:"6px 0",fontWeight:500}}>{label}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {carriers.map(c=>{
                                const rentPriceColor = ratePeriod==="future"?"#b45309":"#7c3aed";
                                const combos = [
                                  { total: c.t20, soc: "soc20", rental: getRentalBase(row.pol,city,0) ?? row.r20[city], comboIdx: 0 },
                                  { total: c.t40dv, soc: "soc40", rental: getRentalBase(row.pol,city,1) ?? row.r40dv?.[city] ?? row.r40[city], comboIdx: 1 },
                                  { total: c.t40hc, soc: "soc40", rental: getRentalBase(row.pol,city,2) ?? row.r40hc?.[city] ?? row.r40[city], comboIdx: 2 },
                                ];
                                return (
                                <tr key={c.k} style={{borderBottom:"1px solid #ede9fe"}}>
                                  <td className="cvt-carrier">
                                    <div className="cvt-carrier-stack">
                                      <Bg k={c.k}/>
                                      {(c.t20||c.t40dv||c.t40hc) && quoteBtnEl({pol:row.pol,pod:city,dropCity:city,carrier:c.k,rateType:"SOC+Rental",currentRate:`20' ${c.t20?`$${n(c.t20)}`:"—"} / 40'DV ${c.t40dv?`$${n(c.t40dv)}`:"—"} / 40'HC ${c.t40hc?`$${n(c.t40hc)}`:"—"}`})}
                                    </div>
                                  </td>
                                  <td className="cvt-validity"><ValidityCell carrierKey={c.k}/></td>
                                  {combos.map(({ total, soc, rental, comboIdx }) => (
                                    <td key={comboIdx} className="cvt-price" style={{padding:"8px 0",cursor:total?"pointer":"default",color:total?rentPriceColor:"#d1d5db",textDecoration:total?"underline":"none"}} onClick={()=>total&&setQuoteReq({pol:row.pol,pod:city,dropCity:city,carrier:c.k,rateType:`SOC+Rental (${RENT_COMBO_SHORT[comboIdx]})`,currentRate:`${RENT_COMBO_SHORT[comboIdx]} $${n(total)}`})}>
                                      <div className="cvt-price-main">{total?`$${n(total)}`:"—"}</div>
                                    </td>
                                  ))}
                                </tr>
                              );})}
                            </tbody>
                          </table>
                        </div>
                      )}
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
    <div className={adVisible ? "app-root app-has-fixed-ad" : "app-root"} style={{minHeight:"100vh",background:"#f8fafc",fontFamily:ff}}>
      {adminSaveToastEl}

      <div className="portal-sticky-top">
      {/* HEADER */}
      <div>
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
                <button onClick={() => openFreightAdmin("grid")} style={{fontSize:11,fontWeight:700,padding:"6px 10px",borderRadius:20,background:"#1e40af",color:"#fff",border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>운임관리</button>
                <button onClick={()=>{setShowRentalAdmin(true);setRentalAdminTab("grid");}} style={{fontSize:11,fontWeight:700,padding:"6px 10px",borderRadius:20,background:"#7c3aed",color:"#fff",border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>렌탈운임</button>
                <button onClick={()=>setShowNoticeAdmin(true)} style={{fontSize:11,fontWeight:600,padding:"6px 10px",borderRadius:20,background:"#faf5ff",color:"#7c3aed",border:"1px solid #e9d5ff",cursor:"pointer",whiteSpace:"nowrap"}}>Notice</button>
                <button onClick={()=>setShowAdAdmin(true)} style={{fontSize:11,fontWeight:600,padding:"6px 10px",borderRadius:20,background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa",cursor:"pointer",whiteSpace:"nowrap"}}>광고</button>
                <button onClick={()=>{setShowMgr(true);loadClients();}} style={{fontSize:11,fontWeight:600,padding:"6px 10px",borderRadius:20,background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",cursor:"pointer",whiteSpace:"nowrap"}}>Clients</button>
                <button onClick={()=>setShowQuoteAdmin(true)} style={{fontSize:11,fontWeight:600,padding:"6px 10px",borderRadius:20,background:"#f0fdfa",color:"#0f766e",border:"1px solid #99f6e4",cursor:"pointer",whiteSpace:"nowrap"}}>견적요청</button>
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

      {!isAdmin && (
      <>
      {/* SEARCH + FILTERS */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"0 16px 8px"}}>
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
                <span style={{height:36,display:"flex",alignItems:"center"}}><Icon active={active}/></span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="carrier-port-guide-shell">
        <CarrierPortGuide/>
      </div>

      {tab==="ocean" && (
        <div style={{maxWidth:640,margin:"0 auto",padding:"10px 16px 12px"}}>
          <RatePeriodToggle showCocSoc={true}/>
        </div>
      )}
      {tab==="dropoff" && (
        <div style={{maxWidth:640,margin:"0 auto",padding:"10px 16px 12px"}}>
          <RatePeriodToggle/>
        </div>
      )}
      {tab==="rental" && (
        <div style={{maxWidth:640,margin:"0 auto",padding:"10px 16px 12px"}}>
          <RatePeriodToggle/>
        </div>
      )}
      </>
      )}
      </div>

      {/* ADMIN MARGIN PANEL */}
      {isAdmin && (
        <div style={{maxWidth:640,margin:"12px auto 0",padding:"0 16px"}}>
          {!settingsLoaded ? (
            <RatesLoading />
          ) : (
          <>
          <button type="button" onClick={() => openFreightAdmin("grid")}
            style={{width:"100%",padding:"12px 14px",marginBottom:8,fontSize:13,fontWeight:700,color:"#fff",background:"#1e40af",border:"none",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            운임 관리 (현재 · 변경 이력 · Excel)
          </button>
          <button type="button" onClick={()=>{setShowRentalAdmin(true);setRentalAdminTab("grid");}}
            style={{width:"100%",padding:"12px 14px",marginBottom:8,fontSize:13,fontWeight:700,color:"#fff",background:"#7c3aed",border:"none",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            컨테이너 Rental 운임 (현재 · 변경 이력)
          </button>
          <button type="button" onClick={()=>setShowAdAdmin(true)}
            style={{width:"100%",padding:"12px 14px",marginBottom:8,fontSize:13,fontWeight:700,color:"#fff",background:"#ea580c",border:"none",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            하단 광고 배너 관리 (최대 3개)
          </button>
          </>
          )}
        </div>
      )}

      {!isAdmin && (
      <>
      {/* CONTENT */}
      <div style={{maxWidth:640,margin:"12px auto",padding:"0 16px 24px"}}>
        {!settingsLoaded ? (
          <RatesLoading />
        ) : (
          <>
            <div style={{fontSize:10,color:"#9ca3af",marginBottom:8}}>{`${tab==="rental"?rFilt.length:filt.length} routes`}</div>
            {/* 함수 호출 렌더링 — 컴포넌트로 쓰면 매 렌더마다 타입이 바뀌어 전체 리마운트(스크롤 점프) 발생 */}
            {tab==="ocean" && filt.map((row,i)=><Fragment key={i}>{OCard({row,idx:i})}</Fragment>)}
            {tab==="dropoff" && filt.map((row,i)=><Fragment key={i}>{DOCrd({row,idx:i})}</Fragment>)}
            {tab==="rental" && rFilt.map((row,i)=><Fragment key={i}>{RCrd({row,idx:i})}</Fragment>)}
          </>
        )}
      </div>
      </>
      )}

      <FooterAdSlot ads={adBanners} dismissed={adDismissed} onDismiss={dismissAd} />

      <div style={{maxWidth:640,margin:"0 auto",padding:"8px 16px 24px",textAlign:"center"}}>
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
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#6b7280",cursor:"pointer",marginBottom:10,userSelect:"none"}}>
                <input
                  type="checkbox"
                  checked={noticeHideToday}
                  onChange={e => setNoticeHideToday(e.target.checked)}
                  style={{width:16,height:16,cursor:"pointer"}}
                />
                Don&apos;t show again today
              </label>
              <button onClick={dismissCurrentNotice}
                style={{width:"100%",padding:"11px",fontSize:13,fontWeight:600,color:"#fff",background:"#1D2B4F",border:"none",borderRadius:10,cursor:"pointer"}}>
                {(() => {
                  const idx = activeNoticeQueue.findIndex(n => n.i === currentNoticePopup.i);
                  return idx >= 0 && idx < activeNoticeQueue.length - 1 ? "Next" : "OK";
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUOTE REQUEST MODAL */}
      {quoteReq && <QuoteRequestModal info={quoteReq} onClose={() => setQuoteReq(null)} />}

    </div>
  );
}

