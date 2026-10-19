# Independent acceptance review

Reviewed the production working tree and the running app at http://127.0.0.1:4174/ on 2026-10-18. This review is independent of implementation. Production files were read only. The review used the installed poteto compatibility rules, saved Balanced configuration, unslop and no-comments. No further agents were spawned.

## Decision

Accept the architecture and design direction, conditional on the two release blockers below. The integrated design earns its GPU layer by rendering actual source records and carrying their identity into a different analytical arrangement. Geographic selection answers a useful cross-border query and reuses the existing records, source dialogs and export pipeline. These are substantive interactions rather than decorative motion.

Candidate A is the better base because geography and within-inventory composition are complementary views of the same records. Candidate B contributes the useful area-selection workflow. Reject both prototypes' large introductory headings and separate binary data products for production. The viewport-first stage and existing normalized record collection avoid a second source of truth. Reject globe depth and animated flow because the supplied data does not justify those encodings.

## Release blockers

1. Status marks overlap adjacent comparison rows. At both 1280 by 720 and 320 by 740, the global 44px button minimum height overrides the 20px or 23px mark container. At 320px, the BC mark container spans y267.19 to 287.19 while its button spans y267.19 to 311.19. The next Alberta row begins at 309.57. The broad translucent bands obscure row separation and misrepresent the intended marks. Scope the button minimum height or provide properly separated touch targets. Keep the existing accessible status controls as an alternative. Evidence is `acceptance-desktop-before.png` and a read-only DOM bounding-box measurement.
2. Clicking a jurisdiction's status segment filters every jurisdiction. Clicking the BC Active segment, labelled with 11,262 matching BC records, produced 14,776 records and the heading Canada. The segment handler changes only closure status. It should select both the clicked row's jurisdiction and its closure status. Sidebar status controls can continue to apply within the current jurisdiction.

## Corrections requested

- Add a compact colour legend beside the chart or arrangement controls. On small screens, the only status colour key is far below the chart in the inspector. The initial comparison view therefore exposes coloured marks before their meaning.
- Hide the point key in Table. Replace its percentage footer and comparison-row wording with count-specific language. The table contains integers, not 100% rows. Keep the source-scope explanation.

## Verified behavior

- Geography at 390 by 844 and comparison at 320 by 740 have no horizontal document overflow. The map and comparison controls remain available.
- The hidden legacy map has no visible focusable buttons or links while Atlas is active.
- NS plus Active yields two matching records. The inspector lists the onshore inventory with source date 2026-10-13 and retrieval date 2026-10-18.
- The source button opens the correct source dialog, including original source URL, scope and attribution.
- Selecting ECE-2019-P3 opens the existing well detail view with Well ID P-141, original source record link and the same dates.
- Enter on the map creates an area. ArrowRight moves it. Shift+ArrowRight changes its size and exact count. Escape returns to Pan while retaining the selected area.
- Clearing the area restores the national matching records.
- The table exposes exact counts through native table semantics. Its horizontal content is confined to the table scroller at 320px.
- The source-scope copy distinguishes historical inventory and partial coverage. Alberta and Saskatchewan use their limited layer names in the desktop comparison. The comparison explicitly disclaims provincial performance ranking.
- The transport view at 390 by 844 preserves a readable subtotal, government-charge distinction, date, unit and calculation-source entry without horizontal overflow.
- Browser warning and error logs were empty during these checks.

## Review limits

The parent owns final CSV, shared-state, reduced-motion, forced no-WebGL or context-loss checks and public deployment verification. I reviewed the fallback code, but did not force the browser's GPU context to fail. No speed or accessibility conformance score is claimed. The source record count is not a complete national population.

## Prose and comments

The new visible labels use concrete records, dates, arrangements and actions. I found no decorative metaphors or promotional AI prose in the new workflow. The new renderer and pure model do not introduce narrative code comments or lint suppressions requiring deletion. No production comments were changed.

## Focused repair verification

The parent rebuilt the files before its execution stopped. I started a fresh read-only public preview on port 4188 because port 4174 retained an older integrity manifest and returned HTTP 500 for the rebuilt health file. The fresh preview returned 200 and rendered the rebuilt app.

The mark-height repair passes. At 320px, the chart container and all visible child marks are now 20px. Screenshots `acceptance-mobile-after.png` and `acceptance-desktop-after.png` show distinct rows. The new compact status legend is visible above the marks on mobile and desktop.

The segment-scope blocker remains. The rebuilt app still returns 14,776 Canada records after clicking the BC Active segment labelled 11,262. The Table wording correction also remains. Final acceptance is therefore conditional on those two outstanding corrections and parent-owned deployment checks. No production code was edited by this reviewer.

## Parent repair verification

The remaining segment-scope defect is fixed. Clicking BC Active in the actual rebuilt app selects British Columbia and Active, producing 11,262 records. Table mode now uses record-count labels with no percentage or point claim. These checks were performed by the parent, not an additional independent reviewer.

The parent also verified a selected geographic area across Atlas, the existing record list and a shared-link reload. Québec's one historical GSC record exported through the existing CSV and opened its native details. A local fault-injection proxy verified unavailable WebGL and context loss without changing the production code. The fallback retained exact data and usable comparison/table controls.

A final public check found the mobile footer sitting inside the longer atlas content. The mobile atlas now uses a content-height shell. A real-browser check at 574×724 confirmed that the footer starts exactly at the atlas bottom, with no horizontal overflow. This is the same mobile layout rule used below 760px.
