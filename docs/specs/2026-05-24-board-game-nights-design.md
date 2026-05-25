# Board Game Night Scheduler — Design Spec

## Overview

A lightweight web app that lets ~10 couples coordinate board game nights with minimal friction. Each couple gets a unique link to toggle their availability over a rolling 4-week window. A shared dashboard shows overlap and highlights the best nights. Final coordination happens in the group chat.

## Goals

- Absolute minimum friction: no accounts, no passwords, no app install
- Each couple manages their own schedule independently
- Group can see at a glance which nights work best
- Stable group of up to 20 couples, rarely changes

## Architecture

### Stack

- **Frontend/Backend:** Next.js (App Router) hosted on Vercel (free tier)
- **Database:** Supabase (free tier Postgres)
- **Auth model:** None. Access controlled by unique, unguessable URL slugs.

### Pages

| Route | Purpose |
|-------|---------|
| `/c/[slug]` | Couple's personal calendar — toggle available days |
| `/dashboard` | Shared group view — heat map, counts, best nights |
| `/admin/[secret]` | Admin panel — manage couples, copy/regenerate links |

## Data Model

### `couples`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Primary key |
| name | text | Display name (e.g. "The Smiths") |
| slug | text, unique | Unguessable URL identifier (e.g. `smith-a7x9q`) |
| created_at | timestamp | When added |

### `availability`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Primary key |
| couple_id | uuid (FK → couples.id) | Which couple |
| date | date | A specific day they're available |

**Constraint:** Unique on (couple_id, date) — one row per couple per day.

**Semantics:** Availability is additive. A row exists = available. No row = not available. Toggle on = INSERT. Toggle off = DELETE.

### Admin access

The admin secret is stored as an environment variable (`ADMIN_SECRET`). No database table needed.

## UI/UX

### Couple's Calendar (`/c/[slug]`)

- Mobile-first layout
- Header shows couple's display name
- 4-week calendar grid starting from today
- Each day is a tappable cell: highlighted = available, default = unavailable
- Single tap toggles instantly (no submit button, auto-saves)
- First visit: brief welcome text explaining what this is

### Dashboard (`/dashboard`)

- 4-week calendar grid with heat map coloring (darker = more couples available)
- Each day shows count (e.g. "7/10")
- Top section highlights the 2-3 best nights with list of who's available
- View only — no editing

### Admin (`/admin/[secret]`)

- List of all couples with their unique links (tap to copy)
- Add a couple: enter name → auto-generates slug
- Remove a couple (with confirmation)
- Regenerate a couple's link if lost

## Key Behaviors

- The 4-week rolling window advances automatically (always today → today + 27 days)
- Past dates are ignored in queries (no cleanup job needed for v1)
- All interactions are optimistic UI with immediate persistence
- Dashboard is public (anyone with the link can view) — no sensitive data exposed

## Deferred to v2

- Board game recommendation per couple (text field on calendar page)
- Game picks section on dashboard (list of suggestions, random highlight)

## Hosting & Deployment

- Vercel: connect GitHub repo, auto-deploys on push to main
- Supabase: provision free project, store connection string in Vercel env vars
- Custom domain optional (can use `*.vercel.app` for free)
- Total cost: $0 at this scale
