import { API_TIMEOUT_MS, DEFAULT_MARGINS, RATE_HISTORY_UPLOAD_TIMEOUT_MS, RENT_COMBO_KEYS, normalizeRentalCityBucket, readStoredPricingCache, rentComboMarginType } from "../config.js";
import { CRS, DO, DOC_RC, PM, RATE_TYPES, RC, RENTAL_RATE_TYPES, VALIDITY_KEYS, buildDefaultRentalRates, defaultCarrierDropMargins, defaultCarrierDropRates, defaultCarrierRates, defaultRentalMargins, defaultValidityInfo, mergeCarrierDropMargins, mergeCarrierDropRates, mergeRentalRates, normalizeRentalMargins, normalizeValidityCarrier } from "../data/staticData.js";
import { RENTAL_DB_KEYS, api, mergePortalOverridesIntoPolCostO, withTimeout } from "./api.js";
import { applyRateHistoryDeletesToStores, buildRateHistoryRowsFromUpload, carrierUploadServesRate, enrichRateHistoryRowsWithCosts, rateHistoryScopeFromUpload } from "./excelParsers.js";


const marginInpStyle = {width:"100%",padding:"6px 8px",fontSize:13,fontWeight:700,color:"#92400e",background:"#fff",border:"1px solid #fcd34d",borderRadius:6,boxSizing:"border-box"};

const marginNowTs = () => Date.now();

