# Luke Edwards — Personal Fitness

A website for Luke Edwards, a certified personal trainer, with practical training advice and a personal bodybuilding journal. The selected Split design gives both sections equal space: Training on paper and Journal on graphite. All articles, training examples, and journal updates are labeled sample content; stock photographs do not depict Luke.

## Run locally

Use Node 24.15.x and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5178**. The home page opens directly into the Split site, with Training and Journal as its two entry points. `npm run dev` applies local D1 migrations and seeds the sample content before starting Vite. `npm run dev:server` starts only the server after the database is initialized. No cloud credentials are needed.

- `/` — Training and Journal, side by side on desktop and stacked on phones.
- `/training` — advice and workouts, filtered by category.
- `/journal` — chronological entries with full-text search.
- `/post/:slug` — individual training articles and journal entries.

Existing `/split`, `/split/training`, `/split/journal`, and `/split/post/:slug` links redirect to their canonical paths. Retired design routes use the site's normal not-found page.

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

- Home: https://lukes-macbook-pro.tail97dc4.ts.net:8443/
- Training: https://lukes-macbook-pro.tail97dc4.ts.net:8443/training
- Journal: https://lukes-macbook-pro.tail97dc4.ts.net:8443/journal

## Cloudflare deployments

React 18, React Router, TypeScript, Vite, Hono, Cloudflare Workers, and D1. Inter Tight is bundled locally through Fontsource.

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

The repository is [lukedwards99/personal-fitness-site](https://github.com/lukedwards99/personal-fitness-site). Open feature pull requests against `dev`; merging into `dev` deploys the development lane. Merge reviewed changes from `dev` into `main` for production. Feature branches and their pull requests do not deploy either lane. Keep credentials out of Git; local Wrangler authentication supplies manual deployment access.

Cloudflare Workers Builds deploys on pushes to the matching branch. Each Worker has its own Git trigger and project-named build token; preview branch builds are disabled so other branches cannot deploy either lane. The build image uses `NODE_VERSION=24.15.0`, the repository root `/`, and an empty build command because the deploy script performs both build and deployment:

| Worker | Tracked branch | Deploy command |
| --- | --- | --- |
| `personal-fitness-dev` | `dev` | `npm run deploy:dev` |
| `personal-fitness-production` | `main` | `npm run deploy:main` |

The deploy script rejects a Cloudflare CI Worker-name override that does not match the requested lane. Build credentials stay in Cloudflare, outside the repository. Cloudflare's generated token permissions cover the account; the project-specific Worker and D1 bindings provide deployment and data separation.


| Lane | URL |
| --- | --- |
| Development | https://personal-fitness-dev.luke-edwards20.workers.dev |
| Production (`main`) | https://personal-fitness-production.luke-edwards20.workers.dev |

Validate a hosted lane with `PREVIEW_ORIGIN=<lane-url> npm run check:api`.
