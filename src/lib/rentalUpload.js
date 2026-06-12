// 렌탈 운임 Excel 업로드 — 템플릿 생성·파싱·변경 미리보기·반영
// 양식: 도착도시(Return City) / AREA / POL / 20' 매입 / 40'DV 매입 / 40'HC 매입
// 매출은 저장하지 않음 — 셀별 기존 마진으로 화면에서 자동 계산되므로 매입만 갱신한다.
import { PM, RC_LABEL, RENT_CITY_ORDER, normalizeRentalCityName } from "../data/staticData.js";
import { RENT_COMBO_KEYS, normalizeRentalCityBucket, rentComboMarginType } from "../config.js";
import { loadXlsx, num } from "./excelParsers.js";

const normKey = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** 도시 키 매칭 맵 — 내부 키 + 표시 라벨(SPB 등) + 별칭 모두 허용 */
const buildCityMap = () => {
  const map = {};
  RENT_CITY_ORDER.forEach(city => {
    map[normKey(city)] = city;
    const label = RC_LABEL[city];
    if (label) map[normKey(label)] = city;
  });
  return map;
};

/**
 * 템플릿 — "극동 컨테이너 운임.xlsx ③ Rental Fee (업로드용)" 시트와 동일한 그리드 양식.
 * 1행: 지역 | POL | 도시1 | | | 도시2 | | | …   2행: 20' | 40'DV | 40'HC 반복
 * 데이터: 행=POL(지역은 그룹 첫 행만), 값=매입가, 미서비스="x"
 */
export const buildRentalTemplateRows = (rentalRates, rentalRows, period = "current") => {
  const head1 = ["지역", "POL"];
  const head2 = [null, null];
  RENT_CITY_ORDER.forEach(city => {
    head1.push(city, null, null);
    head2.push("20'", "40'DV", "40'HC");
  });
  const rows = [head1, head2];
  let lastArea = null;
  rentalRows.forEach(r => {
    const pol = r.rentalPol;
    const row = [r.area !== lastArea ? r.area || "" : null, pol];
    lastArea = r.area;
    RENT_CITY_ORDER.forEach(city => {
      const bucket = normalizeRentalCityBucket(rentalRates[pol]?.[period]?.[city]);
      const cur = period === "future" ? normalizeRentalCityBucket(rentalRates[pol]?.current?.[city]) : {};
      RENT_COMBO_KEYS.forEach(sk => {
        const v = isRentalNoService(bucket[sk]) ? "x" : (bucket[sk] ?? (isRentalNoService(cur[sk]) ? "x" : cur[sk]));
        row.push(v == null || v === "" || v === "x" ? "x" : Number(v));
      });
    });
    rows.push(row);
  });
  return rows;
};

