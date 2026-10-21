# Navigation release recovery review

Reviewed 2026-10-21. **Approved for the explicit prior-deployment data reuse path**, subject to the unchanged CI tests, beta release gate, and build succeeding on the final commit. No unresolved blocking findings.

This reviews the recovery mechanism for the navigation release after Statistics Canada returned outage HTML instead of ZIP content. Application navigation has a separate desktop/mobile review. This reviewer did not deploy, change production data, call data providers, access secrets, or run foreground browser tests.

## Scope and findings

The optional `data_run_id` dispatch input is passed through an environment variable and restricted to numeric IDs. The workflow queries a run in the current repository, requires successful conclusion, the deployment workflow ID, and the main branch, then downloads its named `github-pages` artifact. Artifact expiration or missing download fails the job. The artifact is trusted through its successful same-repository deployment provenance; its own manifest supplies content integrity checks, not a separate cryptographic signature.

Archive preflight rejects absolute/traversal paths, single backslashes, duplicate normalized paths, symbolic links, hard links, and non-file/directory members before extraction. The Python 3.12 data extraction filter remains enabled.

The restoration script verifies every manifest file's SHA-256 and byte count, checks required public data, rejects unlisted data and symlinks, and requires catalog/health/manifest release identity agreement with public-beta status. It stages the entire verified data directory, swaps it into the checkout, and rolls back if installation fails. Current application files and publication configuration are preserved. Initial review identified overlay/stale-file mixing, unlisted data, and partial-write risks; the final implementation resolves them with full-directory staging and validation.

Only explicit reuse skips provider refresh, model rebuilding, and the provider-dependent reproduction steps. JS and Python tests execute after restoration. Existing rights/integrity/freshness gates and the public build remain unconditional. Normal manual and refresh-triggered deployments retain the existing refresh sequence. Retrieval timestamps are never rewritten.

## Independent verification

- `node --test tests/public-data-restore.test.mjs`: **24 passed**. Covers exact byte/date preservation, replacement of stale checkout data, preservation of current application code, unsafe/duplicate paths, bad hashes/sizes, missing/extra data, source/destination symlinks, release identity/status, and fault-injected install failure with successful rollback.
- Exact workflow tar preflight: **10 scenarios passed** under Python 3.12. A normal archive extracts; absolute/traversal/single-backslash paths, duplicate exact/normalized names, symbolic links, hard links, and FIFO members fail.
- Exact workflow run-provenance expression and input validator: **11 scenarios passed**. Accepts a successful main deployment of the same workflow and numeric run ID; rejects failed/running runs, other workflow/branch, and shell/path/non-numeric inputs.
- Independent real-artifact restore into an isolated scratch checkout: **414 public data files, 294,070,123 bytes**, every restored file matched the original manifest hash and byte count. Original release ID `6e50f5b7fe67a57c00ce` and catalog retrieval time `2026-10-21T08:13:44Z` were retained. Current application sentinel remained unchanged.
- Beta release gate passed against the restored artifact with no errors at `2026-10-21T19:35:34.133Z`. Advancing the gate clock to 2027-01-01 rejected the same artifact for stale context, BC permits, and source retrievals, confirming reuse does not bypass freshness.

Reproducible independent scripts and JSON/TAP evidence are in the ignored `.data-cache/navigation-release-review/` directory. Durable restoration regressions are in `tests/public-data-restore.test.mjs`.

The parent release process additionally reported a successful public build from restored data, 398 original JS tests and 139 Python pipeline tests passing, and 422 JS tests passing after inclusion of this review's 24 tests. Those full-suite results are parent-run evidence; this reviewer independently executed the restoration, archive, provenance, byte comparison, rollback, and stale-gate checks described above.

## Release boundary

Approval covers the reviewed recovery implementation. Successful local checks do not establish that deployment occurred. The live release must still pass the final workflow and be verified after publication. Public data remains the previous successful artifact's data, with its original retrieval dates and coverage limitations.
