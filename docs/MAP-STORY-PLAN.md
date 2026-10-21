# Connected guide map

## Workflow

1. Ground the existing workspace, guide and map ownership. Complete.
2. Compare persistent geography with scroll-driven scenes. Choose a persistent map that does not advance the guide automatically.
3. Subtract duplicate headings, eyebrow labels, repeated connection values and stage counters before adding the map.
4. Implement a derived map scene and shared coordinate model. Preserve the economic calculations and saved-state contract.
5. Independently review desktop and mobile. Test keyboard, motion, source failures and saved investigations.
6. Deploy, verify public assets and user journeys, and record the evidence.

## Throughput checkpoint

- Blocking first steps. Read the requested essay and inspect the model boundaries before visual changes.
- Independent workstreams. One reviewer owns the experience report and browser evidence. The parent owns production changes and tests.
- Shared mutable state. Workspace selection remains the single source of truth. Map focus and animation preference are local presentation state. No second price, stage or province filter is introduced.
- Smallest safe decomposition. One implementation owner keeps map, stage and responsive layout changes consistent. The reviewer writes no production files.

## Architecture and alternatives

The existing workspace owns the selected trade, stage, price and model snapshots. `summarizeGuidedConnection` computes economic results. `GuidedScenario` displays one stage but currently removes geography. `TradeNetwork` owns the exploratory map and seller–buyer diagram.

The chosen design adds one derived map scene to the guide. It reuses projected provincial boundaries and the selected connection. Exchange marks communicate seller-to-buyer direction at a fixed rate. GDP and household stages retain the connection as context and show their separate province-wide results. The flow line never grows or accelerates when a price changes. Missing data never produce an animated flow or a numeric zero.

A scrolling full-screen story would create more choreography and make repeated comparisons slower. A permanent map plus all three result panels would preserve simultaneous comparison but increase clutter. The chosen guide keeps one analytical question visible and changes the endpoint labels with that question.

The map uses SVG with thirteen provincial/territorial shapes, one selected relation and two labelled endpoints. Geometry is fixed across stage and price changes. The projection is the existing Canada Albers projection. The basemap is administrative context; the connection is schematic and does not represent a shipment route. No tiles, WebGL or new provider are required.

On desktop, the map stays beside the results. On mobile portrait, a compact map remains above the current stage. Short and landscape viewports use normal scrolling. Controls work without dragging or hover. Animation has a pause control, stops outside the viewport and in hidden tabs, and is disabled for reduced motion. Static arrows preserve direction.

Model support, GDP interpretation, units and household bill limitations stay visible. Full formulas, model checks and sources remain in disclosures. Shared links and saved snapshots retain the existing guide state; transient focus and animation do not change the calculation.
