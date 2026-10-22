# Independent capacity experience review

Reviewed 2026-10-21 against the local production build at port 4208 (codeVersion `977096b085c1bf0641c0`). All browser use was headless; no foreground windows or paid inference requests.

## Scope and result

The reviewer independently navigated Nursing supply, School openings and Funding rules at 1440×1000 desktop, 375×812 mobile and 812×375 landscape: nine topic/viewport combinations. The three layouts were visually inspected, including real mobile viewport captures and the Evidence dialog. No release-blocking errors were found.

- Each topic renders without document or dialog horizontal overflow. Wide evidence tables deliberately scroll within labelled, keyboard-focusable regions.
- Keyboard arrow changes work for extra registrants and school opening dates. Reset returns nursing assumptions to baseline; funding year and rule selections update results.
- Evidence opens in all nine states, Escape closes it, and focus returns to Evidence. Funding combobox accessible names are correct.
- There were no JavaScript page errors. Analysis API routes were intercepted.
- Chart semantics and legends remain legible at 375px. Conditional nursing paths have dashed strokes and an observed/conditional boundary. Construction uses stepped cumulative places; funding uses aligned dots and observed-count markers.
- Visible text distinguishes RN registrations from employer hires, FTE and staffed beds; historical construction timing from future delivery forecasting; and funding-weighted student FTE from grant dollars. The nursing model's failure to beat a simple historical trend is visible beside the result.
- No empirical policy-effect or validated forecast claims were found. The scenario is honestly conditional on user assumptions and limited historical observations.

## Feedback

Evidence initially began with nursing even when opened from School openings or Funding rules. Relevant evidence required excessive scrolling. Recommended connecting Evidence to the selected topic, with optional navigation to the other topic records. This is a usability improvement, not a model-validity blocker.

The full-page screenshot utility can draw the off-screen fixed skip link inside a stitched image after scrolling. A real viewport inspection and computed geometry confirmed it remains off screen (top −100px) when not focused; this is a capture artifact, not a page overlay bug.

## Reproducible check

`tests/capacity-experience-independent.mjs` uses `PLAYWRIGHT_MODULE`, `TEST_BROWSER_PATH`, `TEST_URL` and optional `TEST_ARTIFACT_DIR`. It repeats all nine combinations, keyboard input, reset, funding selections, dialog focus return and overflow checks. Screenshots/results are local test artifacts, not source data.

## Final acceptance

Build `df16cf648df73dbb2bb2` resolves the Evidence finding: each scenario opens its own records, validation and source list; the full source snapshot remains available in the export. The independent nine-state check was rerun against this build and passed. An explicit assertion verifies that the first Evidence section matches the selected topic. Approved for release within the stated conditional-model scope.
