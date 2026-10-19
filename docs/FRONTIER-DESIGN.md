# Production design contract

## Choice

Use Candidate A's stable record identity across geography and within-inventory status comparison. Graft Candidate B's spatial selection into the existing record list and CSV. Replace the landing-page framing with a viewport-filling analytical stage and a compact evidence inspector. Keep transport calculations, dated benchmarks, source dialogs and scenarios as first-class navigation destinations.

## Data shape

The existing normalized `Well[]` is the sole record collection. A record has id, lon, lat, province, closureStatus, orphanStatus, sourceId and dates. The GPU buffer is derived in memory from that collection. No second binary inventory or acquisition pipeline is introduced.

App state adds `view: atlas` and `exploration: { arrangement: geography | compare | table, area: [minX,minY,maxX,maxY] | null }`. Area coordinates use the documented Canada Albers projection. Existing province, closure, orphan, query and event filters stay authoritative. A geographic selection applies to the map, summary, record list and CSV through the same pure predicate. Camera pan and zoom are transient viewport controls; selected area and arrangement survive shared links.

`atlas-model.mjs` owns the pure projection, inverse projection, bounds validation, point-in-area predicate and summaries. `record-atlas.js` owns one GPU scene and its HTML/SVG controls. The parent app owns URL state, data loading, dialogs, record details and downloads.

## Component contract

`new RecordAtlas(host, {wells, provinces, catalog, onChange, onRecords, onExport, onWell, onSource})`.

`update(state, filtered)` updates current normalized app state and the exact matching records. `setVisible(boolean)` suspends animation while hidden. `destroy()` removes observers/listeners/GPU resources if replaced. `onChange(patch)` sends top-level state keys; exploration is a complete object when changed. Parent immediately normalizes, filters, updates and persists. `onRecords()` opens existing matching-record list. `onExport()` invokes its existing CSV. `onWell(id)` opens existing details. `onSource(id)` opens existing source dialog.

The component has no global data-action or data-view attributes; those are owned by the parent event delegate. All inserted source strings are escaped or set with textContent.

## Meaning and interaction

Geography uses exact source coordinates and a labelled equal-area projection. Every GPU point is one source record. Comparison shows the same records arranged by jurisdiction and recorded closure status, with 100% row denominators and exact counts. It compares loaded inventories, never provincial performance. Alberta's abandoned-only source and historical inventories are explicitly identified.

Spatial selection works by pointer drag and keyboard. Enter starts a centre selection, arrows move it, Shift+arrows resize it, Escape ends selection mode. A visible clear-area button removes only the area restriction. Table and province/status controls give keyboard access without WebGL. Filters and matched counts always remain visible.

## Rendering and responsive behavior

Use raw WebGL for this small point renderer; Three.js research informs buffer-based rendering without adding a full scene graph for one orthographic point layer. Canvas/SVG geographic boundaries, HTML exact data. Cap DPR, render only when state or viewport changes, suspend off-screen animation, honour reduced motion and handle lost context with a usable table/Canvas fallback.

Desktop has a wide stage and a narrow inspector. Mobile starts with compact controls and a useful geographic stage, followed by exact summary and records. Comparison becomes readable rows on narrow screens. No decorative scroll interception, perpetual motion, fake flow, 3D height or numerical encoding by glow.

## Verification

Projection roundtrip, area validation and shared filter semantics get focused unit tests. Existing rate and release checks remain. Real-browser checks cover geography, comparison, province/status selection, area selection, record details, matching export, shared state, source provenance, mobile/landscape, no-WebGL fallback and the existing transport/scenario routes. A fresh reviewer assesses both candidate choice and the integrated result.

# Research and design transfers

The requested references were inspected on 2026-10-18. These are design inferences, not claims that their authors endorse this app.

| Reference | Observed | Design transfer |
| --- | --- | --- |
| https://threejs.org/ and https://threejs.org/examples/#webgl_buffergeometry_drawrange | GPU buffer geometry renders many points with interactive controls. | Use one buffer for the published records. Keep record identity when changing the arrangement. No animation should imply measured flow. |
| https://www.shadertoy.com/browse | The browser presented a security verification screen; the web tool returned HTTP 402. | Gallery contents were not reviewed. Do not attribute a visual technique to a shader we could not inspect. |
| https://www.scrolltide.co/ | Large typography, deliberate spacing and a library of scroll and shader interactions. | Use progressive disclosure to sequence the data task. Avoid turning an analytical workbench into a scroll-driven presentation. |
| https://recent.design/?category=web and https://recent.design/i/68a8v4h-webgl-portfolio-explorer | A curated gallery and a WebGL portfolio study with selectable scene objects beside readable detail controls. | Keep visual selection and an HTML evidence inspector coordinated. Keep labels, sources and controls accessible outside the GPU scene. |

## Candidate rubric

1. Analytical usefulness. Does the interaction answer a question that the current app makes difficult?
2. Data fidelity. Are source identity, dates, unknown states and partial coverage preserved?
3. Spatial clarity. Can people understand both geography and the comparison without a tutorial?
4. Accessibility and responsive behavior. Are exact data, keyboard controls and a small-screen view available?
5. Integration cost. Can the feature reuse the existing records, calculations, exports and URL state without duplicating them?

Candidate A tests identity-preserving transitions from a geographic point cloud to jurisdiction status strips. Candidate B tests a geographic selection that filters exact counts and downloadable records. Both use the actual current inventory. Their code-native prototypes serve as responsive design concepts; raster concepts would not test these interactions.
