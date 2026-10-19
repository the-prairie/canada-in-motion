# Public AI launch

## Chosen deployment

Keep the website and its 275 MB of published data on GitHub Pages. Run the AI API on Cloudflare Workers, with a SQLite Durable Object for usage accounting and Turnstile for automated-request protection. The public app keeps its current address. A custom domain is optional.

The largest well index is about 50 MB, above Workers' 25 MiB individual static-asset limit. Moving the whole site would add data-storage work without improving the analyst. The small API bundle can deploy separately. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

Use **Workers Free** for launch. The public Worker only checks the route, origin and configuration, then relays the request. Validation, evidence loading, accounting and inference execute inside the SQLite Durable Object, which has a default 30-second CPU allowance; network wait is separate. There is no paid CPU override or required US$5 subscription. [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

The free tier includes 100,000 Durable Object requests and 13,000 GB-s of duration per day, plus 5 GB of storage. Our 20 admitted analyses/day at a 60-second inference timeout would consume roughly 150 GB-s/day for those inference waits, before verification and other work. This is a planning estimate, not an abuse-proof bound or deployed CPU measurement. Free limits are shared with other account workloads; exceeding them stops the affected operations rather than creating paid overages. Do not upgrade the account automatically. [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Implemented

- `server/cloudflare-worker.mjs`: HTTPS relay with exact GitHub Pages CORS origin. The internal Durable Object handles the strict input schema, bounded request body and timeouts, server-side Turnstile checks, and analysis. No question/answer logging.
- `AnalysisQuota`: atomic SQLite reservations shared by every Worker instance, retained across restarts and deployments. Limits are 20 admitted analyses per UTC day, 100 per calendar month, three per network address per UTC day, six per minute and two concurrently. Failed admitted calls count. Leases recover after a terminated request.
- Turnstile verification requires success, the exact website hostname and the `energy_analysis` action. Tokens expire and are single-use. [Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- Only a daily HMAC of the edge-provided network address is stored. Raw IPs, questions and answers are not written to the app database. Daily counters expire; alarms remove expired rows. Shared networks share the allowance. This is a fair-use control, not individual identification.
- The Worker reads the public `economy.json` and `energy-debate.json`, caches them for five minutes and validates them before analysis. Economic data older than eight days stops new analyses. Existing daily publication refreshes therefore reach the AI without redeploying Worker code.
- The browser loads the public API origin from `ai-config.json`. The build permits only that HTTPS origin and Cloudflare's challenge host in CSP. No API key reaches the browser or public artifact.
- The form supports verification, cancellation, timeout, retry, quota messages and retention of the previous answer. Nothing is sent to OpenAI until the visitor submits a question and passes verification.
- `npm run test:ai:edge` runs the bundled Worker in Cloudflare's actual `workerd` runtime with simulated upstream responses. It covers CORS, validated answers, token replay, wrong hostname/action, restart persistence, overlapping public analyses, private accounting routes, concurrent admission, provider failures and the kill switch. Node tests additionally check UTC day/month rollover, expired leases and input bounds.

## Current blockers, verified 18 October 2026

1. Cloudflare is signed in to the intended account, but the OAuth grant covers Pages rather than Workers and Turnstile. It needs the additional scopes listed below.
2. Copying the existing OpenAI key to Cloudflare has not been approved. Its current approved destination is only the ignored local `.env.local` file. Nothing has been uploaded.
3. A real Responses request returned HTTP 429, `credit_balance_exhausted`, `insufficient_quota`. A read-only model lookup returned HTTP 200 for `gpt-6-astra`, so the key authenticates and the model is accessible. API credit must be replenished before a public answer can pass verification. [OpenAI billing](https://platform.openai.com/settings/organization/billing)
4. No paid hosting subscription is required. The production API budget remains a separate decision. Suggested initial API ceiling: US$25/month; this is a spending cap, not a required subscription or purchase. Confirm the scope before setting a project limit: the existing key belongs to Default project, so its project limit may also affect other applications using that project.

`AI_ENABLED` remains `0`, and the public origin remains `null`, until these are resolved. Status means configured, not a guarantee that a provider request will succeed. A real completed public answer is required for launch acceptance.

## Cost controls

The API uses `gpt-6-astra`, at most two Responses requests per answer, `store:false`, explicit low reasoning effort and a maximum of 2,200 output tokens per request. Requests are limited to 50,000 UTF-8 bytes, with duplicate evidence removed. There are no automatic paid retries or external model tools.

Current published standard pricing is US$10 per million input tokens and US$50 per million output tokens. The output allowance alone can therefore cost up to US$0.22 per analysis, plus input tokens. Daily/monthly request limits do not constitute a dollar cap. [Model and pricing](https://developers.openai.com/api/docs/models/gpt-6-astra)

Use an OpenAI enforced project spend limit, not just an alert, after confirming the correct project scope. OpenAI documents a possible small overrun while usage propagates. The existing key has a 30-day expiry and needs rotation before its configured expiration. A longer-term production key should be project-scoped and stored only in the hosting secret store. [Spend limits](https://developers.openai.com/api/docs/guides/spend-limits)

## ChatGPT plan versus API billing

The API-key route uses separately billed API usage. A ChatGPT/Codex credit balance is not automatically available to this app’s API key. The verified exhausted-credit error concerns the API account, not the user’s Codex credit balance. [OpenAI pricing](https://learn.chatgpt.com/docs/pricing)

Sign in with ChatGPT can let eligible users spend their own plan allowance in supported integrations. OpenAI’s current public documentation covers open-source, locally hosted apps and directs remotely hosted apps through an interest/application process. It is a possible later route, not an activated replacement for public API billing. Each user would authorize their own usage. [Integration scope](https://developers.openai.com/siwc/token-sharing-open-source)

## Activation sequence

The owner approves free-tier Cloudflare authorization, the key destination and API spend-limit scope. Then:

1. Reauthorize the Cloudflare account using only the required scopes. Existing Pages access is retained:

   ```sh
   npx wrangler login --scopes account:read user:read workers_scripts:write workers:write challenge-widgets.write pages:write offline_access
   ```

   Complete the authorization page. Use the free tier; do not enable Workers Paid.

2. Create a managed Turnstile widget named `Canada in Motion`, limited to `the-prairie.github.io`. Save its public site key in `wrangler.jsonc` under `vars.TURNSTILE_SITE_KEY`. Keep `AI_ENABLED` set to `0` for the first deployment.
3. Run `npm ci`, `npm test`, `npm run test:ai:edge`, then `npm run deploy:ai`. The account and Worker name are pinned in `wrangler.jsonc`.
4. Put `OPENAI_API_KEY`, `TURNSTILE_SECRET_KEY` and a random, at least 32-character `VISITOR_HASH_KEY` in this Worker's encrypted secret store. Transfer the approved local OpenAI key through stdin/in-memory tooling; never put it in command arguments, a workflow variable, Git, a screenshot or chat. Do not rotate the visitor hash casually because that resets per-network accounting for the current day.
5. Replenish OpenAI credit and configure the approved project spend limit. If Default project is shared, isolate the app before changing limits that would affect other applications.
6. Set `AI_ENABLED` to `1`, deploy, and copy the actual HTTPS Worker origin returned by Cloudflare. Run `node scripts/connect-public-ai.mjs <actual-origin>`. This verifies the service's origin, configured status and matching Turnstile site key before writing the public configuration.
7. Commit the public origin/site key and publish the GitHub Pages build. The build embeds the matching CSP. Do not use wildcard CORS or `unsafe-eval` to fix integration errors.
8. In the public browser, complete Turnstile and ask a question. Verify a completed cited answer, correct data version, a second visitor request and the quota response. Verify the API key is absent from the public build. Record the actual Worker and Pages deployment revisions.

No new domain, separate database service or GitHub credential is required. GitHub continues refreshing the datasets. Worker source updates are deployed from this authorized workspace; `.github/workflows/ai-checks.yml` verifies them in CI without production credentials.

## Operations

To pause AI, set `AI_ENABLED` to `0` and redeploy. Maps, records, published scenarios and calculations remain available. To disconnect the frontend completely, restore `config/ai-public.json` to `{"apiOrigin":null}` and republish Pages.

Do not delete the Durable Object namespace or change the `public-analysis-v1` object identity during ordinary deployments, as doing so would reset accounting. Rollbacks use the previous Worker code with the same namespace and schema. The initial migration is additive.

Cloudflare operational metrics can diagnose CPU/error rates. Request-body logging is disabled. OpenAI receives the visitor's question and selected public evidence with `store:false`; provider retention policies still apply. Turnstile processes browser verification signals and the network address.

## Local development

`npm run build && npm run start:ai` serves the existing Node development server on `127.0.0.1:4175`, using the approved ignored `.env.local`. It is for private testing only. Its per-process limits are not the public accounting mechanism. `npm run dev:ai:edge` runs the Worker locally; the shipped public Worker deliberately accepts only the public site's origin.

The analyzer selects supported inputs, computes results deterministically, then explains the evidence with checked citations and numerical placeholders. It does not infer uncalibrated provincial GDP, jobs or household-bill responses. Qualitative model interpretation still needs review; validation does not prove every sentence true.