export const downloadRentalTemplate = async (rentalRates, rentalRows, period = "current") => {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(buildRentalTemplateRows(rentalRates, rentalRows, period));
  ws["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 9 }, { wch: 9 }, { wch: 9 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rental");
  XLSX.writeFile(wb, `rental-upload-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const sizeSkOf = (raw) => {
  const k = normKey(raw);
  if (!k) return null;
  if (k.includes("40DV") || k === "40") return "c40dv";
  if (k.includes("40HC")) return "c40hc";
  if (k.includes("20")) return "c20";
  return null;
};

const matchCity = (cityMap, raw) =>
  cityMap[normKey(raw)] || cityMap[normKey(normalizeRentalCityName(raw))] || null;

/** 셀 값: 'x' = 명시적 미서비스(삭제), 빈칸 = 변경 없음(null), 그 외 숫자 */
const cellVal = (raw) => {
  if (normKey(raw) === "X") return "x";
  return num(raw);
};

/** 저장된 셀이 명시적 미서비스("x")인지 */
export const isRentalNoService = (v) => v === "x";

/**
 * 그리드 양식 파싱 — "극동 컨테이너 운임.xlsx ③ Rental Fee (업로드용)":
 * 헤더행(지역|POL|도시…) + 사이즈행(20'|40'DV|40'HC…) + POL행들. 'x'/빈칸은 변경 없음.
 */
const parseRentalGridRows = (rows, headerIdx, polCol, cityMap, polMap) => {
  const header = rows[headerIdx] || [];
  const sizeRow = rows[headerIdx + 1] || [];
  const errors = [];

  // 도시 열 구간: 헤더에 도시명이 있는 열부터 다음 도시명 전까지
  const cityCols = [];
  for (let c = polCol + 1; c < header.length; c++) {
    if (header[c] != null && String(header[c]).trim() !== "") cityCols.push(c);
  }
  const colDefs = [];
  cityCols.forEach((c, i) => {
    const rawCity = header[c];
    const city = matchCity(cityMap, rawCity);
    const end = i + 1 < cityCols.length ? cityCols[i + 1] : Math.max(header.length, sizeRow.length);
    if (!city) {
      errors.push({ row: headerIdx + 1, city: String(rawCity ?? ""), pol: "", reason: "도시 매칭 실패 (열 전체 제외)" });
      return;
    }
    for (let cc = c; cc < end; cc++) {
      const sk = sizeSkOf(sizeRow[cc]);
      if (sk) colDefs.push({ col: cc, city, sk });
    }
  });

  const entries = [];
  for (let i = headerIdx + 2; i < rows.length; i++) {
    const row = rows[i] || [];
    const rawPol = row[polCol];
    if (rawPol == null || String(rawPol).trim() === "") continue;
    const pol = polMap[normKey(rawPol)];
    if (!pol) {
      errors.push({ row: i + 1, city: "", pol: String(rawPol), reason: "POL 매칭 실패" });
      continue;
    }
    const byCity = {};
    colDefs.forEach(d => {
      const v = cellVal(row[d.col]); // 숫자 / 'x'(미서비스) / null(빈칸=변경 없음)
      if (v == null) return;
      (byCity[d.city] ??= {})[d.sk] = v;
    });
    Object.entries(byCity).forEach(([city, values]) => {
      entries.push({ city, pol, values: { c20: values.c20 ?? null, c40dv: values.c40dv ?? null, c40hc: values.c40hc ?? null }, row: i + 1 });
    });
  }
  return { entries, errors };
};

/** 업로드 시트 파싱 — 그리드 양식(극동 컨테이너 운임) 자동 감지, 아니면 세로 양식. 매칭 실패는 errors 로 분리 */
export const parseRentalUploadRows = (rows, rentalRows) => {
  const cityMap = buildCityMap();
  const polMap = {};
  rentalRows.forEach(r => {
    polMap[normKey(r.rentalPol)] = r.rentalPol;
    if (PM[r.rentalPol]) polMap[normKey(PM[r.rentalPol])] = r.rentalPol;
  });

  let headerIdx = (rows || []).findIndex(r =>
    (r || []).some(c => normKey(c) === "POL") && ((r || []).some(c => /20/.test(String(c ?? "")))
      || ((rows[(rows || []).indexOf(r) + 1] || []).filter(c => sizeSkOf(c)).length >= 3)));
  if (headerIdx < 0) headerIdx = 0;
  const header = rows[headerIdx] || [];

  // 그리드 감지: 헤더 다음 행에 사이즈 토큰(20'/40'DV/40'HC)이 3개 이상이면 그리드 양식
  const gridPolCol = header.findIndex(c => normKey(c) === "POL");
  const sizeTokens = (rows[headerIdx + 1] || []).filter(c => sizeSkOf(c)).length;
  if (gridPolCol >= 0 && sizeTokens >= 3) {
    return parseRentalGridRows(rows, headerIdx, gridPolCol, cityMap, polMap);
  }
  const colOf = (pred, fallback) => {
    const i = header.findIndex(c => c != null && pred(String(c)));
    return i >= 0 ? i : fallback;
  };
  const cityCol = colOf(c => /city|도시|반납/i.test(c), 0);
  const polCol = colOf(c => normKey(c) === "POL", 2);
  const c20Col = colOf(c => /20/.test(c) && !/40/.test(c), 3);
  const dvCol = colOf(c => /40\s*'?\s*DV/i.test(c.replace(/\s/g, "")) || /40DV/i.test(normKey(c)), 4);
  const hcCol = colOf(c => /40\s*'?\s*HC/i.test(c.replace(/\s/g, "")) || /40HC/i.test(normKey(c)), 5);

  const entries = [];
  const errors = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const rawCity = row[cityCol];
    const rawPol = row[polCol];
    if ((rawCity == null || String(rawCity).trim() === "") && (rawPol == null || String(rawPol).trim() === "")) continue;
    const city = cityMap[normKey(rawCity)] || cityMap[normKey(normalizeRentalCityName(rawCity))];
    const pol = polMap[normKey(rawPol)];
    if (!city || !pol) {
      errors.push({
        row: i + 1,
        city: String(rawCity ?? ""),
        pol: String(rawPol ?? ""),
        reason: !city && !pol ? "도시·POL 모두 매칭 실패" : !city ? "도시 매칭 실패" : "POL 매칭 실패",
      });
      continue;
    }
    const values = { c20: cellVal(row[c20Col]), c40dv: cellVal(row[dvCol]), c40hc: cellVal(row[hcCol]) };
    if (values.c20 == null && values.c40dv == null && values.c40hc == null) continue; // 매입가 없는 행은 무시
    entries.push({ city, pol, values, row: i + 1 });
  }
  return { entries, errors };
};

/**
 * 변경 셀 목록 — 기존값과 다른 셀만. bigJump: ±30% 이상, inverted: 20' > 40'DV 역전
 * (향후 운임 비교 기준: 향후 저장값 → 없으면 현재값)
 */
export const buildRentalUploadChanges = (entries, rentalRates, period) => {
  const effOld = (pol, city, sk) => {
    const stored = normalizeRentalCityBucket(rentalRates[pol]?.[period]?.[city]);
    if (isRentalNoService(stored[sk])) return null; // 명시적 미서비스 — current fallback 안 함
    if (stored[sk] != null && stored[sk] !== "") return Number(stored[sk]);
    if (period === "future") {
      const cur = normalizeRentalCityBucket(rentalRates[pol]?.current?.[city]);
      if (isRentalNoService(cur[sk])) return null;
      if (cur[sk] != null && cur[sk] !== "") return Number(cur[sk]);
    }
    return null;
  };

  const changes = [];
  entries.forEach(e => {
    RENT_COMBO_KEYS.forEach((sk, ci) => {
      const next = e.values[sk];
      if (next == null) return;
      const old = effOld(e.pol, e.city, sk);
      if (next === "x") {
        if (old == null) return; // 이미 값 없음 — 변경 불필요
        changes.push({
          pol: e.pol, city: e.city, sk, type: rentComboMarginType(ci),
          old, next: null, remove: true, row: e.row, bigJump: false, inverted: false,
        });
        return;
      }
      if (old != null && old === next) return; // 변경 없음
      changes.push({
        pol: e.pol, city: e.city, sk, type: rentComboMarginType(ci),
        old, next, remove: false, row: e.row,
        bigJump: old != null && old > 0 && Math.abs(next - old) / old >= 0.3,
        inverted: false,
      });
    });
  });

  // 가격 역전: 업로드 반영 후 기준으로 20' > 40'DV 인 셀 경고 ('x'는 제외)
  entries.forEach(e => {
    const eff = sk => {
      const v = e.values[sk];
      if (v === "x") return null;
      return v ?? effOld(e.pol, e.city, sk);
    };
    const v20 = eff("c20");
    const vdv = eff("c40dv");
    if (v20 != null && vdv != null && Number(v20) > Number(vdv)) {
      changes.forEach(c => {
        if (c.pol === e.pol && c.city === e.city && !c.remove && (c.sk === "c20" || c.sk === "c40dv")) c.inverted = true;
      });
    }
  });
  return changes;
};

/** 변경 셀을 rentalRates 에 반영한 새 객체 반환 (원본 불변) — 삭제는 "x" 마커 저장 (기본값 fallback 차단) */
export const applyRentalUploadChanges = (rentalRates, changes, period) => {
  const next = JSON.parse(JSON.stringify(rentalRates || {}));
  changes.forEach(c => {
    if (!next[c.pol]) next[c.pol] = { current: {}, future: {} };
    if (!next[c.pol][period]) next[c.pol][period] = {};
    next[c.pol][period][c.city] = { ...(next[c.pol][period][c.city] || {}), [c.sk]: c.remove ? "x" : c.next };
  });
  return next;
};
