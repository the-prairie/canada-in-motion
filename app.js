import { DESTINATIONS, currentDestination, destinationState } from "./navigation-model.mjs";
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
import { wellStatusSummary, comparisonWidths, revealPanel } from "./insights.mjs";
import { AtlasMap } from "./map.js";
import { EnergyEconomy } from "./energy-economy.js";
import { RecordAtlas } from "./record-atlas.js";
import { STATUSES, statusAvailability, inventoryScope, summarize as summarizeWellInventory } from "./atlas-model.mjs";
import { validateAlbertaWellStatus } from "./alberta-status-model.mjs";
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
  recordAtlas,
  energyEconomy,
  provinceGeometry,
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
let bcPromise = null, historicalPromise = null, dialogRevision = 0;
let wellsReady = false, wellsLoading = false, wellLoadError = null, detailLoadingId = null, detailError = null;
let wellInventory = null, albertaTotalsPromise = null, albertaTotalsError = false;
async function boot() {
  const [
    network,
    catalog,
    tariffs,
    coverage,
    tariffSources,
    countries,
    provinces,
  ] = await Promise.all(
    [
      "data/network.json",
      "data/catalog.json",
      "data/tariffs.json",
      "data/national-coverage.json",
      "data/tariff-sources.json",
      "data/countries.geojson",
      "data/provinces.geojson",
    ].map(fetchJSON),
  );
  provinceGeometry = provinces;
  const wells = { wells: [], retrievedAt: catalog.retrievedAt, coverage: catalog.sources.map(source => ({province:source.province, sourceId:source.id, included:source.count, totalAvailable:source.sourceCount, scope:source.scope, note:source.limitations})) };
  data = { network, wells, tariffs, catalog, coverage, historicalInfrastructure: null, benchmarkTolls: null, bcInfrastructure: null };
  sources = [...network.sources, ...catalog.sources, ...tariffSources];
  if (!network.routes.some((r) => r.id === state.route))
    state.route = DEFAULT_STATE.route;

  atlas = new AtlasMap(
    network,
    { countries, provinces },
    {
      onRoute: (id) => chooseRoute(id),
      onStep: (n) => chooseStep(n),
      onWell: (id) => chooseWell(id),
      onFacility: showFacility,
      onBCFeature: showBCFeature,
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
async function ensureHistoricalData() {
  if (data.historicalInfrastructure) return data.historicalInfrastructure;
  if (!historicalPromise) historicalPromise = fetchJSON('data/context/historical-infrastructure.geojson').then(layer => {
    data.historicalInfrastructure = layer;
    atlas.setHistorical(layer);
    render();
    return layer;
  }).catch(error => { historicalPromise = null; state.layers.historical = false; render(); announce('The historical layer could not load. Turn it on again to retry.'); throw error; });
  return historicalPromise;
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
function persist(mode = "replace") {
  if (!validNumericInputs()) return;
  const next = location.pathname + encodeState(state);
  if (mode === "push" && next !== location.pathname + location.hash) history.pushState(null, "", next);
  else history.replaceState(null, "", next);
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
    wellInventory = summarizeWellInventory(data.wells.wells);
    atlas.setRecords(data.wells.wells);
    wellsReady = true;
    if (state.well) {
      const well = data.wells.wells.find(w => w.id === state.well);
      if (!well) state.well = null;
    }
  } catch (error) { wellLoadError = error.message; wellsReady = false; }
  finally { wellsLoading = false; render(); if (wellsReady && ["wells", "lab"].includes(state.view)) atlas.focus(); }
}
function wellRecordScope() {
  const selected = STATUSES.findIndex(item => item.id === state.closure);
  const availability = statusAvailability(data.catalog, state.province, wellInventory || summarizeWellInventory([]));
  return {
    ...inventoryScope(data.catalog, state.province),
    status: selected >= 0 ? STATUSES[selected].label : "",
    outsideScope: selected >= 0 && !availability[selected],
  };
}
async function ensureAlbertaTotals() {
  if (data.albertaWellStatus || albertaTotalsPromise) return albertaTotalsPromise;
  albertaTotalsError = false;
  albertaTotalsPromise = fetchJSON("data/alberta-well-status.json")
    .then(value => { data.albertaWellStatus = validateAlbertaWellStatus(value); })
    .catch(() => { albertaTotalsError = true; })
    .finally(() => {
      albertaTotalsPromise = null;
      if (state.view === "wells" && state.province === "AB" && !state.well) render();
    });
  return albertaTotalsPromise;
}
function albertaCountEvidence() {
  if (state.province !== "AB") return "";
  const totals = data.albertaWellStatus;
  if (!totals) return albertaTotalsError
    ? '<p>Alberta’s provincial totals could not load. <button class="text-link" data-action="retry-alberta-totals">Retry totals</button></p>'
    : '<p role="status">Loading AER’s provincial totals…</p>';
  const row = totals.latest;
  return `<p class="well-provincial-counts"><strong>${fmt(row.counts.active)} active</strong> and <strong>${fmt(row.counts.marginal)} marginal</strong> well licences in AER’s ${row.year} snapshot (${fmt(row.operating)} operating licences in total).</p><p class="small">Province-wide totals; your search and map filters do not apply.</p>`;
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
function renderNavigation() {
  const current = currentDestination(state);
  $("location-group").textContent = current.group;
  $("location-label").textContent = current.label;
  $("location-button").setAttribute("aria-label", `${current.group}: ${current.label}. Change view`);
  $("header-ask").hidden = state.view !== "economy";
  document.title = `${current.label} | Canada in Motion`;
  const nav = $("destination-list");
  if (!nav.children.length) nav.innerHTML = [...new Set(DESTINATIONS.map(item => item.group))].map((group, i) => `<section aria-labelledby="navigation-group-${i}"><h3 id="navigation-group-${i}">${esc(group)}</h3>${DESTINATIONS.filter(item => item.group === group).map(item => `<button ${item.section ? `id="ec-section-${item.section}"` : ''} data-page="${item.id}">${esc(item.label)}</button>`).join('')}</section>`).join('');
  nav.querySelectorAll('[data-page]').forEach(button => {
    if (button.dataset.page === current.id) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}
function chooseDestination(id) {
  state = destinationState(state, id);
  energyEconomy?.showData();
  $("navigation-dialog").close();
  chooseView(state.view, state.labTab);
  window.scrollTo({top: 0, behavior: 'instant'});
}
$("navigation-dialog").addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const buttons = [...$("navigation-dialog").querySelectorAll('button')];
  const first = buttons[0], last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
  else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
});
$("navigation-dialog").addEventListener('close', () => $("location-button").setAttribute('aria-expanded', 'false'));
function showEconomicEvidence() {
  const snapshot = energyEconomy?.data;
  if (!snapshot) {announce("Economic sources are still loading.");return;}
  openDialog(`<p>GDP is observed in ${snapshot.gdp.year}. Energy Futures 2026 contains conditional projections through 2050. The national oil-price experiment uses Finance Canada’s 2026 calibration.</p>${snapshot.sources.map(source => `<section class="source-entry"><h3>${esc(source.title)}</h3><p><a href="${esc(source.url)}" target="_blank" rel="noopener">Open source</a></p></section>`).join("")}<h3>Calculation limits</h3><ul>${snapshot.limitations.map(note => `<li>${esc(note)}</li>`).join("")}</ul>`, "Economic sources & methods");
}
function showRateCoverage() {
  const route = getRoute();
  openDialog(`<p class="eyebrow">${esc(route.name || route.id)}</p><h3>${esc(route.origin)} → ${esc(route.destination)}</h3><p>No service-specific carrier rate is loaded for this corridor. A comparable quote needs the commodity, service, origin, destination, effective date and unit.</p><p>Government charges have not been established for this shipment. The app cannot calculate its total transport cost.</p><button class="secondary-button" data-action="benchmark-tolls">Browse published benchmark tolls</button><p class="micro">Benchmark observations cover different services and dates. They cannot substitute for a shipment quote.</p>`, "Rate coverage for this corridor");
}
function render() {
  const exploring = state.view === "atlas";
  document.body.dataset.view = state.view;
  const economy = state.view === "economy";
  $("energy-economy").hidden = !economy;
  $("record-atlas").hidden = !exploring;
  document.querySelector(".workspace").hidden = exploring || economy;
  document.querySelector(".skip-link").href = economy ? "#energy-economy" : exploring ? "#record-atlas" : "#panel";
  renderNavigation();
  if (!economy) energyEconomy?.deactivate?.();
  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("selected", button.dataset.view === state.view);
    button.setAttribute("aria-current", button.dataset.view === state.view ? "page" : "false");
  });
  $("coverage-line").textContent = `${fmt(data.catalog.totalRecords)} records · ${new Set(data.catalog.sources.map(source => source.province)).size} jurisdictions · coverage gaps`;
  recordAtlas?.setVisible(exploring);
  if (economy) {
    clearTimeout(resultTimer);
    if (!energyEconomy) energyEconomy = new EnergyEconomy($("energy-economy"), {provinces:provinceGeometry,onChange: value => {state.economy = value;renderNavigation();persist("push");},onInventory: province => {state.province = province;state.cohort="all";state.query="";state.orphan="all";state.closure="all";state.eventYear="all";state.eventType="all";state.exploration.area=null;chooseView("atlas");}});
    $("coverage-line").textContent = "Economic sources & methods";
    $("snapshot-label").textContent = "Observation dates and forecasts are labelled in each view";
    energyEconomy.update(state.economy);
    return;
  }
  $("snapshot-label").textContent = state.view === "journey" ? "" : `${snapshotFreshness(data.catalog.retrievedAt) === "stale" ? "Refresh overdue" : "Retrieved"} · ${localDate(data.catalog.retrievedAt)}`;
  if (exploring) {
    clearTimeout(resultTimer);
    if (!wellsReady) {
      $("record-atlas").innerHTML = `<div class="empty"><h1>${wellLoadError ? "Inventory unavailable" : "Loading well inventories"}</h1><p role="status">${wellLoadError ? esc(wellLoadError) : "Loading published records for the atlas."}</p>${wellLoadError ? '<button data-action="retry-wells" class="primary-button">Retry inventory</button>' : ""}</div>`;
      if (!wellLoadError) void ensureWellData();
      return;
    }
    filtered = filterWells(data.wells.wells, state);
    if (!recordAtlas) recordAtlas = new RecordAtlas($("record-atlas"), {
      wells: data.wells.wells, provinces: provinceGeometry, catalog: data.catalog,
      onChange: patch => { state = normalizeState({...state, ...patch, well:null}); render(); persist("push"); },
      onRecords: () => chooseView("wells"), onExport: exportWellRecords,
      onWell: inspectAtlasWell, onSource: showEvidence,
    });
    recordAtlas.setVisible(true);
    recordAtlas.update(state, filtered);
    return;
  }
  if (state.view!=="journey" && state.layers.bcPermits && !data.bcInfrastructure) void ensureBCData().catch(() => {});
  if (state.view!=="journey" && state.layers.historical && !data.historicalInfrastructure) void ensureHistoricalData().catch(() => {});
  const selectedRecord = wellsReady && state.view === "wells" && state.well ? data.wells.wells.find(w => w.id === state.well) : null;
  if (selectedRecord && !selectedRecord._detailLoaded) {
    const error = detailError?.id === selectedRecord.id ? detailError.message : null;
    $("panel").innerHTML = `<div class="panel-head"><button class="text-link" data-action="back-wells">← All matching wells</button><h1>${esc(selectedRecord.name)}</h1><p role="status">${error ? esc(error) : "Loading the regulator record…"}</p>${error ? '<button class="primary-button" data-action="retry-detail">Retry record</button>' : ""}</div>`;
    if (!error) void ensureSelectedDetail(selectedRecord);
    return;
  }
  const needsWells = state.view === "wells" || (state.view === "lab" && state.labTab === "cleanup") || (state.view!=="journey" && state.layers.wells);
  if (needsWells && !wellsReady) {
    document.querySelectorAll("[data-view]").forEach(b => {b.classList.toggle("selected",b.dataset.view===state.view);b.setAttribute("aria-current",b.dataset.view===state.view?"page":"false");});
    $("panel").innerHTML = `<div class="panel-head"><h1>${wellLoadError ? "Inventory unavailable" : "Loading well inventories"}</h1><p>${wellLoadError ? esc(wellLoadError) : "Loading well records. Details will load when you select a well."}</p>${wellLoadError ? '<button data-action="retry-wells" class="primary-button">Retry inventory</button>' : '<p role="status">Loading…</p>'}</div>`;
    if (!wellLoadError) void ensureWellData();
    return;
  }

  clearTimeout(resultTimer);
  $("result-announcement").textContent = "";
  const active = document.activeElement,
    activeId = active?.id,
    activeControl = active?.matches("button")
      ? ["view", "lab", "action", "nextWell", "statusFilter", "route", "step"]
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
  const recordScope = state.view === "wells" ? wellRecordScope() : {outsideScope:false};
  document.body.dataset.view = state.view;
  $("map-eyebrow").textContent = wellMode
    ? "WELL RECORDS"
    : "ENERGY INFRASTRUCTURE";
  $("map-title").textContent = wellMode
    ? state.well
      ? data.wells.wells.find((w) => w.id === state.well)?.name
      : inventoryGap ? "Inventory not loaded" : recordScope.outsideScope ? `${recordScope.status} wells not mapped` : `${fmt(filtered.length)} loaded well ${filtered.length === 1 ? "record" : "records"}`
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
  layerItems.push(["bcPermits", "BC pipeline & facility permits", "layer-line bc-permit"]);
  layerItems.push(["historical", "Historical pipelines & refineries", "layer-line"]);
  $("layer-inputs").innerHTML =
    layerItems
      .map(
        ([key, label, cl]) =>
          `<label class="check-row"><input type="checkbox" data-layer="${key}" ${state.layers[key] ? "checked" : ""}><span class="${cl}"></span>${label}</label>`,
      )
      .join("") +
    '<button class="text-link" data-action="facilities">Browse six featured facilities</button><button class="text-link" data-action="historical-infrastructure">Historical layer dates & sources</button><button class="text-link" data-action="bc-infrastructure">BC permit records & sources</button>';
  $("map-legend").innerHTML = wellMode
    ? '<span><i class="wells"></i>Orphan recorded</span><span><i class="context"></i>Designation unknown</span><span><i class="mixed-key"></i>Mixed cluster</span>'
    : `${state.layers[getRoute().commodity] ? '<span><i class="selected-route"></i>Selected corridor</span>' : ""}${state.layers.oil ? "<span><i></i>Oil</span>" : ""}${state.layers.gas ? '<span><i class="gas"></i>Gas</span>' : ""}${state.layers.facilities ? "<span>◇ Approximate facility location</span>" : ""}${state.layers.wells ? '<span><i class="wells"></i>Well records</span>' : ""}`;
  if (state.layers.bcPermits) $("map-legend").innerHTML += '<span><i class="bc-permit"></i>BC permit records · operation unknown</span>';
  if (state.layers.historical) $("map-legend").innerHTML += '<span><i class="historical-line"></i>Historical pipeline</span><span><i class="historical-point"></i>Historical refinery</span>';
  $("layer-inputs").insertAdjacentHTML(
    "beforeend",
    `<div class="layer-key"><strong>Map key</strong>${$("map-legend").innerHTML}</div>`,
  );
  $("map-source-label").textContent =
    state.view === "lab" && state.labTab === "cleanup"
      ? "Saskatchewan records used in the budget scenario. Locations from the source."
      : state.view === "wells"
        ? recordScope.outsideScope ? recordScope.detail : "Clusters count source records, not unique sites."
        : state.view === "journey" ? "Schematic route · not a pipeline alignment." : "Schematic routes. Facility markers show approximate locations.";
  if (state.view!=="journey" && state.layers.historical && data.historicalInfrastructure) $("map-source-label").textContent += ` Historical CanVec overlay: pipelines through ${data.historicalInfrastructure.metadata.observationRanges.pipeline.latest.slice(0,4)}, refineries through ${data.historicalInfrastructure.metadata.observationRanges.refinery.latest.slice(0,4)}; current operation unknown.`;
  $("coverage-line").textContent = state.view === "journey" ? "Data coverage" :
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
        ? `<div class="dock-summary"><div><strong>${inventoryGap ? "Not loaded" : recordScope.outsideScope ? "Not mapped" : fmt(filtered.length)}</strong><small>${state.labTab === "cleanup" && state.view === "lab" ? "SK records eligible for this budget scenario" : recordScope.outsideScope ? `${esc(recordScope.status)} wells outside source coverage` : "loaded records matching filters"}</small></div><button data-action="show-records">${recordScope.outsideScope ? "View coverage" : "View records"}</button></div>`
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
    const replacement = [...document.querySelectorAll("button")].find((button) => button.dataset[key] === value) || (key === "statusFilter" ? document.querySelector("[data-status-filter=designated]") : null);
    replacement?.focus({ preventScroll: true });
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
  return `<nav class="journey-stages" aria-label="Shipment stages">${[['Shipment',r.origin.split(',')[0]],['Carrier charge',r.name.split(' · ')[0]],['Destination',r.destination.split(',')[0]]].map(([label,name],i)=>`<button class="stage ${state.step===i?'active':''}" data-step="${i}" aria-pressed="${state.step===i}"><span class="stage-index">${i+1}</span><span><small>${label}</small><strong>${esc(name)}</strong></span></button>`).join('')}</nav>`;
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
    return `<section class="panel-section" id="receipt-region"><h3>Transport estimate unavailable</h3><p class="small">No service-specific rate is loaded for this corridor.</p><div class="receipt-row"><span>Carrier charge</span><strong>Not sourced</strong></div><div class="receipt-row"><span>Government charges</span><strong>Not established</strong></div><button class="text-link" data-action="rate-coverage">View rate coverage</button></section>`;
  return `<section class="panel-section" id="receipt-region"><div class="receipt-topline"><h3>Carrier subtotal</h3>${pill("Published schedule")}</div>${q.status === "partial" ? `<div class="receipt-total" data-testid="receipt-total">${money(q.carrier)}<small>CAD</small></div><p class="receipt-label">Base transport only · ${precise(rate.rate)} CAD / m³</p>` : `<div class="callout amber" role="status">${esc(q.reason)} ${["unverified-date", "out-of-period"].includes(q.status) ? `<button class="text-link" data-action="rate-date">Use ${rate.effectiveFrom}</button>` : ""}</div>`}<div class="receipt-row"><span>Government charges</span><strong>Not established</strong></div><p class="micro">No tariff solely for crossing a provincial border. Other applicable charges are not included.</p><div class="price-caption"><span>Schedule · ${rate.effectiveFrom}</span></div></section>`;
}

function destinationComparison() {
  const widths = comparisonWidths(data.tariffs.rates.map(rate => rate.rate));
  return data.tariffs.rates.map((rate, i) => `<button class="route-option ${rate.routeId === state.route ? "selected" : ""}" data-route="${rate.routeId}" aria-pressed="${rate.routeId === state.route}"><span><strong>${esc(rate.destination.split(",")[0])}</strong><span class="rate-strip"><i style="width:${widths[i]}%"></i></span></span><span class="route-cost">${precise(rate.rate)} <small>CAD / m³</small></span></button>`).join("");
}
function journeyPanel() {
  const route=getRoute(),rate=getRate();
  const stage=state.step===0?`<section class="panel-section shipment-form"><h2>Your shipment</h2>${rate?shipmentFields():'<p>No service-specific rate is loaded for this corridor.</p>'}<button class="primary-button wide" data-step="1">See carrier charge →</button></section>`:state.step===1?`${receipt()}<section class="panel-section"><button class="text-link" data-step="0">Edit shipment · ${fmt(state.volume)} ${state.unit==='m3'?'m³':'bbl'}</button><button class="primary-button wide" data-step="2">Compare destinations →</button></section>`:`<section class="panel-section destination-section"><h2>${esc(route.destination.split(',')[0])}</h2>${rate?`<p>${esc(rate.commodity)} · ${esc(rate.service)} · ${rate.effectiveFrom}</p>${destinationComparison()}<button class="primary-button wide" data-workspace="lab" data-tab="transport">Test a cost scenario →</button>`:'<p>No comparable destination rates are loaded for this corridor.</p><button class="text-link" data-action="rate-coverage">Rate coverage</button>'}</section>`;
  return `<div class="panel-head"><h1>Transport costs</h1>${routeSelect()}</div><div class="transport-stage" aria-live="polite">${stage}</div><div class="panel-section transport-actions"><button class="text-link" data-action="benchmark-tolls">Other pipeline tolls</button><button class="text-link" data-action="receipt-evidence">Sources & calculation</button></div>`;
}

function wellFilters() {
  return `${field("Well name, ID or company", "well-search", `<input type="search" id="well-search" data-state="query" value="${esc(state.query)}" placeholder="Search the loaded records" autocomplete="off">`)}${field(
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
  return `<details id="event-options" class="events-explorer" ${state.eventYear !== "all" || state.eventType !== "all" ? "open" : ""}><summary class="small" style="cursor:pointer">Events by year</summary><p class="micro">Recorded events by year for this jurisdiction. The bars count events, not the number of wells operating that year.</p>${field(
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
function wellInsights(unavailable) {
  if (unavailable) return '';
  const records = filterWells(data.wells.wells, {...state, closure:'all', orphan:'all'});
  const counts = wellStatusSummary(records);
  return `<section class="well-insights" aria-label="Orphan and abandonment counts for the selected records"><div class="split-note"><h3>Orphan and abandoned wells</h3><button class="text-link" data-action="status-guide" aria-label="Explain orphan designation and abandonment">Definitions ↗</button></div><p class="micro">Counts use your location, search and event filters. Some wells have both statuses.</p><div class="status-pair"><button data-status-filter="designated" aria-pressed="${state.orphan==='designated' && state.closure==='all'}"><span class="status-symbol orphan-symbol" aria-hidden="true">◇</span><strong>${fmt(counts.designated)}</strong><span>Designated<br>orphan</span></button><button data-status-filter="abandoned" aria-pressed="${state.closure==='abandoned' && state.orphan==='all'}"><span class="status-symbol closure-symbol" aria-hidden="true">○</span><strong>${fmt(counts.abandoned)}</strong><span>Recorded as<br>abandoned</span></button></div><button class="overlap-filter" data-status-filter="both" aria-pressed="${state.closure==='abandoned' && state.orphan==='designated'}"><span>${fmt(counts.both)} ${counts.both === 1 ? "record has" : "records have"} both statuses</span><span aria-hidden="true">↗</span></button>${state.closure!=='all'||state.orphan!=='all'?'<button class="text-link" data-status-filter="all">Clear status selection</button>':''}</section>`;
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
  const scope = state.province === "all" ? "Records from the sources listed in Coverage" : (data.catalog.sources.filter(s => s.province === state.province).map(s => s.title).join("; ") || "No well inventory is available in the app for this jurisdiction");
  const controls = wellFilters();
  const recordScope = wellRecordScope();
  if (state.province === "AB" && recordScope.outsideScope && !data.albertaWellStatus && !albertaTotalsPromise && !albertaTotalsError) void ensureAlbertaTotals();
  const outsideScopeMessage = `<div class="empty well-scope-gap"><h3>${esc(recordScope.status)} wells are not mapped for ${esc(provinceCoverage?.name || state.province)}</h3><p>${esc(recordScope.detail)}</p>${albertaCountEvidence()}<div class="action-row"><button class="secondary-button" data-action="clear-closure-filter">Clear status filter</button><button class="text-link" data-action="province-well-totals">${state.province === "AB" ? "View Alberta totals" : "View province inventory"}</button></div></div>`;
  return `<div class="panel-head well-list-heading"><h1>Find a well</h1><div class="result-count" role="status"><span>${inventoryGap ? "Inventory not loaded" : recordScope.outsideScope ? `${esc(recordScope.status)} wells not mapped` : `<strong>${fmt(filtered.length)}</strong> matching ${filtered.length === 1 ? "record" : "records"}`}</span><button class="text-link" data-action="clear-well-filters">Reset</button></div></div><div class="panel-section well-search-controls">${state.cohort === "cleanup" ? '<div class="callout">Closure-budget records. Reset to browse all inventories.</div>' : ""}${state.exploration.area ? '<div class="callout">Within the selected map area. <button class="text-link" data-action="clear-atlas-area">Clear area</button></div>' : ""}${controls}<details id="well-filter-options" class="disclosure"><summary>Status & event filters${advanced ? ` · ${esc([state.orphan !== "all" ? "orphan " + state.orphan : "", state.closure !== "all" ? state.closure : "", state.eventYear !== "all" ? state.eventYear : "", state.eventType !== "all" ? state.eventType : ""].filter(Boolean).join(" / "))}` : ""}</summary>${wellAdvancedFilters()}${eventChart()}</details><details id="well-source-scope" class="disclosure"><summary>Source coverage & status counts</summary><p class="coverage-note">${inventoryGap ? esc(provinceCoverage?.topics["well-inventory"].note || scope) : esc(scope) + ". Counts cover these sources only."} <button class="text-link" data-action="coverage">Coverage</button></p>${wellInsights(inventoryGap)}</details><button class="text-link" data-action="well-csv" ${inventoryGap || recordScope.outsideScope || !filtered.length ? "disabled" : ""}>Download matching records</button></div><div class="well-results" aria-label="Matching well records">${
    filtered.length
      ? filtered
          .slice(0, resultLimit)
          .map(
            (w) =>
              `<button class="well-card" data-well="${esc(w.id)}"><strong>${esc(w.name)}</strong>${pill(w.province, "gray")} ${w.observationsThrough ? pill("Historical", "amber") : ""} ${pill(statusNames[w.closureStatus] || w.closureStatus, "gray")} ${w.orphanStatus === "designated" ? pill("Orphan designation recorded", "amber") : ""}<small>${esc(w.locationLabel || w.license)}<br>${esc(w.operator || "Company not supplied")}</small></button>`,
          )
          .join("")
      : inventoryGap ? '<div class="empty"><h3>No inventory loaded</h3><p>The app has no well records for this jurisdiction yet. Its well count is unknown.</p><button class="secondary-button" data-action="coverage">View coverage details</button></div>' : recordScope.outsideScope ? outsideScopeMessage : '<div class="empty"><h3>No matching records</h3><p>Try another well name or ID, or clear the filters. Results cover the sources listed above.</p><button class="secondary-button" data-action="clear-well-filters">Clear all filters</button></div>'
  }${filtered.length > resultLimit ? '<button class="secondary-button wide" data-action="more-wells">Show 30 more records</button>' : ""}</div>`;
}

function wellDetail(w) {
  const events = eventTimeline(w);
  const source = data.catalog.sources.find(item => item.id === w.sourceId);
  const position = filtered.findIndex((record) => record.id === w.id);
  return `<div class="panel-head"><button class="text-link well-back" data-action="back-wells">← All matching wells</button><span class="eyebrow">${esc(w.province)} / SOURCE RECORD ${esc(w.sourceRecordId)}</span><h1>${esc(w.name)}</h1><p>${esc(w.locationLabel || "Surface location from the source record")}</p>${source?.observationsThrough ? `<p class="callout">${esc(historicalNote(source))}</p>` : ""}</div><div class="panel-section"><div class="record-row"><p class="record-label">Orphan designation</p><div class="record-value">${pill(statusNames[w.orphanStatus] || "Unknown", w.orphanStatus === "designated" ? "amber" : "gray")}</div></div><div class="record-row"><p class="record-label">Whole-well closure</p><div class="record-value">${pill(statusNames[w.closureStatus] || w.closureStatus)}</div></div><div class="record-row"><p class="record-label">Reclamation status as recorded</p><div class="record-value">${esc(w.reclamationStatus || "Not supplied")}</div></div><div class="record-row"><p class="record-label">Recorded company</p><div class="record-value">${esc(w.operator || "Not supplied")}</div></div><p class="micro">The company is listed as recorded by the source. Current ownership and liability may differ.</p><div class="action-row"><a class="primary-button" href="${esc(w.sourceUrl)}" target="_blank" rel="noopener">Open source record</a><button class="secondary-button" data-action="focus">Locate on map</button></div></div><div class="panel-section"><div class="record-navigation"><button data-next-well="-1" ${position <= 0 ? "disabled" : ""}>Previous record</button><button data-next-well="1" ${position < 0 || position >= filtered.length - 1 ? "disabled" : ""}>Next record</button></div><h3 style="margin-top:20px">Documented history</h3>${events.length ? `<ol class="timeline">${events.map((e) => `<li><time>${esc(e.date)}</time><strong>${esc(e.label)}</strong></li>`).join("")}</ol>` : '<p class="small muted">This source provides no dated events.</p>'}<p class="note">This timeline includes only events dated in the source; it may be incomplete.</p></div><div class="panel-section"><h3>Source & location</h3><div class="receipt-row"><span>${esc(source?.identifierLabel || "Licence")}</span><span>${esc(w.license || "Not supplied")}</span></div><div class="receipt-row"><span>Latitude / longitude</span><span>${w.lat.toFixed(5)} / ${w.lon.toFixed(5)}</span></div><div class="receipt-row"><span>Snapshot retrieved</span><span>${esc(localDate(source?.retrievedAt || data.wells.retrievedAt))}</span></div>${source?.sourceObservationDate ? `<div class="receipt-row"><span>Publisher inventory date</span><span>${esc(source.sourceObservationDate)}</span></div>` : ""}${sourceButton(w.sourceId)}<details style="margin-top:16px"><summary class="small">Original source fields</summary>${Object.entries(
    w.raw || {},
  )
    .map(
      ([k, v]) =>
        `<div class="record-row" style="margin-top:12px"><p class="record-label">${esc(k)}</p><div class="micro">${esc(v ?? "Not supplied")}</div></div>`,
    )
    .join("")}</details></div>`;
}
function labPanel() {
  return `<div class="panel-head"><h1>${state.labTab === "transport" ? "Cost experiment" : "Closure budget"}</h1></div>${state.labTab === "transport" ? transportLab() : cleanupLab()}<div class="panel-section"><h3>Save or export</h3><p class="micro">Save scenarios in this browser, or download the inputs, results and sources.</p><div class="action-row"><button class="primary-button" data-action="save-scenario">Save scenario</button><button class="secondary-button" data-action="saved-scenarios">Saved scenarios</button><button class="secondary-button" data-action="export-scenario">Download scenario</button><button class="text-link" data-action="reset-scenario">Reset assumptions</button></div></div>`;
}

function scenarioChart(base, alternative) {
  const widths = comparisonWidths([base, alternative]);
  return `<div class="scenario-bars" role="img" aria-label="Carrier baseline ${esc(money(base))}. Scenario subtotal ${esc(money(alternative))}. Actual government charges have not been calculated.">${[['Carrier baseline',base],['Your scenario',alternative]].map(([label,value],i)=>`<div><span>${label}</span><strong>${money(value)}</strong><div class="scenario-track"><i class="${i?'assumed':'baseline'}" style="width:${widths[i]}%"></i></div></div>`).join('')}</div>`;
}
function transportLab() {
  const base = getQuote(),
    alt = getQuote(true);
  const valid = base.status === "partial" && alt.status === "partial";
  const delta = valid ? alt.knownSubtotal - base.carrier : 0;
  return `<section class="panel-section sticky-result" id="scenario-results"><span class="eyebrow">SCENARIO SUBTOTAL · CAD</span>${state.scenario.closed ? '<h2 style="margin-top:10px">Corridor unavailable</h2><p class="micro">An estimate is unavailable because this scenario has no alternative route.</p>' : valid ? `<div class="scenario-comparison"><div class="scenario-number" data-testid="scenario-subtotal">${money(alt.knownSubtotal)}</div><span class="delta">${delta >= 0 ? "+" : ""}${money(delta)}<small>vs. carrier baseline</small></span></div>${scenarioChart(base.carrier, alt.knownSubtotal)}<p class="receipt-label">Calculated from your assumptions. Actual government charges have not been calculated.</p>` : `<div class="callout amber" role="status">${esc(base.status === "partial" ? alt.reason : base.reason)}${getRate() && ["unverified-date", "out-of-period"].includes(base.status) ? '<button class="text-link" data-action="rate-date">Use the schedule date</button>' : ""}</div>`}</section><div class="panel-section"><div class="split-note"><h3>Change an assumption</h3>${pill("User assumptions", "amber")}</div><div class="field" style="margin-top:16px"><div class="range-top"><label for="toll-change">Carrier toll adjustment</label><output>${state.scenario.tollChange > 0 ? "+" : ""}${state.scenario.tollChange}%</output></div><input id="toll-change" data-scenario="tollChange" type="range" min="-100" max="200" step="5" value="${state.scenario.tollChange}"></div>${field("Additional government fee · assumed CAD / m³", "government-assumption", `<input id="government-assumption" data-scenario="extraGovernment" type="number" min="0" max="10000" step="0.1" value="${Number.isFinite(state.scenario.extraGovernment) ? state.scenario.extraGovernment : ""}">`)}<label class="toggle-line"><span>Make corridor unavailable</span><input id="corridor-closed" data-scenario="closed" type="checkbox" ${state.scenario.closed ? "checked" : ""}></label><p class="micro">Enter a fee to test its effect. Actual government charges have not been calculated.</p><details id="baseline-settings" class="disclosure"><summary>Edit baseline shipment</summary>${routeSelect()}${shipmentFields()}</details><button class="text-link" data-action="receipt-evidence">Baseline calculation & source</button></div>`;
}

function cleanupLab() {
  const eligible = data.wells.wells.filter(isCleanupRecord),
    s = state.scenario;
  const q = cleanupScenario(s.budget, s.costLow, s.costHigh, eligible.length);
  return `<section class="panel-section sticky-result" id="cleanup-results">${q.status === "invalid" ? '<div class="callout amber" role="alert">Enter a budget between $0 and $10 billion. Each cost must be above $0 and no more than $100 million. The high cost must equal or exceed the low cost.</div>' : `<div class="receipt-total" data-testid="cleanup-result">${fmt(q.low)}–${fmt(q.high)}</div><p class="receipt-label">records covered by this budget · ${fmt(eligible.length)} eligible SK records</p>`}</section><div class="panel-section"><h3>Budget assumptions</h3>${field("Illustrative budget · CAD", "budget", `<input id="budget" data-scenario="budget" type="number" min="0" max="10000000000" step="100000" value="${Number.isFinite(s.budget) ? s.budget : ""}">`)}<div class="field-grid">${field("Low cost / record · CAD", "cost-low", `<input id="cost-low" data-scenario="costLow" type="number" min="1" max="100000000" step="any" value="${Number.isFinite(s.costLow) ? s.costLow : ""}">`)}${field("High cost / record · CAD", "cost-high", `<input id="cost-high" data-scenario="costHigh" type="number" min="1" max="100000000" step="any" value="${Number.isFinite(s.costHigh) ? s.costHigh : ""}">`)}</div><p class="micro">Enter your own cost range. These costs are assumptions, and several records may refer to one site.</p><button class="secondary-button wide" data-action="view-cleanup-cohort">Inspect ${fmt(eligible.length)} eligible records</button><details id="cleanup-method" class="disclosure"><summary>Eligibility & calculation</summary><p class="micro">Saskatchewan orphan records marked as requiring reclamation. Records with a transfer or reclamation event are excluded.</p><p class="micro">The range divides the budget by each cost estimate and rounds down, up to the number of eligible records. It excludes savings from shared-site work and does not predict completed or certified reclamation.</p></details></div>`;
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
  document.querySelector(`#map-dock [data-step="${n}"]`)?.focus({preventScroll:true});
  persist();
}
async function inspectAtlasWell(id) {
  const record=data.wells.wells.find(item=>item.id===id);if(!record)return;
  const source=data.catalog.sources.find(item=>item.id===record.sourceId);
  openDialog('<p role="status">Loading the source record…</p>',record.name||'Well record');
  const revision=dialogRevision;
  try{
    if(!record._detailLoaded)Object.assign(record,await loadDetail(data.catalog,record),{_detailLoaded:true});
    if(revision!==dialogRevision||!$('evidence-dialog').open)return;
    const events=eventTimeline(record);
    $('evidence-body').innerHTML=`<p>${esc(record.province)} · ${esc(source?.identifierLabel||'Licence')} ${esc(record.license)}</p><dl class="atlas-record-facts"><div><dt>Closure</dt><dd>${esc(statusNames[record.closureStatus]||record.closureStatus)}</dd></div><div><dt>Orphan designation</dt><dd>${esc(statusNames[record.orphanStatus]||'Unknown')}</dd></div><div><dt>Company in source</dt><dd>${esc(record.operator||'Not supplied')}</dd></div><div><dt>Reclamation</dt><dd>${esc(record.reclamationStatus||'Not supplied')}</dd></div></dl>${source?.observationsThrough?`<p>${esc(historicalNote(source))}</p>`:''}${events.length?`<h3>Recorded history</h3><ol class="timeline">${events.map(event=>`<li><time>${esc(event.date)}</time><strong>${esc(event.label)}</strong></li>`).join('')}</ol>`:'<p>No dated events supplied.</p>'}<a href="${esc(record.sourceUrl)}" target="_blank" rel="noopener">Open source record</a><p class="micro">${esc(source?.title||'')} · Retrieved ${esc(localDate(source?.retrievedAt||data.wells.retrievedAt))}. Current ownership and liability may differ.</p>`;
  }catch{if(revision===dialogRevision)$('evidence-body').innerHTML='<p role="alert">The record could not load. Close this panel and select the record to retry.</p>';}
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
function chooseView(view, labTab = state.labTab) {
  setSurface("details");
  state.view = view;
  state.labTab = labTab;
  state.well = null;
  render();
  if (!["atlas", "economy"].includes(view)) atlas.focus();
  persist("push");
  $("panel").scrollTop = 0;
  if (view === "economy") $("energy-economy").focus({preventScroll:true});
  else if (view === "atlas") $("record-atlas").focus({preventScroll:true});
  else revealPanel($("panel").firstElementChild);
}
function openDialog(html, title) {
  dialogRevision++;
  $("evidence-body").innerHTML = html;
  const firstHeading = $("evidence-body").querySelector("h3");
  $("dialog-title").textContent =
    title || firstHeading?.textContent || "Sources and methods";
  if (firstHeading?.textContent === $("dialog-title").textContent)
    firstHeading.remove();
  if (!$("evidence-dialog").open) $("evidence-dialog").showModal();
  $("evidence-dialog").scrollTop = 0;
}
function historicalNote(source) {
  const date = source.observationsThrough;
  if (String(date).startsWith("Historical compilation")) return "Historical inventory. Status observation dates are unavailable.";
  return `Historical inventory dated ${date}. Current status is unknown.`;
}
function originalDownloads(source) {
  if (!source.reproductions?.length) return "";
  const labels = {"publisher-native.json": "Original well records", "publisher-wgs84.json": "Well records with latitude and longitude", "publisher-layer.json": "Source field definitions", "publisher-item.json": "Publisher metadata", "publisher-service.json": "Source service metadata", "publisher-count.json": "Record count", "publisher-ids.json": "Record IDs", "publisher-final-ids.json": "Record IDs after download"};
  return `<details class="disclosure"><summary>Download publisher files</summary><p class="micro">These files reproduce the publisher's responses unchanged. The app groups statuses for filtering; the original values are in these downloads.</p>${source.reproductions.map(file => `<p><a href="${esc(data.catalog.basePath + file.file)}" download>${esc(labels[file.file.split('/').pop()] || (file.file.includes("publisher-batch-") ? "Well records, batch " + (Number(file.file.match(/batch-(\d+)/)?.[1]) + 1) : file.file.split("/").pop()))}</a></p>`).join("")}</details>`;
}
function showEvidence(id) {
  const list = id ? sources.filter((s) => s.id === id) : sources;
  openDialog(
    (!id
      ? `<div class="source-entry"><span class="eyebrow">DATA SOURCES</span><h3>Coverage and limitations</h3><p>The app uses downloaded source records. Coverage and dates vary. Pipeline routes are schematic; well markers use source coordinates.</p>${coverageTable()}<p>For current operations, shipping availability or engineering work, consult the linked source authorities.</p></div>`
      : "") +
      list
        .map(
          (s) =>
            `<article class="source-entry"><div class="source-meta">${esc(s.publisher)} ${s.asOf ? " · " + esc(s.asOf) : ""} ${s.observationsThrough ? " · " + esc(historicalNote(s)) : ""} ${s.sourceObservationDate ? " · Inventory dated " + esc(s.sourceObservationDate) : ""} ${s.retrievedAt ? " · Retrieved " + esc(localDate(s.retrievedAt)) : ""}</div><h3>${esc(s.title)}</h3><a href="${esc(s.url)}" target="_blank" rel="noopener">Open original source</a>${s.method ? `<p><strong>Method.</strong> ${esc(textList(s.method))}</p>` : ""}${s.limitations ? `<p><strong>Limits.</strong> ${esc(textList(s.limitations))}</p>` : ""}${s.license ? `<p><strong>Licence.</strong> ${esc(s.license)}</p>` : ""}${originalDownloads(s)}${
              s.definitions
                ? `<details><summary class="small">How statuses are classified</summary>${Object.entries(
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
async function showHistoricalInfrastructure() {
  let layer;
  try { layer = await ensureHistoricalData(); } catch { return; }
  const metadata = layer.metadata;
  const refineries = layer.features.filter(feature => feature.properties.kind === "refinery");
  openDialog(`<h3>Historical pipelines and refineries</h3><p>${esc(metadata.scope)}</p><p>${fmt(metadata.counts.pipeline)} pipeline segments and ${fmt(metadata.counts.refinery)} refinery points at 1:250,000 scale. Pipeline feature dates extend through ${esc(metadata.observationRanges.pipeline.latest.slice(0,4))}; refinery dates extend through ${esc(metadata.observationRanges.refinery.latest.slice(0,4))}. Archive modification date: ${esc(metadata.source.upstreamModifiedAt || "not supplied on this retrieval")}.</p><p>${esc(metadata.licence.attribution)} <a href="${esc(metadata.licence.url)}" target="_blank" rel="noopener">Licence</a>.</p><p><a href="data/context/historical-infrastructure.geojson" download>Download mapped features and source dates</a> · <a href="${esc(metadata.source.url)}" target="_blank" rel="noopener">Original NRCan archive</a></p><h3>Refinery records</h3><p>Historical locations. Current operating status is not established.</p>${refineries.map(feature => `<p><strong>${esc(feature.properties.name)}</strong><br>${esc(feature.properties.sourceDateMin)} to ${esc(feature.properties.sourceDateMax)} · ${feature.geometry.coordinates[1].toFixed(4)}, ${feature.geometry.coordinates[0].toFixed(4)}</p>`).join("")}`);
}
function benchmarkRows(index) {
  const system = data.benchmarkTolls.systems[index];
  if (!system) return '<p>No benchmark observations for this system.</p>';
  return `<div class="benchmark-summary"><span class="eyebrow">OBSERVATION DATE</span><strong>${esc(system.latestObservationDate)}</strong><span>${fmt(system.snapshotRowCount)} ${system.snapshotRowCount === 1 ? "observation" : "observations"} · rates may have changed</span></div><div class="benchmark-table" role="table" aria-label="Dated benchmark observations"><div class="benchmark-row benchmark-heading" role="row"><span role="columnheader">Route & service</span><span role="columnheader">Observed toll</span></div>${system.rows.map(row => `<div class="benchmark-row" role="row"><div role="cell"><strong>${esc(row.Path || row['Pipeline Name'])}</strong><span>${esc(row.Service)} · ${esc(row.Product)}</span><small>${esc(row['Corporate Entity'])} · Tariff ${esc(row['Tariff Number'] || 'not supplied')}</small></div><div role="cell" class="benchmark-value"><strong>${esc(row.Toll)}</strong><span>${esc(row.Unit)}</span></div></div>`).join('')}</div><p><a href="${esc(system.source.url)}" target="_blank" rel="noopener">Download full CER history</a></p>`;
}
async function showBenchmarkTolls() {
  if (!data.benchmarkTolls) {
    openDialog('<div class="source-entry"><h3>CER benchmark tolls</h3><p role="status">Loading benchmark tolls…</p></div>');
    const requestRevision = dialogRevision;
    try { data.benchmarkTolls = await fetchJSON('data/context/benchmark-tolls.json'); }
    catch { if (requestRevision === dialogRevision && $("evidence-dialog").open) openDialog('<div class="source-entry"><h3>Benchmark tolls unavailable</h3><p>The file could not be loaded.</p><button data-action="benchmark-tolls">Try again</button></div>'); return; }
    if (requestRevision !== dialogRevision || !$("evidence-dialog").open) return;
  }
  const tolls = data.benchmarkTolls;
  openDialog(`<h3>CER benchmark tolls</h3><p class="benchmark-intro">Published benchmark tolls for ${fmt(tolls.systemCount)} pipeline systems. Rates may have changed since the observation date.</p>${field("Pipeline system", "benchmark-system", `<select id="benchmark-system" data-benchmark-system>${tolls.systems.map((system,index) => `<option value="${index}">${esc(system.name)}</option>`).join("")}</select>`)}<div id="benchmark-records">${benchmarkRows(0)}</div><details class="source-entry"><summary>Sources, licence & downloads</summary><p>${esc(tolls.scope)}</p><p>${esc(tolls.licence.attribution)} <a href="${esc(tolls.licence.url)}" target="_blank" rel="noopener">Licence</a>.</p><p><a href="data/context/benchmark-tolls.json" download>Download tolls and source details</a></p><p><a href="data/context/pipeline-attributes.json" download>Download CER pipeline attributes</a></p></details>`);
}
function coverageOverview() {
  return `<div class="coverage-intro"><span class="eyebrow">PUBLIC BETA / DATA COVERAGE</span><h3>Available well records</h3><p>${fmt(data.catalog.totalRecords)} well records across ${new Set(data.catalog.sources.map(s=>s.province)).size} jurisdictions. Coverage varies by source; select a province or territory below.</p></div><div class="jurisdiction-grid">${data.coverage.provinces.map(p => {
    const loaded = data.catalog.sources.filter(s=>s.province===p.code);
    const count = loaded.reduce((total,s)=>total+s.count,0);
    const historical = loaded.some(s=>s.observationsThrough);
    return `<button data-coverage-province="${esc(p.code)}" class="jurisdiction ${count?'loaded':'unavailable'}"><span class="jurisdiction-code">${esc(p.code)}</span><span><strong>${esc(p.name)}</strong><small>${count?`${fmt(count)} ${count === 1 ? "record" : "records"} · ${historical?'historical / partial':'partial coverage'}`:'Inventory not loaded'}</small></span><span aria-hidden="true">↗</span></button>`;
  }).join('')}</div>`;
}

function coverageTable() {
  const statusLabel = {partial:"Partial coverage",unavailable:"Not available", "permission-required":"Permission required",complete:"Verified complete"};
  return `${coverageOverview()}<details class="coverage-detail"><summary>Coverage table, dates & limitations</summary><p>National coverage is incomplete. Retrieval dates show when files were checked, not when the underlying records were last updated.</p><div class="table-scroll" role="region" aria-label="National well inventory coverage" tabindex="0"><table class="coverage-table"><thead><tr><th>Jurisdiction</th><th>Published records</th><th>Coverage</th></tr></thead><tbody>${data.coverage.provinces.map(p => {const loaded=data.catalog.sources.filter(s => s.province===p.code);return `<tr><td>${esc(p.name)}</td><td>${loaded.length ? fmt(loaded.reduce((n,s)=>n+s.count,0)) : "Not loaded"}</td><td>${esc(statusLabel[p.topics["well-inventory"].status] || p.topics["well-inventory"].status)}</td></tr>`;}).join("")}</tbody></table></div><h3>Source dates</h3>${data.catalog.sources.map(s=>`<p><strong>${esc(s.title)}</strong><br>Retrieved ${esc(localDate(s.retrievedAt))} · ${snapshotFreshness(s.retrievedAt)==="stale"?"refresh overdue":"recent retrieval"}<br>${s.observationsThrough ? `${esc(historicalNote(s))}<br>` : ""}Source date: ${esc(s.sourceDateText || (typeof s.upstreamModifiedAt === "number" ? new Date(s.upstreamModifiedAt).toISOString() : s.upstreamModifiedAt) || "not supplied")}<br>${esc(s.limitations)}</p>`).join("")}<p><a href="data/national-coverage.json" target="_blank" rel="noopener">Download coverage and source register</a></p></details>`;
}
function showReceiptEvidence() {
  const rate = getRate(),
    q = getQuote();
  openDialog(
    `<div class="source-entry"><h3>${esc(getRoute().origin)} to ${esc(getRoute().destination)}</h3>${rate ? `<p>${esc(rate.commodity)}. ${esc(rate.service)}. Source page ${rate.page}.</p><p><strong>${fmt(state.volume)} ${state.unit === "m3" ? "m³" : "barrels"} × ${precise(rate.rate)} CAD/m³</strong>${state.unit === "bbl" ? " after converting barrels to cubic metres" : ""}.</p><p>One oil barrel is 0.158987294928 cubic metres. Currency is rounded for display after calculation.</p><p>${q.status === "partial" ? `Published base transport subtotal: ${money(q.carrier)} CAD.` : esc(q.reason)}</p><p><a href="${esc(rate.sourceUrl)}#page=${rate.page}" target="_blank" rel="noopener">Open tariff schedule</a></p>${rate.components.filter(c=>c.additive).map(c=>`<div class="receipt-row"><span>${esc(c.name)} · ${precise(c.rate)} CAD/m³</span><strong>${q.status==="partial"?money(q.m3*c.rate):"Not calculated"}</strong></div>`).join("")}${rate.conditions.map((c) => `<p>${esc(c)}</p>`).join("")}<button class="secondary-button" data-action="export-receipt">Download receipt</button><p>The published rate includes fixed and variable charges. The variable charge includes pipeline reclamation. The schedule does not identify an orphan-well cleanup contribution.</p>` : "<p>No published rate is loaded for this route.</p>"}</div><div class="source-entry"><h3>Government charges</h3><p>No tariff applies simply because goods cross an internal provincial border. Other taxes, permits, port fees and transaction-specific charges need their own applicability check.</p><p><a href="https://www.canada.ca/en/intergovernmental-affairs/services/internal-trade/federal-investments-internal-trade.html" target="_blank" rel="noopener">Government of Canada internal trade explanation</a></p><p>Rail, road and marine freight rates are not available in this app.</p></div><div class="source-entry"><h3>Route map</h3><p>${esc(getRoute().geometryNote)}</p><a href="${esc(getRoute().sourceUrl)}" target="_blank" rel="noopener">CAPP infrastructure map</a></div>`,
  );
}
function showFacility(f) {
  openDialog(
    `<div class="source-entry"><span class="eyebrow">${f.type === "lng" ? "LNG FACILITY" : "REFINERY"} / CITY-LEVEL MARKER</span><h3>${esc(f.name)}</h3><div class="receipt-total">${fmt(f.capacity)}</div><p>${esc(f.unit)} · capacity as listed in the CAPP map</p><p>Source date ${esc(f.asOf)}. ${esc(f.note)}</p><p>Listed capacity differs from actual throughput and available shipping capacity. LNG and refinery figures use different units.</p>${sourceButton(f.sourceId)}</div>`,
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
function exportWellRecords() {
    exportFile(
      "canada-in-motion-well-records.csv",
      csv(filtered, [
        "id",
        "name",
        "province",
        "license",
        "identifierLabel",
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
          "Unknown. Crossing a provincial border alone does not incur a government tariff.",
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
          costStatus: "Costs supplied by the user; actual cleanup costs are unknown",
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
          "Additional fees have not been calculated.",
          "The scenario does not calculate shipping capacity, alternative routes, dispatch or completed cleanup work.",
          "Source coverage is partial. A full source download may cover only part of a province or territory.",
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
    `<div class="source-entry"><h3>Save scenario</h3><p>Save these inputs and source references in this browser.</p>${field("Scenario name", "scenario-name", '<input id="scenario-name" type="text" maxlength="80" value="My scenario">')}<button class="primary-button" data-action="confirm-save">Save scenario</button></div>`,
  );
  setTimeout(() => $("scenario-name")?.focus(), 50);
}
function showSaved() {
  const list = savedScenarios();
  openDialog(
    `<div class="source-entry"><h3>Saved scenarios</h3>${list.length ? list.map((s, i) => `<button class="route-option" data-load-scenario="${i}"><span><strong>${esc(s.name)}</strong><small>${esc(localDate(s.createdAt))} · ${esc({ journey: "Transport costs", wells: "Well records", lab: s.state.labTab === "cleanup" ? "Closure budget" : "Transport scenario" }[s.state.view] || "Scenario")}</small></span><span>Open</span></button>`).join("") : "<p>No saved scenarios yet. Open Scenarios, enter your assumptions and choose Save scenario.</p>"}</div>`,
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
    persist("push");
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
    // Keep the focused controls mounted while change/blur advances keyboard focus.
    updateLiveResults();
    atlas.update(state, filtered);
    persist();
  }
});
document.addEventListener("click", async (e) => {
  if (e.target.closest('[data-action="reload"]')) { location.reload(); return; }
  const b = e.target.closest("button,a.brand");
  if (!b || !data) return;
  if (b.matches("a.brand")) {
    e.preventDefault();
    chooseDestination("explore");
    return;
  }
  if (b.dataset.page) {chooseDestination(b.dataset.page);return;}
  if (b.dataset.action === "navigation") {$("navigation-dialog").showModal();$("location-button").setAttribute("aria-expanded", "true");$("destination-list").querySelector("[aria-current=page]")?.focus();return;}
  if (b.dataset.action === "close-navigation") {$("navigation-dialog").close();return;}
  if (b.dataset.action === "ask") {energyEconomy?.openQuestion();return;}
  if (b.dataset.action === "rate-coverage") {showRateCoverage();return;}
  if (state.view === "economy" && ["coverage", "evidence"].includes(b.dataset.action)) {showEconomicEvidence();return;}
  if (b.dataset.statusFilter) {
    state.orphan = ['designated','both'].includes(b.dataset.statusFilter) ? 'designated' : 'all';
    state.closure = ['abandoned','both'].includes(b.dataset.statusFilter) ? 'abandoned' : 'all';
    state.well = null; resultLimit = 30; render(); persist();
    $("result-announcement").textContent = `${fmt(filtered.length)} matching source records`;
    return;
  }
  if (b.dataset.coverageProvince) {
    state.exploration.area = null; state.province = b.dataset.coverageProvince; state.query = ''; state.orphan = 'all'; state.closure = 'all'; state.eventYear = 'all'; state.eventType = 'all'; state.cohort = 'all';
    $("evidence-dialog").close(); chooseView('wells'); return;
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
  if (b.dataset.destination) {chooseView(b.dataset.destination);return;}
  if (b.dataset.workspace) {chooseView(b.dataset.workspace, b.dataset.tab || state.labTab);return;}
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
      `<div class="source-entry"><h3>Facilities</h3><p class="micro">Selected CAPP capacity records. Map markers show approximate locations.</p>${data.network.facilities.map((f, i) => `<button class="route-option" data-facility="${i}"><span><strong>${esc(f.name)}</strong><small>${esc(f.type)}</small></span><span>${fmt(f.capacity)}<small>${esc(f.unit)}</small></span></button>`).join("")}</div>`,
    );
  if (a === "status-guide") openDialog('<div class="source-entry"><h3>Well-status definitions</h3><p><strong>Orphan</strong>: designated by the responsible authority. This status concerns responsibility for the well, rather than whether it is sealed.</p><p><strong>Abandoned</strong>: the wellbore is recorded as closed. It may also be designated orphan.</p><p><strong>Reclamation</strong>: restoration of the site. Check this status separately from wellbore closure or orphan designation.</p><p>Select "both statuses" to see records marked orphan and abandoned. An unknown designation means the source does not establish orphan status.</p></div>');
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
  if (a === "clear-atlas-area") { state.exploration.area = null; render(); persist(); }
  if (a === "clear-closure-filter") {
    state.closure = "all"; state.well = null;
    render(); persist(); $("well-search")?.focus({preventScroll:true});
    return;
  }
  if (a === "province-well-totals") { chooseView("atlas"); return; }
  if (a === "retry-alberta-totals") { void ensureAlbertaTotals(); return; }
  if (a === "clear-well-filters") {
    Object.assign(state, {
      exploration: {...state.exploration, area:null},
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
  if (a === "bc-infrastructure") void showBCSources();
  if (a === "historical-infrastructure") showHistoricalInfrastructure();
  if (a === "benchmark-tolls") showBenchmarkTolls();
  if (a === "coverage")
    openDialog(
      `<div class="source-entry"><h3>Well-data coverage</h3>${coverageTable()}</div>`,
    );
  if (a === "well-csv") exportWellRecords();
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
        "This browser could not save the scenario. Choose Download scenario instead.",
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
    state.exploration.area = null;
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
      announce(state.view === "economy" && energyEconomy?.answer?.workspace ? "Original data view link copied. Use Export data to save the question workspace." : "View link copied.");
    } catch {
      openDialog(
        `<div class="source-entry"><h3>Copy view link</h3><p>${state.view === "economy" && energyEconomy?.answer?.workspace && energyEconomy.answerVisible !== false ? "This link opens the original data view. Use Export data in the comparison to preserve this question workspace." : "Copy the link below to reopen this view with the same settings."}</p><textarea aria-label="View link" readonly style="width:100%;height:120px">${esc(url)}</textarea></div>`,
      );
    }
  }
  if (a === "about")
    openDialog(
      `<div class="source-entry"><span class="eyebrow">CANADA IN MOTION</span><h3>About Canada in Motion</h3><p>Explore Canadian pipeline routes, published tolls and provincial well records. Use scenarios to estimate how changes in costs or budgets affect the results.</p><p>This free, noncommercial public beta has partial national coverage. Data dates vary by source. The app cannot confirm current operations, route availability or the full cost of a shipment.</p><p>Map searches and manual scenarios stay in this browser. Questions submitted for live analysis are sent to the providers named beside the question form. This application has no analytics or advertising trackers. Hosting providers may retain access logs. Use a private browser window to avoid retaining scenarios on a shared device.</p><p><a href="https://github.com/the-prairie/canada-in-motion" target="_blank" rel="noopener">Project repository</a>. Source records retain their original licences. AER data is reproduced for noncommercial use with attribution and is not an official version or endorsement.</p><p>Open Sources for data dates and methods. Share a view link, download filtered records or export a calculation.</p><div class="action-row"><button class="primary-button" data-action="evidence">View sources</button></div></div>`,
    );
});
boot().catch((error) => {
  $("panel").innerHTML =
    `<div class="empty"><h2>The atlas could not load</h2><p>${esc(error.message)}</p><p>Reload the page to try again. If it still fails, check your connection and try later.</p><button class="primary-button" data-action="reload">Try again</button></div>`;
  $("snapshot-label").textContent = "Source loading failed";
  console.error(error);
});

async function ensureBCData() {
  if (data.bcInfrastructure) return data.bcInfrastructure;
  if (!bcPromise) {
    announce('Loading BC permit locations…');
    bcPromise = fetchJSON('data/bc-infrastructure/map.geojson').then(layer => {
      data.bcInfrastructure = layer; atlas.setBCPermits(layer); render();
      announce(`${fmt(layer.features.length)} BC permit records loaded. Operating status is not established.`);
      return layer;
    }).catch(error => {bcPromise=null; state.layers.bcPermits=false; render(); announce('The BC permit layer could not load. Turn it on again to retry.'); throw error;});
  }
  return bcPromise;
}
function showBCFeature(feature) {
  const p=feature.properties;
  openDialog(`<h3>${esc(feature.id)}</h3><p>BC ${esc(p.kind.replace('-',' '))} record</p><dl class="record-fields"><dt>Source permit status</dt><dd>${esc(p.sourceStatus||'Not supplied')}</dd><dt>Approval date</dt><dd>${esc(p.approvalDate||'Not supplied')}</dd><dt>Operating status</dt><dd>Not established by this source</dd></dl><p>Locations collected on or after July 11, 2016. Pipeline display geometry is simplified within 10 metres of the source geometry.</p><button class="primary-button" data-action="bc-infrastructure">Inventory scope, sources & downloads</button>`);
}
async function showBCSources() {
  openDialog('<h3>BC pipeline & facility permits</h3><p role="status">Loading source details…</p>');
  const revision=dialogRevision;
  try {
    const m=await fetchJSON('data/bc-infrastructure/manifest.json');
    if(revision!==dialogRevision||!$('evidence-dialog').open)return;
    openDialog(`<h3>BC pipeline & facility permits</h3><p>${fmt(m.counts['pipeline-permit'])} pipeline segments · ${fmt(m.counts['facility-permit'])} facility points · ${fmt(m.counts['orphan-pipeline-row'])} separate orphan pipeline rows.</p><p>${esc(m.scope)}</p><p>Retrieved ${esc(localDate(m.retrievedAt))}. Publisher updates nightly; this app checks weekly. Statuses are shown as published. They describe permits; current operations require separate confirmation.</p><p>Contains information licensed under the <a href="https://www.bc-er.ca/files/gis/BCER-Open-Data-Licence.pdf" target="_blank" rel="noopener">BC Energy Regulator Open Data Licence</a>.</p>${Object.entries(m.sources).map(([name,s])=>`<p><a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">BCER ${esc(name)} source</a> · ${fmt(s.recordCount)} records</p>`).join('')}<p><a href="data/bc-infrastructure/full.geojson" download>Download full geometry and attributes</a><br><a href="data/bc-infrastructure/orphan-pipelines.json" download>Download separate orphan table</a></p><p>Map geometry uses a 10 metre simplification. Full geometry retains source vertices, with coordinates rounded to six decimals. The orphan-pipeline table is provided separately; its rows have not been matched to map features.</p>`);
  } catch {if(revision===dialogRevision)openDialog('<h3>Source details unavailable</h3><p>Please retry.</p>');}
}
