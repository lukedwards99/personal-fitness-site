# Split site

The Split design is the single public site. Its home page divides into two doors: Training on paper and Journal on graphite. They sit side by side on desktop and stack on phones. Each door shows the section name, one explanatory line, and the latest title when an entry exists. The header contains Luke Edwards's name and the two section links.

## Visual language

Keep the established design: Inter Tight throughout, oversized tightly set headings, generous space, fine horizontal rules, and a restrained monochrome palette. Training uses paper `#f2f2ee` with graphite `#161616` text; the journal reverses those tones. The home doors contain no photographs. Articles inherit their section's light or dark tone and retain a comfortable reading width. Full image/video galleries fit within this visual treatment and preserve their original order.

## Navigation and content

Canonical routes are `/`, `/training`, `/journal`, and `/post/:slug`. Training provides category filters; Journal provides chronological entries and full-text search with clear result counts and empty states. Training begins empty until articles are authored. Article pages include section back links, sharing, previous/next entries, and related reading when available.

Complete Markdown supports GitHub Flavored Markdown, including headings, lists, links, and workout tables. Preserve authentic journal text and every associated photo/video reference. Render media from the content API; videos retain playback controls and seeking. Writing and media come from the external R2 catalog, with no article bodies or personal media bundled into application code.

Journal overview rows preview the first photo in each entry, even when a video comes before it. Entries without photos retain their text layout. Journal entry galleries show one full photo or video at a time in the original order, with native horizontal swiping, previous/next controls, a position counter, and keyboard navigation. Keep complete frames visible, pause videos when their slide leaves view, respect reduced motion, and show every slide when printing.

Legacy `/split`, `/split/training`, `/split/journal`, and `/split/post/:slug` links redirect to the corresponding canonical paths. Retired design routes use the normal not-found page. The site has no design gallery or comparison switcher.

## Craft and integrity

Preserve keyboard focus, labeled controls, responsive layouts, reduced-motion support, and accessible contrast. Authentic journal entries should be presented as Luke's own writing and media. Show sample or stock disclosures conditionally when the corresponding metadata applies. Empty states should explain missing content without substituting invented personal details. Content import and publication preserve the established Split layout and visual treatment.
