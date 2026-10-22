# Personal Fitness Site

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React, TypeScript and Vite frontend with Hono on Cloudflare Workers and private R2 content storage. Node 24.15.x. Markdown uses GitHub Flavored Markdown. Existing D1 resources are retained externally and unused.

## Users
People seeking practical fitness advice from Luke Edwards, a certified personal trainer, and readers following his bodybuilding journey.

## Product Purpose
Give training advice/workouts and a personal bodybuilding journal equal prominence through the Split site. The home page offers two direct entry points, Training and Journal.

## Operating Context
Keep Git limited to application code, schemas, tools, and documentation. All article and journal writing, media, generated catalogs, editable source copies, and backups live in an external workspace, defaulting to `~/Documents/personal-fitness-content`. Content tools reject workspaces inside Git working trees and unsafe paths or symbolic links.

Code uses the project's isolated Cloudflare lanes: `dev` deploys `personal-fitness-dev`; `main` deploys `personal-fitness-production`. Dedicated private content buckets are `personal-fitness-content-dev` and `personal-fitness-content-production`, each bound as `CONTENT` only to its matching Worker. Feature pull requests target `dev` and do not deploy either lane until merged. Code deployments do not alter content or D1 data.

Content publication is explicit and separate from Git: author outside the repository, build and validate, publish to dev, preview, then publish to main. Keep the local authoring copy and verified remote snapshots. Local development hydrates R2 emulation from the external workspace; Tailscale Serve remains available for private previews.

The owner can run `npm run content:studio` for a loopback-only browser editor. It creates and edits journal entries and training articles, accepts ordered image/video uploads, previews Markdown, and saves to the external local library. Publication and backup require an explicit lane. Existing local R2 credentials stay on the Node server; a temporary launch session protects browser access. Studio assets and write APIs are separate from the public Worker.

## Capabilities and Constraints
Advice library with category filters, Markdown workout tables, newest-first journal Entries/Photos views with shared URL-backed year and full-text search filters, a complete vertical photo timeline with lazy-loaded full frames and full-size links, individual article links, complete ordered image/video galleries, and responsive layouts. Canonical routes are `/`, `/training`, `/journal`, and `/post/:slug`; legacy `/split` links redirect to the matching canonical route. Retired design routes show the normal not-found page.

The Worker serves read-only archive, detail, health, and media endpoints. Media use content-addressed paths and immutable caching; videos support byte ranges. Publishing uploads and verifies media and a versioned catalog before atomically changing the current pointer. Backups preserve authoring files and previous snapshots; publishing and backup tools do not delete remote objects.

Use original writing and properly sourced assets. Identify authentic journal entries accurately. Label sample writing and stock media only when those flags apply; do not present samples as Luke's actual progress or photos.

## Evidence on Hand
Luke's name and certified personal trainer status are confirmed. His existing BDE journal has been imported: 214 entries and 1,830 media files, retaining all 1,831 ordered references, complete Markdown, dates, sequence, and source metadata. The original repository is untouched. No training articles are included initially. Local R2 is hydrated and the same release is published and verified in both dedicated hosted buckets. A complete dev backup was downloaded and checksum-verified into the external local library on October 17, 2026.

## Product Principles
- Equal space for useful advice and the personal journey.
- Preserve complete writing, chronological metadata, and all associated media.
- Distinguish authentic writing from samples through content metadata.
- Keep the established Split style: Training on paper, Journal on graphite, and direct navigation between them.
- Keep all authored content and backups outside Git.
- Isolate local, development, and production content; preserve hosted releases across code deployments.
