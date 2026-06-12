// 렌탈 운임 Excel 업로드 — 템플릿 생성·파싱·변경 미리보기·반영
// 양식: 도착도시(Return City) / AREA / POL / 20' 매입 / 40'DV 매입 / 40'HC 매입
// 매출은 저장하지 않음 — 셀별 기존 마진으로 화면에서 자동 계산되므로 매입만 갱신한다.
import { PM, RC_LABEL, RENT_CITY_ORDER, normalizeRentalCityName } from "../data/staticData.js";
import { RENT_COMBO_KEYS, normalizeRentalCityBucket, rentComboMarginType } from "../config.js";
import { loadXlsx, num } from "./excelParsers.js";

const RENTAL_UPLOAD_HEADER = ["Return City", "AREA", "POL", "20'", "40'DV", "40'HC"];

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

/** 현재 DB의 도시×POL 목록 + 매입가가 채워진 템플릿 행 */
export const buildRentalTemplateRows = (rentalRates, rentalRows, period = "current") => {
  const rows = [RENTAL_UPLOAD_HEADER];
  RENT_CITY_ORDER.forEach(city => {
    rentalRows.forEach(r => {
      const pol = r.rentalPol;
      const stored = normalizeRentalCityBucket(rentalRates[pol]?.[period]?.[city]);
      const cur = period === "future" ? normalizeRentalCityBucket(rentalRates[pol]?.current?.[city]) : {};
      const val = sk => {
        const v = stored[sk] ?? cur[sk];
        return v == null || v === "" ? null : Number(v);
      };
      rows.push([RC_LABEL[city] || city, r.area || "", pol, val("c20"), val("c40dv"), val("c40hc")]);
    });
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

/** 업로드 시트 파싱 — 매칭 실패 행은 errors 로 분리하고 제외 */
export const parseRentalUploadRows = (rows, rentalRows) => {
  const cityMap = buildCityMap();
  const polMap = {};
  rentalRows.forEach(r => {
    polMap[normKey(r.rentalPol)] = r.rentalPol;
    if (PM[r.rentalPol]) polMap[normKey(PM[r.rentalPol])] = r.rentalPol;
  });

  let headerIdx = (rows || []).findIndex(r =>
    (r || []).some(c => normKey(c) === "POL") && (r || []).some(c => /20/.test(String(c ?? ""))));
  if (headerIdx < 0) headerIdx = 0;
  const header = rows[headerIdx] || [];
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
    const values = { c20: num(row[c20Col]), c40dv: num(row[dvCol]), c40hc: num(row[hcCol]) };
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
    if (stored[sk] != null && stored[sk] !== "") return Number(stored[sk]);
    if (period === "future") {
      const cur = normalizeRentalCityBucket(rentalRates[pol]?.current?.[city]);
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
      if (old != null && old === next) return; // 변경 없음
      changes.push({
        pol: e.pol, city: e.city, sk, type: rentComboMarginType(ci),
        old, next, row: e.row,
        bigJump: old != null && old > 0 && Math.abs(next - old) / old >= 0.3,
        inverted: false,
      });
    });
  });

  // 가격 역전: 업로드 반영 후 기준으로 20' > 40'DV 인 셀 경고
  entries.forEach(e => {
    const eff = sk => e.values[sk] ?? effOld(e.pol, e.city, sk);
    const v20 = eff("c20");
    const vdv = eff("c40dv");
    if (v20 != null && vdv != null && Number(v20) > Number(vdv)) {
      changes.forEach(c => {
        if (c.pol === e.pol && c.city === e.city && (c.sk === "c20" || c.sk === "c40dv")) c.inverted = true;
      });
    }
  });
  return changes;
};

/** 변경 셀을 rentalRates 에 반영한 새 객체 반환 (원본 불변) */
export const applyRentalUploadChanges = (rentalRates, changes, period) => {
  const next = JSON.parse(JSON.stringify(rentalRates || {}));
  changes.forEach(c => {
    if (!next[c.pol]) next[c.pol] = { current: {}, future: {} };
    if (!next[c.pol][period]) next[c.pol][period] = {};
    next[c.pol][period][c.city] = { ...(next[c.pol][period][c.city] || {}), [c.sk]: c.next };
  });
  return next;
};
