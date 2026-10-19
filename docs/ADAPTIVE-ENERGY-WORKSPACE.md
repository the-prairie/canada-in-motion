# Adaptive energy workspace: architecture proposal

Status: researched proposal, 19 October 2026. The public app has not changed. Jev credential setup, a server-only decision adapter and a development benchmark are implemented; the first live run is complete. An OpenUI integration and a new economic model are not implemented. Approval covers up to US$1 for the Jev benchmark, not recurring production Jev charges.

## Product objective

A person asks a question about Canada's energy economy and receives a coordinated, interactive investigation. The system identifies the relevant provinces, commodities, periods and outcomes; retrieves dated evidence; runs the supported calculations; and composes linked views that explain both the answer and its limits. The person can change a scenario, pin a comparison, inspect a source and share a reproducible result without learning the dataset structure.

For example: “What would cheaper oil and more east–west electricity trade mean for Alberta, Ontario and Québec?” should produce a question-specific workspace. Physical trade, observed value added, income recipients and conditional economic effects are separate measures, connected where evidence permits. The system must not animate pipeline capacity as measured flow, call gross revenue GDP, allocate a national coefficient to provinces, or silently replace a requested price shock with a different one.

## Roles of the models and software

1. An LLM proposes an investigation plan: subquestions, relevant measures, sources, model calls and a presentation outline. A typed capability registry tells it what is executable now and what needs additional evidence or model development.
2. Jev evaluates narrow decisions: task classification, evidence relevance, claim support and which registered visualization suits the question and available data. Each question includes its actual context; field names alone are not instructions. Decisions and confidence are measured on domain examples before they control production routing.
3. Versioned data tools return records with source, geography, period, units, observation/scenario status and missingness. The existing snapshot pipeline remains the acquisition foundation. Source freshness and semantic changes are explicit.
4. Calculation tools produce numbers. A future provincial scenario engine will require calibrated trade, production, fiscal and household relationships, with uncertainty and validation against historical outcomes. Input-output accounting alone is not a causal price forecast. Model outputs carry scope, assumptions, parameter versions and supported ranges.
5. A validated view specification connects those outputs to a custom component library. Models select evidence references and supported operations; they do not supply authoritative chart values, executable browser code or arbitrary fetch destinations.
6. A verifier checks numerical identities and scope in code, then evaluates whether the answer covers the question and whether its cited evidence supports the claims. One bounded repair may address a missing component or unsupported claim. A failed result becomes a specific explanation of what could not be established, not a silently changed scenario.

## OpenUI decision

Recommendation: prototype the open-source OpenUI runtime with an application-owned component and tool library. Its documented capabilities include streamed composition, reactive state, tool-backed queries and incremental edits. Those are directly relevant, and rebuilding that infrastructure has no demonstrated advantage yet.

OpenUI is the presentation runtime; it does not supply energy data, economic identification, trustworthy numerical results or a good visual design automatically. Jev returns decisions rather than OpenUI Lang. The LLM can compose the layout, or code can map Jev's typed choices into a small verified layout. Jev is therefore complementary to OpenUI.

Use a custom analytical surface with the existing navigation. Avoid adopting a default chat shell as the whole product. The current frontend is vanilla JavaScript and Leaflet: test an isolated renderer mount and explicit state bridge before a framework migration. Pin library versions and keep server inference independent from the rendering library. The open-source runtime can use existing providers directly; the hosted Gateway is a separate choice and is not required for the experiment.

Alternatives: Vercel json-render is worth a paired prototype if typed JSON and existing schema tooling give it a simpler integration. A2UI matters if cross-client agent UI transport becomes a requirement. A custom finite view-spec renderer remains a fallback if framework cost, parser behavior, accessibility or state preservation fails our tests. Do not claim a homemade renderer is better without measuring those criteria.

## Component and interaction contract

Candidate components:

- Geographic network map, with topology/capacity/observed flow clearly distinguished.
- Provincial comparison of value added, production or another named measure.
- Physical-flow diagram only when origin–destination quantities share a compatible period and unit.
- Scenario comparison with supported assumptions, uncertainty and national/provincial scope.
- Beneficiary and cost breakdown only where those distributional measures exist.
- Claim/evidence comparison, preserving positions and showing agreement, contradictions and missing evidence.
- Source drawer and accessible data table for each quantitative view.

One shared selection model links province, commodity, year and baseline across views. Each panel also stores its own metric and evidence references. Clicking or brushing updates linked views immediately without inference. A new analytical request can trigger planning; changing an already-supported control runs code. Pinning freezes a panel's selection and source snapshot; undo restores prior workspace state. Focus, map camera and unfinished inputs survive layout patches. Mobile order follows the question's reasoning sequence, and every map/chart offers a keyboard-accessible table or equivalent control.

