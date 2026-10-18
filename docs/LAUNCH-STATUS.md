# Launch status

The private candidate now contains **317,129 source records in six provinces and Yukon**, plus openly licensed historical infrastructure and dated CER benchmark references. This is suitable for review as a public beta with explicit coverage gaps. It does not meet the original complete-national-product requirement. Public deployment remains disabled and no public site is live.

## Resolved in this follow-up

- Added Yukon: 76 records under the Yukon Open Government Licence.
- Added Nova Scotia: 125 onshore records observed through February 1, 2016, and 211 historical offshore directory records under explicit open licences. Six empty onshore placeholders are recorded as exclusions; all other malformed records still fail acquisition. Offshore re-entries retain distinct composite identities.
- Added NRCan CanVec historical geometry: 1,253 pipeline segments and 21 refinery point records under OGL Canada. Pipeline feature dates extend through 2002; refinery dates are 2016. These are not a current operating inventory or a count of unique refinery sites.
- Added CER benchmark snapshots: 216 observations across 25 systems, with dates, units, services and source downloads. They cannot enter the shipment calculator. Pipeline attribute data for 26 systems is included in the verified context package.
- Replaced the blocked Trans Mountain index monitor with its official tariff PDF and added official CER reference monitors. A fixed PDF cannot discover its own successor; source checks do not establish current tariff applicability.
- Daily well acquisition and weekly context acquisition preserve original retrieval dates, fail on integrity/schema/count issues, and retain the previous complete group after a failure.
- The report-only beta readiness check passes locally. It always returns `launchAuthorized: false`; it does not bypass the stricter national deployment gate.

## Exact decisions needed to launch

**Recommended route: approve a public beta and make `the-prairie/canada-in-motion` public so it can use free GitHub Pages.** This exposes the source repository as well as the app. A custom domain, payment account and new API keys are not needed for that route. The proposed address is `https://the-prairie.github.io/canada-in-motion/`; it is not live yet.

Two decisions remain: accept the explicitly incomplete beta scope, and approve public repository visibility. If the code must stay private, identify a hosting account/plan that supports the private repository. A paid plan or different host has not been selected or purchased.

After approval, implement a separately reviewed beta publication policy that enforces licensed sources, source freshness, integrity and visible coverage disclosures; retain the national completeness check for any complete-product claim. Then configure Pages and the deployment environment, publish, and verify HTTPS, project-relative URLs, shared views, mobile rendering and the live release ID at the actual URL. Automatic public updates require that same approved publication policy; the current schedule prepares private candidates only.

## Data needed for national completeness

Québec, Newfoundland and Labrador, New Brunswick and Prince Edward Island still have no integrated, verified open petroleum inventory. Current Nova Scotia coverage remains unresolved despite its reusable historical records. Alberta and Saskatchewan loaded cohorts do not represent every well. Orphan designation and site reclamation remain separate gaps in many sources. Northwest Territories and Nunavut are accounted for as unfilled territorial coverage.

Current national pipeline/refinery/LNG coverage, full commodity/mode-specific carrier rates and applicable government charges remain incomplete. Historical geometry and benchmark prices do not close those gaps. A province-to-province all-goods price matrix cannot be inferred from the available public schedules.

See [prepared authority requests](DATA-ACCESS-REQUESTS.md) and the [eastern source investigation](OPEN-EASTERN-SOURCES.md). No external request has been sent. These permissions are needed to expand the product, not to display the already cleared beta sources. The resource must remain noncommercial while it uses AER material under the verified noncommercial terms.

## Verification

The expanded hosted run 39102260809 succeeded with 317,129 records, all context counts, a passing report-only beta check and 15 successful transport publication checks. See VERIFICATION.md for local tests, browser checks and hosted execution evidence. GitHub scheduled recurrence and public deployment are distinct from successful manual candidate runs. Review reports are scoped evidence, not a claim of national completeness or a security certification.
