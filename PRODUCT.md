# Personal Fitness Site

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React, TypeScript and Vite frontend with Hono on Cloudflare Workers and D1. Node 24.15.x.

## Users
People seeking practical fitness advice from Luke Edwards, a certified personal trainer, and readers following his bodybuilding journey.

## Product Purpose
Give training advice/workouts and a personal bodybuilding journal equal prominence through the selected Split site. The home page offers two direct entry points, Training and Journal.

## Operating Context
Develop locally in this folder and publish through the project's GitHub repository and isolated Cloudflare dev/production lanes. The `dev` branch uses `personal-fitness-dev`; `main` uses `personal-fitness-production`. Each hosted lane has its own D1 database. Feature pull requests target `dev` and do not deploy either lane until merged. Tailscale Serve remains available for private local previews.

## Capabilities and Constraints
Advice library with category filters, workout details, chronological journal with full-text search, individual article links, and responsive layouts. Canonical routes are `/`, `/training`, `/journal`, and `/post/:slug`; legacy `/split` links redirect to the matching canonical route. Retired design routes show the normal not-found page. Use original code and properly sourced assets. Sample entries and stock photography must be labeled and must not be represented as Luke's actual progress or photos.

## Evidence on Hand
The user's name and certified personal trainer status are confirmed. No original posts, competition dates, progress statistics, personal photographs or testimonials supplied.

## Product Principles
- Equal space for useful advice and the personal journey.
- Clear distinction between sample content and personal facts.
- Keep the established Split style: Training on paper, Journal on graphite, and direct navigation between them.
- Keep local, development, and production data isolated; preserve hosted content across deployments.
