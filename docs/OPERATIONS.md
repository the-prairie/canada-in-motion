# Operating the approved public beta

The owner approved public repository visibility and an explicitly incomplete, free noncommercial beta on October 18, 2026. `config/publication.json` records this scope. The beta gate checks rights, integrity, acquisition freshness and explicit jurisdiction/topic limitations. The separate national-completeness gate remains enabled and fails until its evidence requirements hold.

## Local verification

Use Node 22 and Python 3.12. From the repository root:

```sh
python -m pip install -r pipeline/requirements.txt
node --test tests/*.test.mjs
python pipeline/refresh.py
python pipeline/refresh_context.py
python pipeline/refresh_bcer.py
node scripts/beta-release-gate.mjs
node scripts/build-public.mjs
node scripts/serve-public.mjs
```

The candidate listens on `http://127.0.0.1:4174/`. `HOST` and `PORT` can change the bind address. Never expose the old development server or the repository root. The public server serves only the build manifest allowlist inside `dist/`. A new build requires a server restart because each server instance retains its startup manifest.

```sh
node scripts/release-gate.mjs
```

A successful public gate additionally requires an explicitly enabled launch, licensed catalog sources, current retrieval evidence, and complete documented coverage for AB, BC, SK, MB, ON, QC, NB, NS, PE and NL across inventory, orphan status, abandonment status, infrastructure, carrier rates and government charges. A sourced historical tariff is still historical. Refreshing a website does not prove its old rate is currently applicable. Coverage declarations must be reviewed against their authorities, not mechanically promoted because data arrived.

## Publication boundary

The build copies named app files, named bundled vendor assets and their licence notices, named static data, the coverage registry, verified open context files, and only the catalog's verified index and detail shards. It rejects unapproved source rights, purpose mismatches, incomplete enumerations, unreviewed dropped records, mismatched counts, duplicate record IDs, broken detail references, SHA-256 mismatches, path traversal and symbolic links. Raw downloads, `.data-cache`, configurations, acquisition reports, old `wells.json`, source tooling, tests and internal documentation are excluded.

`dist/health.json` identifies the candidate release, record count, retrieval time and build time. Its `public-beta` status does not certify national coverage, live upstream availability or legal review. `build-manifest.json` records hashes of public files; the Node server uses it internally and does not serve it. The artifact remains inspectable on disk.

The source registry is a reviewed trust boundary. Automated gates cannot decide whether a regulator's licence applies, whether a list includes every well, or whether a government charge is legally payable. Review changes to permissions, coverage and source definitions through pull requests with source evidence. Protect the default branch and require a reviewer for public launch configuration changes.

## Daily refresh

`.github/workflows/refresh.yml` runs at **10:17 UTC daily**, which is **04:17 MDT or 03:17 MST in Edmonton**, and can be dispatched manually. GitHub scheduled workflows may be delayed; this is not a precise delivery SLA. Scheduling only becomes active after this workflow is pushed to the default branch and Actions is enabled.

Each run installs pinned Python packages, runs Node tests, retrieves all enabled permitted sources, validates the full enumeration, builds an allowlisted candidate, and uploads a uniquely named review artifact. A failed acquisition does not advance the catalog or overwrite the last deployed public site. Failure reports are retained for 90 days; successful candidate artifacts for 30 days. Enable GitHub Actions failure notifications for the repository in your GitHub notification settings. No email, webhook or credentials for another messaging service are configured.

Successful refresh runs trigger the approved beta publication workflow via `workflow_run`; failed refreshes do not publish. Refresh and deployment runs restore the latest successful refresh artifact containing the catalog, transport publication hashes and the verified open context and BC permit groups. Count-drop validation compares against that previous successful snapshot. The first run has no historical baseline. If the baseline artifact is unavailable, the workflow fails rather than silently dropping this check. Preserve releases outside transient Actions artifact retention if long-term auditability is required.

An upstream schema change, a count decrease beyond the configured threshold, or a licence uncertainty should block a new source release. Inspect `refresh-report-<run-id>`, compare source definitions with the authority, repair the adapter or rights record, rerun tests, then dispatch a new refresh. Never change retrieval timestamps to conceal a failed refresh. Carrier publications require human-reviewed rate imports; this workflow does not silently turn newly observed PDFs into authoritative toll schedules.

## Public launch

