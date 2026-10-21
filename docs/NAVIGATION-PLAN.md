# Connected navigation

A destination is `{id, label, group, view, section?, labTab?}`. One registry maps the twelve existing destinations onto the existing URL state. Domain filters and scenarios survive navigation; selecting a destination changes only its view, section and lab tab, and clears the individual well selection as before.

The independent reviewer compared a persistent rail with a compact location switcher. We chose the switcher: the rail would reduce map/chart width, while the switcher removes two competing levels of navigation and works identically on small screens. A native dialog groups every destination under Economy, Well atlas and Transport. It has one current item, keyboard focus containment, Escape, and focus restoration. The existing local chart/guide controls stay next to their result.

The shared header owns the current location, Ask (economy only), and Share. No new dashboard, introductory copy, icon catalogue, or accordion is added. The brand goes to Explore a question. Destination changes bring the new content to the top; Back restores the previous state. Existing shared links remain valid. An uninitialized Explore question inherits the selected province; an explicitly saved question keeps its own focus.

Scope also includes bugs found during the independent whole-app walk-through. Closure-budget default costs currently violate the input step base; accept arbitrary positive costs while retaining domain validation. Remove its two redundant eyebrow labels.

Validation: registry/state unit tests; headless navigation and representative chart, evidence, map, scenario, history and keyboard interactions at desktop, mobile, narrow mobile and landscape widths; independent candidate review; existing model/pipeline checks; public deployment and live smoke checks. No paid inference is required.

## Throughput checkpoint

The parent owns the registry, header, state integration and regression harness. One independent reviewer owns baseline and candidate desktop/mobile walkthroughs. Review and existing regressions run concurrently; final candidate checks precede the single production deployment. No data-model changes or AI provider calls are in scope.

## Final review

Independent desktop/mobile review approved all twelve destinations. Parent code review additionally found that destination selection bypassed the old account button's answer-dismissal behavior. Destination changes now open the selected data view and retain the previous answer behind its existing action. The mocked forecast end-to-end test covers both a different account and reselecting the current account.
