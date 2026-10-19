# Run the energy analyst

The analyst selects a supported scenario, runs the app's deterministic model, then explains the results with source references. It uses at most two OpenAI Responses API calls per question. The default model is `gpt-6-astra`. Model access and billing must be enabled on the API project.

## Run locally

Use Node 22 or 24. From the repository root, build the public app and start the analysis server.

```sh
npm run build
node server/server.mjs
```

Open `http://127.0.0.1:4175/`. The server loads the approved `.env.local` file from the repository root. That file must contain `OPENAI_API_KEY`. Keep its permissions restricted to the account running the server. Never add the key to browser JavaScript, the build manifest, Git, screenshots or a Pages variable exposed to the browser.

`GET /api/analysis/status` reports whether the server has an analysis handler. `available: true` means configured, not that a billable provider request has succeeded. Without a key, the server serves the public app and reports AI unavailable.

The existing static preview command does not run the analyst. GitHub Pages cannot execute this server. It continues to serve the deterministic data and scenarios.

## Configure a hosted instance

Deploy the same public build and Node server behind an HTTPS reverse proxy. Keep the frontend and `/api/analysis` on the same origin. Configure the API key through the host's secret manager. Do not upload a local environment file into a public artifact.

Before binding a public address, configure these controls at the gateway.

1. Authenticate users or issue rate-limited visitor sessions with abuse controls.
2. Enforce persistent daily quotas across instances and restarts. Enforce per-session limits as well as the global ceiling.
3. Restrict direct access to the Node port. Forward the configured public Host header and terminate TLS at the gateway.
4. Set an API project budget, alerts and appropriate provider limits. The app's request counter is not a dollar budget.
5. Disable request-body and authorization-header logging. Document that questions and the public evidence are sent to OpenAI. Do not ask users for confidential information.
6. Test a provider success, refusal, timeout and quota exhaustion before enabling public traffic.

Then set `HOST=0.0.0.0`, `PUBLIC_ORIGIN=https://your-host.example` and `AI_PUBLIC_GATEWAY_READY=1`. The readiness flag is an operator acknowledgement. It does not install or verify the gateway controls. Set `PORT` to the port expected by the host. Do not set wildcard CORS; the server requires a matching Origin header on analysis requests.

The local implementation is ready for integration testing. Public AI launch still requires a hosting account, the gateway controls above, and a verified deployment. The current static Pages deployment is not a publicly hosted AI service.

## Configuration reference

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `OPENAI_API_KEY` | absent | Server-only credential. Absence disables analysis. |
| `OPENAI_MODEL` | `gpt-6-astra` | Responses API model with strict structured-output support. |
| `HOST` | `127.0.0.1` | Public interfaces require the explicit public-host settings above. |
| `PORT` | `4175` | Server port. |
| `PUBLIC_ORIGIN` | absent | Exact HTTPS origin for a hosted deployment, without a trailing slash or path. |
| `AI_PUBLIC_GATEWAY_READY` | absent | Set to `1` only after configuring the gateway. |
| `AI_CONCURRENCY` | `2` | Maximum simultaneous analyses in this process. |
| `AI_PER_MINUTE` | `6` | Global analyses admitted in a rolling minute. |
| `AI_DAILY_LIMIT` | `20` | Global analyses admitted per UTC day in this process. Failed attempts also count. |
| `AI_TIMEOUT_MS` | `60000` | Combined timeout for both provider passes. |

The local counters reset on restart and are not shared across instances. Each analysis permits two provider requests, each capped at 2,200 output tokens. No automatic retries or background provider calls occur. Input questions are limited to 2,000 characters and request bodies to 8 KiB. These bounds control requests and tokens; they do not guarantee a fixed monetary cost.

## API reference

Send `POST /api/analysis` with `Content-Type: application/json` and the app's matching `Origin` header.

```json
{
  "question": "How would higher energy prices affect Alberta?",
  "state": {
    "region": "AB",
    "scenario": "Higher",
    "year": 2030,
    "oilShock": 10,
    "duration": "persistent"
  }
}
```

State fields are optional within `state`. The model normalizes missing fields before scenario selection. Supported regions are Canada and all provinces and territories. Years run from 2023 through 2050. CER cases are `Current Measures`, `Higher`, `Lower` and `Canada Net-zero`. The separate national oil illustration permits changes from -20% through +20%; cases other than the published +10% preset are explicitly labelled approximations.

A successful response contains `state`, `summary`, `model`, and `analysis`. The analysis contains a `headline`, `blocks`, `limitations`, `sources`, and `evidence`. Each block contains plain `text`, `sourceIds`, and `evidenceIds`. Render text as text, never as HTML. Use the returned trusted source URLs for citations.

Errors contain `error.code` and `error.message`. Invalid requests use 400, a refused analysis uses 422, quota exhaustion uses 429, unchecked model output uses 502, unavailable analysis uses 503, and a timeout uses 504. Provider response bodies, credentials and raw exceptions are not returned.

## Evidence and limitations

The first pass can select only the validated state. The second pass receives the calculation summary and a small curated set of primary-source debate facts. Stakeholder sources establish attributed positions, not independently measured economic outcomes. The context includes producer, consumer, labour, Indigenous, electricity-system and environmental perspectives. It is a dated, incomplete selection, not a live news feed.

The server rejects unknown evidence IDs, unsupported citation IDs, numerical literals, malformed placeholders and mismatched source sets. It substitutes numeric placeholders with values from the deterministic result. This prevents the model from performing hidden arithmetic in the published answer. The mechanical check does not prove that every qualitative sentence or unit interpretation is correct. Inspect the citations and test representative questions before publication.

Observed GDP is value added, not gross sales. CER cases change multiple assumptions together. The national oil illustration does not identify provincial GDP responses, does not alter the CER paths, and must not be added to them. Provincial GDP, jobs and household bill responses to arbitrary oil, gas and electricity price shocks remain unestimated.

The API uses `store: false`. This setting is not a claim of zero provider retention. Review the provider's applicable data policy before launch. The app does not persist question text, raw provider responses or response caches.

Run the local contract and boundary tests without spending API credits.

```sh
node --test tests/energy-ai.test.mjs
```

The provider implementation follows the [Responses structured-output guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Production controls should also follow the [OpenAI production guidance](https://developers.openai.com/api/docs/guides/production-best-practices).
