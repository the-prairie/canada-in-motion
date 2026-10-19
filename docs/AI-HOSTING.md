# Public AI launch

## Deployment and current status

The user approved Workers Free and encrypted secret storage on 18 October 2026. Keep the website and its roughly 275 MB of data on GitHub Pages; deploy the small API to `canada-in-motion-ai` on Cloudflare Workers. The largest well index exceeds Workers' 25 MiB individual static-asset limit. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

The free service uses **Llama 3.3 70B** through the Workers AI binding. It does not need an OpenAI key or funded OpenAI account. The model selects a supported scenario and relevant findings from a source-backed catalog. The server supplies wording, numbers, units, scope and citations; the free model cannot write arbitrary economic claims. [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)

## OpenRouter evaluation

On 19 October 2026 the owner completed OpenRouter's PKCE authorization. The key was saved in an owner-readable, Git-ignored local file and transferred through stdin to the Worker's encrypted `OPENROUTER_API_KEY` secret. It was never printed or included in the public build. The account reported 1,000 free-model calls per day and zero usage charges during the evaluation. Account allowances can change; no credits were purchased.

Cloudflare remains the public provider. The eight-question comparison found SuperVL's fast mode quicker, but weaker on Québec benefits and equally vulnerable to misreading an unsupported percentage. Its bounded reasoning mode returned only three valid, correctly selected answers out of eight; four requests timed out. Ultra timed out in its single test. These are limited application tests, not a general ranking. See [the recorded comparison](OPENROUTER-EVALUATION.json).

The comparison was a release smoke test: one trial per case/configuration, no held-out question set, no randomized provider order, and no calibrated answer-quality score. Provider-specific prompts and token settings were tuned during investigation. The independent review was not blinded to model names. Timeouts measure the model and hosted service together; they do not establish that the underlying model cannot answer. The software test count is separate from the number of live model questions.

Subsequent grader review found that comparing two absent error codes could count an unclassified exception as an expected rejection. The saved comparison failures had explicit codes, so its reported scores were not inflated by that bug. Both probe scripts now share `ai-trial-grading.mjs`: a nonempty expected error must match exactly, an unexpected successful answer cannot satisfy a required rejection, and correctly rejected requests count as guard outcomes rather than validated model answers. Historical results remain unchanged.

`scripts/probe-openrouter.mjs` uses fixed public questions and the existing state, evidence and citation validators. Its adapter permits only named `:free` models, sets all provider maximum prices to zero, disables fallbacks and enables no paid plugins. It is not wired into the live Worker. If reconsidering a switch, repeat the benchmark and update the public recipient/privacy notice first: OpenRouter and the chosen model host would receive the question and public evidence, and free-provider retention policies vary.

The comparison also found a shared percentage-parsing defect. The server now rejects explicit English oil-price requests outside its supported range before inference, including numeric, spelled-out and fraction forms. The check matches a price-change phrase, so unrelated gas changes, GDP shares and durations do not trigger it. It is not a complete natural-language parser. Supported answers no longer include a contradictory general out-of-scope paragraph; partial unsupported price questions lead with the missing calculation.

To reconnect after revoking the key, run `node scripts/setup-openrouter.mjs` and complete its one-use, loopback-only authorization page. An existing credential file causes setup to stop rather than overwrite it. For evaluation, use `node scripts/probe-openrouter.mjs --extended`; `--no-reasoning` selects the faster comparison profile. Reports are saved privately in `.data-cache/`; only reviewed fixed-question results should be committed. No key is read by browser code.

## Cloudflare launch

Cloudflare authorization is complete and the account was verified as Workers Free in the dashboard on 19 October 2026. The Worker is deployed at `https://canada-in-motion-ai.thelaurenzary.workers.dev`. A managed Turnstile widget is restricted to `the-prairie.github.io`; its secret and the visitor-hash secret are stored in the Worker's encrypted secret store. No OpenAI key was uploaded.

The live four-question evaluation passed for Alberta oil sensitivity, Québec contribution and benefits, unsupported gas/GDP/bill estimates, and attempted invented figures. An independent reviewer accepted the constrained answer catalog for a bounded release. The results establish this sample, not universal relevance. Arbitrary free-form Llama and GPT-OSS answers did not meet the app's checks and are not enabled. The public browser completed a real Turnstile-verified question and downloaded its answer, calculations and sources on 19 October 2026. An initial Turnstile stall recovered with Try again. See `AI-LAUNCH-VERIFICATION.json` for the verified revision, data timestamp and test scope.

## Free allowance and cost controls

