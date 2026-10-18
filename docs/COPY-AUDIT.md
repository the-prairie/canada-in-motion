# Language audit

The October 18, 2026 audit used the requested local `unslop` skill and an independent reviewer. It covered navigation, transport estimates, benchmark tolls, well search and details, status definitions, event charts, scenarios, saved views, sharing, downloads, map labels, source notes, coverage, loading failures and About.

The reviewer proposed 174 exact replacements across 12 files. Those edits replaced abstract headings, repeated assurances and defensive framing with concrete descriptions. They also removed old release-candidate wording, local-server instructions and references to button names that no longer exist. Original source values, official titles, attribution, rates and calculation rules were preserved.

For example, the benchmark introduction now reads:

> Published benchmark tolls for 25 pipeline systems. Rates may have changed since the observation date.

The acceptance pass found two additional issues. Historical records now carry a label in search results and map tooltips. CSV exports include the identifier type, so a Geological Survey of Canada record ID is not presented as an unexplained provincial licence number. Well details use each source's identifier label and distinguish the publisher's inventory date from the download date.

The audit also found a loading-error recovery button that used an inline event handler blocked by the app's Content Security Policy. It now uses the existing delegated event listener. The manual share-link field now has an accessible label.

Browser verification and publication evidence are recorded in `LANGUAGE-DATA-VERIFICATION.json` after the release checks finish. The independent source-level audit does not claim a screen-reader speech test or exhaustive device coverage.
