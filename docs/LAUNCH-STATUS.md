# Public-beta launch status

Owner approval recorded October 18, 2026 for public repository visibility and incomplete national coverage. The beta release gate passes locally; the national-completeness gate remains intentionally unsatisfied. Public deployment verification will be recorded below after the hosted run completes.

Target: https://the-prairie.github.io/canada-in-motion/

## Included

- 317,129 verified well source records in six provinces and Yukon; Nova Scotia records are historical.
- 6,144 BC pipeline permit segments and 11,717 facility permit points, including 13 LNG facility records; 27 separate orphan-pipeline rows. Permits since July 2016 do not establish complete or operating coverage.
- 1,253 historical CanVec pipeline segments and 21 historical refinery points.
- 25 CER systems with 216 dated benchmark rows, plus 26-system reference attributes; benchmarks are not quote eligible.
- Redesigned map, common-scale destination comparisons, independent orphan/abandonment summaries, clickable jurisdiction coverage, progressive shipment controls, scenario comparisons, lazy heavy layers and mobile dialogs.

## Remaining coverage work

Québec, NL, NB, PEI and current NS petroleum well inventories still need the authority-specific licence/inventory requests in `DATA-ACCESS-REQUESTS.md`. No requests were sent. The delegated second investigation and openly licensed NPRI refinery candidate are documented in `ADDITIONAL-COVERAGE-RESEARCH.md`; the NPRI candidate is not published until its refresh adapter is implemented. Current national infrastructure, carrier rates and government-charge coverage remain incomplete.

## Validation

28 Node tests and 21 Python tests pass locally. Independent code review identified comparison-track sizing, schedule-date context and filter keyboard-focus issues; these were corrected. Additional browser and hosted results are recorded after deployment. No claim of physical-device certification, formal accessibility conformance, security audit or national completeness is made.