Workers AI includes **10,000 neurons per account per UTC day**. On Workers Free, requests fail when the allowance is exhausted; more usage requires an explicit paid upgrade. Other apps on the account share the allowance. The account was confirmed on Free before activation. Do not upgrade it automatically. [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

The app allows ten admitted analyses per UTC day, 100 per calendar month, three per network address per UTC day, six per minute and two active analyses. These counts are conservative launch controls, not a guarantee of ten successful answers: provider capacity, free allowance and validation can stop an answer sooner. Failed admitted calls count. There are no automatic model retries or paid fallbacks.

Each analysis has at most two calls: a 256-token scenario selection and a 1,200-token explanation. Input is bounded to 50,000 UTF-8 bytes per call. Repeated numeric contexts and source-download metadata are removed from the model payload; the full evidence remains available to validate and display the answer. No numbers, units, observation periods or source identities are discarded.

Llama's published rates are 26,668 neurons per million input tokens and 204,805 per million output tokens. The combined output cap is about 298 neurons per analysis, plus input consumption. The reviewed four-case run used about 376 neurons in total and took 2.8–4.6 seconds per answer through the API. This is a small sample, not a promised daily answer count or public-browser latency. [Model rates](https://developers.cloudflare.com/workers-ai/platform/pricing/)

The optional OpenAI adapter now defaults to **GPT-6 Luna**, at US$0.10 per million input tokens and US$0.50 per million output tokens for standard short-context requests. It is disabled for the public free configuration. Switching requires an explicit `AI_PROVIDER=openai` deployment and a funded API account. The existing key previously returned exhausted API credit; no successful Luna answer has been verified. A ChatGPT/Codex plan does not automatically fund this key. [Luna pricing](https://developers.openai.com/api/docs/models/gpt-6-luna)

## Runtime and data handling

The public Free Worker checks route, origin and configuration, then relays to a SQLite Durable Object. The object handles validation, evidence loading, inference and atomic usage accounting. Durable Objects have a default 30-second CPU allowance; network waits are separate. No paid CPU override is configured. [Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

The free object allocation includes 100,000 requests, 13,000 GB-s per day and 5 GB storage. Ten analyses waiting 60 seconds at 128 MB would use roughly 75 GB-s before verification and other work. This estimate is not an abuse-proof bound or a deployed CPU measurement. [Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

- Exact-origin CORS permits only `https://the-prairie.github.io`.
- Turnstile requires success, the exact hostname and the `energy_analysis` action. Tokens are single-use. [Validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- The database stores a date-rotated HMAC of the network address and temporary counters. It does not store raw IPs, questions or answers. Shared networks share the allowance.
- Published economic and debate data are loaded from fixed public URLs and cached for five minutes. Economic snapshots older than eight days stop new analyses.
- Scenario selection and finding IDs are validated. The free route assembles source-backed findings with their mandatory scope and caveats. Unknown IDs, duplicate IDs, missing limitations and arbitrary output fields are rejected. The optional OpenAI prose path remains separately validated and disabled.
- The browser identifies Cloudflare Workers AI as the recipient before submission. Cloudflare receives the question and selected public data; Turnstile processes verification signals. Provider policies still apply. No blanket zero-retention claim is made.
- A 60-second application timeout prevents a late response from being shown or starting a second call. The Workers AI binding has no documented cancellation option, so an already-running upstream call may finish. The concurrency limit bounds active application requests, not guaranteed simultaneous GPU work.
- Request-body logging is disabled. No API key or deployment credential is included in the public build.

## Activation sequence

The free setup and secret destination are already approved. Authorization, the Free-plan check, widget creation and encrypted secret storage are complete. The sequence below documents setup and future redeployment.

1. Renew authorization, retaining Pages and adding the required services:

   ```sh
   npx wrangler login --scopes account:read user:read workers_scripts:write workers:write ai:write challenge-widgets.write pages:write
   ```

   Wrangler adds its refresh scope automatically. Complete the browser authorization. Confirm Workers Free in the dashboard; no paid subscription is required.
2. Run `node scripts/probe-free-ai.mjs`. It uses the current Wrangler credential in memory, makes at most eight model calls for four fixed public questions, and saves a private local report in `.data-cache/free-ai-evaluation.json`. Review actual answers for Alberta oil sensitivity, Québec benefits, unsupported gas/GDP forecasts and prompt injection. It records validation, state selection, latency and token usage. A successful schema check alone does not authorize activation.
3. Create a managed Turnstile widget named `Canada in Motion`, limited to `the-prairie.github.io`. Put its public site key in `wrangler.jsonc`. Keep `AI_ENABLED=0` for the first deployment.
4. Run `npm test`, `npm run test:ai:edge`, then `npm run deploy:ai`. The account and Worker name are pinned in `wrangler.jsonc`.
5. Store `TURNSTILE_SECRET_KEY` and a random, at least 32-character `VISITOR_HASH_KEY` in this Worker's encrypted secret store. Transfer values through stdin/in-memory tooling, never command arguments or chat. The approved OpenAI key can be stored there if the optional OpenAI route is needed; the free route neither requires nor uses it. Do not reset the visitor hash during ordinary deployments.
6. After model acceptance, set `AI_ENABLED=1` and deploy. Run `node scripts/connect-public-ai.mjs <actual-HTTPS-Worker-origin>` to verify provider/model, CORS and the matching Turnstile site key before saving the public endpoint.
7. Publish Pages with the generated CSP. In the actual public browser, submit a question through Turnstile and verify the cited answer, data version, retry/cancel behavior and quota response. Scan the build for secrets. Record both deployment revisions and measured runtime behavior.

No domain purchase or separate database service is needed. GitHub continues refreshing the datasets. CI tests changes without production credentials.

## Operations and tests

Pause inference with `AI_ENABLED=0` and redeploy. To disconnect the frontend, restore `config/ai-public.json` to `{"apiOrigin":null}` and republish. Maps and deterministic calculations remain available.

Preserve the Durable Object namespace and `public-analysis-v1` identity through normal deployments and rollbacks so usage accounting is retained. Expired counters and leases are cleaned up automatically.

`npm run test:ai:edge` uses real workerd with simulated upstream responses. It covers the Cloudflare binding path and optional OpenAI path, exact-origin CORS, Turnstile validation, persistence, atomic quotas, overlapping requests, no paid fallback and the disabled state. Node tests cover evidence compaction, malformed outputs, citation/number checks, timeouts, UTC resets and input bounds.

`npm run build && npm run start:ai` runs the private local Node server on `127.0.0.1:4175` using the approved ignored `.env.local`. That local server uses the optional OpenAI adapter and its separate API billing. It is not the public free service.
