# Canada in Motion

A noncommercial Canadian energy atlas. Explore published well records, dated pipeline tolls and explicit scenarios. This repository is a launch candidate. It is not a complete national inventory and public deployment is disabled until the release gate passes.

## Run

Use Node 22 and Python 3.12. Create a virtual environment, install `pipeline/requirements.txt`, and run `python pipeline/refresh.py`. This acquires every record in each enabled, permitted source layer. It takes several minutes and requires network access.

Run `npm test`, `python -m unittest discover -s pipeline -p 'test_*.py'`, then `npm run build`. Run `npm run preview` to serve the allowlisted build on localhost. Detailed well records load on demand. Tariff amounts remain restricted to their independently verified shipment dates.

## Coverage

Read `data/national-coverage.json` and `docs/WELL-SOURCES.md` before interpreting a count. A full source layer can still be a partial provincial inventory. Orphan designation, wellbore abandonment and site reclamation are independent facts. Missing data never means zero wells or zero charges.

The public resource is noncommercial. AER material is attributed and is not an official AER version or endorsement. Other datasets retain their own licences. Source code licensing does not grant additional rights to source data. Restricted Québec and Newfoundland datasets are excluded from publication.

## Updates and launch

Daily acquisition is configured in GitHub Actions. An atomic catalog points to a verified immutable release. Failed acquisition cannot replace a previous successful catalog. Workflow artifacts retain candidate snapshots; a separate manual deployment workflow runs the public release gate. A configured workflow is not proof that the schedule has successfully run. See `docs/OPERATIONS.md` and `docs/LAUNCH-STATUS.md` for verified status and remaining gates.

No visitor account is required. Scenarios and preferences stay in browser storage. There is no application analytics, advertising, tracking pixel or server-side collection of search text. A hosting provider may keep access logs under its own policy.
