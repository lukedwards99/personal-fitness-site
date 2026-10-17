# Luke Edwards — Personal Fitness

Three original website design studies for a certified personal trainer's advice library and personal bodybuilding journal. The existing BDE project informed the idea of a dated, searchable journey archive; no code, writing, or assets were reused from it. All articles, training examples, and journal updates here are sample content for choosing a design.

## Run locally

Use Node 24.15.x and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5178**. The home page presents the three designs. `npm run dev` applies local D1 migrations and seeds the shared sample content before starting Vite. `npm run dev:server` starts only the server after the database is initialized. No cloud credentials are needed.

- `/editorial` — a warm, editorial direction on one long page.
- `/split` — a minimal direction where the home page is two doors: Training and Journal (`/split/training`, `/split/journal`).
- `/logbook` — a minimal, text-first index with a Training | Journal switch (`/logbook/training`, `/logbook/journal`).

Each design has advice and journal sections, plus individual articles at `/{design}/post/{slug}`. Earlier drafts of the retired Fieldnotes and Iron directions are kept, ignored by Git, in `.local-review/archive-2026-10-17/`.

```sh
npm run check           # TypeScript and production build
npm run check:api       # Smoke-check the running local Worker and D1 API
npm run preview         # Locally preview the production build on port 5178
npm run db:setup        # Reapply local migrations and upsert sample posts
```

Advice and journey posts are authored in `src/content.ts`. The React application and local D1 seed share that source. Read-only Worker endpoints are `/api/health`, `/api/posts`, and `/api/posts/:slug`. The list endpoint accepts `kind`, `category`, and `q`. Local database files stay under ignored `.wrangler/` state; seeding only upserts supplied samples.

## Share on Tailscale

```sh
npm run dev:tailnet
```

This starts or reuses the loopback server on port 5178 and serves it through **Tailscale Serve HTTPS port 8443**. It prints the URL to open from another device connected to the same tailnet. It checks for conflicting Tailscale mappings and leaves existing services alone. Ctrl+C stops only services the command started. Use `PREVIEW_PORT` or `PREVIEW_HTTPS_PORT` to select different ports. Tailscale must already be installed and connected; Serve may print a one-time activation link.

Current preview (while this Mac and the local server are running):

- Gallery: https://lukes-macbook-pro.tail97dc4.ts.net:8443/
- Editorial: https://lukes-macbook-pro.tail97dc4.ts.net:8443/editorial
- Split: https://lukes-macbook-pro.tail97dc4.ts.net:8443/split
- Logbook: https://lukes-macbook-pro.tail97dc4.ts.net:8443/logbook

## Cloudflare deployments

React 18, React Router, TypeScript, Vite, Hono, Cloudflare Workers, and D1 follow the workout SPA's stack and the Copy Shop application's shared Worker/D1 approach. Fonts are bundled locally through Fontsource.

| Git branch | Wrangler environment | Worker and database |
| --- | --- | --- |
| local | default | `personal-fitness-local` |
| `dev` | `dev` | `personal-fitness-dev` |
| `main` | `production` | `personal-fitness-production` |

The hosted lanes use separate Workers and D1 databases in the Cloudflare account configured in `wrangler.jsonc`. They do not share resources with other projects. The default environment remains local and has no public deployment URL.

```sh
npm run deploy:dev      # Typecheck, build dev, migrate dev D1, deploy dev
npm run deploy:main     # Typecheck, build production, migrate production D1, deploy production
```

Deployment selects the Cloudflare environment at build time, checks the generated Worker configuration, and deploys that exact output. Migrations apply only to the matching lane. Routine deployment never seeds, resets, or deletes posts. For initial sample content only, `npm run db:seed:dev` and `npm run db:seed:main` insert missing samples while preserving existing rows.

The repository is [lukedwards99/personal-fitness-site](https://github.com/lukedwards99/personal-fitness-site). Develop on `dev`; merge reviewed changes into `main` for production. Keep credentials out of Git; local Wrangler authentication supplies manual deployment access.

| Lane | URL |
| --- | --- |
| Development | https://personal-fitness-dev.luke-edwards20.workers.dev |
| Production (`main`) | https://personal-fitness-production.luke-edwards20.workers.dev |

Validate a hosted lane with `PREVIEW_ORIGIN=<lane-url> npm run check:api`.
