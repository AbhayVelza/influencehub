# InfluenceHub — frontend

Internal CRM for finding, calling, onboarding and shipping packages to influencers.
React 19 + TypeScript + Vite, with a mock API (MSW) so it runs without a backend.

## What it does

**Business flow:** gather data → call → onboard → send package.

Influencers are added by public profile lookup, manually or by CSV. One creator can have accounts on several
platforms (Instagram, YouTube, TikTok, Facebook, Threads, Pinterest, LinkedIn, Snapchat), each with its own stats.

| Stage | Meaning |
| --- | --- |
| Data Gathered → Contacted | Needs a call logged with outcome "Interested" |
| Contacted → Onboarded | Creator agreed |
| Onboarded → Package Sent | Needs a package with courier and tracking number |
| Package Sent → Delivered | Package arrived (a returned package moves them back to Onboarded) |
| On Hold / Rejected | Side stages. On Hold resumes to the previous stage; reopening Rejected is manager/admin only |

Call outcomes: no answer / call back create a follow-up, not interested rejects, interested moves to Contacted.
Admins can override any stage move, with a required reason.

## Features

- **Dashboard**: KPIs, pipeline funnel, by-category and top-cities charts, my follow-ups, activity feed.
- **Influencers**: filterable (category, platform, country → state → city, stage, owner, reach), sortable table,
  saved views, bulk actions, CSV import / export. Filters live in the URL.
- **Influencer detail**: stage stepper, social accounts with per-platform stats, sync / connect link / manual
  stats, growth chart and recent posts, calls, packages, activity log.
- **Add / Import**: profile lookup (with "Also found" linked accounts), manual entry, CSV with a preview.
- **Unassigned Pool**: influencers with no owner. Executives see a preview and claim; managers assign.
  Optional guards: claim limit and auto-release.
- **Possible duplicates** (manager/admin): side-by-side pairs with confidence and reasons; merge or dismiss.
  Duplicate warnings also appear before every add.
- **Pipeline** kanban, **Calls & Follow-ups**, **Packages**.
- **Settings** (admin): Instagram integration, team and roles, categories, pool guards.
- Light / dark theme, usable at 1024px, skeleton / empty / error states, times shown in Asia/Kolkata.

## Tech stack

Vite, React 19, TypeScript, Tailwind, shadcn/ui, lucide-react, React Router, TanStack Query and Table, Recharts,
dnd-kit, react-hook-form + zod, date-fns, sonner, MSW (mock API), Playwright (e2e), oxlint.

## Project layout

```
src/
  components/   layout shell, shared UI, shadcn/ui
  features/     add-influencer, calls, dashboard, duplicates, influencers, packages, pipeline, pool, settings
  pages/        one component per route
  services/     the only place that calls the API
  lib/          schemas (zod), platforms, stages, permissions, formatting, session
  mocks/        MSW handlers, in-memory database, fixtures
  types/        API types, the source of truth for the contract
e2e/            Playwright tests
```

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, mock API on (see .env.development)
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with the mock API |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` / `npm run typecheck` | oxlint / TypeScript |
| `npm run test:e2e` | Playwright end-to-end tests (`e2e/`) against the dev server with mocks, on port 5199 |

E2E tests use the installed Microsoft Edge. Elsewhere, run `npx playwright install chromium` and set
`E2E_CHANNEL=chromium`.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `VITE_API_URL` | API origin, without `/api/v1`. Empty = same origin. |
| `VITE_USE_MOCKS` | `true` serves the API from MSW in the browser (`src/mocks`). Read at build time: a production build without it contains no mock code. |

Copy `.env.example` to `.env.local` to override. `.env.development` turns the mocks on for `npm run dev`;
`npm run build` has them off unless you set `VITE_USE_MOCKS=true`.

## Mock data

- 54 influencers (70% in Indian cities) across every stage, plus calls, packages, activity and a 4-person team.
  Each has an Instagram account plus, for many, YouTube, TikTok, Facebook (Pages and two personal profiles),
  Threads, Pinterest, LinkedIn or Snapchat, in every sync / connect state.
- 4 planted duplicate pairs for **Possible duplicates**: same email (Riya Shah / Riya S.), a YouTube channel linked
  from an Instagram bio (Ishaan Kapoor / Ishaan Talks), the same handle on two platforms (Arjun Pillai / Arjun P),
  and a similar name in the same city (Kabir Malhotra / Kabir Malhothra).
  Dates shift on load, so "due today" and "overdue" follow-ups are always current.
- Data lives in memory: a full page reload resets it.
- Usernames that simulate failures (lookup in **Add influencer**, and **Sync now**; any lookup platform):

  | Username contains | Result |
  | --- | --- |
  | `personal` | Personal Instagram / Facebook profile: offered "Enter manually" |
  | `notfound` | Account not found |
  | `ratelimit` | Instagram rate limit |
  | `multi` | A profile whose bio links another platform ("Also found: …") |
  | anything else | A generated profile (about half link another platform in their bio) |

  A handle already in the CRM (e.g. `riyastyle`) returns "Already in CRM"; one in the Unassigned Pool (e.g.
  `oliviaexplores`) offers "Claim it".
- 12 influencers start unassigned (in the Unassigned Pool), 8 of them in Data Gathered. Arjun claimed `priyaeatskochi`
  6 days ago and Sneha claimed `meerathemom` 10 days ago, both with no call since: turn on auto-release (7 days) in
  Settings → Unassigned Pool to see one released at once and the other flagged in Arjun's notifications.

## View as (who you're signed in as)

With mocks on, the user menu (top right) has **View as**: Ananya (Admin), Rahul (Manager), and two executives,
Sneha and Arjun. It changes who `/me` returns and who the mock API enforces permissions and scoping for, so
hidden buttons, 403s and 404s can be tried in the browser. It's stored in `localStorage`, resets the cached
data, and does nothing against a real backend.

| | Executive | Manager | Admin |
| --- | :---: | :---: | :---: |
| View, add, edit, log calls, packages, standard stage moves | own influencers | all | all |
| Unassigned Pool | preview, Claim | full details, Assign | full details, Assign |
| Release to the pool (reason required) | own | anyone's | anyone's |
| Reassign, delete, reopen rejected, import / export, review & merge duplicates |  | ✓ | ✓ |
| Stage override (with reason), Settings (incl. pool guards) |  |  | ✓ |

## API

Base URL is `VITE_API_URL` + `/api/v1`. Lists return `{ items, total, page, page_size }` and errors return
`{ error: { code, message } }`. Long actions (lookup, sync, import, export) return a `job_id`; the UI polls
`GET /jobs/{id}` every 2 seconds. Executives are scoped server-side to their own influencers.
Resources: influencers, accounts, duplicates, calls, packages, pipeline, dashboard, pool, team, categories,
saved views, imports / exports, settings.

## Tests

`npm run test:e2e` runs 25 Playwright tests against the mock API: cascading filters and URL restore, sorting,
bulk stage changes, stage modals, admin override, package return, the role permissions matrix, pool claim /
release, duplicates, platforms and an axe accessibility check on every main page. Each test starts with fresh mock
data and fails on any console error.

Before calling a change done, run `npm run lint`, `npm run typecheck`, `npm run build` and `npm run test:e2e`.

## More

`CLAUDE.md` holds the data model, the API contract and every contract decision the backend must match
(including the exact name-similarity rule for duplicate detection).