Every workspace is reproducible from the investigation plan, view specification, dataset hashes, calculation version and selected assumptions. A shared link must either preserve the historical release or explicitly report when it cannot be reproduced. Do not save a private conversation into a public URL by default.

## Proof before migration

Start with three tasks: compare provincial contribution; trace a supported physical flow; examine a national oil-price sensitivity alongside provincial exposure. For each, compare a fixed authored workspace, an OpenUI composition and (if needed) a json-render composition using the same components/data. Score task completion, time to first useful view, wrong or omitted findings, interaction latency, keyboard use, narrow-screen layout, state preservation, parser recovery, bundle size and inference cost. Invalid generation must fall back to a usable authored view.

The Jev development benchmark currently contains 24 authored fixtures covering intent, evidence support and view selection. Each is repeated three times with changed choice order. French cases and missing-data traps are included. These are supplied test contexts, not independent economic evidence, a held-out evaluation or an end-to-end performance result. Broader held-out user tasks and adversarial cases are required before production adoption. Model confidence thresholds must be tuned separately and frozen before the held-out run.

### First live development result

See [JEV-EVALUATION.json](JEV-EVALUATION.json) for every decision and its probabilities. Jev 1.14.0 matched the authored labels in 67 of 72 attempts: intent 24/24, evidence 24/24, UI selection 19/24. Median request latency was 79 ms and p95 was 232 ms. Reported input usage was 33,300 tokens; estimated inference cost was US$0.0013986 at the checked tariff. The persistent ledger reserved US$0.193536 conservatively, including the full allowed input context per attempt.

All five mismatches selected a location map for a request for pipeline volumes when only coordinates were available. A map is reasonable supplemental context but does not establish the requested volumes. The French version changed its selected answer under reordered choices; order and repeat variation are confounded here, so this does not isolate a positional effect. These misses had confidence 0.45–0.59, but selecting a confidence cutoff from this run would be post-hoc tuning, not validation.

Architecture consequence: track the requested analytical measure separately from the chosen visual. Require data capability checks before a view may be presented as an answer. If a map only provides context, label it as context and show the missing-volume explanation. Jev may propose the view; it cannot certify data availability or answer completeness by itself.

The setup form initially rejected real browser submissions because its no-referrer policy suppressed the same-origin signal required by its POST check. It now uses same-origin referrer policy, retaining exact-origin validation without leaking the setup URL to other origins. A real browser submission with a fake key verified the repair, followed by successful user credential storage and live inference. No real key is included in the report, browser output or repository.

## Credential and benchmark handling

Run `node scripts/setup-jev.mjs` for a one-use loopback form. It writes `.env.jev.local` with mode 0600 using exclusive creation; the file is ignored by Git and excluded by the existing public build allowlist. The form uses no third-party resources, browser storage or script. It requires the exact loopback Host and same-origin POST, and does not echo credentials. Saving does not call Jev.

Run `node scripts/probe-jev.mjs` for a dry run, or add `--run` after setup to make the authorized calls. The model is pinned to `jev-1.14.0`. Each attempt reserves the cost of the entire documented 64,000-token default context at US$0.042/M input tokens, including failed attempts. A persistent ledger stops new attempts before US$0.90 reserved, leaving headroom within the US$1 approval. No retries, paid LLM fallback or production change occurs. The 72 planned attempts reserve at most US$0.193536 at that published rate. The ledger is never automatically reset; provider usage is reported separately as estimated cost. This is an application budget based on the checked tariff, not an account-level provider spending cap.

## Primary references

- [OpenUI architecture](https://www.openui.com/docs/openui-lang/architecture): generation, reactive execution, tool access and incremental edits.
- [OpenUI repository](https://github.com/thesysdev/openui): runtime and integration packages.
- [json-render](https://github.com/vercel-labs/json-render): constrained component catalogs and JSON specifications.
- [A2UI](https://github.com/a2ui-project/a2ui): agent-to-interface protocol.
- [TypeSafe API](https://docs.typesafe.ai/api): typed decisions and validation contract.
- [TypeSafe models](https://docs.typesafe.ai/models): model IDs, context limits, input pricing and data handling.
- [TypeSafe confidence](https://docs.typesafe.ai/confidence): probability summaries and domain-dependent thresholds.

The product choices and acceptance criteria above are our proposed design, not claims established by these libraries' documentation.
