# Independent launch follow-up review

Review scope is the working tree of `outputs/canada-in-motion-production` relative to `44c404b`. This is a fresh same-model review. Production files are read-only for this reviewer.

## Finding requiring repair

P2. Historical status loses its observation date in record detail and CSV export. `app.js` `wellDetail()` displays a closure status and only the catalog-wide retrieval date. The historical observation limit appears only after opening another source dialog. A direct shared link to a Nova Scotia record therefore presents a 2016 status beside a 2026 retrieval date without a visible historical qualification. The CSV exports statuses without observation or retrieval dates. The actual release contains 125 onshore Nova Scotia records, including 10 suspended records, from the inventory through February 1, 2016. Display the source observation period beside the record status and carry source observation and retrieval metadata into the export. Reported to the parent for repair.

## Verified checks

- All 23 Node tests and all 9 Python tests passed independently.
- `validateRelease()` verified the actual release `6bcfaedd2d7bcd8889ce`. It contains 317,129 records and 332 catalog, index, and detail files across eight source layers.
- The source acquisition caches were independently normalized and validated again. Yukon has 76 records. Nova Scotia onshore has 125 valid records and six reviewed empty placeholders. Nova Scotia offshore has 211 records.
- The placeholder policy requires the reviewed source IDs, empty identifying attributes, zero source values, and latitude zero. New placeholder IDs fail. Identifiable records remain subject to normal validation. The build rejects unknown exclusion IDs and unaccounted raw records.
- Offshore composite identity uses well name, number, and spud date. It preserves the distinct re-entry records and does not depend on changing ArcGIS object IDs. Duplicate normalized IDs still fail validation.
- `betaReadiness()` returned `technicalReady=true` and `launchAuthorized=false` for the actual release. The national release gate still returned `passed=false` with 62 unmet conditions. The deployment workflow still calls the strict national gate. No deployment permission was added.
- Live official metadata confirmed the Yukon Open Government Licence, Nova Scotia onshore open licence and 2016 observation description, and the Canada open licence for the offshore directory. The browser search tool could not retrieve those metadata endpoints, so direct official JSON requests were used.

Prove It Works shaped the review by requiring actual source-cache normalization and complete release checksum checks. Passing synthetic tests alone was insufficient.

## Pending review

The parent is integrating historical infrastructure and benchmark toll assets. Their final acquisition, release validation, and visible app flows have not yet been accepted. Browser verification remains with the parent. This report does not approve a public deployment or complete national coverage.

## Repair check

The historical-date finding is repaired in the current code. `wellDetail()` now shows the historical observation period beside the record heading. It displays the source-specific retrieval date. `loadWells()` carries observation, retrieval, source-date, and limitation metadata into each record, and the CSV exports those fields. An independent actual-file check loaded all 336 Nova Scotia records and confirmed the metadata survived the lazy-detail merge for `ns-onshore-open-historical:P-1`. The parent still owns browser verification.

## Context finding requiring repair

P2. The context cache-resume path can relabel old acquisition as fresh. `open_transport.fetch(..., reuse=True)` accepts an arbitrarily old cached file. `refresh_context()` stamps the manifest with the current time. The new readiness and launch freshness checks inspect that manifest timestamp. Therefore `CIM_CONTEXT_RESUME=1` can make stale source downloads pass the freshness gate. Bound the resume age and preserve or validate actual source acquisition timestamps. The source data being acquired in this session is fresh, but the recovery path does not enforce that fact.

## Final context verification and verdict

Both reported findings are repaired. The context cache now rejects files older than four hours. Its manifest preserves the oldest acquisition timestamp across geometry, source catalogues, pipeline attributes, and all benchmark systems. The build independently recomputes that minimum and rejects a freshness timestamp that conceals an older source. The seven-day reuse path preserves the existing timestamp and verifies file hashes.

Independent checks on the final working tree passed all 23 Node tests and all 11 Python tests. `validateRelease()` accepted the actual well release and the complete context group. The verified context contains 1,253 historical pipeline segments, 21 historical refinery points, 25 benchmark systems with 216 dated rows, and 26 pipeline attribute rows. No pending benchmark sources remain.

Adversarial checks ran against temporary copies of the actual context group. The validator rejected changed bytes, quote eligibility promotion, an observation after the cutoff date, a freshly relabeled manifest, and a restricted licence. A separate Python check confirmed that stale resume files fail and a failed acquisition retains the previous context files. These checks did not modify production files.

The latest actual readiness result is `technicalReady=true` with `launchAuthorized=false`. The national gate still fails with 62 unmet conditions. The deployment workflow still invokes that national gate. The context additions strengthen its freshness requirements and do not bypass it. Benchmark observations remain separate from shipment pricing.

Accepted scope is an expanded private release candidate with openly licensed historical context and explicit incomplete national coverage. No unresolved provable defect remains in this review scope. This verdict does not certify complete national data, current operating inventories, current all-in shipping quotes, or public deployment authorization. Browser checks, hosted workflow execution for this revision, and the user's public-beta and hosting decisions remain outside this review's completed validation.
