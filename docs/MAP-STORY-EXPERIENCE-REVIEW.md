# Map continuity through guided scenarios

Independent experience review, October 20, 2026. This review covers the selected trade guide, its network entry, and desktop and mobile use.

## Design basis

[Jakub's Less is more, more or less](https://jakub.kr/writing/less-is-more) argues for intentional removal and animation that serves a specific task. For this guide, motion has one purpose. It makes the seller-to-buyer direction legible. It must not imply a transport route, physical volume, speed, or causation that the data cannot establish.

The existing guide replaces the map with text and cards. Its route header, panel header, workspace summary, stage heading, numbered stage buttons, and numbered footer repeat context. The selected transaction loses its geographic reference exactly when the user starts comparing effects.

## Two alternatives

### Keep a map beside each stage

Use one persistent map and one stage detail. The selected provinces and their connecting curve remain in the same place as the stage changes. On desktop, the map occupies one side and the current stage occupies the other. On mobile, a compact map sits above the stage. The stage navigation stays adjacent to the map.

The exchange stage can animate the selected relationship from seller to buyer. Provincial and household stages preserve the same relationship and update endpoint labels. Label the displayed quantity directly. An unavailable estimate remains unavailable on the map and in the detail.

This option keeps the user's place and supports repeated comparison. It needs no scrolling choreography and keeps the slider responsive.

### Turn the guide into three scrolling map scenes

Make the map sticky on desktop and reveal three sections as the user scrolls. The same selected pair remains visible while each section changes its endpoint labels. On mobile, repeat a small map in each section because a sticky map would consume most of the viewport.

This option makes a good narrated article. It is weaker for this app's repeated price changes, changing energy types, saved investigations, and stage links. Repeated mobile maps also add vertical length and duplicate the same information.

## Recommendation

Use the first alternative. Keep a single selected-connection map in the guide. Change its annotations with the active stage. Preserve its camera, selected pair, and position while stage content changes.

Do not show the full seller-and-buyer network alongside the guide. It competes with the one transaction being explained. Return to the network through the existing Back to connections action.

Use motion along the selected curve only. A pause control must stop it. Reduced-motion preferences must leave a static arrow and labels. Keep animation speed, particle density, and curve width independent of the price assumption. The scenario holds quantity fixed.

The province and household stages must not draw onward arrows that suggest the selected trade directly causes GDP, government revenue, or bills. These are separate province-wide price models and retail assumptions.

## Remove before adding

- Remove the guide's duplicated panel header and eyebrow. Keep a meaningful accessible section name.
- Replace the route metadata eyebrow with one plain context line containing the energy type and trade year.
- Remove numbered circles when the same stage order is already visible in the navigation.
- Remove the footer's repeated stage count. Back and Next already express progression.
- Remove the sidebar's repeated connection delta when the exchange remains visible on the map.
- Remove duplicate guide-entry buttons and selected-connection summaries from the network view.
- Remove the numbered Geography and Relationships eyebrows. The diagrams should identify their function through their structure and accessible names.
- Remove the repeated all-provinces summary while a specific connection is open.
- Move snapshot identifiers, arithmetic details, parameter explanations, and full validation results into the existing disclosures.

Keep source year and currency beside the trade value. Keep the distinction between a trade-value change and a GDP estimate. Keep the household spending qualification beside the household amount. Simplicity must not make an unsupported result look certain.

## Browser acceptance criteria

- Opening the guide preserves the selected connection and highlights its two provinces.
- The same map survives all three stage changes without a camera reset or complete disappearance.
- Map labels and the visible stage agree after price, horizon, retail-basis, energy-type, and trade-year changes.
- Positive, zero, and negative price changes preserve geographic direction. A price fall does not reverse energy trade.
- Zero and unpublished values do not gain animated flow lines.
- The guide works by keyboard. Stage changes put focus on useful content without hiding the map or losing the selected pair.
- The map remains legible at 320 and 390 CSS pixels. Mobile controls are reachable without horizontal scrolling or tiny SVG targets.
- Pause and reduced motion stop decorative motion without removing directional information.
- Switching stages does not announce an endless stream of changing animation coordinates.
- Exact units, periods, model support, and household qualifications remain visible or one explicit disclosure away.
- No inference requests occur during ordinary guide interaction.

## Review status

The candidate passed independent desktop and mobile review at `http://127.0.0.1:4201/`.

I used headless Chromium at 1440 × 1100, 390 × 844, 320 × 740, and 844 × 390. I opened the guide from the network and exercised all three stages, positive and negative price changes, zero change, pause and play, reduced motion, endpoint inspection, keyboard navigation, independent retail prices, unsupported electricity estimates, and return focus. No inference request was permitted.

The first pass found two defects. The Pause label inherited white text and became difficult to see. A pointer-leave event cleared the province highlight after the endpoint moved out from under the pointer during scrolling. Both defects are fixed. The final pass also confirms that mobile map labels remain readable and Maritime labels do not overlap.

The final scripted review passed 132 behavior checks with no runtime errors or horizontal overflow. Those checks cover the four viewports and are not a claim that every browser or possible dataset has been tested. I also inspected the resulting screenshots. A separate check covered a zero-value Newfoundland and Labrador to Prince Edward Island connection, long province names, pause-control contrast, keyboard endpoint activation, and a failed model-source request. Zero trade has no animated line or directional arrow. Failed sources display Unavailable and disable endpoint inspection until the sources can load.

On narrow portrait screens, the map remains above the stage and selected province detail. On short landscape screens, the map scrolls normally so it does not cover the result. The guide keeps essential model qualifications beside amounts, while its calculation and source details remain expandable.

Local evidence is in `.data-cache/map-story-review/`. `review.mjs` reproduces the desktop and mobile checks. `edge-review.mjs` reproduces the additional cases. `review-results.json` records the final results, and the candidate PNGs preserve the visual review. The public deployment still needs its release smoke check.

Subtract Before You Add shaped the deletion list. Experience First selected the persistent map over scrolling scenes because the app is an interactive comparison tool. Prove It Works required interaction with the built app and screenshot inspection before acceptance.
