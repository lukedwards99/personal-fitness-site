# Luke Edwards — Personal Fitness

A website for Luke Edwards, a certified personal trainer, with practical training advice and a personal bodybuilding journal. The Split design gives both sections equal space: Training on paper and Journal on graphite.

Git contains application code, schemas, tools, and documentation. Article and journal writing, photographs, videos, generated catalogs, and local backups live outside the repository. Content publication is separate from code deployment.

## Run locally

Use Node 24.15.x and npm. Prepare an external content workspace before starting the site:

```sh
npm install
npm run content:import -- --source /path/to/bde-web
npm run dev
```

The default workspace is `~/Documents/personal-fitness-content`. Set `FITNESS_CONTENT_DIR` or pass `--workspace /absolute/path` to a content command to select another location. Content tools reject workspaces inside a Git working tree and reject symbolic links and unsafe paths.

`npm run dev` builds the external catalog, loads it into local R2 emulation under ignored `.wrangler/` state, and starts Vite at **http://localhost:5178**. This local flow needs no cloud credentials. `npm run dev:server` starts Vite without hydrating content; `npm run content:local` refreshes local R2 after writing changes.

- `/` — Training and Journal, side by side on desktop and stacked on phones.
- `/training` — advice and workouts, filtered by category; initially empty until training articles are authored.
- `/journal` — chronological entries with full-text search.
- `/post/:slug` — individual training articles and journal entries.

Existing `/split`, `/split/training`, `/split/journal`, and `/split/post/:slug` links redirect to their canonical paths. Retired design routes use the site's normal not-found page.

```sh
npm run check           # Content boundary guard, TypeScript, focused tests, production build
npm run content:guard   # Check the repository boundary for authored content files
npm run check:api       # Smoke-check the running Worker and its content API
npm run preview         # Locally preview the production build on port 5178
```

Read-only Worker endpoints are `/api/health`, `/api/posts`, `/api/posts/:slug`, and `/api/media/:filename`. The archive accepts `kind`, `category`, and `q`. The Worker reads its catalog and media through the `CONTENT` R2 binding. Media responses use immutable caching; video byte ranges support seeking.

## External content workspace

The workspace contains editable source files and generated releases:

```text
personal-fitness-content/
  posts/<slug>.json
  posts/<slug>.md
  media/<sha256>.<ext>
  source/bde-web/blogs/lukes-journey/...
  source/bde-web/import-manifest.json
  releases/<sha256>/catalog.json
  releases/<sha256>/publish-manifest.json
  current.json
  backups/<lane>/...
  receipts/<lane>/...
```

Each post has JSON metadata and a sibling Markdown file. Metadata supplies its slug, title, excerpt, `advice` or `journey` kind, category, date, reading time, ordered media, and content filename. Optional sequence and sample flags retain ordering and provenance. Media references use `/api/media/<sha256>.<ext>`; the files are stored once under their full SHA256 names. Markdown supports GitHub Flavored Markdown, including workout tables.

The BDE importer preserves the complete Markdown, original dates and entry sequence, and every ordered photo/video reference. It copies the original blog JSON and Markdown into `source/bde-web/` and records source paths, checksums, and normalized destinations in the import manifest. The original BDE repository remains untouched. Identical imports are safe to repeat; differing existing files cause a collision error instead of being overwritten.

The initial import contains 214 authentic journal entries and 1,830 media files, with all 1,831 ordered media references retained. There are no training articles initially. The catalog is loaded into local R2 and published to both dedicated hosted buckets. Every release object was verified in both lanes, and a complete dev backup was downloaded and checksum-verified in the external local library on October 17, 2026.

## Publish and back up content

Author or edit the JSON and Markdown in the external workspace, then publish deliberately to each lane:

```sh
npm run content:build
npm run content:publish -- dev
# Preview the development site and check the writing and media.
npm run content:publish -- main
```

This process publishes content directly to R2. Git pushes and code deployments do not publish or replace writing. Keep the editable local copy; use `npm run content:local` to preview edits privately before publishing.

