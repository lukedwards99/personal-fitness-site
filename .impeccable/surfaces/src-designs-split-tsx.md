---
version: 1
slug: "src-designs-split-tsx"
primary_target: "src/designs/Split.tsx"
related_targets: ["src/components/JournalTimeline.tsx","src/designs/split.css"]
---

# Journal browsing

## Direction contract

THESIS: Extend the journal with year selection and a complete vertical photo timeline. Keep entries as the default reading view and offer Photos beside it.

OWN-WORLD: Inherit Split’s graphite canvas, paper text, Inter Tight, fine rules and generous spacing. Use a native year selector and existing underlined view controls.

STORY: Readers select a year, search the writing, then browse entries or every associated photograph. The same filters apply in both views and persist in the URL.

FIRST VIEWPORT: Preserve the Journal title and introduction. Put Entries / Photos and Year together above search. The timeline begins directly beneath with dated entry groups and large complete-frame photographs. Desktop separates dates from a two-column photo grid; phones stack dates and full-width photos.

FORM: A local extension of the established journal. Show all photos newest first, retain their order within each entry, and use ordinary page scrolling. Images load lazily and open at full size; each date group links to its entry.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish result

Finish review: **ship**, with no material findings across the desktop (1440px), mobile (390px), and user-width (446px) captures in `.impeccable/review/journal-timeline/`. The implementation preserves the incumbent Split palette, typography, rules, and responsive language. PRODUCT.md and DESIGN.md record the completed browsing behavior. No new shipping raster assets were created; photographs continue to come from the external content catalog.
