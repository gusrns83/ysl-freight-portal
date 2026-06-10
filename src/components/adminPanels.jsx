import { useState } from "react";
import { RATE_TYPES } from "../data/staticData.js";
import { marginInpStyle, marginInpVal } from "../lib/pricing.js";

function MarginPanel({
  filterHint,
  marginTab, setMarginTab,
  margins, applyGlobalMargin,
  selArea, setSelArea, areaM, applyAreaMarginType, applyAreaMargins,
  selPol, setSelPol, polM, applyPolMargins, clearPolMargins, polEdit, setPolEdit,
  areas, fData, getM,
  rateTypes = RATE_TYPES,
  rateLabel = (t) => t.toUpperCase(),
  gridCols = "1fr 1fr 1fr 1fr",
  polData,
  globalHint = "전체 마진 변경 시 운임표·매출에 즉시 반영 (셀별 마진은 해당 항목만 해제)",
  formatAreaSummary,
}) {
  const polList = polData || fData;
  const emptyPolEdit = () => Object.fromEntries(rateTypes.map(t => [t, ""]));
  const areaSummary = (area, m) => formatAreaSummary
    ? formatAreaSummary(m, margins)
    : <>COC {m.coc20 ?? margins.coc20}/{m.coc40 ?? margins.coc40} SOC {m.soc20 ?? margins.soc20}/{m.soc40 ?? margins.soc40}</>;
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
          <div style={{fontSize:10,color:"#b45309",marginBottom:6}}>{globalHint}</div>
          <div style={{display:"grid",gridTemplateColumns:gridCols,gap:8}}>
            {rateTypes.map(t=>(
              <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{rateLabel(t)}</div>
                <input type="number" value={marginInpVal(margins[t])} onChange={e=>applyGlobalMargin(t, e.target.value)}
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
            <div style={{display:"grid",gridTemplateColumns:gridCols,gap:8,marginBottom:8}}>
              {rateTypes.map(t=>(
                <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{rateLabel(t)}</div>
                  <input type="number"
                    value={marginInpVal(
                      areaM[selArea] && Object.prototype.hasOwnProperty.call(areaM[selArea], t)
                        ? areaM[selArea][t]
                        : margins[t]
                    )}
                    onChange={e=>applyAreaMarginType(selArea, t, e.target.value)}
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
                  <b>{area}</b>: {areaSummary(area, m)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {marginTab==="pol" && (
        <div>
          <div style={{fontSize:10,color:"#b45309",marginBottom:6}}>도시별 마진 (마지막 수정 기준 · 선택 시 해당 POL만 표시)</div>
          <select value={selPol} onChange={e=>{setSelPol(e.target.value); const m=polM[e.target.value]; setPolEdit(m||emptyPolEdit());}}
            style={{width:"100%",padding:"8px",fontSize:13,border:"1px solid #fcd34d",borderRadius:6,marginBottom:8,background:"#fff"}}>
            <option value="">-- 전체 POL --</option>
            {polList.map(d=><option key={d.pol} value={d.pol}>{d.area} · {d.pol} {polM[d.pol]?"✅":""}</option>)}
          </select>
          {selPol && <>
            <div style={{display:"grid",gridTemplateColumns:gridCols,gap:8,marginBottom:8}}>
              {rateTypes.map(t=>(
                <div key={t}><div style={{fontSize:10,color:"#b45309",marginBottom:2}}>{rateLabel(t)}</div>
                  <input type="number" placeholder={String(getM(selPol,polList.find(d=>d.pol===selPol)?.area||"",t))} value={polEdit[t] ?? ""} onChange={e=>setPolEdit(p=>({...p,[t]:e.target.value}))}
                    style={marginInpStyle}/></div>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button type="button" onClick={()=>{
                const area=polList.find(d=>d.pol===selPol)?.area||"";
                const m={};
                rateTypes.forEach(t=>{
                  const raw=polEdit[t];
                  if(raw===""||raw==null) return;
                  const v=parseInt(raw,10);
                  if(Number.isFinite(v)) m[t]=v;
                });
                applyPolMargins(selPol, m);
              }}
                style={{flex:1,padding:"7px",fontSize:11,fontWeight:700,color:"#fff",background:"#d97706",border:"none",borderRadius:6,cursor:"pointer"}}>적용</button>
              <button type="button" onClick={()=>{clearPolMargins(selPol); setPolEdit(emptyPolEdit());}}
                style={{flex:1,padding:"7px",fontSize:11,color:"#dc2626",background:"#fee2e2",border:"none",borderRadius:6,cursor:"pointer"}}>초기화</button>
            </div>
          </>}
        </div>
      )}
    </div>
  );
}

function GriAdjustPanel({
  rateTypes = RATE_TYPES,
  rateLabel = (t) => t.toUpperCase(),
  gridCols = "1fr 1fr 1fr 1fr",
  filterHint,
  periodLabel,
  areas = [],
  scopeTab = "all",
  setScopeTab,
  selAreas = [],
  toggleArea,
  clearAreas,
  onApplyBuying,
  onApplySelling,
  canUndoBuying = false,
  canUndoSelling = false,
  onUndoBuying,
  onUndoSelling,
}) {
  const empty = () => Object.fromEntries(rateTypes.map(t => [t, ""]));
  const [buyGri, setBuyGri] = useState(empty);
  const [sellGri, setSellGri] = useState(empty);
  const areaModeBlocked = scopeTab === "area" && selAreas.length === 0;

  const parseDeltas = (vals) => {
    const deltas = {};
    rateTypes.forEach(t => {
      const raw = String(vals[t] ?? "").trim();
      if (raw === "") return;
      const v = parseInt(raw, 10);
      if (Number.isFinite(v) && v !== 0) deltas[t] = v;
    });
    return deltas;
  };

  const tryApplyBuying = () => {
    if (areaModeBlocked) return;
    const deltas = parseDeltas(buyGri);
    if (Object.keys(deltas).length) onApplyBuying(deltas);
    setBuyGri(empty());
  };

  const tryApplySelling = () => {
    if (areaModeBlocked) return;
    const deltas = parseDeltas(sellGri);
    if (Object.keys(deltas).length) onApplySelling(deltas);
    setSellGri(empty());
  };

  const buyInpStyle = { ...marginInpStyle, color: "#3d6a9e", borderColor: "#93c5fd" };
  const sellInpStyle = { ...marginInpStyle, color: "#6b5038", borderColor: "#d6b88a" };
  const undoBtnStyle = (enabled) => ({
    padding: "7px 10px",
    fontSize: 10,
    fontWeight: 600,
    color: enabled ? "#6b7280" : "#d1d5db",
    background: enabled ? "#f3f4f6" : "#fafafa",
    border: `1px solid ${enabled ? "#e5e7eb" : "#f3f4f6"}`,
    borderRadius: 6,
    cursor: enabled ? "pointer" : "not-allowed",
    whiteSpace: "nowrap",
  });

  const applyBtnStyle = (enabled, bg) => ({
    flex: 1,
    padding: "7px",
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    background: enabled ? bg : "#d1d5db",
    border: "none",
    borderRadius: 6,
    cursor: enabled ? "pointer" : "not-allowed",
  });

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>GRI 일괄 조정 (USD)</div>
        {periodLabel && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
            background: periodLabel.includes("향후") ? "#fef3c7" : "#f3f4f6",
            color: periodLabel.includes("향후") ? "#b45309" : "#374151",
            border: `1px solid ${periodLabel.includes("향후") ? "#fcd34d" : "#e5e7eb"}`,
            whiteSpace: "nowrap",
          }}>
            {periodLabel}만 적용
          </span>
        )}
      </div>
      <div style={{ display: "flex", background: "#eff6ff", borderRadius: 8, padding: 2, marginBottom: 8 }}>
        {[["all", "전체"], ["area", "지역별"]].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setScopeTab(k)}
            style={{
              flex: 1, padding: "6px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer",
              background: scopeTab === k ? "#fff" : "transparent",
              color: scopeTab === k ? "#1d4ed8" : "#60a5fa",
              boxShadow: scopeTab === k ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {scopeTab === "area" && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: "#6b7280" }}>적용 지역 선택 (중복 선택 가능)</div>
            {selAreas.length > 0 && (
              <button type="button" onClick={clearAreas}
                style={{ fontSize: 9, color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                선택 해제
              </button>
            )}
          </div>
          <div className="gri-area-chips">
            {areas.map(area => {
              const on = selAreas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  className={`gri-area-chip${on ? " gri-area-chip--on" : ""}`}
                  onClick={() => toggleArea(area)}
                >
                  {area}
                </button>
              );
            })}
          </div>
          {areaModeBlocked && (
            <div style={{ fontSize: 9, color: "#dc2626", marginTop: 6 }}>지역을 하나 이상 선택하세요</div>
          )}
        </div>
      )}
      {filterHint && <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 8 }}>{filterHint}</div>}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#3d6a9e", marginBottom: 6 }}>매입 GRI</div>
        <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 6 }}>입력값만큼 매입가에 가산 (+/- 가능)</div>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, marginBottom: 8 }}>
          {rateTypes.map(t => (
            <div key={`buy-${t}`}>
              <div style={{ fontSize: 10, color: "#3d6a9e", marginBottom: 2 }}>{rateLabel(t)}</div>
              <input type="number" value={buyGri[t]} onChange={e => setBuyGri(p => ({ ...p, [t]: e.target.value }))}
                placeholder="0" style={buyInpStyle} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={tryApplyBuying} disabled={areaModeBlocked}
            style={applyBtnStyle(!areaModeBlocked, "#2563eb")}>
            매입 GRI 적용
          </button>
          <button type="button" disabled={!canUndoBuying} onClick={onUndoBuying} style={undoBtnStyle(canUndoBuying)}>
            되돌리기
          </button>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#6b5038", marginBottom: 6 }}>매출 GRI</div>
        <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 6 }}>
          {periodLabel ? `${periodLabel} 매출(마진)에만 가산 · 다른 기간·매입은 유지` : "입력값만큼 매출가(마진)에 가산 · 매입은 유지"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, marginBottom: 8 }}>
          {rateTypes.map(t => (
            <div key={`sell-${t}`}>
              <div style={{ fontSize: 10, color: "#6b5038", marginBottom: 2 }}>{rateLabel(t)}</div>
              <input type="number" value={sellGri[t]} onChange={e => setSellGri(p => ({ ...p, [t]: e.target.value }))}
                placeholder="0" style={sellInpStyle} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={tryApplySelling} disabled={areaModeBlocked}
            style={applyBtnStyle(!areaModeBlocked, "#b45309")}>
            매출 GRI 적용
          </button>
          <button type="button" disabled={!canUndoSelling} onClick={onUndoSelling} style={undoBtnStyle(canUndoSelling)}>
            되돌리기
          </button>
        </div>
      </div>
    </div>
  );
}


export { GriAdjustPanel, MarginPanel };
