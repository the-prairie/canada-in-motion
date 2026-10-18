# Public-beta launch status

Owner approval recorded October 18, 2026 for public repository visibility and incomplete national coverage. The beta release gate passes locally; the national-completeness gate remains intentionally unsatisfied. The first hosted deployment succeeded. HTTPS, the live app and automatic refresh-to-deploy execution were verified.

Live public beta: https://the-prairie.github.io/canada-in-motion/

## Included

- 317,129 verified well source records in six provinces and Yukon; Nova Scotia records are historical.
- 6,144 BC pipeline permit segments and 11,717 facility permit points, including 13 LNG facility records; 27 separate orphan-pipeline rows. Permits since July 2016 do not establish complete or operating coverage.
- 1,253 historical CanVec pipeline segments and 21 historical refinery points.
- 25 CER systems with 216 dated benchmark rows, plus 26-system reference attributes; benchmarks are not quote eligible.
- Redesigned map, common-scale destination comparisons, independent orphan/abandonment summaries, clickable jurisdiction coverage, progressive shipment controls, scenario comparisons, lazy heavy layers and mobile dialogs.

## Remaining coverage work

Québec, NL, NB, PEI and current NS petroleum well coverage remains incomplete. These gaps combine acquisition, completeness and source-specific reuse questions; separate permission letters are not a blanket requirement. See the revised approach in `DATA-ACCESS-REQUESTS.md`. No requests were sent. The delegated second investigation and openly licensed NPRI refinery candidate are documented in `ADDITIONAL-COVERAGE-RESEARCH.md`; the NPRI candidate is not published until its refresh adapter is implemented. Current national infrastructure, carrier rates and government-charge coverage remain incomplete.

## Validation

28 Node tests and 21 Python tests pass locally. Independent code review identified comparison-track sizing, schedule-date context and filter keyboard-focus issues; these were corrected. Browser and hosted results are recorded below and in DESIGN-VERIFICATION.md. No claim of physical-device certification, formal accessibility conformance, security audit or national completeness is made.

## Hosted publication

[First public deployment](https://github.com/the-prairie/canada-in-motion/actions/runs/39106500975) succeeded at commit `00f4b7b`. Public health confirms release `a06c64fe91f76e5ed479`, 317,129 records and `nationalComplete: false`. All eight checked app/context/BC file endpoints return HTTP 200 with correct MIME types. Live mobile benchmark data, BC source disclosures and Saskatchewan filtering loaded without browser console errors.

[Fresh data run](https://github.com/the-prairie/canada-in-motion/actions/runs/39106671252) succeeded and triggered [automatic public deployment](https://github.com/the-prairie/canada-in-motion/actions/runs/39106844305) via `workflow_run`, also successful. Latest verified public release: `948554d5cee0d0a641b1`. BC weekly reuse preserved its prior acquisition timestamp. Daily schedule remains 10:17 UTC; the timer itself has not yet fired since this launch, while its refresh-to-publication path has been exercised end to end.

No further hosting setup is required from the owner. Full national expansion requires additional verified source acquisition and integration. Existing licences and applicable noncommercial reuse terms should be used directly; only explicit unresolved source/use restrictions warrant separate escalation. No external requests have been sent.
