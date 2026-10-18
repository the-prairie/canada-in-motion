export const BARRELS_PER_CUBIC_METRE = 6.2898107704321;
export const DEFAULT_STATE = Object.freeze({
  view: "journey",
  labTab: "transport",
  cohort: "all",
  route: "trans-mountain-burnaby",
  step: 1,
  eventYear: "all",
  eventType: "all",
  commodity: "all",
  province: "all",
  orphan: "all",
  closure: "all",
  query: "",
  well: null,
  volume: 10000,
  unit: "m3",
  rateId: null,
  date: "2026-05-01",
  scenario: {
    tollChange: 20,
    extraGovernment: 0,
    closed: false,
    budget: 5000000,
    costLow: 75000,
    costHigh: 150000,
  },
  layers: {
    oil: true,
    gas: true,
    facilities: true,
    wells: false,
    context: false,
    historical: false,
    bcPermits: false,
  },
  camera: null,
});
const number = (v, fallback, min, max) =>
  Number.isFinite(Number(v))
    ? Math.min(max, Math.max(min, Number(v)))
    : fallback;
export function normalizeState(raw = {}) {
  const s = {
    ...DEFAULT_STATE,
    ...raw,
    scenario: { ...DEFAULT_STATE.scenario, ...raw.scenario },
    layers: { ...DEFAULT_STATE.layers, ...raw.layers },
  };
  if (!["journey", "wells", "lab"].includes(s.view)) s.view = "journey";
  s.labTab = s.labTab === "cleanup" ? "cleanup" : "transport";
  s.cohort = s.cohort === "cleanup" ? "cleanup" : "all";
  s.route = typeof s.route === "string" ? s.route : DEFAULT_STATE.route;
  s.well = typeof s.well === "string" ? s.well : null;
  s.query = typeof s.query === "string" ? s.query.slice(0, 100) : "";
  s.province = ["all", "AB", "BC", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"].includes(s.province)
    ? s.province
    : "all";
  s.orphan = ["all", "designated", "not-designated", "unknown"].includes(
    s.orphan,
  )
    ? s.orphan
    : "all";
  s.closure = ["all", "abandoned", "suspended", "active", "unknown"].includes(
    s.closure,
  )
    ? s.closure
    : "all";
  s.eventYear = /^(all|\d{4})$/.test(String(s.eventYear))
    ? String(s.eventYear)
    : "all";
  s.eventType = [
    "all",
    "orphan-designated",
    "abandoned",
    "reclaimed",
    "transferred",
  ].includes(s.eventType)
    ? s.eventType
    : "all";
  s.commodity = ["all", "oil", "gas"].includes(s.commodity)
    ? s.commodity
    : "all";
  s.volume = number(s.volume, 10000, 0, 1e9);
  s.step = number(s.step, 0, 0, 2);
  s.unit = s.unit === "bbl" ? "bbl" : "m3";
  s.date =
    typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date)
      ? s.date
      : DEFAULT_STATE.date;
  s.scenario = {
    tollChange: number(s.scenario.tollChange, 20, -100, 200),
    extraGovernment: number(s.scenario.extraGovernment, 0, 0, 10000),
    closed: s.scenario.closed === true,
    budget: number(s.scenario.budget, 5000000, 0, 1e10),
    costLow: number(s.scenario.costLow, 75000, 1, 1e8),
    costHigh: number(s.scenario.costHigh, 150000, 1, 1e8),
  };
  for (const key of Object.keys(DEFAULT_STATE.layers))
    s.layers[key] = s.layers[key] === true;
  if (
    !s.camera ||
    !Array.isArray(s.camera.center) ||
    s.camera.center.length !== 2 ||
    !s.camera.center.every(Number.isFinite)
  )
    s.camera = null;
  else
    s.camera = {
      center: [
        number(s.camera.center[0], 53, 20, 80),
        number(s.camera.center[1], -110, -170, -45),
      ],
      zoom: number(s.camera.zoom, 4, 2, 15),
    };
  return s;
}
export function volumeM3(value, unit) {
  return unit === "bbl" ? value / BARRELS_PER_CUBIC_METRE : value;
}
export function quoteShipment(
  rate,
  volume,
  unit,
  date,
  adjustment = 0,
  extraGovernment = 0,
) {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1e9)
    return {
      status: "invalid",
      reason: "Enter a shipment volume from 0 to 1,000,000,000.",
    };
  if (
    !Number.isFinite(adjustment) ||
    adjustment < -100 ||
    adjustment > 200 ||
    !Number.isFinite(extraGovernment) ||
    extraGovernment < 0 ||
    extraGovernment > 10000
  )
    return {
      status: "invalid",
      reason:
        "Enter a toll adjustment from −100% to 200% and a government fee from 0 to 10,000 CAD / m³.",
    };
  if (!rate || !Number.isFinite(rate.rate))
    return {
      status: "unknown",
      reason: "No published rate is loaded for this route.",
    };
  if (!["CAD/m3", "CAD/bbl", "m3", "bbl"].includes(rate.unit))
    return {
      status: "unknown",
      reason: "This rate requires a service-specific calculation.",
    };
  if (
    (rate.effectiveFrom && date < rate.effectiveFrom) ||
    (rate.effectiveTo && date > rate.effectiveTo)
  )
    return {
      status: "out-of-period",
      reason: "The shipment date is outside this schedule’s documented period.",
    };
  if (
    rate.currentness?.verifiedShipmentDate &&
    date !== rate.currentness.verifiedShipmentDate
  )
    return {
      status: "unverified-date",
      reason:
        "Rate applicability is only verified for the schedule date in this build. Choose that date or verify subsequent filings.",
    };
  const m3 = volumeM3(volume, unit),
    billable = /bbl/.test(rate.unit) ? m3 * BARRELS_PER_CUBIC_METRE : m3;
  const carrier = billable * rate.rate * (1 + adjustment / 100),
    governmentAssumption = m3 * extraGovernment;
  return {
    status: "partial",
    carrier,
    governmentAssumption,
    knownSubtotal: carrier + governmentAssumption,
    m3,
    billable,
    unit: rate.unit,
    rate: rate.rate,
    reason:
      "Carrier estimate only. Applicable taxes, fees and other services are not fully established.",
  };
}
export function filterWells(wells, state) {
  const q = state.query.toLowerCase().trim();
  return wells.filter(
    (w) =>
      (state.cohort !== "cleanup" || isCleanupRecord(w)) &&
      (state.province === "all" || w.province === state.province) &&
      (state.orphan === "all" || w.orphanStatus === state.orphan) &&
      (state.closure === "all" || w.closureStatus === state.closure) &&
      ((state.eventYear === "all" && state.eventType === "all") ||
        (w.events || []).some(
          (e) =>
            (state.eventYear === "all" ||
              e.date?.startsWith(state.eventYear)) &&
            (state.eventType === "all" || e.type === state.eventType),
        )) &&
      (!q ||
        [w.id, w.name, w.operator, w.license, w.province].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(q),
        )),
  );
}
export function isCleanupRecord(w) {
  return (
    w.province === "SK" &&
    w.orphanStatus === "designated" &&
    w.reclamationStatus === "Required" &&
    !(w.events || []).some(
      (e) => e.type === "transferred" || e.type === "reclaimed",
    )
  );
}
export function cleanupScenario(budget, low, high, eligible) {
  if (
    ![budget, low, high, eligible].every(Number.isFinite) ||
    budget < 0 ||
    budget > 1e10 ||
    low <= 0 ||
    high < low ||
    high > 1e8 ||
    eligible < 0
  )
    return { status: "invalid" };
  return {
    status: "assumption",
    low: Math.min(eligible, Math.floor(budget / high)),
    high: Math.min(eligible, Math.floor(budget / low)),
    eligible,
    budget,
    costLow: low,
    costHigh: high,
  };
}
export function encodeState(s) {
  return "#v1=" + encodeURIComponent(JSON.stringify(normalizeState(s)));
}
export function decodeState(hash) {
  if (typeof hash !== "string" || hash.length > 65536) return null;
  try {
    return hash.startsWith("#v1=")
      ? normalizeState(JSON.parse(decodeURIComponent(hash.slice(4))))
      : null;
  } catch {
    return null;
  }
}
export function csv(rows, columns) {
  const cell = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    columns.map(cell).join(","),
    ...rows.map((r) => columns.map((c) => cell(r[c])).join(",")),
  ].join("\r\n");
}
export function eventTimeline(well) {
  return (well.events || [])
    .filter((e) => /^\d{4}-\d{2}-\d{2}/.test(e.date || ""))
    .sort((a, b) => a.date.localeCompare(b.date));
}
