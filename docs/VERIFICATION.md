# Release candidate verification

Verified October 17, 2026 (America/Edmonton); hosted execution timestamps are October 18 UTC.

## Data and hosted execution

The first [hosted refresh](https://github.com/the-prairie/canada-in-motion/actions/runs/39098379760) succeeded from source commit d71cfe7. It acquired 316,717 source records: AB 238,158; BC 34,425; SK 4,340; MB 12,155; ON 27,639. All enabled source layers were enumerated; this does not establish complete provincial inventories. The downloaded source-baseline artifact reproduced these counts. See HOSTED-VERIFICATION.json and VERIFIED-SNAPSHOT.json.

Twelve transport publication monitors established a baseline. Trans Mountain returned HTTP 403. This is recorded as a failed source check even though the candidate build succeeds. No rate is promoted by a successful fetch. The daily 10:17 UTC schedule is configured; manual hosted execution is verified, scheduled recurrence is not yet observed.

## Automated checks

21 Node tests passed: domain calculations, shared state, CSV escaping, publication rights, immutable file checksums, allowlisting, path traversal, symlink rejection, HTTP methods, caching and the public-release gate. Seven Python tests passed: acquisition failure retention, malformed records, count drops, publication permissions, partial-refresh rejection, monitor recovery across an outage and shapefiles without SHX. The verified build contains 353 public-package files and 316,717 records.

## Browser checks

The candidate was inspected at desktop 1440 × 900 and mobile 390 × 844. Verified transport estimates, full inventory loading, Ontario filtering, lazy record provenance, Québec's unavailable inventory state, disabled unavailable exports, province map fitting, and all 13 jurisdictions in the coverage dialog. The mobile table was repaired so all three columns remain visible. Reloading a shared Ontario record view restored its detailed source fields and documented event. The record-detail loading path and shared view restoration were also reviewed independently. Screenshots are supplied beside the local project folder.

## Review and limits

A fresh agent accepted the scoped private candidate after repair of its findings; see INDEPENDENT-REVIEW.md. Public launch remains blocked by missing coverage, rights and current transport evidence. No public deployment, production load test or screen-reader speech audit has been performed. The security checks are concrete release controls, not a security certification.

Model the Domain drove separate orphan, abandonment, reclamation, government-charge and carrier-charge fields. Prove It Works required real acquisition, failure tests, browser inspection and an actual hosted run rather than relying on configuration alone.