The builder validates metadata, real dates, media paths, and file checksums, then creates a versioned catalog. The publisher uploads and verifies immutable media and the catalog before atomically switching that lane's `current.json` pointer. Failed or interrupted uploads can be retried. Existing remote objects and older releases are retained; the tools do not delete remote objects.

```sh
npm run content:backup -- dev
npm run content:backup -- main
```

Backups download and verify the selected lane's current catalog and all referenced media into separate local snapshots. They preserve existing authoring files and earlier backups. Successful publishes also write local receipts recording the selected lane and verified release.

The publisher and remote backup commands require `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. On macOS they can instead read a Keychain item with service `personal-fitness-content-r2`, account `personal-fitness-site`, and JSON fields `accessKeyId` and `secretAccessKey`. Keep these credentials outside Git. Credential setup and remote publication are separate from local content preparation.

## Share on Tailscale

```sh
npm run dev:tailnet
```

This starts or reuses the loopback server on port 5178 and serves it through **Tailscale Serve HTTPS port 8443**. It prints the URL to open from another device connected to the same tailnet. It checks for conflicting Tailscale mappings and leaves existing services alone. Ctrl+C stops only services the command started. Use `PREVIEW_PORT` or `PREVIEW_HTTPS_PORT` to select different ports. Tailscale must already be installed and connected; Serve may print a one-time activation link.

While this Mac and the local server are running:

- Home: https://lukes-macbook-pro.tail97dc4.ts.net:8443/
- Training: https://lukes-macbook-pro.tail97dc4.ts.net:8443/training
- Journal: https://lukes-macbook-pro.tail97dc4.ts.net:8443/journal

## Cloudflare code deployments

React 18, React Router, TypeScript, Vite, and Hono run on Cloudflare Workers with R2 content storage. Inter Tight is bundled locally through Fontsource.

| Git branch | Wrangler environment | Worker | Content bucket |
| --- | --- | --- | --- |
| local | default | `personal-fitness-local` | Local R2 emulation: `personal-fitness-content-local` |
| `dev` | `dev` | `personal-fitness-dev` | `personal-fitness-content-dev` |
| `main` | `production` | `personal-fitness-production` | `personal-fitness-content-production` |

The hosted lanes use dedicated private R2 buckets and separate Workers in the Cloudflare account configured in `wrangler.jsonc`. Each Worker receives only its matching `CONTENT` binding and serves published content through its read-only API. These resources are separate from other projects. Existing D1 databases are retained externally and are no longer used by this application.

```sh
npm run deploy:dev      # Validate, build dev, deploy application code
npm run deploy:main     # Validate, build production, deploy application code
```

Deployment selects the Cloudflare environment at build time, checks the generated Worker configuration, and deploys that exact output. Code deployment does not upload, seed, migrate, reset, or delete content and does not change D1 data.

The repository is [lukedwards99/personal-fitness-site](https://github.com/lukedwards99/personal-fitness-site). Open feature pull requests against `dev`; merging into `dev` deploys development code. Merge reviewed changes from `dev` into `main` for production code. Feature branches and their pull requests do not deploy either lane.

Cloudflare Workers Builds deploys code on pushes to the matching branch. Preview branch builds are disabled. Each Worker has its own Git trigger and project-named build token. The build image uses `NODE_VERSION=24.15.0`, repository root `/`, and an empty build command because the deploy script performs the build:

| Worker | Tracked branch | Deploy command |
| --- | --- | --- |
| `personal-fitness-dev` | `dev` | `npm run deploy:dev` |
| `personal-fitness-production` | `main` | `npm run deploy:main` |

The deploy script rejects a Cloudflare CI Worker-name override that does not match the requested lane. Code build credentials remain in Cloudflare. R2 content publishing uses separate credentials and the explicit content commands above.

| Lane | URL |
| --- | --- |
| Development | https://personal-fitness-dev.luke-edwards20.workers.dev |
| Production (`main`) | https://personal-fitness-production.luke-edwards20.workers.dev |

Validate a hosted lane with `PREVIEW_ORIGIN=<lane-url> npm run check:api` after its code and content are available.