The `deploy.yml` workflow runs on manual dispatch or successful default-branch refresh completion. It runs tests, fresh well acquisition, weekly context/BC verification and `beta-release-gate.mjs` before building and uploading. Only the deployment job has `pages: write` and `id-token: write`. Workflows use GitHub's scoped job token; official actions are pinned to reviewed commit SHAs.

Pages is configured for GitHub Actions on the public `the-prairie/canada-in-motion` repository. The `github-pages` deployment environment is restricted to `main`. Changes to licence/coverage policy must retain source evidence. A required-reviewer rule is not installed: approved scheduled deployments do not wait for manual approval. No custom domain is required or purchased.

After a deployment, verify the HTTPS site, health record, shared views, mobile layout and source dates. Current verified run links are in `LAUNCH-STATUS.md`.

## Security and host differences

The Node server implements GET/HEAD only, an allowlist, raw/encoded traversal rejection, symbolic-link rejection, per-request SHA-256 integrity checks, MIME types, gzip negotiation, ETags, immutable caching only for release paths, and `no-cache` for mutable app/catalog files. It sends CSP, no-sniff, no-referrer, frame denial and restrictive permissions headers. CSP permits inline styles because Leaflet positions map elements through style attributes; scripts remain self-hosted and inline scripts are disallowed. It has no visitor accounts, credentials, mutation API or third-party analytics.

The build injects a CSP meta tag for static hosts and emits `_headers` for compatible hosts. **GitHub Pages does not honor `_headers` and cannot reproduce every Node response header.** In particular, CSP `frame-ancestors` requires a response header; the meta policy cannot provide it. If response-level frame protections, custom cache policies or HSTS are a launch requirement, deploy behind a host/proxy that supports those headers instead of assuming Pages applies them. The Node server does not terminate TLS and should sit behind a managed HTTPS reverse proxy for internet use.

The filesystem is assumed read-only to untrusted users. The server verifies allowed file bytes against the startup manifest, but this is not a general sandbox against a local administrator replacing the executable or manifest. No penetration test, public concurrency benchmark, cross-browser certification, disaster recovery exercise or compliance audit is implied. Serving large indexes reads those files into memory per request; benchmark realistic concurrency at the selected host before setting traffic commitments.

## Rollback

A failed refresh or gate never deploys. For a regression discovered after publication, keep the prior verified artifact and its manifest, restore that exact artifact through the selected hosting provider's deployment rollback, then verify `/health.json` and the reported release ID. GitHub Pages workflow reruns reacquire data, so rerunning an old job is **not** an exact immutable rollback procedure. For an exact Pages rollback, download the retained approved artifact and publish it through a separately reviewed rollback workflow after checking its hashes and freshness; this package does not silently bypass the release gate. Freeze further publication while investigating and keep the failed release's acquisition report for the audit trail.

## Open context refresh and beta report

`python pipeline/refresh_context.py` acquires the NRCan historical geometry and CER benchmark/attribute sources as one staged group. It checks upstream OGL metadata, enumerates all current catalogue CSV resources, preserves raw units and observation dates, and excludes future/undated benchmark rows with counts. A failure leaves the prior group intact. Sources are reacquired when the oldest group acquisition is at least seven days old. Between acquisitions every stored file hash is checked and the original retrieval timestamp remains unchanged. `--force` requests fresh acquisition.

The first benchmark acquisition downloads about 430 MB; the public snapshots are much smaller. Local research recovery can use `CIM_CONTEXT_RESUME=1` only for files younger than four hours. CI never enables research-cache reuse. Well acquisition remains daily. A new retrieval does not make historical source observations current.

`npm run readiness:beta` reports the technical status of the incomplete candidate and always leaves launch unauthorized. It verifies source rights/integrity, freshness and explicit coverage for every jurisdiction/topic. It does not alter publication configuration or weaken `npm run gate:public`. The owner-approved scope and beta deployment policy are recorded in publication configuration.

## BC permit refresh

`pipeline/refresh_bcer.py` verifies the official dataset item licence, complete ID enumeration, duplicate identities, full/display counts, checksums and oldest acquisition date. It stages all four files atomically. A decline above 5% blocks replacement. Reuse within seven days preserves original source timestamps. The map retains every feature while simplifying pipeline geometry with a 10 metre tolerance in EPSG:3005. Permit statuses never become inferred operating status; the separate orphan table has no invented geometry join.