const marginNum = (v) => {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const marginInpVal = (v) => (v === "" || v == null || v === undefined ? "" : v);

const settingBundleHas = (s, key) =>
  Object.prototype.hasOwnProperty.call(s, key) && s[key] != null && s[key] !== "";

const countPolCostOverrides = (polCostO) =>
  Object.values(polCostO || {}).filter(p => p?.carrier && Object.keys(p.carrier).length > 0).length;

/** pol_costs 병합 — overlay의 매입·매출(sell)을 base에 덮어씀 (캐시↔서버 동기화용) */
const mergePolCostODeep = (base, overlay) => {
  if (!overlay || !Object.keys(overlay).length) return base ? { ...base } : {};
  const out = { ...(base || {}) };
  Object.entries(overlay).forEach(([pol, polData]) => {
    if (!polData || typeof polData !== "object") return;
    const prevPol = out[pol] || {};
    const nextPol = { ...prevPol };
    if (polData.carrier) {
      nextPol.carrier = { ...(prevPol.carrier || {}) };
      Object.entries(polData.carrier).forEach(([cr, crData]) => {
        if (!crData || typeof crData !== "object") return;
        const prevCr = nextPol.carrier[cr] || {};
        const nextCr = { ...prevCr };
        ["current", "future"].forEach(period => {
          if (!crData[period]) return;
          const prevBucket = { ...(nextCr[period] || {}) };
          const oBucket = crData[period];
          RATE_TYPES.forEach(t => {
            if (oBucket[t] != null && oBucket[t] !== "") prevBucket[t] = oBucket[t];
          });
          if (oBucket.sell && typeof oBucket.sell === "object") {
            prevBucket.sell = { ...(prevBucket.sell || {}), ...oBucket.sell };
          }
          nextCr[period] = prevBucket;
        });
        RATE_TYPES.forEach(t => {
          if (crData[t] != null && crData[t] !== "") nextCr[t] = crData[t];
        });
        nextPol.carrier[cr] = nextCr;
      });
    }
    if (polData.rent) nextPol.rent = { ...(prevPol.rent || {}), ...polData.rent };
    if (polData.drop) nextPol.drop = { ...(prevPol.drop || {}), ...polData.drop };
    out[pol] = nextPol;
  });
  return out;
};

const polCostOHasSellOverrides = (polCostO) => {
  if (!polCostO) return false;
  return Object.values(polCostO).some(polData => {
    const carriers = polData?.carrier;
    if (!carriers) return false;
    return Object.values(carriers).some(crData =>
      ["current", "future"].some(period => {
        const sell = crData?.[period]?.sell;
        return sell && Object.keys(sell).length > 0;
      }),
    );
  });
};

const countPolMarginOverrides = (polM) =>
  Object.keys(polM || {}).filter(pol => polM[pol] && Object.keys(polM[pol]).length > 0).length;

const resolveCarrierCostFromStore = (costs, pol, cr, t, period, carrierRates, fData) => {
  const c = costs[pol]?.carrier?.[cr];
  if (c?.[period]?.[t] != null && c[period][t] !== "") return Number(c[period][t]);
  if (period === "current" && c?.[t] != null && c[t] !== "") return Number(c[t]);
  const g = carrierRates[cr]?.[period]?.[t];
  if (g != null && g !== "") return Number(g);
  const row = fData.find(d => d.pol === pol);
  const base = row?.rates[cr]?.[t];
  return base != null ? Number(base) : null;
};

/** pol_costs에 직접 저장된 매출가 (없으면 null) */
const resolveCarrierExplicitSell = (costs, pol, cr, t, period) => {
  const c = costs[pol]?.carrier?.[cr];
  const p = period === "future" ? "future" : "current";
  const sellVal = c?.[p]?.sell?.[t];
  if (sellVal != null && sellVal !== "") return Number(sellVal);
  return null;
};

const getPolStoredMargin = (pol, type, period, polM, polMFuture) => {
  const store = period === "future" ? polMFuture : polM;
  const val = store?.[pol]?.[type];
  if (val == null || val === "") return null;
  return marginNum(val);
};

/** 매출가: 저장된 sell → cost+POL마진 → (게스트만) cost+fullMargin → null(Admin) / cost(게스트 fallback) */
const resolveCarrierEffectiveSell = (
  costs, pol, cr, t, period, cost,
  { polM, polMFuture, fullMargin = null, adminMode = false } = {},
) => {
  if (cost == null) return null;
  const explicit = resolveCarrierExplicitSell(costs, pol, cr, t, period);
  if (explicit != null) return explicit;
  const polMargin = getPolStoredMargin(pol, t, period, polM, polMFuture);
  if (polMargin != null) return cost + polMargin;
  if (fullMargin != null) return cost + fullMargin;
  return adminMode ? null : cost;
};

const DROP_CITY_LABELS = { ...DOC_RC };
const RATE_HISTORY_CHUNK = 80;

const rateHistoryEntryKey = (row) =>
  `${row.carrier}|${row.pol}|${row.rate_type}|${row.period}|${row.category}|${row.route || ""}`;

/** 동일 운임값(매입·매출·마진) 중복 판별용 */
const rateHistoryDuplicateValueKey = (row) =>
  `${row.carrier}|${row.pol}|${row.rate_type}|${row.period}|${row.category}|${row.cost}|${row.sell ?? ""}|${row.margin ?? ""}`;

const RH_SOURCE_KEEP_RANK = {
  excel_upload: 100,
  history_backfill: 75,
  admin_save: 80,
  rental_save: 80,
  admin: 70,
  import: 60,
  gri: 50,
  import_undo: 20,
  auto_save: 10,
  excel_delete: 0,
};

/** 중복 그룹에서 유지 1건 제외, 삭제 후보 id 목록 */
const pickRateHistoryDuplicatesToRemove = (rows) => {
  const groups = new Map();
  rows.forEach(row => {
    const k = rateHistoryDuplicateValueKey(row);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  });
  const removeIds = [];
  const keepIds = [];
  const groupKeys = [];
  groups.forEach((members, k) => {
    if (members.length < 2) return;
    groupKeys.push(k);
    const sorted = [...members].sort((a, b) => {
      const ra = RH_SOURCE_KEEP_RANK[a.source] ?? 20;
      const rb = RH_SOURCE_KEEP_RANK[b.source] ?? 20;
      if (rb !== ra) return rb - ra;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    keepIds.push(sorted[0].id);
    sorted.slice(1).forEach(r => removeIds.push(r.id));
  });
  return {
    removeIds,
    keepIds,
    groupCount: groupKeys.length,
    removeCount: removeIds.length,
    highlightIds: [...removeIds, ...keepIds],
  };
};


const flattenRateSnapshot = ({
  fData, rData, polCostO, carrierRates, carrierDropRates, carrierDropMargins, rentalRates, polM, polMFuture,
}) => {
  const map = new Map();
  const put = (entry) => map.set(rateHistoryEntryKey(entry), entry);

  fData.forEach(row => {
    CRS.forEach(cr => {
      ["current", "future"].forEach(period => {
        RATE_TYPES.forEach(t => {
          const cost = resolveCarrierCostFromStore(polCostO, row.pol, cr, t, period, carrierRates, fData);
          if (cost == null) return;
          const sell = resolveCarrierEffectiveSell(polCostO, row.pol, cr, t, period, cost, {
            polM, polMFuture, adminMode: true,
          });
          put({
            carrier: cr, area: row.area, pol: row.pol, route: row.pol, rate_type: t, period,
            category: "ocean", cost, sell, margin: sell != null ? sell - cost : null,
          });
        });
      });
    });
  });

  Object.keys(DO).forEach(cityKey => {
    CRS.forEach(cr => {
      ["current", "future"].forEach(period => {
        [0, 1].forEach(si => {
          const sk = si === 0 ? "c20" : "c40";
          const stored = carrierDropRates[cr]?.[period]?.[cityKey]?.[sk];
          const base = DO[cityKey]?.[cr];
          const cost = stored != null && stored !== "" ? Number(stored) : (base ? base[si] : null);
          if (cost == null) return;
          const dropM = carrierDropMargins[cr]?.[cityKey]?.[sk];
          const margin = dropM != null && dropM !== "" ? Number(dropM) : 0;
          const label = DROP_CITY_LABELS[cityKey] || cityKey;
          put({
            carrier: cr, area: "DROP", pol: label, route: `Drop · ${label}`,
            rate_type: si === 0 ? "drop20" : "drop40", period, category: "dropoff",
            cost, sell: cost + margin, margin,
          });
        });
      });
    });
  });

  rData.forEach(row => {
    const freightPol = PM[row.pol] || row.pol;
    const fr = fData.find(d => d.pol === freightPol);
    RC.forEach(city => {
      ["current", "future"].forEach(period => {
        RENT_COMBO_KEYS.forEach((sk, ci) => {
          const rt = rentComboMarginType(ci);
          const bucket = normalizeRentalCityBucket(rentalRates[row.pol]?.[period]?.[city]);
          let cost = bucket?.[sk];
          if (cost == null || cost === "") {
            if (period === "future") {
              const cur = normalizeRentalCityBucket(rentalRates[row.pol]?.current?.[city]);
              cost = cur?.[sk];
            }
            if (cost == null || cost === "") {
              if (ci === 0) cost = row.r20[city];
              else if (ci === 1) cost = row.r40dv?.[city] ?? row.r40[city];
              else cost = row.r40hc?.[city] ?? row.r40[city];
            }
          }
          if (cost == null || cost === "") return;
          cost = Number(cost);
          put({
            carrier: "RENTAL", area: fr?.area || "OTHERS", pol: freightPol,
            route: `${freightPol} > ${city}`, rate_type: rt, period,
            category: "rental", cost, sell: null, margin: null,
          });
        });
      });
    });
  });

  return map;
};

const diffRateHistoryRows = (prevMap, nextMap, { source, note, batchId } = {}) => {
  const batch_id = batchId || (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `batch-${Date.now()}`);
  const rows = [];
  nextMap.forEach((entry) => {
    const prev = prevMap?.get(rateHistoryEntryKey(entry));
    if (prev && prev.cost === entry.cost && prev.sell === entry.sell && prev.margin === entry.margin) return;
    rows.push({
      batch_id, source: source || "admin", note: note || null,
      carrier: entry.carrier, area: entry.area || null, pol: entry.pol,
      route: entry.route || entry.pol, rate_type: entry.rate_type, period: entry.period,
      category: entry.category, cost: entry.cost, sell: entry.sell, margin: entry.margin,
    });
  });
  return rows;
};

const postRateHistoryRows = async (rows) => {
  if (!rows.length) return 0;
  let sent = 0;
  const postHeaders = { Prefer: "return=minimal" };
  for (let i = 0; i < rows.length; i += RATE_HISTORY_CHUNK) {
    try {
      await api("rate_history", {
        method: "POST",
        body: JSON.stringify(rows.slice(i, i + RATE_HISTORY_CHUNK)),
        headers: postHeaders,
        timeoutMs: API_TIMEOUT_MS,
      });
      sent += Math.min(RATE_HISTORY_CHUNK, rows.length - i);
    } catch (e) {
      console.warn("rate_history chunk skip", e);
      break;
    }
  }
  return sent;
};

async function uploadExcelRateHistory(parsed, period, fData, note, batchId, polCostO) {
  const rhRaw = enrichRateHistoryRowsWithCosts(
    buildRateHistoryRowsFromUpload(parsed, period, fData, note),
    polCostO,
    period,
  );
  if (!rhRaw.length) return { sent: 0, total: 0 };

  const rhScope = rateHistoryScopeFromUpload(parsed, period);
  try {
    const sent = await withTimeout(
      (async () => {
        try {
          await deleteRateHistoryExcelUpload(rhScope.carrier, rhScope.period, rhScope.category);
        } catch (delErr) {
          console.warn("rate_history delete skip (DELETE policy 확인):", delErr);
        }
        return postRateHistoryRows(rhRaw.map(r => ({ ...r, batch_id: batchId })));
      })(),
      RATE_HISTORY_UPLOAD_TIMEOUT_MS,
      "Rate History 기록 시간 초과",
    );
    return { sent, total: rhRaw.length };
  } catch (e) {
    console.warn("Rate History 기록 생략 (매입 저장은 완료됨):", e);
    return { sent: 0, total: rhRaw.length, error: e?.message || String(e) };
  }
}

/** 재업로드 시 이전 Excel 업로드 기록 제거 (동일 선사·기간·유형) */
const deleteRateHistoryExcelUpload = async (carrier, period, category = "ocean") => {
  const q = [
    "rate_history?",
    `carrier=eq.${encodeURIComponent(carrier)}`,
    `period=eq.${encodeURIComponent(period)}`,
    `category=eq.${encodeURIComponent(category)}`,
    "source=eq.excel_upload",
  ].join("&");
  await api(q, { method: "DELETE", headers: { Prefer: "return=minimal" }, timeoutMs: API_TIMEOUT_MS });
};

const fetchRateHistoryExcelUploadOcean = async () => {
  const rows = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const batch = await api(
      `rate_history?source=eq.excel_upload&category=eq.ocean&select=*&order=created_at.desc&limit=${limit}&offset=${offset}`,
    );
    if (!batch?.length) break;
    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return rows;
};

const deleteRateHistoryByIds = async (ids) => {
  for (let i = 0; i < ids.length; i += RATE_HISTORY_CHUNK) {
    const chunk = ids.slice(i, i + RATE_HISTORY_CHUNK);
    await api(`rate_history?id=in.(${chunk.join(",")})`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
};

/** Excel 업로드 기록 중 서비스 구간 밖 + pol_costs 연동 정리 */
async function pruneRateHistoryOutsideService(fData, storeSnap, rData) {
  const all = await fetchRateHistoryExcelUploadOcean();
  const invalid = all.filter(row => !carrierUploadServesRate(fData, row.carrier, row.pol, row.rate_type));
  if (!invalid.length) {
    return {
      historyCleared: 0,
      polCostO: storeSnap.polCostO,
      polCostsChanged: false,
      dbCleared: 0,
    };
  }
  const applied = applyRateHistoryDeletesToStores(invalid, storeSnap, rData);
  await deleteRateHistoryByIds(invalid.map(r => r.id));
  return {
    historyCleared: invalid.length,
    polCostO: applied.polCostO,
    polCostsChanged: applied.polCostsChanged,
    dbCleared: applied.dbCleared,
    dropChanged: applied.dropChanged,
    carrierDropRates: applied.carrierDropRates,
    rentalChanged: applied.rentalChanged,
    rentalRates: applied.rentalRates,
  };
}

const buildRateHistoryQuery = (filters) => {
  const parts = ["rate_history?select=*", "order=created_at.desc", "limit=400"];
  parts.push("source=neq.excel_delete");
  parts.push("cost=gt.0");
  if (filters.scope === "rental") {
    parts.push("category=eq.rental");
  } else if (filters.scope === "freight") {
    if (filters.category && filters.category !== "ALL") {
      parts.push(`category=eq.${encodeURIComponent(filters.category)}`);
    } else {
      parts.push("category=in.(ocean,dropoff)");
    }
  } else if (filters.category && filters.category !== "ALL") {
    parts.push(`category=eq.${encodeURIComponent(filters.category)}`);
  }
  if (filters.carrier && filters.carrier !== "ALL") parts.push(`carrier=eq.${encodeURIComponent(filters.carrier)}`);
  if (filters.area && filters.area !== "ALL") parts.push(`area=eq.${encodeURIComponent(filters.area)}`);
  if (filters.period && filters.period !== "ALL") parts.push(`period=eq.${encodeURIComponent(filters.period)}`);
  if (filters.pol?.trim()) parts.push(`pol=ilike.*${encodeURIComponent(filters.pol.trim())}*`);
  if (filters.dateFrom) parts.push(`created_at=gte.${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) parts.push(`created_at=lte.${filters.dateTo}T23:59:59.999`);
  return parts.join("&");
};

/** 변경 이력 표시 — 도시(POL) → 타입 → 기간 → 최신 일시 */
const rateHistoryCitySortKey = (row) => {
  if (row.route?.includes(" > ")) return row.route.split(" > ").slice(1).join(" > ").trim();
  return row.pol || "";
};

const sortRateHistoryRowsByCity = (rows) => {
  const periodRank = (p) => (p === "current" ? 0 : p === "future" ? 1 : 2);
  const typeRank = (t) => {
    const order = ["drop20", "drop40", "coc20", "coc40", "soc20", "soc40", "r20", "r40dv", "r40hc"];
    const i = order.indexOf(t);
    return i >= 0 ? i : 99;
  };
  return [...rows].sort((a, b) => {
    const cityCmp = rateHistoryCitySortKey(a).localeCompare(rateHistoryCitySortKey(b), "ko", { sensitivity: "base" });
    if (cityCmp !== 0) return cityCmp;
    const typeCmp = typeRank(a.rate_type) - typeRank(b.rate_type);
    if (typeCmp !== 0) return typeCmp;
    const periodCmp = periodRank(a.period) - periodRank(b.period);
    if (periodCmp !== 0) return periodCmp;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
};

const buildBuyingGriCosts = (prevCosts, { deltas, rows, carrier, period, carrierRates, fData }) => {
  let next = { ...prevCosts };
  rows.forEach(row => {
    RATE_TYPES.forEach(t => {
      const delta = deltas[t];
      if (!Number.isFinite(delta)) return;
      const cost = resolveCarrierCostFromStore(next, row.pol, carrier, t, period, carrierRates, fData);
      if (cost == null) return;
      const prevCr = { ...(next[row.pol]?.carrier?.[carrier] || {}) };
      const bucket = { ...(prevCr[period] || {}) };
      bucket[t] = cost + delta;
      const nextCr = { ...prevCr, [period]: bucket };
      delete nextCr[t];
      next = {
        ...next,
        [row.pol]: {
          ...(next[row.pol] || {}),
          carrier: { ...(next[row.pol]?.carrier || {}), [carrier]: nextCr },
        },
      };
    });
  });
  return next;
};

const buildSellingGriSells = (prevCosts, { deltas, rows, carrier, period, carrierRates, fData, polM, polMFuture }) => {
  let next = { ...prevCosts };
  rows.forEach(row => {
    RATE_TYPES.forEach(t => {
      const delta = deltas[t];
      if (!Number.isFinite(delta)) return;
      const cost = resolveCarrierCostFromStore(next, row.pol, carrier, t, period, carrierRates, fData);
      if (cost == null) return;
      const currentSell = resolveCarrierEffectiveSell(next, row.pol, carrier, t, period, cost, { polM, polMFuture });
      const prevCr = { ...(next[row.pol]?.carrier?.[carrier] || {}) };
      const bucket = { ...(prevCr[period] || {}) };
      const sellBucket = { ...(bucket.sell || {}), [t]: currentSell + delta };
      bucket.sell = sellBucket;
      const nextCr = { ...prevCr, [period]: bucket };
      delete nextCr[t];
      next = {
        ...next,
        [row.pol]: {
          ...(next[row.pol] || {}),
          carrier: { ...(next[row.pol]?.carrier || {}), [carrier]: nextCr },
        },
      };
    });
  });
  return next;
};

const resolveMarginCandidates = (pol, area, type, period, ctx) => {
  const candidates = [{ value: marginNum(ctx.margins[type]), ts: ctx.marginTs[type] ?? 0 }];
  const areaVal = ctx.areaM[area]?.[type];
  if (areaVal != null && areaVal !== "") {
    candidates.push({ value: marginNum(areaVal), ts: ctx.areaTs[area]?.[type] ?? 0 });
  }
  // POL 마진은 기간별 완전 분리 — current↔future 상호 참조 금지
  if (period === "future") {
    const futVal = ctx.polMFuture[pol]?.[type];
    if (futVal != null && futVal !== "") {
      candidates.push({ value: marginNum(futVal), ts: ctx.polTsFuture[pol]?.[type] ?? 0 });
    }
  } else {
    const polVal = ctx.polM[pol]?.[type];
    if (polVal != null && polVal !== "") {
      candidates.push({ value: marginNum(polVal), ts: ctx.polTs[pol]?.[type] ?? 0 });
    }
  }
  return candidates;
};

const griPeriodLabel = (period) => (period === "future" ? "향후 운임" : "현재 운임");

const displayMarginFromPrices = (cost, sell) =>
  (cost != null && sell != null ? sell - cost : null);

/** 현재 운임 매입가 → 향후 운임 pol_costs 복사 */
const buildCopyCurrentToFutureCosts = (prevCosts, { rows, carrier, carrierRates, fData }) => {
  let next = { ...prevCosts };
  rows.forEach(row => {
    const prevCr = { ...(next[row.pol]?.carrier?.[carrier] || {}) };
    const curBucket = prevCr.current || {};
    const futureBucket = { ...(prevCr.future || {}) };
    let hasCost = false;
    RATE_TYPES.forEach(t => {
      const cost = resolveCarrierCostFromStore(next, row.pol, carrier, t, "current", carrierRates, fData);
      if (cost == null) return;
      futureBucket[t] = cost;
      hasCost = true;
      const curSell = curBucket.sell?.[t];
      if (curSell != null) {
        if (!futureBucket.sell) futureBucket.sell = {};
        futureBucket.sell[t] = curSell;
      }
    });
    if (!hasCost) return;
    if (futureBucket.sell && !Object.keys(futureBucket.sell).length) delete futureBucket.sell;
    const nextCr = { ...prevCr, future: futureBucket };
    RATE_TYPES.forEach(t => delete nextCr[t]);
    next = {
      ...next,
      [row.pol]: {
        ...(next[row.pol] || {}),
        carrier: { ...(next[row.pol]?.carrier || {}), [carrier]: nextCr },
      },
    };
  });
  return next;
};

const copyCarrierRatesPeriod = (prev, carrier) => {
  const cur = prev[carrier]?.current || {};
  return {
    ...prev,
    [carrier]: {
      current: { ...(prev[carrier]?.current || {}) },
      future: { ...cur },
    },
  };
};

const copyCarrierDropRatesPeriod = (prev, carrier) => {
  const cur = prev[carrier]?.current || {};
  return {
    ...prev,
    [carrier]: {
      current: { ...(prev[carrier]?.current || {}) },
      future: JSON.parse(JSON.stringify(cur)),
      byValidity: { ...(prev[carrier]?.byValidity || {}) },
    },
  };
};

const pickLatestMargin = (candidates) =>
  candidates.reduce((best, c) => (c.ts > best.ts ? c : best)).value;

const buildLegacyMarginTimestamps = (areaM, polM, types = RATE_TYPES) => {
  const marginTs = Object.fromEntries(types.map(t => [t, 1]));
  const areaTs = {};
  Object.entries(areaM || {}).forEach(([area, m]) => {
    areaTs[area] = {};
    types.forEach(t => { if (m[t] != null && m[t] !== "") areaTs[area][t] = 2; });
  });
  const polTs = {};
  Object.entries(polM || {}).forEach(([pol, m]) => {
    polTs[pol] = {};
    types.forEach(t => { if (m[t] != null && m[t] !== "") polTs[pol][t] = 3; });
  });
  return { marginTs, areaTs, polTs };
};

const parsePricingFromSettings = (s) => {
  const snap = {
    validityInfo: defaultValidityInfo(),
    carrierRates: defaultCarrierRates(),
    rentalRates: buildDefaultRentalRates(),
    margins: { ...DEFAULT_MARGINS },
    areaM: {},
    polM: {},
    polMFuture: {},
    marginTs: Object.fromEntries(RATE_TYPES.map(t => [t, marginNowTs()])),
    areaTs: {},
    polTs: {},
    polTsFuture: {},
    rentalMargins: defaultRentalMargins(),
    rentalAreaM: {},
    rentalPolM: {},
    rentalMarginTs: Object.fromEntries(RENTAL_RATE_TYPES.map(t => [t, marginNowTs()])),
    rentalAreaTs: {},
    rentalPolTs: {},
    polCostO: {},
    carrierDropRates: defaultCarrierDropRates(),
    carrierDropMargins: defaultCarrierDropMargins(),
  };

  if (s.validity_info_json) {
    try {
      const parsed = JSON.parse(s.validity_info_json);
      if (parsed && typeof parsed === "object") {
        snap.validityInfo = Object.fromEntries(
          VALIDITY_KEYS.map(k => [k, normalizeValidityCarrier({ ...defaultValidityInfo()[k], ...(parsed[k] || {}) })])
        );
      }
    } catch (e) {}
  } else {
    // 각 carrier별로 해당 키가 정의된 경우에만 업데이트
    // validity_info_json이 없는 부분 로드(2차 RENTAL_DB_KEYS 등)에서
    // 다른 carrier들이 빈값으로 덮어씌워지지 않도록 보호
    if (s.validity_snk !== undefined) {
      snap.validityInfo.SNK = normalizeValidityCarrier({ ...snap.validityInfo.SNK, current: s.validity_snk });
    }
    if (s.validity_dy !== undefined) {
      snap.validityInfo.DY = normalizeValidityCarrier({ ...snap.validityInfo.DY, current: s.validity_dy });
    }
    if (s.validity_ck !== undefined) {
      snap.validityInfo.CK = normalizeValidityCarrier({ ...snap.validityInfo.CK, current: s.validity_ck });
    }
    if (s.validity_rental !== undefined) {
      snap.validityInfo.RENTAL = normalizeValidityCarrier({ ...snap.validityInfo.RENTAL, current: s.validity_rental });
    }
  }
  if (s.carrier_rates_json) {
    try {
      const parsed = JSON.parse(s.carrier_rates_json);
      if (parsed && typeof parsed === "object") {
        snap.carrierRates = Object.fromEntries(
          CRS.map(k => [k, {
            current: { ...defaultCarrierRates()[k].current, ...(parsed[k]?.current || {}) },
            future: { ...defaultCarrierRates()[k].future, ...(parsed[k]?.future || {}) },
          }])
        );
      }
    } catch (e) {}
  }
  if (s.rental_rates_json) {
    try {
      const parsed = JSON.parse(s.rental_rates_json);
      if (parsed && typeof parsed === "object") {
        snap.rentalRates = mergeRentalRates(buildDefaultRentalRates(), parsed);
      }
    } catch (e) {}
  }
  let loadedAreaM = {};
  let loadedPolM = {};
  if (s.global_margins) { try { snap.margins = JSON.parse(s.global_margins); } catch (e) {} }
  if (s.area_margins) { try { loadedAreaM = JSON.parse(s.area_margins); snap.areaM = loadedAreaM; } catch (e) {} }
  if (s.pol_margins) { try { loadedPolM = JSON.parse(s.pol_margins); snap.polM = loadedPolM; } catch (e) {} }
  if (s.pol_margins_future) { try { snap.polMFuture = JSON.parse(s.pol_margins_future); } catch (e) {} }
  if (s.margin_timestamps) {
    try { snap.marginTs = JSON.parse(s.margin_timestamps); } catch (e) {}
  } else {
    snap.marginTs = buildLegacyMarginTimestamps(loadedAreaM, loadedPolM).marginTs;
  }
  if (s.area_margin_timestamps) {
    try { snap.areaTs = JSON.parse(s.area_margin_timestamps); } catch (e) {}
  } else {
    snap.areaTs = buildLegacyMarginTimestamps(loadedAreaM, loadedPolM).areaTs;
  }
  if (s.pol_margin_timestamps) {
    try { snap.polTs = JSON.parse(s.pol_margin_timestamps); } catch (e) {}
  } else {
    snap.polTs = buildLegacyMarginTimestamps(loadedAreaM, loadedPolM).polTs;
  }
  if (s.pol_margin_timestamps_future) {
    try { snap.polTsFuture = JSON.parse(s.pol_margin_timestamps_future); } catch (e) {}
  }
  let loadedRentalAreaM = {};
  let loadedRentalPolM = {};
  if (s.rental_global_margins) { try { snap.rentalMargins = normalizeRentalMargins(JSON.parse(s.rental_global_margins)); } catch (e) {} }
  if (s.rental_area_margins) { try { loadedRentalAreaM = JSON.parse(s.rental_area_margins); snap.rentalAreaM = loadedRentalAreaM; } catch (e) {} }
  if (s.rental_pol_margins) { try { loadedRentalPolM = JSON.parse(s.rental_pol_margins); snap.rentalPolM = loadedRentalPolM; } catch (e) {} }
  if (s.rental_margin_timestamps) {
    try { snap.rentalMarginTs = JSON.parse(s.rental_margin_timestamps); } catch (e) {}
  } else {
    snap.rentalMarginTs = buildLegacyMarginTimestamps(loadedRentalAreaM, loadedRentalPolM, RENTAL_RATE_TYPES).marginTs;
  }
  if (s.rental_area_margin_timestamps) {
    try { snap.rentalAreaTs = JSON.parse(s.rental_area_margin_timestamps); } catch (e) {}
  } else {
    snap.rentalAreaTs = buildLegacyMarginTimestamps(loadedRentalAreaM, loadedRentalPolM, RENTAL_RATE_TYPES).areaTs;
  }
  if (s.rental_pol_margin_timestamps) {
    try { snap.rentalPolTs = JSON.parse(s.rental_pol_margin_timestamps); } catch (e) {}
  } else {
    snap.rentalPolTs = buildLegacyMarginTimestamps(loadedRentalAreaM, loadedRentalPolM, RENTAL_RATE_TYPES).polTs;
  }
  if (s.pol_costs != null && s.pol_costs !== "") {
    try { snap.polCostO = JSON.parse(s.pol_costs); } catch (e) {}
  }
  if (s.pol_portal_overrides_json) {
    try {
      snap.polCostO = mergePortalOverridesIntoPolCostO(
        snap.polCostO || {},
        JSON.parse(s.pol_portal_overrides_json),
      );
    } catch (e) {}
  }
  if (s.carrier_drop_rates_json) {
    try {
      snap.carrierDropRates = mergeCarrierDropRates(JSON.parse(s.carrier_drop_rates_json));
    } catch (e) {}
  }
  if (s.carrier_drop_margins_json) {
    try {
      snap.carrierDropMargins = mergeCarrierDropMargins(JSON.parse(s.carrier_drop_margins_json));
    } catch (e) {}
  }
  return snap;
};

const pricingCacheFromSnapshot = (snap) => ({
  v: 1,
  polCostO: snap.polCostO,
  margins: snap.margins,
  areaM: snap.areaM,
  polM: snap.polM,
  polMFuture: snap.polMFuture,
  marginTs: snap.marginTs,
  areaTs: snap.areaTs,
  polTs: snap.polTs,
  polTsFuture: snap.polTsFuture,
  carrierRates: snap.carrierRates,
  carrierDropRates: snap.carrierDropRates,
  carrierDropMargins: snap.carrierDropMargins,
  validityInfo: snap.validityInfo,
  rentalRates: snap.rentalRates,
  rentalMargins: snap.rentalMargins,
  rentalAreaM: snap.rentalAreaM,
  rentalPolM: snap.rentalPolM,
  rentalMarginTs: snap.rentalMarginTs,
  rentalAreaTs: snap.rentalAreaTs,
  rentalPolTs: snap.rentalPolTs,
});

const bootPricingFromCache = () => {
  const cache = readStoredPricingCache();
  if (!cache) return null;
  return {
    polCostO: cache.polCostO ?? {},
    margins: cache.margins ?? { ...DEFAULT_MARGINS },
    areaM: cache.areaM ?? {},
    polM: cache.polM ?? {},
    polMFuture: cache.polMFuture ?? {},
    marginTs: cache.marginTs ?? Object.fromEntries(RATE_TYPES.map(t => [t, marginNowTs()])),
    areaTs: cache.areaTs ?? {},
    polTs: cache.polTs ?? {},
    polTsFuture: cache.polTsFuture ?? {},
    carrierRates: cache.carrierRates ?? defaultCarrierRates(),
    carrierDropRates: cache.carrierDropRates
      ? mergeCarrierDropRates(cache.carrierDropRates)
      : defaultCarrierDropRates(),
    carrierDropMargins: cache.carrierDropMargins
      ? mergeCarrierDropMargins(cache.carrierDropMargins)
      : defaultCarrierDropMargins(),
    validityInfo: cache.validityInfo ?? defaultValidityInfo(),
    rentalRates: cache.rentalRates
      ? mergeRentalRates(buildDefaultRentalRates(), cache.rentalRates)
      : buildDefaultRentalRates(),
    rentalMargins: normalizeRentalMargins(cache.rentalMargins),
    rentalAreaM: cache.rentalAreaM ?? {},
    rentalPolM: cache.rentalPolM ?? {},
    rentalMarginTs: cache.rentalMarginTs ?? Object.fromEntries(RENTAL_RATE_TYPES.map(t => [t, marginNowTs()])),
    rentalAreaTs: cache.rentalAreaTs ?? {},
    rentalPolTs: cache.rentalPolTs ?? {},
  };
};


export { DROP_CITY_LABELS, RATE_HISTORY_CHUNK, RH_SOURCE_KEEP_RANK, bootPricingFromCache, buildBuyingGriCosts, buildCopyCurrentToFutureCosts, buildLegacyMarginTimestamps, buildRateHistoryQuery, buildSellingGriSells, copyCarrierDropRatesPeriod, copyCarrierRatesPeriod, countPolCostOverrides, countPolMarginOverrides, deleteRateHistoryByIds, deleteRateHistoryExcelUpload, diffRateHistoryRows, displayMarginFromPrices, fetchRateHistoryExcelUploadOcean, flattenRateSnapshot, getPolStoredMargin, griPeriodLabel, marginInpStyle, marginInpVal, marginNowTs, marginNum, mergePolCostODeep, parsePricingFromSettings, pickLatestMargin, pickRateHistoryDuplicatesToRemove, polCostOHasSellOverrides, postRateHistoryRows, pricingCacheFromSnapshot, rateHistoryCitySortKey, rateHistoryDuplicateValueKey, rateHistoryEntryKey, resolveCarrierCostFromStore, resolveCarrierEffectiveSell, resolveCarrierExplicitSell, resolveMarginCandidates, settingBundleHas, sortRateHistoryRowsByCity };
