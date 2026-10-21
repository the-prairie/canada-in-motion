# Connected trade guide

The guide keeps the selected trade on one map while moving through the exchange, provincial economy and household spending. Its endpoint values change with the stage. Selecting a province's endpoint opens and focuses its corresponding result. The same geographic scene remains in place when prices or stages change.

The exchange animates seller-to-buyer direction. Price changes do not alter line width, animation speed or geographic direction. Pause, reduced-motion preferences, offscreen visibility and hidden tabs control playback. Static arrows retain direction when motion is disabled. Provincial and household stages use a static contextual connection because their estimates concern each province as a whole.

The design follows [Jakub's Less is more, more or less](https://jakub.kr/writing/less-is-more): motion has a specific explanatory job, and repeated content is removed first. Duplicate guide headings, eyebrow labels, numbered stage decorations, repeated exchange cards and the extra network entry button were removed. Source periods remain with headings or values. Formulas, model details and source versions stay in disclosures; essential economic qualifications remain beside results.

Desktop uses a map beside the current stage. Portrait phones keep a compact map above it. Short landscape screens scroll normally. Province labels use screen-sized geometry and separate when neighboring endpoints would collide. Large HTML endpoint controls provide touch and keyboard access without requiring users to hit small map marks.

## Verification

The candidate passed all 392 JavaScript tests and five headless browser suites: map continuity and motion, guided scenarios, linked trade views, saved investigations and analysis recovery. Tests cover negative prices, exact result correspondence, unsupported models, source failure/retry, independent retail assumptions, offline snapshot restore, exports, keyboard focus and narrow layouts. No inference requests were sent to a provider.

The [independent experience review](MAP-STORY-EXPERIENCE-REVIEW.md) passed 132 behavior checks across desktop, 390px, 320px and short landscape viewports. Findings led to a visible Pause control, larger mobile map labels and reliable focus highlights. The [independent implementation review](MAP-STORY-CODE-REVIEW.md) checked all 156 directed province pairs, 15,756 curve samples and 108 model-value comparisons. It also caught the source-error loading state and neighboring label collisions; both were fixed and rechecked.

The approved public-beta coverage disclosures and economic model limits remain in place. Trade receipts are not GDP or profit. Provincial results are separate conditional relationships and budget sensitivities. Household amounts are spending equivalents, not validated individual bills. This visual release introduces no new economic coefficients or paid service.

Exact candidate and public verification receipts are recorded in [MAP-STORY-VERIFICATION.json](MAP-STORY-VERIFICATION.json). Public verification follows deployment.

Subtract Before You Add shaped the removed content. Prove It Works required actual desktop and mobile interaction, semantic checks and error-state recovery before release.
