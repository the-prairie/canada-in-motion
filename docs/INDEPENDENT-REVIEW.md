# Independent review — production candidate

Historical prelaunch review. See [current launch status](LAUNCH-STATUS.md) and [design verification](DESIGN-VERIFICATION.md) for the subsequently approved public beta.

Status: **accepted for the scoped private release-candidate stage after repairs**, based on code review, tests and actual release integrity validation on 2026-10-17 (America/Edmonton). Public national launch remains blocked. This verdict does not certify complete national coverage or approve public deployment.

## Scope and checks

Reviewed the architecture, app loading/state restoration, source adapters, acquisition and snapshot publication, public packaging/server boundary, release gate, scheduled refresh and deployment workflows, source registry, coverage claims and operating documentation. Ran the Node suite (21 passing tests) and Python acquisition suite (5 passing tests) on the initial candidate. Actual acquisition was still running during the initial review. After repairs, reran all 21 Node tests and all 6 current Python tests successfully; app JavaScript syntax also passed.

## Confirmed findings — repaired and rechecked

1. **Detail request failure calls a nonexistent function.** `chooseWell` calls `toast(error.message)` although the app defines `announce`, not `toast`. A shard fetch failure raises a second exception rather than presenting a recoverable error. A late failed request can also clear a newer selection because its catch does not check request identity.
2. **Restored selections bypass lazy detail retrieval.** Once indexes are loaded, hash changes and saved-scenario restoration render selected records without necessarily loading their detail shard. Raw fields and location details can be missing while the record appears complete. Loading should be centralized around the current selected record, with explicit pending/error/retry states.
3. **Transport monitoring forgets its prior baseline between workflow runs.** The scheduled workflow restores only the catalog, while the monitor compares with local `data/source-monitor.json`. A fresh runner therefore repeatedly establishes a baseline and cannot detect changes across runs.
4. **Public deployment bypasses count-drop history.** `deploy.yml` does not restore the previous source baseline. Because `data/catalog.json` is gitignored, acquisition starts without `previous_count`, bypassing the >5% decrease review guard in the pathway that would publish publicly. Both workflows need the same accepted-baseline restoration.
5. **Source dates are copied from static research metadata.** SK/MB `asOf` values are stored in source definitions and copied into every future release, then preferred over upstream metadata in the UI. These snapshot-specific dates must be derived from the actual acquisition or labeled as historical research references.
6. **Operating instructions are behind the implemented baseline flow.** The document says scheduled refresh compares a committed catalog; the workflow already restores a previous artifact. Update the instructions together with both workflow repairs.

7. **Monitor recovery could forget the last successful digest.** A failed fetch originally nested the old record and removed its top-level digest. The repaired monitor preserves the last successful hash and timestamp across failures; the new success → failure → changed-success regression test passes.

All seven findings above are repaired in the inspected files. Central detail loading now handles restored selections, displays pending/error/retry states and guards late responses. Both workflows restore the successful baseline artifact, which includes transport hashes. Snapshot source dates come from current acquisition evidence, with fixed research dates kept separate. Documentation matches this behavior. Workflow configuration was reviewed; its actual GitHub execution and environment permissions are not established by this local review.

## Actual release verification

Validated release `fb7e27f1a9d1ce111674` using the production validator. All 326 catalog/index/detail files pass checksum, count and reference validation. The catalog contains **316,717 records** across five published source layers:

| Layer | Records |
| --- | ---: |
| Alberta abandoned-well surface locations | 238,158 |
| Ontario petroleum well records | 27,639 |
| British Columbia well surface authorizations | 34,425 |
| Saskatchewan orphan-designation inventory | 4,340 |
| Manitoba petroleum well locations | 12,155 |

Each acquired source count equals its verified normalized count; no records were dropped. These are source records, not necessarily unique physical wells or a national total. The AER download reports a Last-Modified date of 2025-01-30 despite retrieval on 2026-10-17 local time; the app keeps retrieval and source freshness separate.

The real public release gate **fails as expected with 62 unmet conditions**: launch is disabled, each required province/topic lacks complete evidence, and the catalog explicitly declares national incompleteness. This is the correct result for this candidate.

## Sound boundaries observed

The candidate explicitly distinguishes complete enumeration of a published source layer from complete provincial or national coverage. Missing orphan designations remain unknown; whole-well closure, orphan designation and reclamation are separate. Source failures retain the previous catalog; staged releases and content hashes support coherent publication. The public build uses an explicit allowlist and rejects symbolic links, traversal, incompatible publication purpose, broken references and altered release files. The server implements GET/HEAD only and limits serving to its manifest. The national gate remains disabled and incomplete coverage fails closed. Data availability does not automatically establish public redistribution rights.

## Release limits

The enabled layers cover five provinces and do not satisfy the requested complete national dataset across wells, infrastructure and transportation charges. No public launch, recurrent successful scheduled run, real public-load benchmark, cross-browser certification, screen-reader audit or legal certification has been established by this code review. Browser verification of the revised candidate is being performed separately by the implementation owner; this reviewer has not claimed an independent browser pass. GitHub Pages does not apply the emitted `_headers`; this host difference is documented. The selected deployment service must be verified at its actual URL before public acceptance.
