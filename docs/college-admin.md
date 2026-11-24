# Weekly college selections

This feature uses `college-admin` (a Supabase Edge Function) and an additive `pool_college_drafts` table. The existing login and Current Picks code is retained. Only explicit publication adds college games to a future setup week; no existing games are replaced or deleted.

## Setup

Apply `supabase/college-admin.sql` once and deploy `supabase/functions/college-admin/index.ts` with `verify_jwt = true`. The function has no package dependencies. Add these Edge Function secrets in the existing Supabase project:

- `CFBD_API_KEY`: https://collegefootballdata.com/key
- `ODDS_API_KEY`: https://the-odds-api.com/

The standard `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Edge runtime. Never put private keys in HTML, browser storage, or GitHub. The function validates the signed-in user and the existing database administrator role on every request. Its write RPC is executable only by `service_role`, not browser clients.

## Workflow

Open Administration, choose a setup week (or explicitly prepare the next one), load games, check any number, save, then review and confirm publication. Preparing a week advances the last configured week's deadlines by seven Eastern calendar days without modifying previous weeks. Published weeks and weeks whose spread-lock time has passed are read-only. Preparing a week does not itself import games.

Draft imports are cached for 15 minutes. Refresh preserves selected IDs, including games that disappear from the feed (which are then flagged). Lines are fixed when the administrator publishes before `spread_lock_at`; publishing does not silently fetch a different spread after review. Freshness and draft version are checked again in the database transaction. Zero or any positive number of selections is supported.

Schedule: CFBD regular-season games in the four-day window beginning at the configured picks deadline. This covers the upcoming Friday-through-Monday window with the current deadline configuration. Odds: DraftKings spreads from The Odds API. Favorites come from the negative point spread, not moneyline prices. Team matching uses unique exact normalized CFBD school/alternate names plus mascot, along with the scheduled Eastern date; no fuzzy matching or automatic bookmaker substitution is used.

Unavailable/stale lines, TBD or conflicting kickoff times, ambiguous matches, and pick'em games are shown but cannot be published. Pick'em requires a separate decision about the existing automatic-favorite rule. Provider coverage and early-week line availability depend on the feeds; verify live responses after configuring the keys.

Preparing the next week attempts to import the complete NFL schedule from ESPN and DraftKings spreads from The Odds API. If a line is unavailable, setup continues with a warning and publication retries the import. Publication will not proceed until every scheduled NFL game has a valid line; existing NFL rows are preserved. The import uses the pool's pick deadline and includes games through Monday night. The Thanksgiving Week 13 exception starts Wednesday evening, so it also includes Wednesday, Thursday, and Friday games. Sunday night and Monday night games are worth two points.

## Validation

Run `node tests/college-admin.test.mjs` with Node 22 or newer. Tests cover provider matching, unlimited lists, deadline filtering, missing/stale data, pick'em, provider failures and authentication. SQL transaction tests were run against temporary copies of the pool tables, confirming publication, preservation of NFL data, optimistic locking, duplicate rejection and RPC permissions. Live-provider validation requires the two keys and an administrator session.
