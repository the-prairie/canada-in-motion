import {
  DEFAULT_STATE,
  normalizeState,
  quoteShipment,
  filterWells,
  cleanupScenario,
  encodeState,
  decodeState,
  csv,
  eventTimeline,
  isCleanupRecord,
} from "./model.mjs";
import { AtlasMap } from "./map.js";
import { fetchJSON, loadWells, loadDetail, snapshotFreshness } from "./data-store.mjs";
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (n) =>
  new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 }).format(n);
const money = (n) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
const precise = (n) =>
  new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n);
const localDate = (v) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(v));
const textList = (v) =>
  Array.isArray(v)
    ? v.join(" ")
    : typeof v === "object"
      ? JSON.stringify(v)
      : v;
const pill = (text, kind = "") =>
  `<span class="pill ${kind}">${esc(text)}</span>`;
const option = (value, label, selected) =>
  `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
const field = (label, id, control) =>
  `<div class="field"><label class="field-label" for="${id}">${label}</label>${control}</div>`;
const sourceButton = (id) =>
  `<button class="text-link" data-source="${esc(id)}">Inspect source</button>`;
const statusNames = {
  abandoned: "Abandoned",
  active: "Active",
  suspended: "Suspended",
  unknown: "Not established",
  designated: "Designation recorded",
  "not-designated": "Not designated",
};
let state = normalizeState(),
  data,
  atlas,
  filtered = [],
  resultLimit = 30,
  toastTimer,
  saveTimer;
let sources = [];
try {
  state =
    decodeState(location.hash) ||
    normalizeState(JSON.parse(localStorage.getItem("cim-state-v1") || "{}"));
} catch {}
let wellsReady = false, wellsLoading = false, wellLoadError = null, detailLoadingId = null, detailError = null;
async function boot() {
  const [
    network,
    catalog,
    tariffs,
    coverage,
    tariffSources,
    countries,
    provinces,
    historicalInfrastructure,
    benchmarkTolls,
  ] = await Promise.all(
    [
      "data/network.json",
      "data/catalog.json",
      "data/tariffs.json",
      "data/national-coverage.json",
      "data/tariff-sources.json",
      "data/countries.geojson",
      "data/provinces.geojson",
      "data/context/historical-infrastructure.geojson",
      "data/context/benchmark-tolls.json",
    ].map(fetchJSON),
  );
  const wells = { wells: [], retrievedAt: catalog.retrievedAt, coverage: catalog.sources.map(source => ({province:source.province, sourceId:source.id, included:source.count, totalAvailable:source.sourceCount, scope:source.scope, note:source.limitations})) };
  data = { network, wells, tariffs, catalog, coverage, historicalInfrastructure, benchmarkTolls };
  sources = [...network.sources, ...catalog.sources, ...tariffSources];
  if (!network.routes.some((r) => r.id === state.route))
    state.route = DEFAULT_STATE.route;

  atlas = new AtlasMap(
    network,
    { countries, provinces, historicalInfrastructure },
    {
      onRoute: (id) => chooseRoute(id),
      onStep: (n) => chooseStep(n),
      onWell: (id) => chooseWell(id),
      onFacility: showFacility,
      onProvince: (p) => {
        const names = Object.fromEntries(data.coverage.provinces.map(p => [p.name,p.code]));
        if (state.view === "wells" && names[p.name]) {
          state.province = names[p.name];
          state.eventYear = "all";
          state.cohort = "all";
          state.well = null;
          state.query = "";
          render();
          atlas.focus();
          persist();
        }
      },
      onCamera: (camera) => {
        state.camera = camera;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(persist, 250);
      },
    },
  );
  atlas.setRecords(wells.wells);
  $("snapshot-label").textContent =
    `${snapshotFreshness(catalog.retrievedAt) === "stale" ? "Refresh overdue" : "Retrieved"} · ${localDate(catalog.retrievedAt)}`;
  render();
  atlas.setCamera(state.camera);
  window.addEventListener("hashchange", () => {
    const s = decodeState(location.hash);
    if (s) {
      state = restoreState(s);
      render();
      atlas.setCamera(state.camera);
    }
  });
  persist();
  document.body.dataset.ready = "true";
}
function restoreState(raw) {
  const restored = normalizeState(raw);
  if (!data.network.routes.some((r) => r.id === restored.route))
    restored.route = DEFAULT_STATE.route;
  if (wellsReady && !data.wells.wells.some((w) => w.id === restored.well))
    restored.well = null;
  return restored;
}
function validNumericInputs() {
  const s = state.scenario;
  return (
    Number.isFinite(state.volume) &&
    state.volume >= 0 &&
    state.volume <= 1e9 &&
    [s.tollChange, s.extraGovernment, s.budget, s.costLow, s.costHigh].every(
      Number.isFinite,
    ) &&
    s.tollChange >= -100 &&
    s.tollChange <= 200 &&
    s.extraGovernment >= 0 &&
    s.extraGovernment <= 10000 &&
    s.budget >= 0 &&
    s.budget <= 1e10 &&
    s.costLow > 0 &&
    s.costHigh >= s.costLow &&
    s.costHigh <= 1e8
  );
}
function persist() {
  if (!validNumericInputs()) return;
  history.replaceState(null, "", location.pathname + encodeState(state));
  try {
    localStorage.setItem("cim-state-v1", JSON.stringify(state));
  } catch {}
}
function getRoute() {
  return data.network.routes.find((r) => r.id === state.route);
}
function getRate() {
  return data.tariffs.rates.find((r) => r.routeId === state.route);
}
function getQuote(scenario = false) {
  return quoteShipment(
    getRate(),
    state.volume,
    state.unit,
    state.date,
    scenario ? state.scenario.tollChange : 0,
    scenario ? state.scenario.extraGovernment : 0,
  );
}
function announce(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 4000);
}
async function ensureWellData() {
  if (wellsReady || wellsLoading) return;
  wellsLoading = true;
  wellLoadError = null;
  try {
    data.wells.wells = await loadWells(data.catalog);
    atlas.setRecords(data.wells.wells);
    wellsReady = true;
    if (state.well) {
      const well = data.wells.wells.find(w => w.id === state.well);
      if (!well) state.well = null;
    }
  } catch (error) { wellLoadError = error.message; wellsReady = false; }
  finally { wellsLoading = false; render(); if (wellsReady && state.view !== "journey") atlas.focus(); }
}
async function ensureSelectedDetail(record) {
  if (detailLoadingId === record.id) return;
  detailLoadingId = record.id;
  try {
    Object.assign(record, await loadDetail(data.catalog, record), {_detailLoaded:true});
    if (detailError?.id === record.id) detailError = null;
  } catch (error) {
    if (state.well === record.id && state.view === "wells") detailError = {id:record.id,message:error.message};
  } finally {
    if (detailLoadingId === record.id) detailLoadingId = null;
    if (state.well === record.id && state.view === "wells") render();
  }
}
function render() {
  const selectedRecord = wellsReady && state.view === "wells" && state.well ? data.wells.wells.find(w => w.id === state.well) : null;
  if (selectedRecord && !selectedRecord._detailLoaded) {
    const error = detailError?.id === selectedRecord.id ? detailError.message : null;
    $("panel").innerHTML = `<div class="panel-head"><button class="text-link" data-action="back-wells">← All matching wells</button><h1>${esc(selectedRecord.name)}</h1><p role="status">${error ? esc(error) : "Loading the regulator record…"}</p>${error ? '<button class="primary-button" data-action="retry-detail">Retry record</button>' : ""}</div>`;
    if (!error) void ensureSelectedDetail(selectedRecord);
    return;
  }
  const needsWells = state.view === "wells" || (state.view === "lab" && state.labTab === "cleanup") || state.layers.wells;
  if (needsWells && !wellsReady) {
    document.querySelectorAll("[data-view]").forEach(b => {b.classList.toggle("selected",b.dataset.view===state.view);b.setAttribute("aria-current",b.dataset.view===state.view?"page":"false");});
    $("panel").innerHTML = `<div class="panel-head"><h1>${wellLoadError ? "Inventory unavailable" : "Loading well inventories"}</h1><p>${wellLoadError ? esc(wellLoadError) : "Reading the verified provincial indexes. Detailed records load when you open them."}</p>${wellLoadError ? '<button data-action="retry-wells" class="primary-button">Retry inventory</button>' : '<p role="status">Loading…</p>'}</div>`;
    if (!wellLoadError) void ensureWellData();
    return;
  }

  clearTimeout(resultTimer);
  $("result-announcement").textContent = "";
  const active = document.activeElement,
    activeId = active?.id,
    activeControl = active?.matches("button")
      ? ["view", "lab", "action", "nextWell"]
          .map((key) =>
            active.dataset[key] ? [key, active.dataset[key]] : null,
          )
          .find(Boolean)
      : null,
    openSections = [...$("panel").querySelectorAll("details[open][id]")].map(
      (d) => d.id,
    ),
    start = active?.selectionStart,
    end = active?.selectionEnd;
  filtered =
    state.view === "lab" && state.labTab === "cleanup"
      ? data.wells.wells.filter(isCleanupRecord)
      : filterWells(data.wells.wells, state);
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.view === state.view);
    b.setAttribute(
      "aria-current",
      b.dataset.view === state.view ? "page" : "false",
    );
  });
  const wellMode =
    state.view === "wells" ||
    (state.view === "lab" && state.labTab === "cleanup");
  const inventoryGap = state.province !== "all" && !data.catalog.sources.some(source => source.province === state.province);
  document.body.dataset.view = state.view;
  $("map-eyebrow").textContent = wellMode
    ? "REGULATOR RECORDS"
    : "ENERGY INFRASTRUCTURE";
  $("map-title").textContent = wellMode
    ? state.well
      ? data.wells.wells.find((w) => w.id === state.well)?.name
      : inventoryGap ? "Inventory not loaded" : `${fmt(filtered.length)} loaded well ${filtered.length === 1 ? "record" : "records"}`
    : `${getRoute().origin} → ${getRoute().destination}`;
  $("map-subtitle").textContent = wellMode
    ? "Source coordinates · incomplete national coverage"
    : "Schematic corridors · not pipeline alignments";
  const layerItems = wellMode
    ? [["context", "Energy infrastructure", "layer-line"]]
    : [
        ["oil", "Oil corridors", "layer-line"],
        ["gas", "Gas corridors", "layer-line gas"],
        ["facilities", "Facilities", "layer-line"],
        ["wells", "Well records", "layer-dot"],
      ];
  layerItems.push(["historical", "Historical pipelines & refineries", "layer-line"]);
  $("layer-inputs").innerHTML =
    layerItems
      .map(
        ([key, label, cl]) =>
          `<label class="check-row"><input type="checkbox" data-layer="${key}" ${state.layers[key] ? "checked" : ""}><span class="${cl}"></span>${label}</label>`,
      )
      .join("") +
    '<button class="text-link" data-action="facilities">Browse six featured facility localities</button><button class="text-link" data-action="historical-infrastructure">Historical layer dates & sources</button>';
  $("map-legend").innerHTML = wellMode
    ? '<span><i class="wells"></i>Orphan recorded</span><span><i class="context"></i>Designation unknown</span><span><i class="mixed-key"></i>Mixed cluster</span>'
    : `${state.layers[getRoute().commodity] ? '<span><i class="selected-route"></i>Selected corridor</span>' : ""}${state.layers.oil ? "<span><i></i>Oil</span>" : ""}${state.layers.gas ? '<span><i class="gas"></i>Gas</span>' : ""}${state.layers.facilities ? "<span>◇ Facility locality</span>" : ""}${state.layers.wells ? '<span><i class="wells"></i>Well records</span>' : ""}`;
  $("layer-inputs").insertAdjacentHTML(
    "beforeend",
    `<div class="layer-key"><strong>Map key</strong>${$("map-legend").innerHTML}</div>`,
  );
  $("map-source-label").textContent =
    state.view === "lab" && state.labTab === "cleanup"
      ? "SK records in the closure-budget cohort. Source coordinates."
      : state.view === "wells"
        ? "Clusters count source records, not unique sites."
        : "Indicative corridors. Facility markers represent localities.";
  if (state.layers.historical) $("map-source-label").textContent += ` Historical CanVec overlay: pipelines through ${data.historicalInfrastructure.metadata.observationRanges.pipeline.latest.slice(0,4)}, refineries through ${data.historicalInfrastructure.metadata.observationRanges.refinery.latest.slice(0,4)}; current operation unknown.`;
  $("coverage-line").textContent =
    `${fmt(data.catalog.totalRecords)} records · ${new Set(data.catalog.sources.map(s => s.province)).size} jurisdictions · coverage gaps`;
  $("panel").innerHTML =
    state.view === "journey"
      ? journeyPanel()
      : state.view === "wells"
        ? wellsPanel()
        : labPanel();
  $("map-dock").innerHTML =
    state.view === "journey"
      ? journeyDock()
      : wellMode
        ? `<div class="dock-summary"><div><strong>${inventoryGap ? "Not loaded" : fmt(filtered.length)}</strong><small>${state.labTab === "cleanup" && state.view === "lab" ? "eligible SK records · assumed closure budget" : "loaded records matching filters"}</small></div><button data-action="show-records">${state.view === "lab" ? "Inspect cohort" : "View records"}</button></div>`
        : `<div class="dock-summary"><div><strong>${state.scenario.closed ? "Corridor unavailable" : getQuote(true).status === "partial" ? money(getQuote(true).knownSubtotal) : "Estimate unavailable"}</strong><small>Scenario subtotal · includes your assumptions</small></div><button data-action="show-details">Edit scenario</button></div>`;
  openSections.forEach((id) => {
    if ($(id)) $(id).open = true;
  });
  $("panel")
    .querySelectorAll('input[type="number"]')
    .forEach((input) =>
      input.setAttribute(
        "aria-invalid",
        String(!input.checkValidity() || input.value === ""),
      ),
    );
  atlas.update(state, filtered);
  if (activeControl && !activeId) {
    const [key, value] = activeControl;
    [...document.querySelectorAll("button")]
      .find((button) => button.dataset[key] === value)
      ?.focus({ preventScroll: true });
  }
  if (activeId) {
    const el = $(activeId);
    if (el) {
      el.focus({ preventScroll: true });
      if (typeof start === "number" && el.setSelectionRange)
        try {
          el.setSelectionRange(start, end);
        } catch {}
    }
  }
}
function journeyDock() {
  const r = getRoute();
  return `<div class="journey-stages">${[
    ["Locate origin", r.origin.split(",")[0]],
    ["Fit corridor", r.name.split(" · ")[0]],
    ["Locate destination", r.destination.split(",")[0]],
  ]
    .map(
      ([label, name], i) =>
        `${i ? '<span class="stage-divider"></span>' : ""}<button class="stage ${state.step === i ? "active" : ""}" data-step="${i}" aria-pressed="${state.step === i}"><span class="stage-index">${i + 1}</span><span><small>${label}</small><strong>${esc(name)}</strong></span></button>`,
    )
    .join("")}</div>`;
}
function routeSelect() {
  return field(
    "Corridor and destination",
    "route-select",
    `<select id="route-select" data-state="route">${data.network.routes.map((r) => option(r.id, `${r.origin.split(",")[0]} → ${r.destination}`, state.route)).join("")}</select>`,
  );
}
function shipmentFields() {
  return `<div class="field-grid">${field("Shipment volume", "volume", `<input id="volume" data-state="volume" type="number" min="0" max="1000000000" value="${Number.isFinite(state.volume) ? state.volume : ""}">`)}${field("Volume unit", "unit", `<select id="unit" data-state="unit">${option("m3", "Cubic metres", state.unit)}${option("bbl", "Oil barrels", state.unit)}</select>`)}</div><div class="shipment-date"><label class="field-label" for="shipment-date">Shipment date</label><input id="shipment-date" data-state="date" type="date" value="${state.date}"></div>`;
}

function receipt() {
  const rate = getRate(),
    q = getQuote();
  if (!rate)
    return `<section class="panel-section" id="receipt-region"><h3>Transport estimate unavailable</h3><p class="small">No service-specific rate is loaded for this corridor.</p><div class="receipt-row"><span>Carrier charge</span><strong>Not sourced</strong></div><div class="receipt-row"><span>Government charges</span><strong>Not established</strong></div><button class="text-link" data-action="evidence">View rate coverage</button></section>`;
  return `<section class="panel-section" id="receipt-region"><div class="receipt-topline"><h3>Carrier subtotal</h3>${pill("Published schedule")}</div>${q.status === "partial" ? `<div class="receipt-total" data-testid="receipt-total">${money(q.carrier)}<small>CAD</small></div><p class="receipt-label">Base transport only · ${precise(rate.rate)} CAD / m³</p>` : `<div class="callout amber" role="status">${esc(q.reason)} ${["unverified-date", "out-of-period"].includes(q.status) ? `<button class="text-link" data-action="rate-date">Use ${rate.effectiveFrom}</button>` : ""}</div>`}<div class="receipt-row"><span>Government charges</span><strong>Not established</strong></div><p class="micro">No tariff solely for crossing a provincial border. Other applicable charges are not included.</p><div class="price-caption"><span>Schedule · ${rate.effectiveFrom}</span><button class="text-link" data-action="receipt-evidence">Calculation & source</button></div><details id="receipt-conditions" class="disclosure"><summary>Carrier breakdown & conditions</summary><p class="micro">${esc(rate.commodity)} · ${esc(rate.service)}<br>Payable to ${esc(rate.operator)}</p>${rate.components
    .filter((c) => c.additive)
    .map(
      (c) =>
        `<div class="receipt-row"><span>${esc(c.name)}<small>${precise(c.rate)} CAD / m³</small></span><strong>${q.status === "partial" ? money(q.m3 * c.rate) : "Not calculated"}</strong></div>`,
    )
    .join(
      "",
    )}<p class="micro">Rate applicability is verified for ${rate.effectiveFrom} only. The pipeline reclamation surcharge is included in the variable toll. It is not an orphan-well cleanup payment.</p>${rate.destination.includes("Westridge") ? '<p class="micro">Marine and port charges are not included.</p>' : ""}<button class="secondary-button" data-action="export-receipt">Download receipt</button></details></section>`;
}

function journeyPanel() {
  return `<div class="panel-head"><h1>Transport costs</h1><p>Published pipeline rates, separated from government charges.</p></div><div class="panel-section">${routeSelect()}${shipmentFields()}</div>${receipt()}<div class="panel-section"><button class="secondary-button wide" data-action="benchmark-tolls">Browse CER benchmark tolls</button><p class="micro">Dated observations across pipeline systems. These do not change the shipment estimate.</p></div><div class="panel-section"><h3>Compare destinations</h3><p class="micro">Edmonton origin · light crude · same service and schedule. Delivery outcomes differ.</p>${data.tariffs.rates.map((rate) => `<button class="route-option ${rate.routeId === state.route ? "selected" : ""}" data-route="${rate.routeId}" aria-pressed="${rate.routeId === state.route}"><span><strong>${esc(rate.destination.split(",")[0])}</strong><span class="rate-strip"><i style="width:${(rate.rate / 90) * 100}%"></i></span></span><span class="route-cost">${precise(rate.rate)} <small>CAD / m³</small></span></button>`).join("")}<button class="primary-button wide" data-view="lab">Compare a cost scenario</button></div>`;
}

function wellFilters() {
  return `${field("Licence, well or recorded licensee", "well-search", `<input type="search" id="well-search" data-state="query" value="${esc(state.query)}" placeholder="Search the loaded records" autocomplete="off">`)}${field(
    "Province or territory",
    "province",
    `<select id="province" data-state="province">${[
      ["all", "All covered jurisdictions"],
      ...data.coverage.provinces.map(p => [p.code,p.name]),
    ]
      .map(([v, l]) => option(v, l, state.province))
      .join("")}</select>`,
  )}`;
}
function wellAdvancedFilters() {
  return `<div class="field-grid">${field(
    "Orphan designation",
    "orphan",
    `<select id="orphan" data-state="orphan">${[
      ["all", "All designations"],
      ["designated", "Recorded"],
      ["unknown", "Unknown"],
    ]
      .map(([v, l]) => option(v, l, state.orphan))
      .join("")}</select>`,
  )}${field(
    "Whole-well closure",
    "closure",
    `<select id="closure" data-state="closure">${[
      ["all", "All statuses"],
      ["abandoned", "Abandoned"],
      ["suspended", "Suspended"],
      ["active", "Active"],
      ["unknown", "Not established"],
    ]
      .map(([v, l]) => option(v, l, state.closure))
      .join("")}</select>`,
  )}</div>`;
}

function eventChart() {
  const counts = new Map();
  const cohort = data.wells.wells.filter(
    (w) => state.province === "all" || w.province === state.province,
  );
  cohort.forEach((w) =>
    (w.events || [])
      .filter((e) => state.eventType === "all" || e.type === state.eventType)
      .forEach((e) =>
        counts.set(
          e.date.slice(0, 4),
          (counts.get(e.date.slice(0, 4)) || 0) + 1,
        ),
      ),
  );
  const years = [...counts.keys()].sort();
  const max = Math.max(1, ...counts.values());
  return `<details id="event-options" class="events-explorer" ${state.eventYear !== "all" || state.eventType !== "all" ? "open" : ""}><summary class="small" style="cursor:pointer">Explore documented events</summary><p class="micro">Source event counts by year in the selected jurisdiction. This is not a reconstruction of historical inventories.</p>${field(
    "Recorded event type",
    "event-type",
    `<select id="event-type" data-state="eventType">${[
      ["all", "All recorded events"],
      ["orphan-designated", "Designation recorded"],
      ["abandoned", "Abandonment recorded"],
      ["reclaimed", "Reclamation recorded"],
      ["transferred", "Transfer recorded"],
    ]
      .map(([v, l]) => option(v, l, state.eventType))
      .join("")}</select>`,
  )}${years.length ? `<div class="event-bars" aria-label="Documented source events by year">${years.map((y) => `<div class="event-bar ${state.eventYear === y ? "active" : ""}" role="img" aria-label="${counts.get(y)} recorded ${counts.get(y) === 1 ? "event" : "events"} in ${y}"><span style="height:${Math.max(3, (counts.get(y) / max) * 62)}px"></span><small>${Number(y) % 10 === 0 ? y : ""}</small></div>`).join("")}</div>` : '<p class="small muted">This source does not include dated events.</p>'}${field("Show wells with an event in", "event-year", `<select id="event-year" data-state="eventYear">${option("all", "Any recorded year", state.eventYear)}${years.map((y) => option(y, `${y} · ${fmt(counts.get(y))} ${counts.get(y) === 1 ? "event" : "events"}`, state.eventYear)).join("")}</select>`)}</details>`;
}
function wellsPanel() {
  const provinceCoverage = data.coverage.provinces.find(p => p.code === state.province);
  const inventoryGap = state.province !== "all" && !data.catalog.sources.some(source => source.province === state.province);
  if (state.well) {
    const w = data.wells.wells.find((w) => w.id === state.well);
    if (w) return wellDetail(w);
  }
  const advanced =
    state.orphan !== "all" ||
    state.closure !== "all" ||
    state.eventYear !== "all" ||
    state.eventType !== "all";
  const scope = state.province === "all" ? "Published source layers from the provinces listed in Coverage" : (data.catalog.sources.filter(s => s.province === state.province).map(s => s.title).join("; ") || "No licensed inventory loaded for this province");
  const controls = wellFilters();
  return `<div class="panel-head"><h1>Well records</h1><p>Search source records for status and documented events.</p></div><div class="panel-section">${state.cohort === "cleanup" ? '<div class="callout">Closure-budget cohort active. Clear filters to browse all records.</div>' : ""}${controls}<div class="result-count" role="status"><span>${inventoryGap ? "Inventory not loaded" : `<strong>${fmt(filtered.length)}</strong> loaded ${filtered.length === 1 ? "record" : "records"}`}</span><button class="text-link" data-action="clear-well-filters">Clear filters</button></div><p class="coverage-note">${inventoryGap ? esc(provinceCoverage?.topics["well-inventory"].note || scope) : esc(scope) + ". Counts are not province-wide totals."} <button class="text-link" data-action="coverage">Coverage</button></p><details id="well-filter-options" class="disclosure" ${advanced ? "open" : ""}><summary>Status & event filters${advanced ? " · active" : ""}</summary>${wellAdvancedFilters()}${eventChart()}</details><button class="text-link" data-action="well-csv" ${inventoryGap ? "disabled" : ""}>Download filtered records</button></div><div class="well-results" aria-label="Matching well records">${
    filtered.length
      ? filtered
          .slice(0, resultLimit)
          .map(
            (w) =>
              `<button class="well-card" data-well="${esc(w.id)}"><strong>${esc(w.name)}</strong>${pill(w.province, "gray")} ${pill(statusNames[w.closureStatus] || w.closureStatus, "gray")} ${w.orphanStatus === "designated" ? pill("Orphan designation recorded", "amber") : ""}<small>${esc(w.locationLabel || w.license)}<br>${esc(w.operator || "Licensee not supplied")}</small></button>`,
          )
          .join("")
      : inventoryGap ? '<div class="empty"><h3>Coverage is unavailable</h3><p>This is a source-access or coverage gap, not a zero-well count.</p><button class="secondary-button" data-action="coverage">Inspect source requirements</button></div>' : '<div class="empty"><h3>No matching records</h3><p>Try a different licence or clear the filters. Missing coverage does not mean no wells exist.</p><button class="secondary-button" data-action="clear-well-filters">Clear all filters</button></div>'
  }${filtered.length > resultLimit ? '<button class="secondary-button wide" data-action="more-wells">Show 30 more records</button>' : ""}</div>`;
}

function wellDetail(w) {
  const events = eventTimeline(w);
  const source = data.catalog.sources.find(item => item.id === w.sourceId);
  const position = filtered.findIndex((record) => record.id === w.id);
  return `<div class="panel-head"><button class="text-link well-back" data-action="back-wells">← All matching wells</button><span class="eyebrow">${esc(w.province)} / SOURCE RECORD ${esc(w.sourceRecordId)}</span><h1>${esc(w.name)}</h1><p>${esc(w.locationLabel || "Surface location from the source record")}</p>${source?.observationsThrough ? `<p class="callout">Historical record · observations through ${esc(source.observationsThrough)}. Status is not verified as current.</p>` : ""}</div><div class="panel-section"><div class="record-row"><p class="record-label">Orphan designation</p><div class="record-value">${pill(statusNames[w.orphanStatus] || "Unknown", w.orphanStatus === "designated" ? "amber" : "gray")}</div></div><div class="record-row"><p class="record-label">Whole-well closure</p><div class="record-value">${pill(statusNames[w.closureStatus] || w.closureStatus)}</div></div><div class="record-row"><p class="record-label">Reclamation status as recorded</p><div class="record-value">${esc(w.reclamationStatus || "Not supplied")}</div></div><div class="record-row"><p class="record-label">Recorded licensee</p><div class="record-value">${esc(w.operator || "Not supplied")}</div></div><p class="micro">A recorded licensee is not proof of current ownership or liability. Orphan designation can coexist with abandonment, reclamation or a later transfer.</p><div class="action-row"><a class="primary-button" href="${esc(w.sourceUrl)}" target="_blank" rel="noopener">Open regulator record</a><button class="secondary-button" data-action="focus">Locate on map</button></div></div><div class="panel-section"><div class="record-navigation"><button data-next-well="-1" ${position <= 0 ? "disabled" : ""}>Previous record</button><button data-next-well="1" ${position < 0 || position >= filtered.length - 1 ? "disabled" : ""}>Next record</button></div><h3 style="margin-top:20px">Documented history</h3>${events.length ? `<ol class="timeline">${events.map((e) => `<li><time>${esc(e.date)}</time><strong>${esc(e.label)}</strong></li>`).join("")}</ol>` : '<p class="small muted">This source does not supply dated lifecycle events. No history has been inferred.</p>'}<p class="note">Only events explicitly recorded in the source appear here. Missing steps and dates remain unknown.</p></div><div class="panel-section"><h3>Evidence & coordinates</h3><div class="receipt-row"><span>Licence</span><span>${esc(w.license || "Not supplied")}</span></div><div class="receipt-row"><span>Latitude / longitude</span><span>${w.lat.toFixed(5)} / ${w.lon.toFixed(5)}</span></div><div class="receipt-row"><span>Snapshot retrieved</span><span>${esc(localDate(source?.retrievedAt || data.wells.retrievedAt))}</span></div>${sourceButton(w.sourceId)}<details style="margin-top:16px"><summary class="small">Original status fields</summary>${Object.entries(
    w.raw || {},
  )
    .map(
      ([k, v]) =>
        `<div class="record-row" style="margin-top:12px"><p class="record-label">${esc(k)}</p><div class="micro">${esc(v ?? "Not supplied")}</div></div>`,
    )
    .join("")}</details></div>`;
}
function labPanel() {
  return `<div class="panel-head"><h1>Scenarios</h1><div class="tab-switch" role="group" aria-label="Scenario type"><button data-lab="transport" class="${state.labTab === "transport" ? "active" : ""}" aria-pressed="${state.labTab === "transport"}">Transport costs</button><button data-lab="cleanup" class="${state.labTab === "cleanup" ? "active" : ""}" aria-pressed="${state.labTab === "cleanup"}">Closure budget</button></div></div>${state.labTab === "transport" ? transportLab() : cleanupLab()}<div class="panel-section"><h3>Save or export</h3><p class="micro">Named scenarios stay in this browser. Downloads include inputs, results and source references.</p><div class="action-row"><button class="primary-button" data-action="save-scenario">Save scenario</button><button class="secondary-button" data-action="saved-scenarios">Saved scenarios</button><button class="secondary-button" data-action="export-scenario">Download scenario</button><button class="text-link" data-action="reset-scenario">Reset assumptions</button></div></div>`;
}

function transportLab() {
  const base = getQuote(),
    alt = getQuote(true);
  const valid = base.status === "partial" && alt.status === "partial";
  const delta = valid ? alt.knownSubtotal - base.carrier : 0;
  return `<section class="panel-section sticky-result" id="scenario-results"><span class="eyebrow">SCENARIO SUBTOTAL · CAD</span>${state.scenario.closed ? '<h2 style="margin-top:10px">Corridor unavailable</h2><p class="micro">No verified alternative route is modeled. No shipment price is calculated.</p>' : valid ? `<div class="scenario-comparison"><div class="scenario-number" data-testid="scenario-subtotal">${money(alt.knownSubtotal)}</div><span class="delta">${delta >= 0 ? "+" : ""}${money(delta)}<small>vs. carrier baseline</small></span></div><p class="receipt-label">${money(base.carrier)} carrier baseline · actual government charges unknown</p>` : `<div class="callout amber" role="status">${esc(base.status === "partial" ? alt.reason : base.reason)}${getRate() && ["unverified-date", "out-of-period"].includes(base.status) ? '<button class="text-link" data-action="rate-date">Use the verified schedule date</button>' : ""}</div>`}</section><div class="panel-section"><div class="split-note"><h3>Change an assumption</h3>${pill("User assumptions", "amber")}</div><div class="field" style="margin-top:16px"><div class="range-top"><label for="toll-change">Carrier toll adjustment</label><output>${state.scenario.tollChange > 0 ? "+" : ""}${state.scenario.tollChange}%</output></div><input id="toll-change" data-scenario="tollChange" type="range" min="-100" max="200" step="5" value="${state.scenario.tollChange}"></div>${field("Additional government fee · assumed CAD / m³", "government-assumption", `<input id="government-assumption" data-scenario="extraGovernment" type="number" min="0" max="10000" step="0.1" value="${Number.isFinite(state.scenario.extraGovernment) ? state.scenario.extraGovernment : ""}">`)}<label class="toggle-line"><span>Make corridor unavailable</span><input id="corridor-closed" data-scenario="closed" type="checkbox" ${state.scenario.closed ? "checked" : ""}></label><p class="micro">A $0 fee assumption does not establish zero actual charges.</p><details id="baseline-settings" class="disclosure"><summary>Edit baseline shipment</summary>${routeSelect()}${shipmentFields()}</details><button class="text-link" data-action="receipt-evidence">Baseline calculation & source</button></div>`;
}

function cleanupLab() {
  const eligible = data.wells.wells.filter(isCleanupRecord),
    s = state.scenario;
  const q = cleanupScenario(s.budget, s.costLow, s.costHigh, eligible.length);
  return `<section class="panel-section sticky-result" id="cleanup-results"><span class="eyebrow">ILLUSTRATIVE BUDGET CAPACITY</span>${q.status === "invalid" ? '<div class="callout amber" role="alert">Enter a budget from 0 to 10 billion and positive costs up to 100 million. High cost must be at least the low cost.</div>' : `<div class="receipt-total" data-testid="cleanup-result">${fmt(q.low)}–${fmt(q.high)}</div><p class="receipt-label">potential well-record interventions · ${fmt(eligible.length)} eligible SK records</p>`}</section><div class="panel-section"><h3>Budget assumptions</h3>${field("Illustrative budget · CAD", "budget", `<input id="budget" data-scenario="budget" type="number" min="0" max="10000000000" step="100000" value="${Number.isFinite(s.budget) ? s.budget : ""}">`)}<div class="field-grid">${field("Low cost / record · CAD", "cost-low", `<input id="cost-low" data-scenario="costLow" type="number" min="1" max="100000000" step="5000" value="${Number.isFinite(s.costLow) ? s.costLow : ""}">`)}${field("High cost / record · CAD", "cost-high", `<input id="cost-high" data-scenario="costHigh" type="number" min="1" max="100000000" step="5000" value="${Number.isFinite(s.costHigh) ? s.costHigh : ""}">`)}</div><p class="micro">Editable costs, not measured cleanup costs or regulator estimates. A record may not be a unique site.</p><button class="secondary-button wide" data-action="view-cleanup-cohort">Inspect ${fmt(eligible.length)} eligible records</button><details id="cleanup-method" class="disclosure"><summary>Eligibility & calculation</summary><p class="micro">SK orphan inventory records marked reclamation required, excluding recorded transfer or reclamation events.</p><p class="micro">Floor of budget divided by high cost to floor of budget divided by low cost, capped at the source cohort. Shared-site work is not modeled. This does not predict completed or certified reclamation.</p></details></div>`;
}

function chooseRoute(id) {
  history.pushState(null, "", location.href);
  if (!data.network.routes.some((r) => r.id === id)) return;
  state.route = id;
  state.step = 1;
  state.layers[getRoute().commodity] = true;
  render();
  atlas.focus();
  persist();
}
function chooseStep(n) {
  state.step = n;
  render();
  atlas.step(n);
  persist();
}
function chooseWell(id) {
  history.pushState(null, "", location.href);
  setSurface("details");
  state.view = "wells";
  state.well = id;
  render();
  atlas.focus();
  persist();
  $("panel").scrollTop = 0;
  const heading = $("panel").querySelector("h1");
  heading?.setAttribute("tabindex", "-1");
  heading?.focus({ preventScroll: true });
}
function chooseView(view) {
  history.pushState(null, "", location.href);
  setSurface("details");
  state.view = view;
  state.well = null;
  render();
  atlas.focus();
  persist();
  $("panel").scrollTop = 0;
}
function openDialog(html, title) {
  $("evidence-body").innerHTML = html;
  const firstHeading = $("evidence-body").querySelector("h3");
  $("dialog-title").textContent =
    title || firstHeading?.textContent || "Sources and methods";
  if (firstHeading?.textContent === $("dialog-title").textContent)
    firstHeading.remove();
  if (!$("evidence-dialog").open) $("evidence-dialog").showModal();
  $("evidence-dialog").scrollTop = 0;
}
function showEvidence(id) {
  const list = id ? sources.filter((s) => s.id === id) : sources;
  openDialog(
    (!id
      ? `<div class="source-entry"><span class="eyebrow">DATA SOURCES</span><h3>Coverage and limitations</h3><p>Source snapshots are bundled with the app. Nothing on the map represents live flow, current price discovery, a complete national well inventory or engineering-grade infrastructure locations.</p>${coverageTable()}<p>Reported facts, scenario assumptions and unknown values remain separate. The route map uses illustrative corridors. Well markers use source coordinates.</p></div>`
      : "") +
      list
        .map(
          (s) =>
            `<article class="source-entry"><div class="source-meta">${esc(s.publisher)} ${s.asOf ? " · " + esc(s.asOf) : ""} ${s.observationsThrough ? " · Historical observations through " + esc(s.observationsThrough) : ""} ${s.retrievedAt ? " · Retrieved " + esc(s.retrievedAt) : ""}</div><h3>${esc(s.title)}</h3><a href="${esc(s.url)}" target="_blank" rel="noopener">Open original source</a>${s.method ? `<p><strong>Method.</strong> ${esc(textList(s.method))}</p>` : ""}${s.limitations ? `<p><strong>Limits.</strong> ${esc(textList(s.limitations))}</p>` : ""}${s.license ? `<p><strong>Licence.</strong> ${esc(s.license)}</p>` : ""}${
              s.definitions
                ? `<details><summary class="small">Normalization definitions</summary>${Object.entries(
                    s.definitions,
                  )
                    .map(
                      ([k, v]) =>
                        `<p><strong>${esc(k)}.</strong> ${esc(textList(v))}</p>`,
                    )
                    .join("")}</details>`
                : ""
            }</article>`,
        )
        .join(""),
  );
}
function showHistoricalInfrastructure() {
  const layer = data.historicalInfrastructure;
  const metadata = layer.metadata;
  const refineries = layer.features.filter(feature => feature.properties.kind === "refinery");
  openDialog(`<h3>Historical pipelines and refineries</h3><p>${esc(metadata.scope)}</p><p>${fmt(metadata.counts.pipeline)} pipeline segments and ${fmt(metadata.counts.refinery)} refinery points at 1:250,000 scale. Pipeline feature dates extend through ${esc(metadata.observationRanges.pipeline.latest.slice(0,4))}; refinery dates extend through ${esc(metadata.observationRanges.refinery.latest.slice(0,4))}. Archive modification date: ${esc(metadata.source.upstreamModifiedAt || "not supplied on this retrieval")}.</p><p>${esc(metadata.licence.attribution)} <a href="${esc(metadata.licence.url)}" target="_blank" rel="noopener">Licence</a>.</p><p><a href="data/context/historical-infrastructure.geojson" download>Download mapped features and source dates</a> · <a href="${esc(metadata.source.url)}" target="_blank" rel="noopener">Original NRCan archive</a></p><h3>Refinery records</h3><p>Historical locations. Current operating status is not established.</p>${refineries.map(feature => `<p><strong>${esc(feature.properties.name)}</strong><br>${esc(feature.properties.sourceDateMin)} to ${esc(feature.properties.sourceDateMax)} · ${feature.geometry.coordinates[1].toFixed(4)}, ${feature.geometry.coordinates[0].toFixed(4)}</p>`).join("")}`);
}
function benchmarkRows(index) {
  const system = data.benchmarkTolls.systems[index];
  if (!system) return '<p>No benchmark observations for this system.</p>';
  return `<p><strong>Observation date ${esc(system.latestObservationDate)}</strong><br>${fmt(system.snapshotRowCount)} observations on this date. Historical benchmarks are not current offers or all-in prices.</p><p><a href="${esc(system.source.url)}" target="_blank" rel="noopener">Download full CER history</a></p>${system.rows.map(row => `<article class="source-entry"><h3>${esc(row.Path || row['Pipeline Name'])}</h3><div class="receipt-row"><span>Published benchmark</span><strong>${esc(row.Toll)} ${esc(row.Unit)}</strong></div><p>${esc(row.Service)} · ${esc(row.Product)}<br>${esc(row['Corporate Entity'])}<br>Tariff ${esc(row['Tariff Number'] || 'not supplied')}</p></article>`).join("")}`;
}
function showBenchmarkTolls() {
  const tolls = data.benchmarkTolls;
  openDialog(`<h3>CER benchmark tolls</h3><p>${esc(tolls.scope)}</p><p>${esc(tolls.licence.attribution)} <a href="${esc(tolls.licence.url)}" target="_blank" rel="noopener">Licence</a>.</p>${field("Pipeline system", "benchmark-system", `<select id="benchmark-system" data-benchmark-system>${tolls.systems.map((system,index) => `<option value="${index}">${esc(system.name)}</option>`).join("")}</select>`)}<div id="benchmark-records">${benchmarkRows(0)}</div><p><a href="data/context/benchmark-tolls.json" download>Download all benchmark snapshots with provenance</a></p>`);
}

function coverageTable() {
  const statusLabel = {partial:"Partial coverage",unavailable:"Not available", "permission-required":"Permission required",complete:"Verified complete"};
  return `<p>National coverage is incomplete. Retrieval dates show when files were checked, not when the underlying records were last updated.</p><div class="table-scroll" role="region" aria-label="National well inventory coverage" tabindex="0"><table class="coverage-table"><thead><tr><th>Jurisdiction</th><th>Published records</th><th>Coverage</th></tr></thead><tbody>${data.coverage.provinces.map(p => {const loaded=data.catalog.sources.filter(s => s.province===p.code);return `<tr><td>${esc(p.name)}</td><td>${loaded.length ? fmt(loaded.reduce((n,s)=>n+s.count,0)) : "Not loaded"}</td><td>${esc(statusLabel[p.topics["well-inventory"].status] || p.topics["well-inventory"].status)}</td></tr>`;}).join("")}</tbody></table></div><h3>Source freshness</h3>${data.catalog.sources.map(s=>`<p><strong>${esc(s.title)}</strong><br>Retrieved ${esc(localDate(s.retrievedAt))} · ${snapshotFreshness(s.retrievedAt)==="stale"?"refresh overdue":"recent retrieval"}<br>${s.observationsThrough ? `Historical observations through ${esc(s.observationsThrough)}<br>` : ""}Source date: ${esc(s.sourceDateText || (typeof s.upstreamModifiedAt === "number" ? new Date(s.upstreamModifiedAt).toISOString() : s.upstreamModifiedAt) || "not supplied")}<br>${esc(s.limitations)}</p>`).join("")}<p><a href="data/national-coverage.json" target="_blank" rel="noopener">Download coverage and source register</a></p>`;
}
function showReceiptEvidence() {
  const rate = getRate(),
    q = getQuote();
  openDialog(
    `<div class="source-entry"><span class="eyebrow">CALCULATION</span><h3>${esc(getRoute().origin)} to ${esc(getRoute().destination)}</h3>${rate ? `<p>${esc(rate.commodity)}. ${esc(rate.service)}. Source page ${rate.page}.</p><p><strong>${fmt(state.volume)} ${state.unit === "m3" ? "m³" : "barrels"} × ${precise(rate.rate)} CAD/m³</strong>${state.unit === "bbl" ? " after converting barrels to cubic metres" : ""}.</p><p>One oil barrel is 0.158987294928 cubic metres. Currency is rounded for display after calculation.</p><p>${q.status === "partial" ? `Published base transport subtotal: ${money(q.carrier)} CAD.` : esc(q.reason)}</p><p><a href="${esc(rate.sourceUrl)}#page=${rate.page}" target="_blank" rel="noopener">Open the exact tariff schedule</a></p>${rate.conditions.map((c) => `<p>${esc(c)}</p>`).join("")}<p>Fixed and variable components are already included in the published rate. The pipeline reclamation surcharge is already inside the variable component. None of these amounts establishes an orphan-well cleanup contribution.</p>` : "<p>No source-backed rate is loaded for this route.</p>"}</div><div class="source-entry"><h3>Government charges are a separate question.</h3><p>No tariff applies simply because goods cross an internal provincial border. Other taxes, permits, port fees and transaction-specific charges need their own applicability check.</p><p><a href="https://www.canada.ca/en/intergovernmental-affairs/services/internal-trade/federal-investments-internal-trade.html" target="_blank" rel="noopener">Government of Canada internal trade explanation</a></p><p>Regulatory friction is not converted to an invented billable fee. General freight rates for rail, road and marine transport are not loaded.</p></div>`,
  );
}
function showFacility(f) {
  openDialog(
    `<div class="source-entry"><span class="eyebrow">${f.type === "lng" ? "LNG FACILITY" : "REFINERY"} / CITY-LEVEL MARKER</span><h3>${esc(f.name)}</h3><div class="receipt-total">${fmt(f.capacity)}</div><p>${esc(f.unit)} · capacity as listed in the CAPP map</p><p>Source date ${esc(f.asOf)}. ${esc(f.note)}</p><p>Capacity is not actual throughput or available shipping capacity. Do not add LNG tonnes and refinery barrels.</p>${sourceButton(f.sourceId)}</div>`,
  );
}
function exportFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(`${name} exported.`);
}
function exportReceipt() {
  const rate = getRate();
  exportFile(
    "canada-in-motion-receipt.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        route: getRoute(),
        inputs: { volume: state.volume, unit: state.unit, date: state.date },
        calculation: getQuote(),
        publishedRate: rate || null,
        governmentCharges:
          "Unknown except no border tariff solely for an internal provincial crossing.",
        allInTotal: null,
        sourceIds: [getRoute().sourceId, rate?.sourceId].filter(Boolean),
      },
      null,
      2,
    ),
    "application/json",
  );
}

function exportScenario() {
  const eligible = data.wells.wells.filter(isCleanupRecord);
  const s = state.scenario;
  const calculation =
    state.labTab === "cleanup"
      ? {
          kind: "closure-budget",
          result: cleanupScenario(
            s.budget,
            s.costLow,
            s.costHigh,
            eligible.length,
          ),
          cohortIds: eligible.map((w) => w.id),
          cohortDefinition:
            "SK, orphan designation recorded, reclamation Required, no recorded transfer or reclamation event",
          costStatus: "User assumptions, not measured cleanup costs",
        }
      : {
          kind: "shipment-cost",
          baseline: getQuote(),
          alternative: s.closed
            ? { status: "unavailable", rerouting: "Not modeled" }
            : getQuote(true),
          publishedRate: getRate() || null,
        };
  exportFile(
    "canada-in-motion-scenario.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        state,
        calculation,
        sourceIds: sources.map((s) => s.id),
        limitations: [
          "Scenario costs are assumptions.",
          "Additional actual fees remain unknown.",
          "No capacity allocation, alternative routing, dispatch or actual cleanup outcome is modeled.",
          "Complete published source layers do not establish complete provincial or national coverage.",
        ],
      },
      null,
      2,
    ),
    "application/json",
  );
}

function savedScenarios() {
  try {
    return JSON.parse(localStorage.getItem("cim-scenarios-v1") || "[]").filter(
      (s) => s && s.state,
    );
  } catch {
    return [];
  }
}
function saveScenarioDialog() {
  openDialog(
    `<div class="source-entry"><h3>Save scenario</h3><p>The inputs and source references stay together. Saved scenarios remain on this browser.</p>${field("Scenario name", "scenario-name", '<input id="scenario-name" type="text" maxlength="80" value="My scenario">')}<button class="primary-button" data-action="confirm-save">Save scenario</button></div>`,
  );
  setTimeout(() => $("scenario-name")?.focus(), 50);
}
function showSaved() {
  const list = savedScenarios();
  openDialog(
    `<div class="source-entry"><h3>Saved scenarios</h3>${list.length ? list.map((s, i) => `<button class="route-option" data-load-scenario="${i}"><span><strong>${esc(s.name)}</strong><small>${esc(localDate(s.createdAt))} · ${esc({ journey: "Transport costs", wells: "Well records", lab: s.state.labTab === "cleanup" ? "Closure budget" : "Transport scenario" }[s.state.view] || "Scenario")}</small></span><span>Open</span></button>`).join("") : "<p>No saved scenarios yet. Set an assumption in the lab, then save it here.</p>"}</div>`,
  );
}
function updateLiveResults() {
  const id =
    state.view === "journey"
      ? "receipt-region"
      : state.labTab === "cleanup"
        ? "cleanup-results"
        : "scenario-results";
  const target = $(id);
  if (!target) return;
  const template = document.createElement("template");
  template.innerHTML =
    state.view === "journey"
      ? receipt()
      : state.labTab === "cleanup"
        ? cleanupLab()
        : transportLab();
  const replacement = template.content.querySelector("#" + id);
  if (replacement) {
    const open = target.querySelector("details")?.open;
    if (open && replacement.querySelector("details"))
      replacement.querySelector("details").open = true;
    target.replaceWith(replacement);
  }
  if (state.view === "lab" && state.labTab === "transport") {
    const q = getQuote(true);
    const output = $("map-dock").querySelector("strong");
    if (output)
      output.textContent = state.scenario.closed
        ? "Corridor unavailable"
        : q.status === "partial"
          ? money(q.knownSubtotal)
          : "Estimate unavailable";
  }
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => {
    const result = $(id)?.querySelector(
      "[data-testid], [role=status], [role=alert]",
    );
    if (!$(id)) return;
    $("result-announcement").textContent =
      result?.textContent || "Result updated";
  }, 500);
  persist();
}

let searchTimer, resultTimer;
function setSurface(surface) {
  document.body.dataset.surface = surface;
  document.querySelectorAll("[data-surface]").forEach((button) => {
    if (button.tagName === "BUTTON")
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.surface === surface),
      );
  });
  if (surface === "map")
    requestAnimationFrame(() => {
      atlas.map.invalidateSize();
      atlas.focus();
    });
}

document.addEventListener("input", (e) => {
  if (!data) return;
  const t = e.target;
  if (t.dataset.state === "query") {
    state.query = t.value;
    state.well = null;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      render();
      persist();
    }, 180);
  }
  if (t.dataset.state && ["volume", "date"].includes(t.dataset.state)) {
    state[t.dataset.state] =
      t.type === "number" ? (t.value === "" ? NaN : Number(t.value)) : t.value;
    t.setAttribute(
      "aria-invalid",
      String(!t.checkValidity() || (t.type === "number" && t.value === "")),
    );
    updateLiveResults();
  }
  if (t.dataset.scenario) {
    state.scenario[t.dataset.scenario] =
      t.type === "checkbox"
        ? t.checked
        : t.value === ""
          ? NaN
          : Number(t.value);
    if (t.type === "range")
      t.previousElementSibling.querySelector("output").textContent =
        ((t.value === "" ? NaN : Number(t.value)) > 0 ? "+" : "") +
        t.value +
        "%";
    t.setAttribute(
      "aria-invalid",
      String(!t.checkValidity() || (t.type === "number" && t.value === "")),
    );
    updateLiveResults();
  }
});
document.addEventListener("change", (e) => {
  if (!data) return;
  const t = e.target;
  if (t.dataset.benchmarkSystem !== undefined) { $("benchmark-records").innerHTML = benchmarkRows(Number(t.value)); return; }
  if (t.dataset.state) {
    const key = t.dataset.state;
    if (key === "route") {
      chooseRoute(t.value);
      return;
    }
    state[key] = ["volume"].includes(key)
      ? t.value === ""
        ? NaN
        : Number(t.value)
      : t.value;
    if (validNumericInputs()) state = normalizeState(state);
    if (["province", "eventType"].includes(key)) state.eventYear = "all";
    if (
      [
        "province",
        "orphan",
        "closure",
        "query",
        "eventYear",
        "eventType",
      ].includes(key)
    ) {
      state.well = null;
      resultLimit = 30;
    }
    render();
    if (key === "province") atlas.focus();
    persist();
  }
  if (t.dataset.layer) {
    state.layers[t.dataset.layer] = t.checked;
    render();
    persist();
  }
  if (t.dataset.scenario) {
    state.scenario[t.dataset.scenario] =
      t.type === "checkbox"
        ? t.checked
        : t.value === ""
          ? NaN
          : Number(t.value);
    if (validNumericInputs()) state = normalizeState(state);
    render();
    persist();
  }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button,a.brand");
  if (!b || !data) return;
  if (b.matches("a.brand")) {
    e.preventDefault();
    chooseView("journey");
    return;
  }
  if (b.dataset.surface) {
    setSurface(b.dataset.surface);
    return;
  }
  if (b.dataset.nextWell) {
    const index =
      filtered.findIndex((w) => w.id === state.well) +
      Number(b.dataset.nextWell);
    if (filtered[index]) chooseWell(filtered[index].id);
    return;
  }
  if (b.dataset.facility) {
    showFacility(data.network.facilities[Number(b.dataset.facility)]);
    return;
  }
  if (b.dataset.view) {
    chooseView(b.dataset.view);
    return;
  }
  if (b.dataset.route) {
    chooseRoute(b.dataset.route);
    return;
  }
  if (b.dataset.step) {
    chooseStep(Number(b.dataset.step));
    return;
  }
  if (b.dataset.well) {
    chooseWell(b.dataset.well);
    return;
  }
  if (b.dataset.source) {
    showEvidence(b.dataset.source);
    return;
  }
  if (b.dataset.year) {
    state.eventYear = b.dataset.year;
    state.well = null;
    render();
    persist();
    return;
  }
  if (b.dataset.lab) {
    history.pushState(null, "", location.href);
    state.labTab = b.dataset.lab;
    render();
    persist();
    if (state.labTab === "cleanup")
      atlas.map.fitBounds(
        [
          [49, -110],
          [60, -101],
        ],
        { padding: [50, 100] },
      );
    return;
  }
  if (b.dataset.loadScenario) {
    const s = savedScenarios()[Number(b.dataset.loadScenario)];
    if (s) {
      state = restoreState(s.state);
      state.labTab = s.labTab || s.state.labTab || "transport";
      render();
      atlas.setCamera(state.camera);
      persist();
      $("evidence-dialog").close();
      announce("Saved scenario restored.");
    }
    return;
  }
  const a = b.dataset.action;
  if (a === "show-details") setSurface("details");
  if (a === "show-records") {
    if (state.view === "lab")
      document.querySelector('[data-action="view-cleanup-cohort"]').click();
    else setSurface("details");
  }
  if (a === "facilities")
    openDialog(
      `<div class="source-entry"><h3>Facilities</h3><p class="micro">Selected CAPP capacity records. Map markers represent localities.</p>${data.network.facilities.map((f, i) => `<button class="route-option" data-facility="${i}"><span><strong>${esc(f.name)}</strong><small>${esc(f.type)}</small></span><span>${fmt(f.capacity)}<small>${esc(f.unit)}</small></span></button>`).join("")}</div>`,
    );
  if (a === "evidence") showEvidence();
  if (a === "close-dialog") $("evidence-dialog").close();
  if (a === "focus") {
    setSurface("map");
    atlas.focus();
  }
  if (a === "extent") atlas.continent();
  if (a === "receipt-evidence") showReceiptEvidence();
  if (a === "export-receipt") exportReceipt();
  if (a === "rate-date") {
    state.date = getRate()?.effectiveFrom || DEFAULT_STATE.date;
    render();
    persist();
  }
  if (a === "back-wells") {
    const previous = state.well;
    state.well = null;
    render();
    document
      .querySelector(`[data-well="${CSS.escape(previous || "")}"]`)
      ?.focus();
    persist();
  }
  if (a === "more-wells") {
    resultLimit += 30;
    render();
  }
  if (a === "clear-well-filters") {
    Object.assign(state, {
      cohort: "all",
      province: "all",
      orphan: "all",
      closure: "all",
      query: "",
      eventYear: "all",
      eventType: "all",
      well: null,
    });
    render();
    atlas.focus();
    persist();
  }
  if (a === "retry-detail") { detailError = null; render(); return; }
  if (a === "retry-wells") { wellLoadError = null; render(); return; }
  if (a === "historical-infrastructure") showHistoricalInfrastructure();
  if (a === "benchmark-tolls") showBenchmarkTolls();
  if (a === "coverage")
    openDialog(
      `<div class="source-entry"><h3>Well-data coverage</h3>${coverageTable()}</div>`,
    );
  if (a === "well-csv")
    exportFile(
      "canada-in-motion-well-records.csv",
      csv(filtered, [
        "id",
        "name",
        "province",
        "license",
        "operator",
        "closureStatus",
        "orphanStatus",
        "reclamationStatus",
        "lat",
        "lon",
        "sourceId",
        "sourceUrl",
        "observationsThrough",
        "sourceRetrievedAt",
        "sourceDateDetail",
        "sourceLimitations",
      ]),
      "text/csv",
    );
  if (a === "save-scenario") saveScenarioDialog();
  if (a === "saved-scenarios") showSaved();
  if (a === "confirm-save") {
    if (!validNumericInputs()) {
      announce("Correct invalid inputs before saving this scenario.");
      return;
    }
    const list = savedScenarios();
    list.unshift({
      name: $("scenario-name").value.trim() || "Untitled scenario",
      createdAt: new Date().toISOString(),
      state: normalizeState(state),
      labTab: state.labTab,
    });
    try {
      localStorage.setItem(
        "cim-scenarios-v1",
        JSON.stringify(list.slice(0, 20)),
      );
      $("evidence-dialog").close();
      announce("Scenario saved in this browser.");
    } catch {
      announce(
        "This browser could not save the scenario. Use Export scenario.",
      );
    }
  }
  if (a === "reset-scenario") {
    state.scenario = { ...DEFAULT_STATE.scenario };
    render();
    persist();
  }
  if (a === "export-scenario") exportScenario();
  if (a === "view-cleanup-cohort") {
    setSurface("details");
    state.cohort = "cleanup";
    state.view = "wells";
    state.province = "SK";
    state.orphan = "designated";
    state.query = "";
    state.closure = "all";
    state.eventYear = "all";
    state.eventType = "all";
    state.well = null;
    render();
    atlas.focus();
    persist();
  }
  if (a === "share") {
    if (!validNumericInputs()) {
      announce("Correct invalid inputs before copying a view link.");
      return;
    }
    const url = location.origin + location.pathname + encodeState(state);
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      announce("View link copied. Local links work on this computer.");
    } catch {
      openDialog(
        `<div class="source-entry"><h3>Copy this view link.</h3><p>A localhost link works on this computer. A hosted copy would use its hosted address.</p><textarea readonly style="width:100%;height:120px">${esc(url)}</textarea></div>`,
      );
    }
  }
  if (a === "about")
    openDialog(
      `<div class="source-entry"><span class="eyebrow">CANADA IN MOTION</span><h3>Energy, land and trade in one evidence atlas.</h3><p>Follow a shipment corridor and inspect a published toll. Explore real well records and their documented events. Compare scenarios without rewriting the source facts.</p><p>This is a noncommercial public-resource release candidate built from dated source snapshots. It does not claim live flow, a complete national well inventory, operational route availability or all-in shipment pricing.</p><p>Searches and scenarios stay in this browser. This application has no analytics or advertising trackers. Hosting providers may retain access logs. Use a private browser window to avoid retaining scenarios on a shared device.</p><p><a href="https://github.com/the-prairie/canada-in-motion" target="_blank" rel="noopener">Project repository</a>. Source records retain their original licences. AER data is reproduced for noncommercial use with attribution and is not an official version or endorsement.</p><p>Use the source tools for coverage and method. Save a view to retain inputs, export records for independent analysis, or export a receipt to inspect its calculation.</p><div class="action-row"><button class="primary-button" data-action="evidence">Inspect the evidence</button></div></div>`,
    );
});
boot().catch((error) => {
  $("panel").innerHTML =
    `<div class="empty"><h2>The atlas could not load.</h2><p>${esc(error.message)}</p><p>Run the app through its included local server, then reload. Source files must remain in the data folder.</p><button class="primary-button" onclick="location.reload()">Try again</button></div>`;
  $("snapshot-label").textContent = "Source loading failed";
  console.error(error);
});
