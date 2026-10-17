# Personal Fitness Site

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React, TypeScript and Vite frontend with Hono on Cloudflare Workers and D1, following the user's workout SPA and the common runtime of the order app. Node 24.15.x.

## Users
People seeking practical fitness advice from Luke Edwards, a certified personal trainer, and readers following his bodybuilding journey.

## Product Purpose
Give training advice/workouts and a personal bodybuilding journal equal prominence. Deliver three distinct working designs for local comparison.

## Operating Context
Develop locally in this folder and publish through the project's GitHub repository and isolated Cloudflare dev/production lanes. The `dev` branch uses `personal-fitness-dev`; `main` uses `personal-fitness-production`. Each hosted lane has its own D1 database. Tailscale Serve remains available for private local previews.

## Capabilities and Constraints
Advice library, workout details, chronological and searchable personal journal, individual article links, responsive layouts. The nearby bde-web blog is structural inspiration only; reuse no code or assets. Sample entries and stock photography must be labeled and must not be represented as Luke's actual progress or photos.

## Evidence on Hand
The user's name and certified personal trainer status are confirmed. No original posts, competition dates, progress statistics, personal photographs or testimonials supplied.

## Product Principles
- Equal space for useful advice and the personal journey.
- Clear distinction between sample content and personal facts.
- Three complete visual directions, directly in code, for comparison.
- Keep local, development, and production data isolated; preserve hosted content across deployments.
