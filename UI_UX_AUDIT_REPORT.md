# InfluenceHub — UI/UX System Audit

| | |
|---|---|
| Date | 19/11/2026 |
| Branch audited | `dev/aditya` at `70ae216` (pulled the same day) |
| Reference package | `C:/Users/ADMIN/Desktop/stitch_influencehub_ui_visual_enhancement/` (9 screens + 2 DESIGN.md) |
| Scope | Investigation and documentation only. No source, config, dependency, data or git changes were made. |
| Companion document | [UI_COMPONENT_MAPPING.md](UI_COMPONENT_MAPPING.md) |

---

## 1. Executive summary

InfluenceHub is a working, well-structured CRM. Its UI is functional, accessible and consistent, but visually
plain: stock shadcn "neutral" tokens (pure white surfaces, near-black primary, no brand hue, no elevation), compact
32px controls, and no content max-width. The Stitch reference proposes a "liquid glass" look: translucent white cards
over a soft cyan-orb canvas, black pill CTAs, cyan as the single accent, Inter type, 16–20px card radii.

Most of the reference can be adopted as a **re-skin** without touching behaviour, because the app's look is
concentrated in a few places: the design tokens in `src/index.css`, 25 shadcn primitives in `src/components/ui`, the
shell in `src/components/layout`, and 18 shared components in `src/components/common`. About 70% of the visual
change lands through those layers.

However, the reference is a **concept mock-up, not a spec**. Four facts shape the whole redesign:

1. **Much of what the reference shows does not exist in the app.** Each screen carries widgets for features the CRM
   doesn't have (date-range filters, weekly charts, automation, WebRTC dialler, calendar sync, DocuSign, secure vault,
   dedupe engine, scraping crawlers, warehouse inventory, courier pickups, deal values in USD…). Under the project rules
   (no new features without asking, no sample or invented data) these **cannot** be ported. Section 7 lists each one
   as EXISTS / PARTIAL / ABSENT.
2. **The reference is internally inconsistent.** Its two DESIGN.md files contradict each other (and themselves), and
   the nine HTML files use neither cleanly. Four active-nav styles, three stage palettes, two card radii, US dates, three
   time zones, and invalid Tailwind classes. A unified system has to be chosen (Section 9).
3. **The reference has no responsive shell, no dark mode and weak accessibility** (no alt text, no focus styles, cyan
   text at 3.7:1, hidden scrollbars). The app already does better on all three, so the redesign must keep the app's
   behaviour and only borrow the look.
4. **`main` is ahead of this branch.** 11 commits on `origin/main` (Welcome Kit rename, Brand Specialist role,
   **dashboard redesign**, darker outlines, layout fixes, override rules) are not on `dev/aditya`. The reference uses
   "Welcome Kits"; this branch still says "Packages". The redesign should start from a branch that includes `main`,
   or it will conflict with that work.

**Recommendation:** adopt the reference's *visual language* (liquid-glass surfaces, black pill CTAs, single cyan
accent, Inter-style type scale, 16px cards, sticky glass header, collapsible icon-rail sidebar) through tokens and
shared components first, then restyle screens one at a time while keeping every handler, id, aria attribute, URL param
and query key exactly as it is. Port none of the reference-only features without a separate decision.

---

## 2. Existing system architecture

All facts below were verified from the repository, not from CLAUDE.md (which is partly out of date — see 2.3).

### 2.1 Stack (declared in `package.json`)

| Area | Technology |
|---|---|
| Language | TypeScript (`typescript ~7.0.2`), TSX |
| Frontend framework | React `^19.3.1`, React DOM `^19.3.1` |
| Build | Vite `^8.3.5` (Rolldown code-split groups in `vite.config.ts`), `@vitejs/plugin-react ^6.1.2` |
| Styling | Tailwind CSS `^4.3.3` via `@tailwindcss/vite`, `tw-animate-css`, `shadcn/tailwind.css`; tokens in `src/index.css` (`@theme inline`, oklch) |
| UI primitives | shadcn/ui v4 "radix-nova" style on the unified `radix-ui ^1.8.1` package; `cmdk`; `cn` package (clsx + tailwind-merge replacement) |
| Icons | `lucide-react ^1.63.0`; brand glyphs in `src/components/common/platform-icon.tsx` (Simple Icons, CC0) |
| Font | Geist Variable (`@fontsource-variable/geist`) |
| Animation | `tw-animate-css` + Radix `data-open/closed` variants. No motion library. |
| Routing | `react-router-dom ^7.18.5`, `createBrowserRouter`, 13 lazy pages (`src/router.tsx`, `src/pages/lazy.ts`) |
| Server state | TanStack Query `^5.105.0` (`src/lib/query.ts`: staleTime 30s, central `queryKeys`) |
| Tables | TanStack Table `^8.21.3` (server-side sort and pagination) |
| Charts | Recharts `^3.10.1` (single series colour `--chart-series-1`, table view toggle) |
| Drag and drop | dnd-kit (`core ^6.3.1`, `sortable ^10`, `utilities ^3.2.2`) — Pipeline only |
| Forms | react-hook-form `^7.91.0` + zod `^4.6.7` (`src/lib/schemas.ts`) |
| Dates | date-fns `^4.4.0` + `@date-fns/tz` (Asia/Kolkata), all display through `src/lib/format.ts` |
| Toasts | sonner `^2.0.8` (bottom-right, `richColors`) |
| In-app API | MSW `^3.0.3` `getResponse` router (no service worker) |
| Backend | Hono `^4.13.18` + `@hono/node-server` (`server/main.ts`), PostgreSQL via `postgres ^4.1.1` (`server/pg-store.ts`, `server/schema.sql`) |
| Lint | oxlint |

### 2.2 Runtime modes and data flow

```
component → features/*/queries.ts (TanStack Query) → src/services/*Api → src/services/http.ts request()
   header X-Acting-As = current team member (no sign-in)
   ├─ PROTOTYPE (VITE_API_SERVER != 'true'):  import('@/backend') → handleApiRequest()
   │     serial queue → IndexedDB workspace (src/backend/local-store.ts) → MSW handlers (src/backend/handlers/*)
   └─ SERVER (VITE_API_SERVER = 'true'): fetch /api/v1/... → Hono (server/main.ts)
         → same MSW handlers over PostgreSQL (server/pg-store.ts; 10 jsonb tables + files)
```

- **Authentication / authorisation:** there is no sign-in. The account menu's "Acting as" picker (`src/components/layout/user-menu.tsx`)
  calls `switchUser` (`src/lib/auth/index.ts`), which stores the member in localStorage and triggers `resetSession`
  (`src/lib/session.ts`: cancels requests, clears caches, remounts routes). Roles are cumulative
  executive ⊂ manager ⊂ admin (`src/lib/permissions.ts`); components check with `useCan` (`src/hooks/use-me.ts`);
  routes are gated by `RequirePermission` (`/duplicates`: `influencer:merge`; `/onboarded*`: `influencer:view`;
  `/settings`: `integrations:manage`).
- **Database:** IndexedDB (prototype) or PostgreSQL tables `team, categories, influencers, documents, calls, packages,
  activities, saved_views, settings, dismissed_duplicates` + `files`.
- **Build and deployment:** `npm run build` (tsc + vite), `npm run server` (builds `vite.server.config.ts` → `dist-server/main.js`,
  serves `dist/`), `npm run server:supabase`. Rule: every production chunk under 500 kB.

### 2.3 Documentation status

| Document | Status |
|---|---|
| `README.md`, `docs/project-overview.md`, `docs/server.md`, `docs/screens.md`, `docs/contract-decisions.md`, `docs/data-model.md`, `docs/api-contract.md`, `docs/dates-and-documents.md` | Current. `docs/screens.md` is the per-screen UX source of truth. |
| `CLAUDE.md` | **Out of date.** Describes Firebase Auth/Firestore, `persistence.ts`, `firestore-store.ts`, `firestore.rules`, `docs/auth.md`, `src/lib/auth/local.ts`, a sign-in page and `useCan` in `permissions.ts`. None of these exist on this branch. Recommend updating it before the redesign so implementers aren't misled. |
| Existing UI/UX documentation | UX rules live in CLAUDE.md "UX" line and `docs/screens.md`: light/dark, desktop-first usable at 1024px, skeleton + empty + error states everywhere, 12.4K/1.2M numbers, dd/MM/yyyy dates in IST, relative times, toasts, "/" focuses search, same stage colours everywhere, filters collapsed behind "Filters", single-series charts with a table view. |
| Design tokens | `src/index.css` (134 lines) + TS colour maps `STAGE_META`, `CALL_OUTCOME_META`, `PACKAGE_STATUS_META`, `SYNC_STATUS_META` (`src/lib/constants.ts`) and `PLATFORM_META` (`src/lib/platforms.ts`). |

---

## 3. Complete frontend structure

```
src/
  main.tsx, App.tsx            providers: Theme → QueryClient → Tooltip → RouterProvider(key=session) + Toaster
  router.tsx                   one layout route (AppShell) with 13 children
  index.css                    all design tokens (light + .dark), base layer
  components/
    layout/   (6)              app-shell, sidebar (+MobileNav, OnboardedGroup), top-bar, global-search,
                               notifications-menu, user-menu (+ActingAs)
    ui/       (25)             shadcn primitives (dialog, sheet, alert-dialog customised with useReturnFocus)
    common/   (18)             PageHeader, states, Pagination, CollapsibleFilters, filters, badges, avatars, inline fields…
  pages/      (13 + lazy.ts)   dashboard, influencers, influencer-detail, pool, duplicates, onboarded,
                               onboarded-platform, pipeline, calls, packages, documents, settings, not-found
  features/   (53 tsx, 18 ts)  add-influencer, calls, dashboard, documents, duplicates, influencers (+detail),
                               onboarded, packages, pipeline, pool, settings
  hooks/ (8), lib/ (19), providers/ (2), services/ (10), backend/ (9 + 10 handlers), types/ (1)
```

**Layout architecture** (`src/components/layout/app-shell.tsx`): `div.flex.h-svh.overflow-hidden` → `Sidebar` (`w-56`, 224px,
`hidden lg:flex`) + column [`TopBar` (`h-14`) + `main.flex-1.overflow-y-auto` (the only scroll container) →
`Suspense(PageSkeleton)` → `Outlet`]. Below 1024px the sidebar becomes a left `Sheet` behind a hamburger. Pages own their
padding (`p-4 sm:p-6`) and have **no max-width**. The shell waits for `/me` (skeleton, then error-with-retry).

**Breakpoint usage:** `sm:` 60 uses, `md:` 5, `lg:` 11 (`lg` = shell breakpoint), `xl:` 4, no `2xl:`. No `useIsMobile` hook.

---

## 4. Existing component inventory

**Counts:** 115 component files — layout 6, ui 25, common 18, pages 13, features 53 — containing about **279 named
component functions** (in-file subcomponents included). 21 of the 25 primitives are in use (`badge`, `scroll-area`,
`separator` unused; `input-group` used only inside `command`).

The full per-component inventory (file, purpose, appearance, interactions, data, reuse, improvements, regression risk)
is in **Appendix A** (shell, tokens, ui, common), **Appendix B** (Dashboard, Influencers, detail, Add/Import, Onboarded,
Pipeline, Calls) and **Appendix C** (Documents, Duplicates, Pool, Packages, Settings, Not-found). Summary by requested
category:

| Category | Component(s) | File(s) | Notes |
|---|---|---|---|
| Application shell | `AppShell`, `ShellSkeleton`, `PageSkeleton` | `components/layout/app-shell.tsx` | `h-svh` + `main overflow-y-auto` is load-bearing (sticky bars, kanban, hotkeys) |
| Sidebar | `Sidebar`, `MobileNav`, `SidebarBody`, `SidebarLink`, `OnboardedGroup` | `components/layout/sidebar.tsx` | 10 items, 3 live badge queries, permission-gated items, platform tile sub-nav |
| Header | `TopBar`, `GlobalSearch`, `NotificationsMenu`, `UserMenu`, `ActingAs` | `components/layout/*` | "/" hotkey with `data-page-search` hand-off; theme radio; Acting as; prototype reset uses `window.confirm` |
| Dashboard layout | `DashboardPage`, `Kpi`, `Panel`, `MyFollowUps`, `RecentActivity` | `pages/dashboard-page.tsx` | 7 KPI tiles, 4 panels, activity feed |
| Cards / KPI | `Card` (7 importers), `Kpi`, hand-rolled `rounded-lg border p-3` boxes (19×) | `ui/card.tsx`, pages | Low Card adoption makes a global restyle harder |
| Tables | `Table` primitive, `InfluencersTable` (shared by Influencers, Pool, Onboarded), page tables (Calls, Documents, Packages, Settings) | `ui/table.tsx`, `features/influencers/influencers-table.tsx` | No sticky headers, no virtualisation, column ids persisted |
| Search | `GlobalSearch`, `ListSearch` | `layout/global-search.tsx`, `features/influencers/list-search.tsx` | Debounced, URL `q` |
| Filters | `CollapsibleFilters`, `InfluencerFilterBar`, `MultiSelectFilter`, `FollowersFilter`, `DateRangeFilter`, `ActiveFilters` | `common/*`, `features/influencers/*` | Panels stay mounted when hidden (cascade logic) |
| Dropdowns | `DropdownMenu`, `Select`, `Popover`, `Command` | `ui/*` | Stock nova |
| Forms | RHF + zod forms in Add/Import, Log Call, Package drawer, Upload, Merge, Settings; `InlineTextField`/`InlineSelectField` | `features/*`, `common/inline-field.tsx` | Field ids and names are referenced by labels and error focus |
| Modals | `Dialog` (14 importers), `AlertDialog` (6) | `ui/dialog.tsx`, `ui/alert-dialog.tsx` | Customised focus return + scroll |
| Drawers | `Sheet` (MobileNav, PackageDrawer, PoolPreviewDrawer) | `ui/sheet.tsx` | Content kept during close animation |
| Tabs | `Tabs` (detail, Calls, Settings, Add/Import); custom vertical tablist (social accounts) | `ui/tabs.tsx`, `detail/social-accounts-panel.tsx` | URL `?tab=` state |
| Buttons | `Button` (59 importers) | `ui/button.tsx` | Default 32px; tinted destructive |
| Toggles | `Switch` (2), `Checkbox` (7), radio cards (Merge, Log Call outcome) | `ui/*`, features | |
| Badges | `StageBadge`/`StageDot`, `PlatformMark(s)`, `SyncStatusBadge`, `ConfidenceBadge`, `DocumentTypeBadge`, `AgreementBadges`, status pills | `common/*`, features | Hand-rolled; `ui/badge` unused |
| Tooltips | `Tooltip` (3 importers); most hints use native `title` | `ui/tooltip.tsx` | |
| Pagination | `Pagination` | `common/pagination.tsx` | 6 importers; sticky footer on list pages |
| Empty / error states | `EmptyState`, `ErrorState` | `common/states.tsx` | 15 / 18 page usages |
| Loading states | `Skeleton` (24 files), `PageSkeleton`, `ShellSkeleton`, per-page skeletons | | |
| Notifications | sonner `Toaster` (~117 toast calls in 34 files); `NotificationsMenu` bell | `ui/sonner.tsx`, layout | `richColors` uses sonner's own palette |
| Charts | `BarListChart`, `PipelineFunnel` (CSS bars), `GrowthChart`, `UsageMeter` | `features/dashboard/*`, detail, settings | Single series colour, `role="img"`, table toggle |
| Responsive layouts | shell `lg` switch, KPI grid 2/3/7, detail `lg:grid-cols-[19rem_1fr]`, onboarded 1/2/3/4 | | See Section 10 |

---

## 5. Screen analyses (all nine reference screens)

Each screen below summarises: what the reference shows, what the app has, what may be adopted visually, what must be
preserved. Exact classes, hex values and px sizes for every reference widget are in **Appendix D**; the app side is in
Appendices B and C.

Legend for reference elements: **EXISTS** (port as re-skin) · **PARTIAL** (re-skin only what exists) · **ABSENT** (new
feature — not allowed in a visual-only redesign; needs a separate decision).

### 5.1 Dashboard — `src/pages/dashboard-page.tsx`

| Reference element | Status | App today |
|---|---|---|
| Greeting + eyebrow | EXISTS | "Welcome back, <name>" + description |
| KPI cards (7) | EXISTS | 7 `Kpi` tiles (Total, Pool, Contacted this week, Onboarded this month, Packages in transit, Follow-ups today, Onboarded without agreement); several are links with exact filter URLs |
| KPI deltas (↑4.2%), "Goal +9" | ABSENT | API has no previous-period data or goals |
| Date-range segmented filter (Today / Week / MTD) | ABSENT | `GET /dashboard/summary` takes no parameters |
| Onboarded per week (area chart) | ABSENT | No time series in `DashboardSummary` |
| Calls per day (bar chart) | ABSENT | No per-day call counts anywhere |
| Pipeline status | EXISTS | `PipelineFunnel` — clickable stage rows using `STAGE_META` colours |
| Conversion rate, "Manage pipeline stages" | ABSENT | |
| My follow-ups widget + empty state | EXISTS | `MyFollowUps` with Log call / Done; "You're all caught up" |
| "Schedule follow-up", "Next scheduled check 16:00 GMT" | ABSENT | Follow-ups are scheduled from Log Call |
| (app-only) By category, Top 10 cities, Recent activity | — | Keep; restyle as glass cards |

**Hierarchy observations (app):** KPI grid is 2 / 3 / 7 columns; between 640 and 1279px seven tiles in three columns leave an
orphan tile. At 1280px the reference's seven tiles also truncate labels ("Total Influen…"). Recommend 4 + 3 or 2-row
layout at `lg`, 7 at ≥1536px.

**Preserve:** `aria-label="Key numbers"`, KPI `to` URLs, chart `role="img"` labels and "Show as table", `--chart-series-1`,
60s refetch, `LogCallDialog` mounted while closing.

### 5.2 Influencers — `src/pages/influencers-page.tsx`

| Reference element | Status | App today |
|---|---|---|
| Directory table | EXISTS | `InfluencersTable` + `buildColumns` (16 columns, chooser persisted) |
| Search | EXISTS | `ListSearch` (debounced, URL `q`, "/" target) |
| Filters button + count | EXISTS | `CollapsibleFilters` + `InfluencerFilterBar` + `ActiveFilters` chips |
| Saved views | EXISTS | `SavedViewsMenu` (team-wide) |
| Quick segments "All / Active / Negotiating" | ABSENT | Not CRM concepts; a stage segmented control would be a new filter UI over `stage[]` (needs decision) |
| Table ↔ kanban toggle | ABSENT here | Kanban is the Pipeline page; a toggle linking there is navigation only (decision) |
| Configure columns gear | EXISTS | Column chooser `DropdownMenu` |
| Platform indicators | EXISTS | `PlatformMarks` two-letter chips; reference uses generic glyphs — prefer real brand glyphs (`PlatformIcon`) |
| Pagination | EXISTS | Sticky footer with rows-per-page |
| Summary metrics (Active Deals $, Contract completion %, Total reach) | ABSENT | No deal/value data; only count in title |
| "Live Pool" indicator | ABSENT | |

**Density:** reference rows ≈ 64px with 17px names (too large for a CRM table); app rows ≈ 40px. Recommend 48–52px rows,
14px names, compact numbers (12.4K) — the reference shows raw "892,000", which breaks the app rule.

**Preserve:** column ids (localStorage key `influencehub-influencer-columns-v2`), `aria-sort`, select-all aria labels,
row-click guard selector, selection keyed on `viewKey`, sticky bulk/pagination bar, URL param names, `data-page-search`.

### 5.3 Onboarded — `src/pages/onboarded-page.tsx`, `onboarded-platform-page.tsx`

| Reference element | Status | App today |
|---|---|---|
| Platform cards (8, brand squircle, big count, chevron) | EXISTS | 8 `Link` cards with `PlatformIcon` + "N onboarded" |
| Per-card tag ("Tier 1", "Viral") and progress % | ABSENT | No targets or tiers |
| Segmented "All / High Growth / Pending Review" | ABSENT | |
| Connected-account stats | PARTIAL | Per-row audience and total reach on `/onboarded/:platform`; no per-platform totals |
| Sync status | PARTIAL | Per-row sync column; no platform summary |
| "Recent Authentication Syncs", "8/8 platforms healthy", "Connect New Network", "Export Audit" | ABSENT | No platform APIs connected (`PROFILE_LOOKUP_CONNECTED = false`); the Instagram sync log lives in Settings (admin only) |
| Sidebar sub-nav with counts | PARTIAL | `OnboardedGroup` shows 8 logo tiles (no counts) |

**Preserve:** `useOnboardedCounts` (one query per platform), locked filters, column ids (`influencehub-onboarded-columns`),
`key={platform}` remount, `aria-label="Platforms"`.

### 5.4 Pipeline — `src/pages/pipeline-page.tsx`, `src/features/pipeline/*`

| Reference element | Status | App today |
|---|---|---|
| Kanban layout | EXISTS | dnd-kit board, pointer + keyboard, 7 columns |
| Lifecycle columns + counts | EXISTS | Column header dot + title + count; On Hold / Rejected collapse to a `w-14` vertical strip (the reference copies this) |
| Creator cards | EXISTS | Avatar, name link, primary account, reach · category, owner, days-in-stage pill (stale > 14 days) |
| Stage indicators | EXISTS | From `STAGE_META`; the reference uses a different Apple-system palette — **do not adopt** (rule: same stage colours everywhere) |
| Drag visual hierarchy | EXISTS | `DragOverlay` tilt + shadow, drop rings (standard / override / blocked) |
| Header metric strip (Est. Reach, Avg Conversion, Kits en route) | ABSENT | Only totals; averages would be a new computed feature |
| Stages ↔ Grid toggle, Sort by reach, Export, Quick Enlist | ABSENT | (Add Influencer exists globally) |
| Card status strips (pitch sent, contract $, courier ETA, views) | ABSENT | |
| "Add Creator Card" in column | ABSENT | |
| Automation banner, Sync to Notion/Airtable | ABSENT | Server stage rules are fixed and not shown |

**Preserve (highest risk screen):** `PointerSensor distance: 6`, `KeyboardSensor` + `columnKeyboardCoordinates` (depends
on column rect geometry and +8/+56px offsets), listeners on the whole card, `id="pipeline-card-<id>"`, `draggable={false}`
on the link, droppable ids = stage values, `useStageMover().dialogs`, per-column `max-h-[calc(100svh-17rem)]`, optimistic
cache move + rollback, announcements, `influencehub-pipeline-collapsed`.

### 5.5 Calls & Follow-ups — `src/pages/calls-page.tsx`, `src/features/calls/log-call-dialog.tsx`

| Reference element | Status | App today |
|---|---|---|
| Tabs Due today / Overdue / Upcoming / History with counts | EXISTS | URL `?tab=`, per-tab count query, overdue red |
| "Only my follow-ups" switch | EXISTS | `Switch id="only-mine"` (managers/admins) |
| Follow-up scheduling | EXISTS | `LogCallDialog` date-time + quick picks |
| Dial queue | PARTIAL | Today / Overdue tables act as a work list; no queue metric |
| Call history | EXISTS | History tab + detail Calls tab |
| Quick actions | EXISTS | Log call, Mark done, `tel:` link |
| "Initiate Instant Call", WebRTC bridge, Dialpad, recording & AI transcription | ABSENT | |
| Sync with Calendar | ABSENT | |
| Export CSV of calls, Customize columns, row selection | ABSENT | |
| Average TAT, Weekly Pipeline Velocity chart | ABSENT | |
| Filter by owner/handle input | ABSENT | (search is not on this page today) |

**Preserve:** URL `tab`/`scope`/`page`, one `TabsContent` per tab, `colSpan={7}` on empty/error rows, Log Call radiogroup
roles, field names, `call-notes`/`call-follow-up` ids, `setError(..., { shouldFocus })`.

### 5.6 Documents — `src/pages/documents-page.tsx`, `src/features/documents/*`

| Reference element | Status | App today |
|---|---|---|
| Category tabs | PARTIAL | Type is a multi-select filter (`type[]`). Segmented tabs All / Insights / Agreements are allowed **only** if they write the same URL param |
| Contract statistics (storage, verified %, pending, clearance) | ABSENT | Only the total |
| Upload controls | EXISTS | Upload ▾ (type) → `InfluencerPicker` → `DocumentUploadDialog` |
| Document table | EXISTS | 7 columns, Preview / Download / Delete |
| Verification status | PARTIAL | Agreement "Current" / "Expired" badges only |
| Bulk operations | ABSENT | No selection |
| Audit trail, DocuSign sync, ESIGN/UETA, secure vault, AES-256, Intuit export | ABSENT | A "secure vault" claim would be **misleading** while there is no sign-in |
| Categories Contracts / Briefs / Tax W-9 | ABSENT | App types are Insights summary and Agreement only |

**Preserve:** file input with `accept={DOCUMENT_ACCEPT}`, `choose()` validation and input reset on rejection, progress
`aria-live`, two-step `pickType` → `target` state, delete hidden (not disabled) without `document:delete`, preview only for
PDF/images with fresh URL, `{dialogs}` mounted once.

### 5.7 Possible Duplicates — `src/pages/duplicates-page.tsx`, `src/features/duplicates/*`

| Reference element | Status | App today |
|---|---|---|
| Duplicate detection interface | EXISTS | `PairCard` list (confidence badge, reasons, two `Side` panels, Merge / Dismiss). **The reference only designs the empty state**; the populated list and merge dialog need their own design using the same tokens |
| Empty state | EXISTS | "No possible duplicates" |
| Exact / Fuzzy toggle, Scan Now | ABSENT | Detection runs on each request |
| Confidence threshold (92%) | ABSENT | Confidence is categorical high/medium/low |
| Dedup engine status, quarantine, heuristic ruleset, scanned sources, auto-merge strategy | ABSENT | A truthful static explainer is copy, not a feature, but needs sign-off |

**Preserve:** Merge dialog (survivor change resets choices, conditional mount, close guard while pending, toast action),
immediate Dismiss (no confirm), `enabled: useCan('influencer:merge')`, `DuplicateWarning` shared by three add flows.

### 5.8 Unassigned Pool — `src/pages/pool-page.tsx`, `src/features/pool/*`

| Reference element | Status | App today |
|---|---|---|
| Unassigned creator table | EXISTS | `InfluencersTable` with pool columns (role-dependent) |
| Search | EXISTS | `ListSearch` (executive placeholder differs) |
| Platform filters | EXISTS | Platform facet behind "Filters"; quick platform chips allowed only over `platform[]` |
| Assignment actions | EXISTS | Assign menu / Claim per row, drawer actions, bulk Assign N (round-robin) / Claim N. **Not designed in the reference** (empty state only) |
| Empty state | EXISTS | Two variants (filtered / truly empty) |
| Creator discovery, Discovery Hub, Import Discovered Creators | PARTIAL / ABSENT | Creators come from manual or CSV entry only |
| Routing info | PARTIAL | Rules exist in Settings → Pool (admin-only endpoint); round-robin shown in bulk dialog |
| Scraping status, crawlers, auto-assignment countdown, Routing Logs, ⌘K | ABSENT | No scraping; would be misleading |

**Preserve:** name cell is a **button opening the drawer** (not a profile link), permission-hidden contact columns and
Assign controls, selection reset + `keepOnly`, drawer `{item, open}` state, BulkAssignDialog two-step state, page clamp,
`influencehub-pool-columns(-limited)` keys.

### 5.9 Welcome Kits — `src/pages/packages-page.tsx`, `src/features/packages/*`

On this branch the UI says **"Packages"**; the rename to "Welcome Kits" exists only on `origin/main` (commits `f93a1ee`,
`bb9eb0b`, `090a3d9`). Take it from there, don't hand-rename.

| Reference element | Status | App today |
|---|---|---|
| Shipment table | EXISTS | 8 columns (Influencer, Items, Status, Courier, Tracking + copy, Sent, Delivered, ⋯) |
| Delivery status | EXISTS | Status pill (`PACKAGE_STATUS_META`), "Mark as" menu, delivered/returned confirm with stage effect |
| Shipping information | EXISTS | Address, courier, tracking in `PackageDrawer` |
| Status / courier filters | EXISTS | Behind "Filters" (status, courier, sent date) |
| Segmented All / Active / Delivered | PARTIAL | Allowed only as a view over `status[]` |
| Kit statistics (in transit / delivered / awaiting) | ABSENT | Would need extra count queries (decision) |
| Logistics tracking, ETAs, "View Tracking" | ABSENT | No courier API |
| Inventory cards (warehouse stock) | ABSENT | No inventory model |
| Dispatch info, scheduled pickups, labels, packing slips, Export Manifest | ABSENT / PARTIAL | Only sent date + courier |

**Preserve:** drawer state (fetch influencer before open, reset on open, `savingRef`, nested confirm), shipped-status
pre-check that opens the drawer, `items.${i}.name/qty` field array, conditional courier/tracking schema, `<datalist>`
courier suggestions, picker excludes Rejected.

### 5.10 Screens the reference does not cover

Influencer detail (`/influencers/:id`), Add / Import modal, Settings (4 tabs), Not-found, notifications menu, account
menu, every dialog and drawer. These must be restyled with the same tokens for consistency, without a reference
design. A 10th Stitch screen, `influencehub_analytics_reports`, exists in the newer zips in Downloads but was outside
the requested scope and has no matching page in the app (an Analytics page would be a new feature).

---

## 6. Existing functionality mapping

The complete per-screen mapping (every button, form, schema, dropdown, search, filter, sort, pagination, API call, modal,
drag interaction, navigation, permission, loading/error state, data update and state transition) is in **Appendices B
and C**. Cross-cutting summary:

| Concern | Where it lives | Must not change |
|---|---|---|
| Navigation | `router.tsx`, sidebar `NavLink`s, `Link`s in KPIs, funnel, rows | Paths, query strings in KPI links, `?tab=` deep links |
| URL state | `features/influencers/list-params.ts` (shared by Influencers, Pipeline, Onboarded, Pool); page-local params on Calls, Documents, Packages, Settings, detail | Param names (saved views store them), page reset on filter change |
| Search | `ListSearch` (300ms debounce → `q`), `GlobalSearch` (submit → `/influencers?q=`), `/` hotkey | `data-page-search` attribute, Esc blur |
| Filtering | `InfluencerFilterBar` + `GET /influencers/filter-options` facets; page filters | Filters stay mounted when collapsed; State/City cascade |
| Sorting | Server-side via TanStack Table `manualSorting`; header buttons with `aria-sort` | Sort keys, desc-first rules |
| Pagination | `Pagination` + `page`/`page_size` params; auto step-back | 25/50/100 options |
| Selection + bulk | Influencers (`BulkActionsBar`: stage, assign, sync, export, delete) and Pool (assign / claim) | Selection map semantics, failed-row retention |
| Stage transitions | `useStageMover` (single source): reason dialogs, required modals (Log Call, Upload agreement + insights, Package drawer), overrides (admin), optimistic Pipeline moves | All of it — it encodes business rules |
| Mutations / API | `features/*/queries.ts` → `services/*` (≈60 endpoints listed in Appendix B §8 and C §7) | Query keys and invalidations |
| Modals / drawers | Dialog, AlertDialog, Sheet with `useReturnFocus`; close guards while pending; content kept during close | Customisations in `ui/dialog.tsx`, `ui/sheet.tsx`, `ui/alert-dialog.tsx` — edit, never regenerate with `shadcn add` |
| Drag and drop | Pipeline only (dnd-kit); CSV upload uses native drag events | Sensors, keyboard coordinate getter, ids |
| Permissions | `useCan` per control; `RequirePermission` per route | Hidden (not disabled) controls stay hidden |
| Loading / error / empty | Skeletons (24 files), `ErrorState` with retry (18), `EmptyState` (15), `keepPreviousData` + `opacity-60` stale dim | Every state must survive the restyle |
| Background jobs | `useJob` / `waitForJob` (CSV import, export, sync, lookup) with progress toasts | |
| Toasts | ~117 sonner calls | Messages and variants |
| Live data | Refetch every 60s: dashboard, follow-ups (sidebar + bell), pool count, duplicates, expiring claims | Hooks inside sidebar/header must remain mounted |

**Purely visual components** (safe to restyle freely): `PageHeader`, `EmptyState`/`ErrorState` chrome, `StageBadge`/`StageDot`
(colours from `STAGE_META`), `PlatformMark(s)`, `PlatformIcon`, `PersonAvatar`, `SyncStatusBadge`, `RelativeTime`,
`ReasonList`, `Kpi`, `Panel`, `PipelineFunnel`, `BarListChart`, `GrowthChart`, `StageStepper`, `PipelineCardView`,
`ActivityTab`, `DocFlags`, `DocumentTypeBadge`, `ConfidenceBadge`, `PoolPreview`, `Side`, `NotFoundPage`, `Outcome`,
`InfluencerCell`, `Field`. Everything else contains logic (Appendices B §9 and C).

---

## 7. Reference design analysis

### 7.1 Shared shell (identical in all nine HTML files)

- **Canvas:** flat `#f9f9f9` + three fixed blurred orbs (cyan `#c3e8ff`@35% 580px blur 120; blue-grey `#d7e4f2`@40% 460px
  blur 130; cyan `#79d1ff`@20% 520px blur 140).
- **Sidebar:** fixed 240px, `bg-white/65 backdrop-blur-2xl`, soft shadow, no border. Logo tile `w-9 h-9 rounded-xl bg-black`
  "IH" + "InfluenceHub / PLATFORM". Items ≈36px, `rounded-xl`, 13px/500, Material Symbols 19px. Order matches the app
  (Dashboard, Influencers, Unassigned Pool, Possible duplicates, Pipeline, Calls & Follow-ups, Welcome Kits, Documents,
  Onboarded ▾, Settings). **No count badges** (the app has three — keep them).
- **Header:** fixed 64px, `bg-white/70 backdrop-blur-2xl`, search `max-w-lg` `rounded-xl` with "/" kbd, black pill
  "Add Influencer", 36px notifications button, 32px avatar.
- **Icons:** Material Symbols Outlined (web font). The app uses lucide — keep lucide (tech stack rule, no external font
  request); map each glyph to its lucide equivalent.

### 7.2 Recurring patterns worth adopting

Page header (optional eyebrow → 32px semibold title → count pill → muted subtitle; actions right); glass KPI tile with
label / value / meta; glass table card with uppercase 11px header, hairline dividers and footer pagination; segmented
pill controls; brand-colour platform squircles; large illustrated empty states (icon in layered circles with soft halo);
collapsed vertical side-stage columns on the kanban; black pill primary + white glass secondary buttons.

### 7.3 Problems in the reference that must not be copied

| Problem | Detail |
|---|---|
| Invalid / no-op classes | `gap-space-gutter` (cards touch on Onboarded, Duplicates, Welcome Kits), `shadow-xs`, `py-0.2`, `w-13`, `active:scale-98`, `animate-fadeIn`; `pt-16` + `py-space-lg` conflict leaves no space below the header |
| Missing font | `font-code` = JetBrains Mono, never loaded, no fallback → serif text in every screenshot |
| Inconsistent active nav | Four styles, set by inline JS rewriting `className`; Welcome Kits breaks the Onboarded row; `aria-current` on 3 screens only |
| Three stage palettes | Dashboard (graded black + cyan), Pipeline (Apple `#007AFF/#AF52DE/#FF9500/#34C759/#FF3B30`), Influencers (non-CRM stage names) |
| Mixed card radius | 16px on four screens, 20px on five, sometimes on the same page |
| Data/format drift | US dates ("Oct 14, 2024"), GMT/IST/EST, USD, raw "892,000", inconsistent counts between screens, creators with different handles |
| Accessibility | No `alt`, no `:focus-visible`, `outline-none` without replacement, hover-only row actions, hidden scrollbars (`::-webkit-scrollbar{display:none}`), `select-none` on the whole Pipeline, 10–11px text, cyan text `#008ebe` at 3.7:1 |
| Responsive | Fixed 240px sidebar with no breakpoints; tables/kanban rely on `min-w-[1100–1360px]` |
| Dark mode | `darkMode:"class"` configured, zero `dark:` classes |
| External loads | Tailwind Play CDN, Google Fonts (Material Symbols 2–3×, Inter), 36 AI-generated portraits from `lh3.googleusercontent.com` |
| Two competing primary CTAs | Header "Add Influencer" + a page black CTA on most screens |

---

## 8. Design-system comparison

`influencehub_design_system/DESIGN.md` (IH-DS) and `liquid_glass_hig/DESIGN.md` (LG-HIG) are the same Material palette with
primary and tertiary swapped. Each also contradicts its own YAML in prose. The nine HTML files implement LG-HIG.

| Topic | IH-DS | LG-HIG | Screens actually use | App today |
|---|---|---|---|---|
| Fonts | Hanken Grotesk + Space Grotesk | Inter + JetBrains Mono | Inter (mono not loaded) | Geist Variable |
| Cyan role | Primary (CTA fill) | Accent only | Accent only (`#008ebe` text, `#c3e8ff` tints) | None (chart blue `#2a78d6` only) |
| Primary button | Cyan fill, black text, 8px | Black pill, white text | Black pill `#000` | Near-black `oklch(0.205 0 0)`, `rounded-lg`, 32px |
| Primary value | YAML `#006689` vs prose `#00B4F0` | YAML `#000000` vs prose `#05080B` | `#000000` | — |
| Surfaces | Blue-tinted `#f8f9ff`… ink `#0b1c30` | Grey `#f9f9f9`… ink `#1a1c1c` | Grey | Pure white for background, card and popover |
| Canvas | `#F8FAFC→#F1F5F9` + 4–8% cyan glows | `#F5FAFF→#BFE8FB` + cyan + lilac blobs | Flat `#f9f9f9` + 3 orbs | Flat white / `oklch(0.145)` dark |
| Cards | Opaque white + 1px `#E2E8F0` | White 65–72% + blur 24 + rim + inset highlight | White 60–90% + blur 24–40, no border | White + `ring-1 ring-foreground/10`, no shadow |
| Card radius | 16px | 20px | 16px and 20px | 14px (`rounded-xl`) |
| Buttons / inputs radius | 8px | Pill or 12px | Pill / 12px | 10px (`rounded-lg`) |
| Elevation | 4 levels with cyan glow on hover | 4 levels, frosted | Ad hoc shadows | Almost none |
| Focus | Cyan border + 3px ring @15% | Double ring 2px white + 4px cyan | Mostly none | `ring-3 ring-ring/50` (neutral) |
| Type scale | h-xl 28, h-md 20, body 14/22 | h-xl 32, h-md 22, body 14/20, label 11/600 caps | LG | Title 20px, body 14px |
| Numerals | Space Grotesk "data-mono" (not mono) | `tnum` forced | Neither | `tabular-nums` in places |
| Tables | Header `#F8FAFC`, caps label, hover + left accent | Inset grouped rows ≥52px | Caps header, hairlines, 64–76px rows | `bg-muted/40` header, 40px rows |
| Breakpoints | 768 / 1280; tablet sidebar → icon bar | 768 / 1024; max width 1440 | Not responsive | `lg` 1024 shell switch |
| Dark mode | Not specified | Not specified | None | Full light/dark/system |
| Contrast | `#00B4F0` text on white 2.4:1 | same | `#008ebe` 3.7:1 (fails AA body) | Passes |

**Conflicts to resolve:** font family; whether cyan is a CTA or an accent; card radius; opaque vs frosted cards; breakpoints;
type scale; stage palette; dark mode (neither doc has one).

---

## 9. Recommended unified design tokens

Base the system on **LG-HIG as rendered in the screens** (black pill CTAs, single cyan accent, grey-white glass), add
from IH-DS what a dense CRM needs (16px radius, table rules, icon-rail tablet nav, opaque fallback), fix contrast, and add
a dark theme. Implement as CSS variables in `src/index.css` mapped through `@theme inline`, so shadcn primitives inherit
them. Values are a starting point; validate contrast before shipping.

### 9.1 Colour (light)

| Token (CSS var) | Value | Use |
|---|---|---|
| `--background` (canvas) | `#f9f9f9` | Page canvas, under the orb layer |
| `--canvas-orb-1/2/3` | `#c3e8ff`@35%, `#d7e4f2`@40%, `#79d1ff`@20% | Fixed decorative layer (pointer-events none, `aria-hidden`) |
| `--card` | `rgb(255 255 255 / 0.72)` | L1 glass cards; opaque `#ffffff` fallback |
| `--popover` | `rgb(255 255 255 / 0.90)` | Menus, popovers, selects |
| `--surface-raised` | `#ffffff` | Dialogs, sheets (opaque for legibility) |
| `--muted` | `#f3f3f4` | Table header, wells, segmented track (`rgb(14 26 36 / 0.06)` for the track) |
| `--foreground` | `#1a1c1c` | Body text |
| `--muted-foreground` | `#54606c` | Secondary text (6.4:1) |
| `--subtle-foreground` | `#75777a` | Placeholders, meta only (4.5:1) |
| `--primary` / `--primary-foreground` | `#05080b` / `#ffffff` | Primary pill buttons, checkbox, active pagination |
| `--accent-brand` | `#00b4f0` | Fills and indicators only: active dot, progress, switch-on, focus ring |
| `--accent-ink` | `#006689` | Any cyan text or meaningful icon (links, "Show as table", verified label) — replaces the reference's 3.7:1 `#008ebe` |
| `--accent-soft` / `--accent-soft-foreground` | `#c3e8ff` / `#004c68` | Active nav tint, selected rows (`/30`), info pills |
| `--border` | `rgb(14 26 36 / 0.08)` | Hairline rim on glass cards and inputs |
| `--ring` | `#00b4f0` | Focus (`0 0 0 2px var(--background), 0 0 0 4px var(--ring)`) |
| `--destructive` | `#ba1a1a` (container `#ffdad6`, ink `#93000a`) | Destructive actions, errors |
| `--success` / `--warning` / `--info` | e.g. `#1e7e34` / `#8f5200` / `#006689` with soft containers | New semantic set (the app has none) |
| `--chart-series-1` | Validate a cyan near `#0088b8` against the dataviz validator, or keep `#2a78d6` | Single chart series (dataviz rule) |
| Stage colours | **Keep `STAGE_META`** (slate, blue, violet, amber, green, gray, red); optionally expose as `--stage-*` vars | Same stage colours everywhere — do not adopt the reference's three palettes |

### 9.2 Colour (dark — not in the reference, required by the app)

Canvas `#0b0f14` with orbs at ~8–12% opacity; card `rgb(24 28 31 / 0.72)`; popover `rgb(24 28 31 / 0.92)`; foreground
`#f0f1f1`; muted foreground `#a9b3bd`; border `rgb(255 255 255 / 0.08)`; primary `#f0f1f1` with `#05080b` text;
`--accent-brand` stays `#00b4f0`; `--accent-ink` becomes `#79d1ff`; destructive `#ffb4ab`. Keep the existing stage badge
dark variants.

### 9.3 Typography

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| display | 34/40 (48/56 only for hero numbers ≥1536px) | 700 | -0.025em | KPI hero values (Onboarded cards) |
| headline-xl | 28/34 (24/30 below 768px) | 600 | -0.02em | Page titles (reference uses 32 — 28 suits a dense CRM at 1024px) |
| headline-md | 20/28 | 600 | -0.015em | Card titles, KPI values |
| headline-sm | 17/22 | 600 | -0.01em | Section headers, drawer titles |
| body-md | 14/20 | 400 | -0.005em | Default |
| body-sm | 12/16 | 400 | 0 | Meta, table secondary lines (minimum size) |
| label-md | 13/18 | 500 | 0 | Nav items, buttons |
| label-sm | 11/14 | 600 | +0.04em, uppercase | Eyebrows, table headers only |

Family: the screens use **Inter**; the app ships **Geist Variable** (self-hosted). Both are neutral grotesques at these
sizes. Switching to Inter needs a new dependency (`@fontsource-variable/inter`) — a decision for you. Either way: never load
from Google Fonts, always include a fallback stack, and use `tabular-nums` for all counts, money, percentages and dates.
Mono only for tracking numbers and IDs, with `ui-monospace` fallback.

### 9.4 Shape, spacing, elevation, motion

| Token | Value |
|---|---|
| Radius | `sm 6px` (kbd, tiny tags) · `md 8px` (menu items, icon buttons) · `lg 12px` (inputs, segmented items, inner tiles) · `xl 16px` (**all cards, table containers, kanban columns**) · `2xl 20px` (dialogs, sheets) · `full` (buttons, chips, avatars, global search) |
| Spacing | 4px base, 8px steps; page padding 16 / 24 / 32px at <768 / <1280 / ≥1280; card padding 16px (compact) or 24px; grid gap 16px (<1280) / 24px |
| Content width | `max-w-[1440px] mx-auto` for page content (tables may use full width) |
| L1 card | glass fill + `backdrop-blur(24px)` + 1px `--border` + `0 8px 32px rgb(14 26 36 / 0.04)` |
| L1 hover (clickable cards only) | `0 12px 36px rgb(14 26 36 / 0.08)`, `translateY(-2px)` |
| L2 popover | 90% fill, blur 32px, `0 16px 40px rgb(14 26 36 / 0.08), 0 2px 6px rgb(14 26 36 / 0.02)` |
| L3 dialog/sheet | opaque `--surface-raised`, overlay `bg-black/30 backdrop-blur-sm` |
| Blur budget | Only shell (sidebar, header), top-level cards and overlays. Never on nested pills, table rows or footers |
| Fallbacks | `@supports not (backdrop-filter: blur(1px))` and `@media (prefers-reduced-transparency: reduce)` → opaque fills |
| Motion | 150–200ms ease-out; respect `prefers-reduced-motion` (disable lifts, pulses) |

### 9.5 Controls

- Buttons: keep current sizes (h-8 default) to avoid toolbar wrapping at 1024px; page-level primary may use `lg` (h-9).
  Primary = black pill; secondary = white glass pill + hairline; ghost = text with `--accent-ink`; destructive = red
  tint (current) or fill for confirm actions. **No hover inversion to grey** (the reference's hover looks disabled).
- One segmented-control style (pill track `rgb(14 26 36 / 0.06)`, white active pill + `shadow-sm` + semibold) for Tabs
  `default` variant everywhere.
- Inputs 32–36px, `rounded-lg` (12px) in forms, pill for global search; focus ring on `:focus-visible` everywhere.
- Chips/badges 20–24px pill, ≥12px text; keep the `ring-1 ring-inset` badge pattern.
- Tables: container = L1 card `overflow-hidden`; header `--muted`/60, uppercase label-sm muted; rows 44–52px; hairline
  dividers; hover `--accent-soft`/20; selected `--accent-soft`/30 + 2px left accent; numbers right-aligned tabular;
  **sticky header** inside the scroll container; visible (not hidden) scrollbars.
- Icons: lucide only, 16px in controls, 18px in nav.

---

## 10. Responsive design assessment

### 10.1 Method

The app ran locally in prototype mode (empty workspace, IndexedDB, no real database). Each of 11 routes was loaded in
iframes at 1920, 1440, 1280, 1024, 768, 430, 390 and 360px (88 measurements), measuring document scroll width,
elements past the viewport, internal horizontal scrollers, interactive-element sizes and truncated text; mobile
screenshots were taken at 375px. **Limitation:** with no data, tables, kanban cards and charts were measured empty, so
row-content truncation, long-name wrapping and chart label collisions with real data are **not** verified; modals and
drawers were assessed from code (only the mobile nav sheet was opened). Re-run this check with a seeded workspace
(created through the UI, never committed) before sign-off.

### 10.2 Results

| Width | Shell | Findings |
|---|---|---|
| 1920 | Sidebar 224px, content 1696px | No overflow. **No max-width**: KPI tiles 230px wide, tables and cards stretch to 1696px; long line lengths, sparse layout. Dashboard charts 776px wide each. |
| 1440 | 224 / 1216 | No page overflow. Influencers and Onboarded/:platform tables already scroll horizontally inside their card. |
| 1280 | 224 / 1056 | No page overflow. Influencers, Pool, Onboarded/:platform tables and the Pipeline board scroll horizontally. |
| 1024 | 224 / 800 | No page overflow (meets the "usable at 1024px" rule). Same internal scrollers; only ~3 kanban columns visible. Dashboard KPI grid is 3 columns with 7 tiles → orphan tile. |
| 768 | Hamburger + Sheet (`w-64`) | No page overflow. Tables scroll inside cards. |
| 430 | Hamburger | No page overflow. Calls, Packages, Documents tables scroll inside cards. |
| 390 | Hamburger | **Page-level horizontal scroll on `/settings`** (main 407px wide): the `TabsList` (`w-fit`, does not wrap) is 391px. |
| 360 | Hamburger | **Page-level horizontal scroll on `/calls` (411px) and `/settings` (407px)**: tab lists 395px / 391px do not wrap. |

### 10.3 Issues found

| # | Issue | Where | Severity |
|---|---|---|---|
| R1 | Tab strips don't wrap or scroll → page scrolls sideways at ≤390px | `ui/tabs.tsx` default variant `w-fit` in `pages/calls-page.tsx`, `pages/settings-page.tsx` (detail page already adds `max-w-full overflow-x-auto`) | High (mobile) |
| R2 | Empty and error states inside wide tables are centred on the **table** width, so at narrow widths the message sits off-screen (Calls: "Follow-ups you schedule for today will show u…" clipped; Influencers: empty state not visible at 375px) | `InfluencersTable` `emptyContent`, Calls/Documents/Packages table empty rows | High (mobile), Medium (1024) |
| R3 | Touch targets: controls are 28–32px tall; at 360px almost no control reaches 44px; 2–5 per page are under 24px (e.g. "Show as table" link buttons 18px, column chooser, sort header buttons) | `ui/button.tsx` sizes, `BarListChart`, `InfluencersTable` | Medium (WCAG 2.5.8 needs 24px; 44px recommended on touch) |
| R4 | Wide tables (Influencers ≈1204px min, Onboarded ≈1179px, Pool ≈1011px) scroll horizontally from 1440px down; no sticky first column or sticky header; scroll affordance is just a scrollbar | `InfluencersTable` | Medium |
| R5 | Kanban: columns `min-w-48`, board scrolls from 1280px down; at mobile one column plus a sliver; per-column `max-h` tuned to header height | `features/pipeline/pipeline-board.tsx` | Medium (keyboard moves depend on geometry — change with care) |
| R6 | No content max-width at ≥1440px | All pages | Medium |
| R7 | KPI grid orphan tile at 640–1279px (3 columns × 7 tiles) and 2-column mobile (7 tiles) | `pages/dashboard-page.tsx` | Low |
| R8 | Header search shrinks to ~120px at 360px; placeholder truncated | `layout/global-search.tsx` | Low |
| R9 | 1024px leaves 800px of content beside a full 224px sidebar; no icon-rail mode | `layout/sidebar.tsx` | Medium (desktop-first rule) |
| R10 | Dialog widths: most `sm:max-w-sm/md`, Add/Import `sm:max-w-3xl max-h-[90svh]`, preview `sm:max-w-3xl h-[65vh]`; sheets `w-3/4 sm:max-w-sm`, package drawer `w-full sm:max-w-lg`. Tall dialogs scroll (`max-h-[calc(100svh-2rem)]`). CSV mapping grid `grid-cols-2` and Merge `md:grid-cols-2` will be cramped below 400px (code review; not opened) | `ui/dialog.tsx`, features | Low–Medium |
| R11 | Charts resize correctly (Recharts width tracked the container at every width: 328–776px); horizontal bar labels in "Top 10 cities" may collide with long names — not verifiable without data | `BarListChart` | Low |
| R12 | Sidebar and navigation: mobile Sheet works and closes on navigation; the Onboarded sub-nav tiles are 32px | `layout/sidebar.tsx` | Low |

---

## 11. UI improvement recommendations

Design recommendations only. Nothing below changes behaviour.

1. **Tokens first** (Section 9): tinted canvas + glass cards + hairline, black pill primary, cyan accent with an accessible
   ink variant, semantic success/warning/info, shadow scale, radius scale, dark theme, blur fallbacks.
2. **Shell:** glass sidebar (240px ≥1280px, 72px icon rail 1024–1279px with tooltips, Sheet below 1024px); active item
   with `--accent-soft` fill + left indicator + `aria-current`; coloured actionable badges (due today = warning, duplicates
   = accent); real logo mark. Sticky glass header (64px), wider search with "/" hint, visible theme toggle.
3. **Page header:** eyebrow (optional), 28px title, count pill, subtitle, actions; one primary CTA per page (avoid a page
   black CTA duplicating the header "Add Influencer" — e.g. make page-level Add a secondary button or hide the header one
   on that page; that is a visual decision, not a behaviour change, but confirm it).
4. **Cards:** migrate the 19 hand-rolled `rounded-lg border` boxes to `Card`, so one file controls the glass surface.
5. **KPI tiles:** reference anatomy (label, value, meta) without deltas; 4+3 layout at `lg`, 7 at `2xl`.
6. **Tables:** sticky header, glass container, 48px rows, hover/selected tints, visible scrollbars, empty state pinned
   to the visible width (`sticky left-0` wrapper sized to the scroll container), optional sticky first column.
7. **Segmented controls:** one style for all `Tabs`; make tab lists wrap or scroll (`max-w-full overflow-x-auto`).
8. **Filters:** extract a shared `FilterTrigger` and `CountBadge` (copy-pasted in four places); put the open filter panel in
   a subtle glass tray; keep children mounted.
9. **Empty states:** reference illustration style (icon in layered circles with soft halo), size variants (page / card /
   menu), reuse in the notifications menu.
10. **Platform marks:** show real brand glyphs (`PlatformIcon`) instead of two-letter chips where space allows.
11. **Charts:** glass `Panel`, accent series colour (validated), keep table view and `role="img"`.
12. **Toasts:** drop `richColors`, style with tokens (success/warning/destructive).
13. **Focus and motion:** `:focus-visible` double ring on every control; `prefers-reduced-motion` support.
14. **Touch:** raise hit areas to ≥24px everywhere (≥36px under 768px) using padding / `after:` hit-area expanders,
    not bigger visuals.
15. Replace `window.confirm` in "Reset prototype data" with `AlertDialog` (visual consistency; same behaviour).

Out-of-scope observations (not UI, recorded for follow-up): no route `errorElement` (a crash or stale chunk shows React
Router's default screen); hard-coded `range-from`/`range-to` ids in `DateRangeFilter`; `vite.config.ts` `ui-utils` group
lists `tailwind-merge` (not installed) and omits `cn`; orphan comment in `src/pages/lazy.ts:17`; stray spaces in the Team
settings description; notification badge uses `bg-red-600` instead of the token; CLAUDE.md out of date.

---

## 12. Component reuse strategy

| New / extended shared piece | Built from | Replaces | Consumers |
|---|---|---|---|
| Glass `Card` (+ `size`, `interactive` variants) | `ui/card.tsx` | 19 hand-rolled boxes, `Kpi`, `Panel`, `PairCard`, `Side`, settings cards, onboarded cards | All pages |
| `PageHeader` v2 (eyebrow, count, icon, actions) | `common/page-header.tsx` | Per-page title + count markup | 11 pages |
| `StatTile` | new in `components/common` | `Kpi`, CSV summary `Stat`, Settings usage tile | Dashboard, CSV import, Settings |
| `SegmentedTabs` (Tabs default variant restyle) | `ui/tabs.tsx` | — | Calls, Settings, detail, Add/Import |
| `FilterTrigger`, `CountBadge` | `ui/button.tsx`, `ui/badge.tsx` (currently unused) | Copies in `CollapsibleFilters`, `MultiSelectFilter`, `DateRangeFilter`, `FollowersFilter`, sidebar | Filters, sidebar, tabs |
| `DataTableCard` wrapper (sticky header, empty-state pinning) | `ui/table.tsx` + Card | `rounded-lg border bg-card` table wrappers | Influencers, Pool, Onboarded, Calls, Documents, Packages, Settings |
| `EmptyState` sizes (`page`, `card`, `inline`) | `common/states.tsx` | Inline `<p>` empties in menus | All |
| `StatusPill` (dot + label, semantic or meta-driven) | `ui/badge.tsx` | Package, call outcome, sync, agreement, confidence pills | Several |
| Canvas layer | new in `components/layout` | — | `AppShell` |

Rules: restyle by **editing** `src/components/ui/*` (never regenerate — focus-return and dialog-scroll customisations would
be lost); keep `STAGE_META`, `PLATFORM_META` and other meta maps as literal class strings (Tailwind scans them).

---

## 13. File-level implementation plan

Change types: **T** = token/CSS only · **R** = restyle (classes/markup inside the component, same props and logic) · **S** =
structural layout change (wrappers, grid) with no behaviour change. See UI_COMPONENT_MAPPING.md for the per-component view.

| Phase | Files | Type | Notes |
|---|---|---|---|
| 0 | — | — | Decisions (Section 16 step 0); bring `origin/main` into the working branch |
| 1 Tokens | `src/index.css` | T | Light + dark roles, radius, shadows, glass utilities (`@utility glass-card` etc.), canvas vars, semantic colours, focus ring, reduced-transparency fallback |
| 1 Font | `src/index.css`, `package.json` (only if Inter approved) | T | Otherwise keep Geist |
| 2 Primitives | `src/components/ui/{button,card,input,select,tabs,table,dialog,sheet,alert-dialog,dropdown-menu,popover,tooltip,checkbox,switch,badge,progress,skeleton,sonner,command,textarea}.tsx` | R | Edit in place; keep `useReturnFocus`, dialog `max-h`/scroll, data-slots |
| 3 Shell | `src/components/layout/{app-shell,sidebar,top-bar,global-search,notifications-menu,user-menu}.tsx` | R/S | Canvas layer, icon-rail breakpoint, sticky glass header, keep badge queries, `data-page-search`, ActingAs, theme key |
| 4 Shared | `src/components/common/{page-header,states,pagination,collapsible-filters,multi-select-filter,date-range-filter,followers-filter,stage-badge,platform-badge,platform-icon,person-avatar,sync-status-badge,inline-field,date-input}.tsx` (+ new `stat-tile.tsx`, `filter-trigger.tsx`) | R | Keep every prop and keyboard contract |
| 5 Tables | `src/features/influencers/influencers-table.tsx`, `columns.tsx`, `src/features/pool/columns.tsx`, `src/features/onboarded/columns.tsx` | R | Do not rename column ids; keep row-click guard |
| 6 Screens | `src/pages/dashboard-page.tsx`, `src/features/dashboard/*` | R/S | |
|  | `src/pages/influencers-page.tsx`, `src/features/influencers/{list-search,saved-views-menu,filter-bar,active-filters,bulk-actions-bar}.tsx` | R | |
|  | `src/pages/pool-page.tsx`, `src/features/pool/*` | R | |
|  | `src/pages/onboarded-page.tsx`, `onboarded-platform-page.tsx` | R/S | |
|  | `src/pages/pipeline-page.tsx`, `src/features/pipeline/{pipeline-board,pipeline-card}.tsx` | R | Geometry-sensitive; test keyboard moves |
|  | `src/pages/calls-page.tsx`, `src/features/calls/log-call-dialog.tsx` | R | Fix tab wrapping |
|  | `src/pages/documents-page.tsx`, `src/features/documents/*` | R | |
|  | `src/pages/packages-page.tsx`, `src/features/packages/*` | R | After the Welcome Kit rename lands |
|  | `src/pages/duplicates-page.tsx`, `src/features/duplicates/*` | R | Design the populated list + merge (not in reference) |
|  | `src/pages/influencer-detail-page.tsx`, `src/features/influencers/detail/*`, `stage-mover.tsx`, `stage-reason-dialog.tsx` | R | No reference — apply tokens |
|  | `src/features/add-influencer/*` | R | |
|  | `src/pages/settings-page.tsx`, `src/features/settings/*`, `src/pages/not-found-page.tsx` | R | Fix tab wrapping |
| 7 Consts | `src/lib/constants.ts`, `src/lib/platforms.ts` | T | Only if badge tints are tuned for glass; keep literal class strings, keep hex in sync with dots |
| Never | `src/backend/**`, `server/**`, `src/services/**`, `src/lib/{schemas,stages,permissions,format,query,session,mode}.ts`, `src/types/**`, `features/*/queries.ts`, `list-params.ts`, `keyboard.ts`, `use-*` hooks | — | Logic layer |

---

## 14. Functional regression risks

| Risk | Where | Mitigation |
|---|---|---|
| Kanban keyboard moves break when column geometry changes | `pipeline/keyboard.ts` (`+8/+56px`, rects sorted by left), `pipeline-board.tsx` | Keep header height/padding or update offsets; test Space + arrows in every column, collapsed side stages |
| Click opens profile instead of drag, or drag starts on click | `PointerSensor distance: 6`, listeners on whole card | Don't add nested buttons to cards without excluding them |
| Column visibility lost | Column ids + localStorage keys | Never rename ids/keys |
| Row click hijacks new controls | Row-click guard selector | Any new cell control must be a `button`/`a`/`[role=menu]` etc. |
| Filters stop cascading | `CollapsibleFilters` hides via CSS | Never unmount children |
| "/" shortcut stops working | `data-page-search` | Keep the attribute on the page search input |
| Focus return lost after dialogs | `useReturnFocus` in dialog/sheet/alert-dialog | Edit primitives, don't regenerate |
| Dialog content vanishes during close animation | Pages keep `target` / `{item, open}` state | Keep the open/target split |
| Required-step flows bypassed | `useStageMover` dialogs, document upload steps, package intent | Keep `dialogs` rendered once; don't change props |
| Permission leaks | Hidden-not-disabled controls (`useCan`) | Keep conditionals exactly |
| Upload validation bypassed | `DocumentUploadDialog` `choose()`, input reset | Any dropzone must call `choose(file)` |
| Merge picks wrong values | `MergeDialog` survivor reset | Keep radio group names and reset |
| Sticky bars detach | Page wrapper `flex min-h-full flex-col` + `main` scroll container | Keep shell scroll model (or move sticky logic with it) |
| Theme flash | Theme key shared by `index.html` inline script | Keep key and `.dark` class strategy |
| Session reset broken | `RouterProvider key={sessionKey}` | Don't restructure `App.tsx` providers |
| Glass hurts legibility / performance | `backdrop-filter` everywhere | Blur budget + opaque fallback; test at 1024px on low-end hardware |
| Contrast regressions | Cyan text, translucent cards over orbs | Use `--accent-ink`; check AA in both themes |
| Chunk size > 500 kB | New libraries | Prefer CSS; no motion/icon font libraries |
| Invented data creeping in | Copying reference widgets | Port layouts only; every number must come from an existing query |
| Merge conflicts with `main` | Dashboard redesign, Welcome Kit rename on `origin/main` | Merge `main` first |

---

## 15. Testing and validation strategy

1. **Automated gates on every change:** `npm run lint`, `npm run typecheck`, `npm run build`; check the build output so every
   chunk stays under 500 kB.
2. **Both modes:** prototype (no env) and server (`VITE_API_SERVER=true` + `npm run server`) — the UI must not differ.
3. **Both themes and System**, plus `prefers-reduced-motion` and `prefers-reduced-transparency`.
4. **Widths:** 1920, 1440, 1280, 1024, 768, 430, 390, 360 — no page-level horizontal scroll; re-run with a seeded workspace
   (created through the UI or CSV import in a throwaway browser profile; never committed).
5. **Per-screen functional checklist** (derived from Appendices B and C), run as executive, manager and admin via "Acting as":
   - Dashboard: KPI links, funnel links, Log call / Done from the follow-up widget, chart ↔ table toggles.
   - Influencers: search, "/" focus, every filter + chip removal, saved view save/apply/delete, sort cycle, column
     chooser + reset, pagination + page size, selection across pages, every bulk action, export, row click vs checkbox.
   - Detail: every stage move incl. required modals and admin override, owner change, release, delete, social account
     tabs (arrow keys), sync, connect link, inline edits (Enter/Esc), address, tags, checklist, all tabs.
   - Add/Import: lookup failure paths, manual with multiple accounts + duplicate warning, CSV upload → mapping → run → summary.
   - Pool: claim (single, bulk, lost race), assign (single, bulk round-robin), drawer open/close.
   - Duplicates: merge with differing fields, dismiss.
   - Onboarded: counts, platform pages, locked filters.
   - Pipeline: pointer drag, keyboard drag (Space + arrows), blocked drop toast, override reason (admin), collapse side stages.
   - Calls: tabs + counts, only-mine, Log call (each outcome and auto-move), Mark done.
   - Documents: upload both types (valid, wrong type, >20 MB), preview, download, delete permission.
   - Packages: create, edit, mark as each status, courier/tracking pre-check, delivered/returned confirm.
   - Settings: all four tabs and their forms.
6. **Keyboard and screen reader:** tab order, visible focus everywhere, dialogs trap and return focus, kanban announcements.
7. **Contrast:** AA for text in both themes over glass (sample over the orbs, not over white).
8. **Visual regression (optional, needs approval for a dev dependency):** Playwright screenshots per screen × width × theme.
   The repo has no e2e tests today (`docs/project-overview.md` §13).

---

## 16. Final implementation sequence

0. **Decisions before any code** (yours):
   - Merge or rebase `origin/main` into the redesign branch (Welcome Kit rename, Brand Specialist, dashboard redesign, override rules).
   - Font: keep Geist, or add Inter (new dependency).
   - Card radius 16px (recommended) vs 20px.
   - Confirm that ABSENT reference features stay out (Section 5), and whether any static explainer copy (duplicates rules, pool rules) is wanted.
   - Whether to update CLAUDE.md first (recommended).
1. **Tokens and theme** in `src/index.css` (light + dark, fallbacks). Verify the whole app still renders in both themes.
2. **Primitives** (`src/components/ui/*`) — buttons, card, inputs, tabs (segmented), table, overlays, toasts.
3. **Shell** — canvas layer, sidebar (rail + mobile), sticky glass header.
4. **Shared components** — PageHeader, Card adoption, StatTile, FilterTrigger/CountBadge, states, pagination, badges, DataTableCard.
5. **Screens, one per change:** Dashboard → Influencers → Pool → Onboarded → Pipeline → Calls → Documents → Welcome Kits →
   Duplicates → Influencer detail → Add/Import → Settings → Not-found.
6. **Responsive fixes** R1–R12 alongside each screen.
7. **Full validation pass** (Section 15) and a final screenshot review at all widths and both themes.

Stop after each phase for review.

---

## 17. Audit verification

| Check | Result |
|---|---|
| All nine reference screens inspected (screen.png viewed, code.html read) | Yes — Dashboard, Influencers, Onboarded, Pipeline, Calls & Follow-ups, Documents, Possible Duplicates, Unassigned Pool, Welcome Kits |
| Both DESIGN.md files read completely | Yes |
| Project documentation inspected | README.md, CLAUDE.md, all 7 files in `docs/`, package manifests, `vite.config.ts`, `components.json`, `index.html`, `src/index.css` |
| Existing functionality mapped | Yes — every page and feature component (Appendices B, C) |
| Critical frontend files identified | Yes — Section 13 and UI_COMPONENT_MAPPING.md |
| Source files modified | None. `git status` shows only the two new report files and `.claude/settings.json` (browser-tool permissions written by Claude Code during the audit) |
| Dependencies changed | None (no install/uninstall; the dev server ran from existing `node_modules`) |
| Database or backend changes | None. Prototype mode only, empty IndexedDB workspace in a test browser tab; no records created |

**Not inspected / limits:**
- Populated-data rendering (no sample data allowed; workspace empty) — truncation, long names, chart labels with data.
- Modals, drawers and menus at mobile widths (assessed from code; only the mobile nav sheet was opened).
- Server mode (PostgreSQL) was not run; the UI is identical by design.
- Real devices / touch input; browser support for `backdrop-filter` on target machines.
- The 10th Stitch screen (`influencehub_analytics_reports`, in the Downloads zips only) — out of the requested scope.
- Commits on `origin/main` not on this branch (only their messages and file lists were noted).

---

## Appendices

The appendices are the detailed working notes behind this report, produced by reading the code and reference files
directly. They are kept as written; where they say "other agent", the referenced screen is covered in another appendix.

- **Appendix A** — App shell, design tokens, shadcn primitives, shared components, hooks, request architecture, build.
- **Appendix B** — Dashboard, Influencers (list and detail), Add/Import, Onboarded, Pipeline, Calls: components and functionality.
- **Appendix C** — Documents, Possible duplicates, Unassigned Pool, Packages (Welcome Kits), Settings, Not-found, backend summary.
- **Appendix D** — Stitch reference package: both design systems, conflicts, shared shell, nine screens in detail,
  cross-screen inconsistencies, external resources.


---

## Appendix A — App shell, tokens, primitives and shared components

## InfluenceHub UI/UX audit: app shell, design tokens, shared components

Scope: entry and routing, providers, build config, `src/index.css` tokens, `src/components/layout/*`,
`src/components/ui/*`, `src/components/common/*`, UI-relevant hooks and lib, request architecture, docs.
Repo root: `c:/Users/ADMIN/Desktop/influencer_management`. All paths below are relative to it. Read-only audit.

**Component count: 49 files** (layout 6, ui 25, common 18), exporting about 140 named components or subparts.
Layout holds 14 component functions (6 exported). ui holds 25 shadcn primitives (4 unused). common holds 18 files
with about 26 exported components.

---

### 0. Doc drift (verify before trusting CLAUDE.md)

CLAUDE.md is out of date. The code and the newer docs agree with each other.

| CLAUDE.md says | Code reality |
|---|---|
| Data in Firestore. Firebase Auth email+password sign-in. `src/lib/auth` exports `signIn`, `signOut`, `changePassword`, `useAuthUser` | **No Firebase anywhere** (not in `package.json`, no `firebase` import in `src/` or `server/`). There is **no sign-in**. `src/lib/auth/index.ts` exports only `currentAuthUid()` and `switchUser(id)`. The acting member is kept in localStorage `influencehub-acting-as`, defaults to `usr_owner`, and is sent as the `X-Acting-As` header (`src/lib/env.ts:5`). |
| Modes: no Firebase config = PROTOTYPE, Firebase config = Firestore (`firestore-store.ts`) | `src/lib/mode.ts:8`: `PROTOTYPE = VITE_API_SERVER !== 'true' && !SSR`. Server mode = **PostgreSQL behind a Hono API server** (`server/main.ts`, `server/pg-store.ts`, `server/schema.sql`, `docs/server.md`). Prototype = IndexedDB via `src/backend/local-store.ts`. |
| `src/backend/persistence.ts`, `firestore-store.ts`, `firestore.rules`, `scripts/seed-admin.mjs`, `docs/auth.md` | **None of these exist.** `src/backend/` has `db.ts, local-store.ts, handlers/, jobs.ts, …`. `scripts/` has only `db-copy.mjs`. |
| `src/lib/auth/local.ts` "Acting as" | It doesn't exist. "Acting as" lives in `src/components/layout/user-menu.tsx:38` (`ActingAs`) and calls `switchUser`. |
| `useCan` in `src/lib/permissions.ts` | `useCan` is in **`src/hooks/use-me.ts:15`**. `permissions.ts` has only `can(role, perm)` and the role tables. |
| "the sign-in page loads no data layer" | There is no sign-in page. `src/pages/lazy.ts:17` ends with an orphan comment ("Outside the app shell, so the router gives it its own Suspense fallback.") left over from a removed SignInPage export. |
| Uses MSW's `getResponse` router | Still true. The same handlers run in the browser (`src/backend/index.ts`) and on the Hono server (`server/main.ts`). |
| `vite.config` vendor group `ui-utils` = clsx, tailwind-merge, cva | `tailwind-merge` isn't installed. Components use the **`cn` npm package** (`cn@0.5`, shadcn's compiled clsx+twMerge replacement). `src/lib/utils.ts` is just `export { cn } from "cn"`, and all 25 ui files import `from "cn"` directly. `cn` isn't in any vendor group, so it may land in an unexpected chunk (see section 9). |

Docs that **are** current: `README.md`, `docs/project-overview.md` (sections 5, 12, 13 and 15 describe Postgres, Hono and Acting-as),
`docs/server.md`, `docs/screens.md` (line 61: "Firebase removed; no sign-in yet"), `docs/contract-decisions.md`
("Acting member & team (no sign-in yet)", "API server and PostgreSQL").

**What each doc covers**
- `README.md` (142 lines): what the app does, features, stack, layout, how to run prototype and server modes, env vars, roles, checks.
- `docs/project-overview.md` (323 lines): the most complete current overview. Stages, roles, screens, architecture and request flow, tables, API summary, conventions (section 12), known gaps (section 13: no sign-in, so anyone who can reach the server can act as anyone; single instance; no e2e tests).
- `docs/screens.md` (61 lines): **the UX source of truth per screen**. Filters are collapsed everywhere, there's a shell description, and screens 2–13 are listed with their columns, filters and dialogs.
- `docs/data-model.md`: types, stages, transitions, permissions.
- `docs/api-contract.md`: endpoint list.
- `docs/contract-decisions.md`: API behaviour (accounts, duplicates, pool, CSV, jobs, acting member, Postgres).
- `docs/dates-and-documents.md`: dd/MM/yyyy rules, document upload, scoping, the Onboarded rule.
- `docs/server.md`: Postgres setup, server, tables, limits, troubleshooting.

UX rules stated in docs: light and dark themes; desktop-first and usable at 1024px; skeleton, empty and error states everywhere;
numbers shown as 12.4K / 1.2M; dates as dd/MM/yyyy in IST; relative times; toasts; "/" focuses search; the same stage colours everywhere; filters
collapsed behind a "Filters" button; charts use one series colour (`--chart-series-1`), thin marks and a table view.

---

### 1. Boot, providers and routing

**`src/main.tsx`**: `createRoot(...).render(<StrictMode><App/></StrictMode>)` and imports `./index.css`.

**`src/App.tsx`** (provider order, outside to inside):
```
ThemeProvider → QueryClientProvider(queryClient) → TooltipProvider(delayDuration=300)
  → RouterProvider key={sessionKey}   (remounts whole route tree on resetSession)
  → <Toaster position="bottom-right" richColors closeButton />
```

**`src/router.tsx`**: `createBrowserRouter`. A single layout route (`element: <AppShell/>`) contains:

| Path | Page (lazy) | Gate |
|---|---|---|
| `/` (index) | DashboardPage | none |
| `/influencers` | InfluencersPage | none |
| `/influencers/:id` | InfluencerDetailPage | none |
| `/pool` | PoolPage | none |
| `/duplicates` | DuplicatesPage | `RequirePermission influencer:merge` |
| `/onboarded` (index) | OnboardedPage | `influencer:view` |
| `/onboarded/:platform` | OnboardedPlatformPage | `influencer:view` |
| `/pipeline` | PipelinePage | none |
| `/calls` | CallsPage | none |
| `/packages` | PackagesPage | none |
| `/documents` | DocumentsPage | none |
| `/settings` | SettingsPage | `integrations:manage` (admin) |
| `*` | NotFoundPage | none |

- **There is no `errorElement` or ErrorBoundary anywhere** (grep found none). A render exception or a failed lazy chunk
  load (for example, stale chunks after a deploy) falls through to React Router's default dev error screen. This is a polish gap and a high-value
  addition: a branded route error page with "Reload".
- `src/pages/lazy.ts`: 13 `React.lazy` pages, plus the orphan comment on line 17.

**Theme (`src/providers/theme-provider.tsx`, `theme-context.ts`, `src/hooks/use-theme.ts`)**
- `Theme = 'light' | 'dark' | 'system'`, stored under localStorage `influencehub-theme`. It listens to `prefers-color-scheme`.
- It toggles the `.dark` class on `<html>` and sets `style.colorScheme`.
- `index.html:11-19` has an inline pre-paint script with the same key, which prevents a flash of light theme. **The key must stay in sync.**
- The only UI for switching theme is the radio group in the account menu. There's no standalone toggle in the top bar.

**`index.html`**: title "InfluenceHub", meta description/og, `/favicon.svg`, `<div id="root">`. No theme-color meta tag.

**`components.json`**: shadcn `style: "radix-nova"`, `baseColor: neutral`, cssVariables, `iconLibrary: lucide`,
`menuColor: default`, `menuAccent: subtle`. Aliases go to `@/components`, `@/lib/utils`, `@/components/ui`, `@/hooks`.

---

### 2. Design tokens (`src/index.css`, 134 lines). The complete set

Imports: `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`, `@fontsource-variable/geist`.
Dark variant: `@custom-variant dark (&:is(.dark *));`

#### `@theme inline` (lines 8–50)
- Fonts: `--font-sans: 'Geist Variable', sans-serif`. `--font-heading: var(--font-sans)` (same font, so headings differ only by weight).
  No mono font is defined, so `font-mono` (used on the `/` kbd) falls back to the Tailwind default stack.
- Colour bridges `--color-*` → `var(--*)` for: background, foreground, card(+fg), popover(+fg), primary(+fg),
  secondary(+fg), muted(+fg), accent(+fg), destructive, border, input, ring, chart-1..5, **chart-series-1**,
  sidebar, sidebar-foreground, sidebar-primary(+fg), sidebar-accent(+fg), sidebar-border, sidebar-ring.
- There's **no `--destructive-foreground`**, and no success, warning or info semantic tokens. Status colours are hard-coded Tailwind palette
  classes in `constants.ts` and `platforms.ts`.
- Radii (base `--radius: 0.625rem` = 10px): sm = r×0.6 (6px), md = r×0.8 (8px), lg = r (10px), xl = r×1.4 (14px),
  2xl = r×1.8 (18px), 3xl = r×2.2 (22px), 4xl = r×2.6 (26px).

#### `:root` (light, lines 52–87). All neutral (achromatic oklch), stock shadcn "neutral"
| token | value |
|---|---|
| background / card / popover | `oklch(1 0 0)` (pure white, so all three surfaces are identical) |
| foreground / card-fg / popover-fg | `oklch(0.145 0 0)` |
| primary | `oklch(0.205 0 0)` (near-black); primary-fg `oklch(0.985 0 0)` |
| secondary / muted / accent | `oklch(0.97 0 0)`; their fg `oklch(0.205 0 0)` (muted-fg `oklch(0.556 0 0)`) |
| destructive | `oklch(0.577 0.245 27.325)` (the only chromatic UI token) |
| border / input | `oklch(0.922 0 0)` |
| ring | `oklch(0.708 0 0)` |
| chart-1..5 | grey ramp `0.87 / 0.556 / 0.439 / 0.371 / 0.269` (unused by app charts) |
| **chart-series-1** | `#2a78d6` (validated single-series blue) |
| sidebar | `oklch(0.985 0 0)`; sidebar-fg `0.145`; sidebar-primary `0.205`; sidebar-accent `0.97`; sidebar-border `0.922`; sidebar-ring `0.708` |

#### `.dark` (lines 89–123)
| token | value |
|---|---|
| background | `oklch(0.145 0 0)` |
| card / popover | `oklch(0.205 0 0)` |
| foreground | `oklch(0.985 0 0)` |
| primary | `oklch(0.922 0 0)` (near-white); primary-fg `oklch(0.205 0 0)` |
| secondary / muted / accent | `oklch(0.269 0 0)`; muted-fg `oklch(0.708 0 0)` |
| destructive | `oklch(0.704 0.191 22.216)` |
| border | `oklch(1 0 0 / 10%)`; input `oklch(1 0 0 / 15%)`; ring `oklch(0.556 0 0)` |
| chart-series-1 | `#3987e5` |
| sidebar | `oklch(0.205 0 0)`; **sidebar-primary `oklch(0.488 0.243 264.376)`** (indigo; it's the only brand hue and it's unused, because sidebar badges use `bg-primary`) |

#### Base layer (lines 125–134)
`* { border-border outline-ring/50 }`, `body { bg-background text-foreground }`, `html { font-sans }`.
No custom utilities, no `@utility`, no keyframes, no shadow tokens, no glass/blur tokens.

#### Semantic colour maps in TS (not CSS)
**`STAGE_META` (`src/lib/constants.ts:29-79`)**. These are the "same stage colours everywhere", and each has a badge class, dot class and hex:

| stage | label | colour | badge (light / dark) | dot | hex |
|---|---|---|---|---|---|
| data_gathered | Data Gathered | slate | `bg-slate-100 text-slate-700 ring-slate-600/20` / `dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/25` | bg-slate-500 | #64748b |
| contacted | Contacted | blue | `bg-blue-50 text-blue-700 ring-blue-600/20` / blue-400/10, 300, 400/25 | bg-blue-500 | #3b82f6 |
| onboarded | Onboarded | violet | `bg-violet-50 text-violet-700 ring-violet-600/20` / … | bg-violet-500 | #8b5cf6 |
| package_sent | Package Sent | amber | `bg-amber-50 text-amber-800 ring-amber-600/25` / … | bg-amber-500 | #f59e0b |
| delivered | Delivered | green | `bg-green-50 text-green-700 ring-green-600/20` / … | bg-green-500 | #22c55e |
| on_hold | On Hold | gray | `bg-gray-100 text-gray-600 ring-gray-500/20` / … | bg-gray-400 | #9ca3af |
| rejected | Rejected | red | `bg-red-50 text-red-700 ring-red-600/20` / … | bg-red-500 | #ef4444 |

Other maps:
- `CALL_OUTCOME_META`: interested green, not_interested red, call_back blue, no_answer amber, wrong_number gray.
- `PACKAGE_STATUS_META`: preparing slate, sent amber, in_transit blue, delivered green, returned red.
- `SYNC_STATUS_META` dots: synced green, pending amber (pulse), not_synced gray, error red.
- `PLATFORM_META[*].badge` (`src/lib/platforms.ts:33-136`): IG pink, YT red, TT zinc, FB blue, TH neutral, PI rose, IN sky, SC yellow. Each has a two-letter `short` code.
- `PlatformIcon` brand tiles use hex brand colours (`platform-icon.tsx:18-27`).

**Restyle note:** if the palette moves off neutral (for example, a brand primary), the hard-coded Tailwind palette classes stay
as they are. Centralising them as CSS variables (`--stage-contacted` etc.) would let the glass theme tune contrast in one place.
The `ring-1 ring-inset` badge pattern is consistent and worth keeping.

---

### 3. App shell and layout (`src/components/layout/*`, 6 files)

#### Overall structure (`app-shell.tsx`)
```
<AddInfluencerProvider>                    (global Add/Import modal context)
  div.flex.h-svh.overflow-hidden
    <Sidebar/>                             (aside w-56, hidden < lg)
    div.flex.min-w-0.flex-1.flex-col
      <TopBar/>                            (h-14 header)
      main.flex-1.overflow-y-auto          (the only scroll container)
        <Suspense fallback={<PageSkeleton/>}><Outlet/></Suspense>
```
- Before `/me` resolves, `ShellSkeleton` (lines 22–39) shows a sidebar skeleton (w-56, 5 bars, `hidden lg:block`), a top-bar skeleton
  and a page skeleton.
- If `/me` fails, a full-screen `ErrorState "Couldn't load your account"` with Retry.
- Pages own their own padding (`p-4 sm:p-6`, `space-y-4`) and have **no max-width container**. Content stretches to full width
  on wide screens.

| Component | File:line | Purpose | Appearance | Interactions | Data | Restyle risk |
|---|---|---|---|---|---|---|
| `AppShell` | app-shell.tsx:41 | Root layout; gates on `/me` | flat flex, `h-svh`, page scroll inside `main` | none | `useMe()` | **High**: `h-svh overflow-hidden` + `main overflow-y-auto` is what makes sticky headers, the kanban and the `useHotkey` focus work. Keep `min-w-0` on the column or tables will overflow. |
| `PageSkeleton` (exported) | app-shell.tsx:10 | Lazy-route fallback | 2 text bars + `h-64` block, `p-4 sm:p-6` | none | none | Low. Generic, so it doesn't resemble the target page. |
| `ShellSkeleton` | app-shell.tsx:22 | First-load skeleton | mirrors the shell | `aria-busy` | none | Low. Must mirror any new shell geometry (sidebar width, header height). |
| `Sidebar` | sidebar.tsx:174 | Desktop nav ≥1024px | `aside w-56 border-r border-sidebar-border bg-sidebar`, `hidden lg:flex` | none | via SidebarBody | Medium. Width is duplicated in ShellSkeleton (`w-56`). |
| `MobileNav` | sidebar.tsx:183 | Hamburger + left Sheet <1024px | ghost icon Button `lg:hidden`; `SheetContent side=left w-64 bg-sidebar p-0` | open/close; closes on link click (nav `onClick` checks `closest('a')`) | none | Medium. The close-on-navigate relies on clicks bubbling to `<nav>`. |
| `SidebarBody` | sidebar.tsx:122 | Logo + nav list | logo row `h-14 border-b`: a 7×7 `rounded-md bg-primary` tile with "IH" text plus the "InfluenceHub" wordmark; nav `p-2 gap-0.5`; Settings pinned `mt-auto border-t` | none | `useCan` ×3, `useFollowUps('today')`, `usePoolCount()`, `useDuplicatePairs()` | **Medium-high**: badge counts come from 3 live queries (follow-ups poll every 60s). Keep the hooks when restyling. |
| `SidebarLink` | sidebar.tsx:44 | One NavLink | `h-9 rounded-md px-2.5 gap-2.5 text-sm font-medium text-sidebar-foreground/75`; hover and active `bg-sidebar-accent text-sidebar-accent-foreground`. **There's no active indicator bar or icon colour change**, so the active state is a subtle grey fill. | NavLink `end` for `/` | props | Low. `aria-label` on the badge forms its spoken text. |
| `OnboardedGroup` | sidebar.tsx:67 | "Onboarded" link + chevron disclosure → 4-column grid of platform logo tiles | 8×8 brand tiles, active = `ring-2 ring-primary ring-offset-2`, hover `scale-105` | chevron toggles `aria-expanded`; it auto-opens when you enter `/onboarded*` (state derived during render) | `useLocation` | Medium. Its expand state isn't persisted, and the chevron button sits absolutely inside the link row. |
| `TopBar` | top-bar.tsx:10 | Header | `h-14 border-b bg-background px-2 sm:px-4 lg:px-6 gap-2 sm:gap-3`. Plain, with no blur and no shadow. | none | `useAddInfluencer().open`, `useCan('influencer:create')` | Low-medium |
| `GlobalSearch` | global-search.tsx:8 | Influencer search; submit navigates to `/influencers?q=` | `form max-w-sm`, Input `pl-8 pr-8`, Search icon left, `<kbd>/</kbd>` right (`hidden sm:block`) | "/" hotkey focuses `[data-page-search]` if present, else this input; Esc blurs; Enter submits and blurs | `useNavigate` | **Medium**: the `data-page-search` hand-off contract lives in `features/influencers/list-search.tsx:42`. There are no live results or command palette, so it's submit-only. |
| `NotificationsMenu` | notifications-menu.tsx:45 | Bell dropdown: "Returning to the pool" (expiring claims) and "Follow-ups due" (overdue, then today, max 8) | ghost icon Button; red count badge `bg-red-600 text-white` (hard-coded, not a token), `9+` cap; content `w-80` | items navigate to the influencer (`?tab=calls` for releases); footer "View all follow-ups" → `/calls` | `useDefaultMine`, `useFollowUps('overdue')`, `useFollowUps('today')`, `useExpiringClaims()` | Medium. It has its own skeleton, error and empty states inline. Accessible name via sr-only text (lines 65–71). Keep that. |
| `FollowUpRow` | notifications-menu.tsx:23 | Row inside the bell menu | avatar 7 + name + outcome · "Overdue x ago" (destructive) / "Today hh:mm a" | none | props | Low |
| `UserMenu` | user-menu.tsx:73 | Account dropdown | round ghost icon Button with initials avatar; content `w-60`: name, email, role label → **Theme** radio (Light/Dark/System with Sun/Moon/Monitor) → **Acting as** | theme radio; acting-as radio | `useMe`, `useTheme` | **High**: switching members calls `switchUser` → `resetSession`, which cancels queries, clears the cache and remounts the routes. |
| `ActingAs` | user-menu.tsx:38 | Pick a team member (there's no sign-in) | label "Acting as", radio items "Name · Role"; in PROTOTYPE mode "Reset prototype data" (RotateCcw) | `toast.info("Acting as …")`; reset uses **`window.confirm`** (not AlertDialog), then dynamic-imports `@/backend` and calls `location.assign('/')` | `useTeam()` | Medium. The native `confirm` is a visual inconsistency, and swapping in AlertDialog is safe. |

#### Sidebar nav items, in order (`sidebar.tsx:130-166`)
| # | Label | Route | Icon (lucide) | Badge | Gate |
|---|---|---|---|---|---|
| 1 | Dashboard | `/` (end) | LayoutDashboard | none | none |
| 2 | Influencers | `/influencers` | Users | none | none |
| 3 | Unassigned Pool | `/pool` | Inbox | `usePoolCount()` "unassigned" | none |
| 4 | Possible duplicates | `/duplicates` | CopyCheck | `duplicates.data.total` "to review" | `influencer:merge` (manager/admin) |
| 5 | Pipeline | `/pipeline` | SquareKanban | none | none |
| 6 | Calls & Follow-ups | `/calls` | PhoneCall | follow-ups `today` total "due today" | none |
| 7 | Packages | `/packages` | Package | none | none |
| 8 | Documents | `/documents` | FileText | none | none |
| 9 | Onboarded (+ chevron → 8 platform tiles: instagram, youtube, tiktok, facebook, threads, pinterest, linkedin, snapchat) | `/onboarded`, `/onboarded/:platform` | BadgeCheck + PlatformIcon | none | `influencer:view` (every role has it) |
| 10 | Settings (pinned bottom, border-t) | `/settings` | Settings | none | `integrations:manage` (admin) |

Badges: `h-5 min-w-5 rounded-full bg-primary text-primary-foreground text-[11px]`, capped at `99+`. Every badge uses the
same neutral primary colour, so "due today" (actionable) isn't visually separated from "pool count" (informational).
The nav has no group headings (for example Work / Records / Admin) and no collapse-to-icons rail.

#### Header (top bar) contents, left to right
1. `MobileNav` hamburger (<lg only)
2. `GlobalSearch` (max-w-sm; `/` kbd hint ≥sm)
3. Spacer (`ml-auto`), then:
4. **+ Add Influencer** primary Button (label hidden <sm; `aria-label` kept); only shown with `influencer:create`; opens the global Add/Import modal
5. `NotificationsMenu` (bell)
6. `UserMenu` (avatar)

There are no breadcrumbs or page title in the header. Pages render their own `PageHeader`.

---

### 4. shadcn primitives (`src/components/ui/*`, 25 files)

They're generated with the **radix-nova** style (the newer shadcn v4 look): `data-slot` attributes, `ring-1 ring-foreground/10` instead of
borders on surfaces, `rounded-lg/xl`, `data-open:/data-closed:` animation variants, imports from the unified `radix-ui`
package, and `cn` from the `cn` package. Customisations relative to stock were confirmed with `git log -p` (commits f04f976 and d2352cd).

| # | Primitive | Importers | Exports | Current look / notable classes | Customised? |
|---|---|---|---|---|---|
| 1 | `alert-dialog.tsx` | 6 | AlertDialog, Trigger, Portal, Overlay, Content(size default/sm), Header, Footer, Media, Title, Description, Action, Cancel | overlay `bg-black/10 supports-backdrop-filter:backdrop-blur-xs`; content `rounded-xl bg-popover p-4 ring-1 ring-foreground/10 max-w-xs sm:max-w-sm`; footer `-mx-4 -mb-4 border-t bg-muted/50` | **Yes**: `useReturnFocus` (`src/lib/focus.ts`) wired into Content `onCloseAutoFocus` |
| 2 | `avatar.tsx` | 1 (PersonAvatar) | Avatar(size sm/default/lg), Image, Fallback, Badge, Group, GroupCount | `size-8 rounded-full`, `after:` hairline border with mix-blend | stock |
| 3 | `badge.tsx` | **0 (unused)** | Badge, badgeVariants (default/secondary/destructive/outline/ghost/link) | `h-5 rounded-4xl px-2 text-xs` | stock. The app hand-rolls badges in StageBadge, PlatformMark and the sidebar instead. |
| 4 | `button.tsx` | 59 | Button, buttonVariants | base `rounded-lg border-transparent text-sm font-medium`, focus `ring-3 ring-ring/50`, `active:translate-y-px`. Variants: default (`bg-primary hover:bg-primary/80`), outline (`border-border bg-background`, dark `bg-input/30`), secondary, ghost, destructive (**tinted**: `bg-destructive/10 text-destructive`), link. Sizes: default **h-8**, xs h-6, sm h-7, lg h-9, icon 8, icon-xs 6, icon-sm 7, icon-lg 9 | stock nova (compact: the default button is 32px tall) |
| 5 | `card.tsx` | 7 | Card(size default/sm), Header, Title, Description, Action, Content, Footer | `rounded-xl bg-card ring-1 ring-foreground/10 py-(--card-spacing)`, spacing 4 (sm 3), **no shadow**; footer `border-t bg-muted/50` | stock. Only 7 importers, and many pages hand-roll `rounded-lg border p-3` boxes instead (19 occurrences in pages/features). |
| 6 | `checkbox.tsx` | 7 | Checkbox | `size-4 rounded-[4px]`, checked `bg-primary`, indeterminate Minus, enlarged hit area `after:-inset-x-3 -inset-y-2` | stock |
| 7 | `command.tsx` | 2 | Command, CommandDialog, Input, List, Empty, Group, Separator, Item, Shortcut | `rounded-xl! bg-popover p-1`; input via InputGroup; list `max-h-72 no-scrollbar`; item `data-selected:bg-muted`, trailing CheckIcon | stock. Used by MultiSelectFilter. There's no global command palette. |
| 8 | `dialog.tsx` | 14 | Dialog, Trigger, Portal, Close, Overlay, Content(showCloseButton), Header, Footer(showCloseButton), Title, Description | overlay `bg-black/10 backdrop-blur-xs`; content `rounded-xl bg-popover p-4 ring-1 ring-foreground/10 sm:max-w-sm`, close button `icon-sm` top-right | **Yes**: (a) `useReturnFocus`; (b) d2352cd added `max-h-[calc(100svh-2rem)] overflow-y-auto` so tall dialogs scroll on small screens |
| 9 | `dropdown-menu.tsx` | 10 | full set (Content, Item(variant destructive, inset), Checkbox/Radio items, Label, Separator, Shortcut, Sub…) | content `rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10`; item `rounded-md px-1.5 py-1 focus:bg-accent` | stock |
| 10 | `input-group.tsx` | 1 (command) | InputGroup, Addon, Button, Text, Input, Textarea | `h-8 rounded-lg border-input` | stock. Not used directly by app code. GlobalSearch hand-positions its icon instead. |
| 11 | `input.tsx` | 17 | Input | `h-8 rounded-lg border-input bg-transparent px-2.5 text-base md:text-sm`, dark `bg-input/30`, focus `ring-3 ring-ring/50`, `aria-invalid` red | stock |
| 12 | `label.tsx` | 18 | Label | `text-sm leading-none font-medium` | stock |
| 13 | `popover.tsx` | 4 | Popover, Trigger, Content, Anchor, Header, Title, Description | `w-72 rounded-lg bg-popover p-2.5 shadow-md ring-1 ring-foreground/10` | stock |
| 14 | `progress.tsx` | 4 | Progress | `h-1 rounded-full bg-muted`, indicator `bg-primary` | stock |
| 15 | `scroll-area.tsx` | **0 (unused)** | ScrollArea, ScrollBar | thumb `bg-border` | stock |
| 16 | `select.tsx` | 10 | Select, Group, Value, Trigger(size sm/default), Content, Label, Item, Separator, ScrollUp/Down | trigger `rounded-lg border-input py-2 pl-2.5 pr-2`; content `rounded-lg shadow-md ring-1` | stock |
| 17 | `separator.tsx` | **0 (unused)** | Separator | `bg-border h-px` | stock |
| 18 | `sheet.tsx` | 3 | Sheet, Trigger, Close, Portal, Overlay, Content(side, showCloseButton), Header, Footer, Title, Description | overlay `bg-black/10 backdrop-blur-xs`; content `bg-popover shadow-lg`, sides use `w-3/4 sm:max-w-sm`, slide animations | **Yes**: `useReturnFocus` |
| 19 | `skeleton.tsx` | 24 | Skeleton | `animate-pulse rounded-md bg-muted` | stock |
| 20 | `sonner.tsx` | 1 (App) | Toaster | theme from `useTheme().resolvedTheme`; lucide icons (CircleCheck, Info, TriangleAlert, OctagonX, Loader2 spin); CSS vars `--normal-bg: var(--popover)`, `--normal-border: var(--border)`, `--border-radius: var(--radius)`; `toastOptions.classNames.toast: "cn-toast"` | stock wiring to the custom ThemeProvider (not next-themes) |
| 21 | `switch.tsx` | 2 | Switch(size sm/default) | 32×18.4px, checked `bg-primary` | stock |
| 22 | `table.tsx` | 7 | Table (wraps in `overflow-x-auto` div), Header, Body, Footer, Row, Head, Cell, Caption | head `h-10 px-2 font-medium text-foreground`; row `border-b hover:bg-muted/50 data-[state=selected]:bg-muted`; cell `p-2 whitespace-nowrap` | stock. Header isn't sticky, has no muted header background and no zebra striping. |
| 23 | `tabs.tsx` | 4 | Tabs, TabsList(variant default/line), Trigger, Content, tabsListVariants | default = `bg-muted rounded-lg p-[3px] h-8` segmented control; line = underline `after:` bar | stock |
| 24 | `textarea.tsx` | 6 | Textarea | `field-sizing-content min-h-16 rounded-lg` | stock |
| 25 | `tooltip.tsx` | 3 | TooltipProvider(delay 0, but App passes 300), Tooltip, Trigger, Content | inverted `bg-foreground text-background rounded-md text-xs` with arrow | stock. Only 3 importers. Most hints use the native `title=` attribute (RelativeTime, PlatformMark, EmailValue, sidebar tiles). |

**Unused primitives:** badge, scroll-area, separator (input-group is only used inside command). They can be adopted
(Badge as the base for stage, platform and count badges; Separator in menus and cards) or deleted.

**Restyle guidance for ui/** (toward a glassy, card-based look):
- The surface tokens all collapse to white in light mode (background = card = popover), so cards are separated only by
  `ring-foreground/10`. Introduce a tinted canvas (for example `--background: oklch(0.985 0.003 264)`), keep `--card` white,
  and add `--card-glass` / `--popover-glass` with alpha, `backdrop-blur-md`, and a soft shadow token
  (`--shadow-card`). Change it once in Card, Popover, Dropdown, Select, Dialog, Sheet and Sonner.
- Most primitives use `ring-1 ring-foreground/10` rather than `border`, so a glass edge (`ring-white/10` in dark, plus an inner
  highlight) is a one-line change per primitive.
- Overlays already use `backdrop-blur-xs` at `bg-black/10`. Bump them to `bg-black/30 backdrop-blur-sm` for depth.
- Buttons are compact (h-8). Raising the default to h-9 changes every toolbar and table row height, which is a **layout regression risk**:
  table action cells, the pagination row and filter bars wrap at 1024px. Prefer keeping the sizes and changing the radius and colour.
- Add a brand `--primary` hue. Right now primary is near-black (light) or near-white (dark), so the "+ Add Influencer" button, checkboxes,
  sidebar badges and the active filter chip are all monochrome.
- **Functional risk:** dialog, sheet and alert-dialog carry `useReturnFocus`, so re-running `shadcn add` and overwriting them would lose focus
  return. The dialog `max-h + overflow-y-auto` fix would also be lost. Any restyle should be done by editing these files, not regenerating them.

---

### 5. Shared components (`src/components/common/*`, 18 files)

| # | Component(s) | File | Used by (files) | Purpose | Appearance | Interactions | Data / props | Recommended improvements | Regression risk |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `CollapsibleFilters` | collapsible-filters.tsx | 3 | Hides every list's filters behind a "Filters" button (the docs rule) | outline sm Button with SlidersHorizontal, active-count pill `bg-primary`, chevron rotates; active state `border-primary/40 bg-primary/5`; panel `basis-full flex-wrap gap-2` toggled `flex`/`hidden` | toggle; `aria-expanded`/`aria-controls`; children **stay mounted when hidden** | `activeCount`, `actions`, children | Animate open/close (grid-rows trick, since the children must stay mounted); put the panel in a subtle `bg-muted/40 rounded-xl p-3` tray; persist the open state per page | **Medium**: it relies on the parent being a `flex-wrap` row (`basis-full`). Children must not unmount. |
| 2 | `DateInput`, `DateTimeInput` | date-input.tsx | 3 | dd/MM/yyyy text inputs (deliberately not `type=date`) | plain Input with placeholder `dd/MM/yyyy` / `dd/MM/yyyy, hh:mm a` | typing only | Input props | Add a calendar-icon popover picker that still writes dd/MM/yyyy text; add a leading icon via InputGroup | High if switched to native date inputs (that breaks the locale rule and `parseDateInput`) |
| 3 | `DateRangeFilter` | date-range-filter.tsx | 2 | Range filter popover: presets (Last 7 days, Last 30 days, This month) plus From/To | outline sm trigger with CalendarRange icon, shows "dd/MM/yyyy – dd/MM/yyyy"; popover `w-72` | draft state is reset on open; validation messages; Clear/Apply | `value {from,to}` yyyy-MM-dd (IST), `onChange` | Add a highlight for the active preset; use a calendar grid; the ids `range-from`/`range-to` are **hard-coded, so two instances on one page create duplicate ids** (switch to `useId`) | Low-medium |
| 4 | `EmailValue` | email-value.tsx | 4 | mailto link, or plain text for a note | `hover:underline`, `title` | link | `value` | Add a copy-to-clipboard affordance | Low |
| 5 | `FollowersFilter` | followers-filter.tsx | 1 | Follower-range popover with tier presets (Nano / Micro / Mid / Macro / Mega) plus min/max (accepts 25k / 1.2m) | same trigger pattern as DateRangeFilter; popover `w-64` | form submit, inline errors | `min,max,onChange,label` | Add a slider or histogram; highlight the active preset | Low |
| 6 | `InlineTextField`, `InlineSelectField` (+ internal `FieldShell`, `DisplayValue`) | inline-field.tsx | 2 | Click-to-edit detail fields validated by zod schemas | `dl`-style grid `grid-cols-[7.5rem_1fr]`; pencil `icon-xs` button that only shows on hover (`opacity-0 group-hover:opacity-100`); editing shows Input/Textarea + Check / X ghost icon buttons; Select opens with `defaultOpen` | Enter saves (Ctrl/⌘+Enter for multiline), Esc cancels; `readOnly` while saving (keeps focus); aria-invalid/describedby | `schema`, `onSave` (Promise), `value` | Show a faint hover field background so it's clear the field is editable (hover-only pencils can't be found on touch); show a success flash | **High**: the save/escape/focus logic is subtle. Restyle classes only. |
| 7 | `MultiSelectFilter` | multi-select-filter.tsx | 3 | Searchable multi-select with counts (cmdk in a Popover) | outline sm trigger `max-w-56` shows the first label or a count pill; custom checkbox squares; counts dim while refreshing; zero-count options dimmed; "Clear x" footer | toggle uses `latest` ref (rapid clicks are safe); search by label keywords | `options`, `selected`, `loading`, `refreshing`, `hint`, `renderOption` | Add a "Select all / none"; a sticky footer; use the Checkbox primitive for visual parity | **Medium-high**: the ref-based toggle and the `[&>svg:last-child]:hidden` that hides cmdk's built-in check must survive |
| 8 | `PageHeader` | page-header.tsx | 11 | Page title, description and actions | `h1 font-heading text-xl font-semibold tracking-tight`, desc `text-sm text-muted-foreground`, actions `flex-wrap gap-2` | none | `title, description, actions` | Main candidate for the "polished SaaS" lift: larger title (text-2xl), optional icon/eyebrow/breadcrumb, optional sticky glass bar | Low (11 pages, prop API is simple) |
| 9 | `Pagination` | pagination.tsx | 6 | "1–25 of 1,234" + rows-per-page Select + numbered pages with ellipses | ghost icon-sm buttons; current = outline; `tabular-nums`; numbers use `en-IN` grouping | page/size changes | `page, pageSize, total, pageSizeOptions, onPageChange, onPageSizeChange` | Make the current page `bg-primary`; at narrow widths collapse to "Prev · 3/12 · Next" | Low |
| 10 | `PersonAvatar` | person-avatar.tsx | 18 | Avatar with an image (no-referrer) and an initials fallback | `size-8`, fallback `bg-muted text-xs` | none | `name, src` | Deterministic hue per name for the fallback (more colour in tables) | Low |
| 11 | `PlatformMark`, `PlatformMarks`, `AccountLabel` | platform-badge.tsx | 16 | Two-letter coloured platform chip; de-duped set; "IG @handle" (optionally a link; `block` truncating layout) | `h-5 min-w-6 rounded px-1 text-[10px] font-semibold ring-1 ring-inset` + `PLATFORM_META.badge`; sr-only full name kept inside (`relative` to avoid scroll overflow) | external link `target=_blank` | `platform`, `account`, `link`, `block` | Option to show the real brand glyph (`PlatformIcon` at size-5) instead of letters; a tooltip instead of `title` | Medium: the `relative` wrapper prevents the sr-only span from widening scroll containers, so don't remove it |
| 12 | `PlatformIcon` | platform-icon.tsx | 3 | Brand glyph on a brand-colour tile (Simple Icons, CC0) | `size-8 rounded-lg`, glyph 55%; black tiles get a dark-mode ring | none | `platform, label` (decorative by default) | Fine as is; consider `rounded-xl` + subtle inner shadow for the glass look | Low |
| 13 | `ReasonList` | reason-list.tsx | 2 | Bullet list inside toast descriptions (max 5 + "…and N more") | `list-disc pl-4 mt-1` | none | `reasons` | none needed | Low |
| 14 | `RelativeTime` | relative-time.tsx | 14 | "2 hours ago" with the exact IST time in `title` | `<time>` | none | `iso` | Use the Tooltip primitive instead of `title` (better on touch and themed); it doesn't auto-refresh as time passes | Low |
| 15 | `RequirePermission` | require-permission.tsx | 1 (router) | Route gate: renders EmptyState "You don't have access to this page" (ShieldX) | EmptyState `py-24` | none | `useCan(permission)` | Add a "Back to dashboard" action | **Medium**: `useCan` is false while `/me` loads, but AppShell already blocks until `/me` resolves, so this is fine as long as the shell gating stays |
| 16 | `StageDot`, `StageBadge` | stage-badge.tsx | 11 | The "same stage colours everywhere" | pill `h-5 rounded-full px-2 text-xs font-medium ring-1 ring-inset` + `STAGE_META.badge`, with a 1.5 dot | none | `stage` | Already consistent; for glass, use a slightly translucent fill and a softer ring | Medium: changing STAGE_META colours affects the charts (`hex`) and the kanban too |
| 17 | `EmptyState`, `ErrorState` | states.tsx | 21 | App-wide empty and error placeholders | centred, `py-14`, 10×10 round icon chip (`bg-muted` or `bg-destructive/10`), title `font-medium`, desc `max-w-sm`; Error has `role=alert`, the message from `getErrorMessage`, and an outline "Try again" with RefreshCw | retry | `icon, title, description, action` / `error, onRetry` | Add a size variant (compact for cards and menus vs page); larger illustration chip with a gradient ring; NotificationsMenu and MultiSelectFilter could reuse it instead of their inline `<p>`s | Low |
| 18 | `SyncStatusBadge` | sync-status-badge.tsx | 3 | Dot + label for sync state | `text-xs text-muted-foreground`; pending pulses | none | `status` | none needed | Low |

**Reuse opportunities**
- The "filter trigger" pattern (outline sm Button, `border-primary/40 bg-primary/5` when active, label muted + value,
  ChevronDown) is copy-pasted in DateRangeFilter, FollowersFilter, MultiSelectFilter and CollapsibleFilters. It could be
  one `FilterTrigger` component. The count pill (`rounded-full bg-primary px-1.5 text-[11px]`) is repeated in sidebar
  badges, CollapsibleFilters and MultiSelectFilter, so it could become a `CountBadge` built on the unused `ui/badge`.
- The Clear/Apply popover footer is duplicated (DateRangeFilter, FollowersFilter).
- The skeleton list rows in NotificationsMenu could be a shared `ListSkeleton`.
- Hand-rolled bordered boxes (`rounded-lg border p-3`, 19 occurrences in pages/features) vs the `Card` primitive (36 `<Card` usages):
  standardising on Card is what makes a global glass restyle cheap.

---

### 6. Hooks and lib (UI-relevant)

| Module | What matters for UI |
|---|---|
| `src/hooks/use-me.ts` | `useMe()` (staleTime ∞); **`useCan(permission)`** → `can(me?.role, perm)`; false while loading |
| `src/lib/permissions.ts` | `can()`. Roles are cumulative: **executive** (view, create, edit, call:log, package:manage, stage:change, claim, release, document:upload) ⊂ **manager** (+ stage:reopen, document:delete, reassign, delete, merge, data:import, data:export) ⊂ **admin** (+ stage:override, team:manage, categories:manage, integrations:manage, pool:configure) |
| `src/hooks/use-follow-ups.ts` | `useFollowUps(bucket, page, size, mine)` with **refetchInterval 60s** (drives the sidebar and bell badges); `useDefaultMine()` = role is executive |
| `src/hooks/use-hotkey.ts` | `useHotkey(key, handler)`: window keydown, ignores modifier keys and editable targets, calls `preventDefault` |
| `src/hooks/use-job.ts` | polls a job every 2s (`JOB_POLL_INTERVAL_MS`) until it succeeds or fails |
| `src/hooks/use-team.ts` | `useTeam()` (5 min stale), `useTeamMap()` |
| `src/hooks/use-categories.ts`, `use-debounced-value.ts` (400ms default) | helpers |
| `src/hooks/use-theme.ts` | context accessor |
| `src/lib/constants.ts` | STAGE_META and other meta maps (section 2); `APP_TIMEZONE = Asia/Kolkata`; `DEFAULT_PAGE_SIZE 25`; `ROLE_LABEL` |
| `src/lib/format.ts` | `formatCompact` (12.4K, Intl compact), `formatNumber` (en-IN 12,45,000), `formatPercent`, `formatFollowerRange`, `parseCompactNumber`; dates are all IST through `TZDate`: `formatDate` dd/MM/yyyy, `formatDateTime` "dd/MM/yyyy, hh:mm a", `formatTime`, `formatChartDate` dd/MM, `formatDay` (no TZ shift), `formatRelative`; input parsers `parseDateInput`, `parseDateTimeInput`, `parseImportDate`; `initials` |
| `src/lib/stages.ts` | `STAGE_TRANSITIONS`, `STAGE_REQUIREMENTS` (contacted → interested call; package_sent → package with tracking; onboarded → agreement + insights), `getAllowedTransitions` (admin can move to any stage = override), `isOverride` |
| `src/lib/platforms.ts` | `PLATFORM_META` (label, short, badge classes, metrics, sync defaults), `PLATFORMS` order (instagram, youtube, tiktok, facebook, threads, pinterest, linkedin, snapchat), `totalReach`, `formatMetric`, `normalizeHandle` |
| `src/lib/session.ts` | `resetSession()` cancels queries, clears the cache, bumps the epoch, and `useSessionKey` remounts RouterProvider |
| `src/lib/mode.ts` | `PROTOTYPE`, `OWNER_ID='usr_owner'`, `PROFILE_LOOKUP_CONNECTED=false` (hides "Fetch public profiles") |
| `src/lib/auth/index.ts` | `currentAuthUid`, `switchUser` (no sign-in) |
| `src/lib/focus.ts` | `useReturnFocus` focus-history helper used by the overlays |
| `src/lib/query.ts` | QueryClient: staleTime 30s, no retry on 4xx, max 2 retries otherwise; central `queryKeys` |

---

### 7. Request architecture

```
component → feature queries (TanStack Query) → src/services/*Api → src/services/http.ts request()
   headers: X-Acting-As = currentAuthUid()
   ├─ PROTOTYPE (VITE_API_SERVER != 'true'):
   │     dynamic import('@/backend') → handleApiRequest(Request)    [src/backend/index.ts]
   │       queue (one at a time) → local-store connect() (IndexedDB) → setActingUid
   │       → msw getResponse(handlers) → 202 job? executeJob → flush() → commitJobs
   │       on throw: revertJobs + revert → 500 database_error
   └─ SERVER mode: fetch(API_ORIGIN + /api/v1/...)
         → server/main.ts: **Hono** (@hono/node-server, serveStatic, bodyLimit, cors)
           same queue + same msw handlers over pg-store (PostgreSQL via `postgres` lib)
```
- Errors become `ApiError(status, code, message)`. Network failures become the friendly "Something went wrong. Check your connection…".
  `getErrorMessage` feeds ErrorState and toasts.
- `uploadBinary` uses XHR PUT with progress, and aborts on session change.
- Vite dev proxies `/api` → `localhost:${PORT||3001}`. Dev server runs on port 3000.
- **Server framework confirmed: Hono 4** (`server/main.ts:3-7`).

---

### 8. Cross-cutting UX behaviour

**Breakpoints** (Tailwind defaults; there's no `useIsMobile` hook and no JS media queries apart from the theme's `prefers-color-scheme`):
- `sm:` 60 occurrences in 37 files: padding (`p-4 sm:p-6`), showing labels (`hidden sm:inline` on Add Influencer, `/` kbd), dialog `sm:max-w-*`.
- `md:` 5: `md:text-sm` on inputs (ui), `md:grid-cols-2` in duplicates-page and instagram-settings.
- `lg:` 11: **the shell breakpoint** (sidebar `hidden lg:flex`, MobileNav `lg:hidden`, top-bar `lg:px-6`), detail page
  `lg:grid-cols-[20rem_1fr]` and `[19rem_minmax(0,1fr)]`, dashboard `lg:grid-cols-2`, onboarded `lg:grid-cols-3`.
- `xl:` 4: dashboard KPI `xl:grid-cols-7`, onboarded `xl:grid-cols-4`, overview-tab `xl:grid-cols-2`.
- `@container` is used only inside CardHeader (ui). No `2xl:` and no `max-*:` variants.
- At exactly 1024px the sidebar (224px) appears, leaving 800px of content. That's tight for the wide influencer tables, which
  rely on `Table`'s `overflow-x-auto`.

**Loading:** Skeleton is used in 24 files. Route-level `PageSkeleton` (generic), shell-level `ShellSkeleton`, plus inline
skeletons (bell menu, multi-select).
**Empty:** `EmptyState` is used in 15 page/feature files. **Error:** `ErrorState` in 18 (with Retry). The notifications menu uses inline text instead.
**No route error boundary** (see section 1).

**Toasts:** sonner, bottom-right, `richColors`, `closeButton`, themed with popover tokens. Calls across 34 files:
`toast.error` ×52, `toast.success` ×48, `toast.warning` ×8, `toast.loading` ×4, `toast.dismiss` ×3, `toast.info` ×2.
`ReasonList` formats multi-row failure descriptions. `richColors` means success and error toasts use sonner's own green and red, not
app tokens. A glass restyle would need `toastOptions.classNames` or CSS overriding `[data-sonner-toast]`.

**Keyboard:**
- **`/`** focuses search (`global-search.tsx:14`). A page search marked `data-page-search` (only
  `features/influencers/list-search.tsx:42`) takes priority. Esc blurs either search.
- Inline fields: Enter saves (Ctrl/⌘+Enter for multiline), Esc cancels.
- Social accounts tabs: arrow-key roving (`social-accounts-panel.tsx:325`).
- Radix provides menu, dialog and select keyboard support, and focus return on close comes from `useReturnFocus`.
- There's no command palette (⌘K), no `?` shortcut help, and no other global hotkeys.

**Theme handling:** see section 1. Toaster follows `resolvedTheme`. Dark mode uses card `0.205` on background `0.145`. Platform tiles
add dark rings for black brands.

**Current visual language:** flat, monochrome neutral, compact (h-8 controls, text-sm), hairline `ring-foreground/10`
surfaces, almost no shadows (only 8 `shadow-/backdrop-blur/gradient` usages outside ui), a single blue accent only in charts,
and the logo is a black "IH" text tile.

---

### 9. Build: `vite.config.ts`
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`. Alias `@` → `src`. Dev and preview run on `0.0.0.0:3000` with `allowedHosts: true`.
- `build.rolldownOptions.output.codeSplitting.groups` (Vite 8 / Rolldown), with priority in brackets:
  - `react` [50]: react, react-dom, scheduler, react-router(-dom)
  - `ui-utils` [45]: clsx, tailwind-merge, class-variance-authority (**tailwind-merge isn't installed; the `cn` package that's actually used isn't listed**)
  - `radix` [40]: radix-ui, @radix-ui, @floating-ui, cmdk, react-remove-scroll*, aria-hidden
  - `tanstack` [40], `forms` [40]: zod, react-hook-form, @hookform; `dates` [40]: date-fns, @date-fns
  - `charts` [30]: recharts + d3-*, victory-vendor, redux and the rest of its deps; `dnd` [30]: @dnd-kit; `msw` [30]: msw + deps
- Rule: every chunk must stay under 500 kB. Adding visual libraries (for example framer-motion for glass transitions) needs its own
  group. Prefer CSS / tw-animate-css, which is already imported.
- Separate `vite.server.config.ts` builds the Hono server (`npm run server:build`).

---

### 10. Prioritised recommendations (shell and shared layer)

1. **Tokens first** (`src/index.css`): add a tinted canvas vs white card, a brand primary hue (reuse the dark-mode
   `sidebar-primary` indigo `oklch(0.488 0.243 264)` as a starting point), `--shadow-*` and `--glass-*` tokens, success/warning/info
   tokens, and stage colour variables. Every ui primitive inherits these with no functional risk.
2. **Card adoption**: migrate the hand-rolled `rounded-lg border` boxes to `Card` so the glass surface lives in one file.
3. **Sidebar**: give the active item a primary tint and a left indicator bar; group headings; colour actionable badges
   (due today = amber/primary, duplicates = violet); a real logo mark; an optional collapsed icon rail at lg (preserve the
   `useCan` gates and the 3 badge queries).
4. **Top bar**: `sticky top-0 bg-background/70 backdrop-blur border-b` (it's already outside the scroll area, so blur
   only matters if the shell is changed to scroll the body); a wider search with a "⌘K" palette (cmdk is already bundled)
   that keeps the `/` + `data-page-search` contract; a visible theme toggle.
5. **PageHeader**: larger title, optional breadcrumb or eyebrow, and a consistent actions toolbar. It's used on 11 pages.
6. **States**: size variants for EmptyState and ErrorState, used in the bell menu too; add a route `errorElement` (chunk-load reload).
7. **Replace `window.confirm`** in Reset prototype data with AlertDialog.
8. **Toasts**: drop `richColors` in favour of token-styled toasts, or style `[data-sonner-toast][data-type=…]` with the new tokens.
9. **Tables**: sticky muted header and row hover tint in `ui/table.tsx` (used by 7 files). Keep `whitespace-nowrap` and the
   `overflow-x-auto` wrapper.
10. Fix the small bugs found: hard-coded `range-from`/`range-to` ids, the orphan comment in `lazy.ts`, `vite.config` `ui-utils` listing
    the wrong class-merge package, and the notification badge `bg-red-600` hard-code (use `bg-destructive`).

**Do-not-break list for restylers**
- `AppShell` `h-svh overflow-hidden` + `main overflow-y-auto`, and `min-w-0` on flex columns.
- `RouterProvider key={session}` (session reset), `switchUser`, and the theme storage key shared with `index.html`.
- `useReturnFocus` in dialog, sheet and alert-dialog; the dialog `max-h/overflow-y-auto`.
- `data-page-search` hand-off; sr-only accessible names on the bell and avatar buttons; `relative` on PlatformMark.
- `CollapsibleFilters` keeps children mounted and needs a flex-wrap parent.
- `MultiSelectFilter`'s `latest` ref toggle and the `[&>svg:last-child]:hidden` override.
- `InlineField` readOnly-while-saving and its keyboard contract.
- STAGE_META `hex` values feed the charts and kanban; keep badge, dot and hex in sync.
- The full Tailwind class strings in `constants.ts` and `platforms.ts` must stay literal (Tailwind scans for them).

---

## Appendix B — Core screens: functionality and components

## UI/UX audit: core screens (Dashboard, Influencers, Add/Import, Onboarded, Pipeline, Calls)

Repo: `c:/Users/ADMIN/Desktop/influencer_management`. Read-only audit, made ahead of a visual-only redesign.
Data path: component → `src/features/*/queries.ts` (TanStack Query) → `src/services/*.ts` → `src/services/http.ts` `request()` →
either `handleApiRequest` (`src/backend/index.ts`, MSW handlers in `src/backend/handlers/*`, IndexedDB prototype) or `fetch` to the
API server (`server/main.ts`, PostgreSQL via `server/pg-store.ts`). Every request carries the `ACTING_AS_HEADER`.

Legend: **VISUAL** = purely presentational (safe to restyle freely). **LOGIC** = contains functional logic (restyle markup only;
keep handlers, ids, aria, names, keys).

Routes (`src/router.tsx`): `/` dashboard, `/influencers`, `/influencers/:id`, `/onboarded`, `/onboarded/:platform`, `/pipeline`, `/calls`.

---

### 0. Shared building blocks used across these screens

| Component | File | Class | Notes |
|---|---|---|---|
| `PageHeader` | `src/components/common/page-header.tsx` | VISUAL | title / description / actions slot |
| `EmptyState`, `ErrorState` | `src/components/common/states.tsx` | VISUAL (ErrorState has an `onRetry` button) | |
| `Pagination` | `src/components/common/pagination.tsx` | LOGIC (small) | "1–25 of N", rows-per-page `Select` (`aria-label="Rows per page"`), page buttons with ellipses |
| `CollapsibleFilters` | `src/components/common/collapsible-filters.tsx` | LOGIC (open state) | "Filters" button with `aria-expanded`/`aria-controls`, active count badge; children stay **mounted** while hidden (`hidden` class, not unmounted) because the filter bar's cascade effect must keep running |
| `MultiSelectFilter`, `FollowersFilter` | `src/components/common/multi-select-filter.tsx`, `followers-filter.tsx` | LOGIC | popover checklists with counts / min-max inputs |
| `StageBadge`, `StageDot` | `src/components/common/stage-badge.tsx` | VISUAL | colours from `STAGE_META` (`src/lib/constants.ts`); must stay identical everywhere (CLAUDE.md rule) |
| `PlatformMark(s)`, `AccountLabel`, `PlatformIcon` | `src/components/common/platform-badge.tsx`, `platform-icon.tsx` | VISUAL | |
| `SyncStatusBadge`, `PersonAvatar`, `EmailValue`, `RelativeTime` | `src/components/common/*` | VISUAL | dates must go through `src/lib/format.ts` |
| `GlobalSearch` | `src/components/layout/global-search.tsx` | LOGIC | `useHotkey('/')` focuses `[data-page-search]` if present, else the top-bar search |

---

### 1. Dashboard

#### 1.1 `DashboardPage` (default export) — `src/pages/dashboard-page.tsx` — LOGIC
- **Purpose**: "Where the pipeline stands today." Greeting `Welcome back, <first name>` (from `useMe`).
- **Layout**: root `space-y-4 p-4 sm:p-6`.
  - KPI row: `<section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">` (7 tiles).
  - Panels grid: `grid gap-4 lg:grid-cols-2` → Pipeline funnel, My follow-ups, Influencers by category, Top 10 cities.
  - Full-width "Recent activity" panel below.
- **Data**: one query `queryKeys.dashboard` (`['dashboard']`) → `dashboardApi.summary()` → `GET /dashboard/summary`
  (`src/backend/handlers/workspace.ts:299`), `refetchInterval: 60_000`. Type `DashboardSummary` (`src/types/index.ts:588`).
- **States**: `DashboardSkeleton` (`aria-busy`, 7 × `h-24` + 2 × `h-72`); `ErrorState "Couldn’t load the dashboard"` with retry;
  sub-empty states in follow-ups ("You’re all caught up") and activity ("No activity yet").
- **No date filter, no time range, no period selector**. Everything is "now" (week = since Monday IST, month = this month).

##### Sub-components (same file)
| Component | Class | Detail |
|---|---|---|
| `Kpi` | VISUAL (renders a `Link` when `to` is given) | `rounded-xl bg-card p-4 ring-1 ring-foreground/10`, value `text-2xl font-semibold tabular-nums` via `formatNumber`; link variant `hover:bg-muted/50 focus-visible:ring-3` |
| `Panel` | VISUAL | shadcn `Card` + `CardHeader` (title `text-sm`, optional action) |
| `MyFollowUps` | LOGIC | list `divide-y`; each row avatar + link `/influencers/:id?tab=calls` + outcome label + "Overdue <relative>" (destructive) or "Today hh:mm"; buttons **Log call** (opens `LogCallDialog`, `aria-label="Log call with <name>"`) and **Done** (`useMarkFollowUpDone` → `POST /calls/:id/done`; toasts "Follow-up marked done" / "Couldn’t update the follow-up"). Max 10 items (server `.slice(0,10)`) |
| `RecentActivity` | LOGIC-light | `ol.divide-y`; `describeActivity()` text, link `/influencers/:id?tab=activity`, actor name from `useTeamMap`, `RelativeTime`. Max 20 items |
| `DashboardSkeleton` | VISUAL | |

##### KPI tiles (all exist)
| Label | Field | Link |
|---|---|---|
| Total influencers / "My influencers" (executive) | `kpis.total` | `/influencers` |
| Unassigned Pool (+ hint "N claimed this week", null for executives) | `kpis.pool`, `kpis.claimed_this_week` | `/pool` |
| Contacted this week (hint "Moved to Contacted since Monday") | `kpis.contacted_this_week` | none |
| Onboarded this month | `kpis.onboarded_this_month` | none |
| Packages in transit | `kpis.packages_in_transit` | `/packages?status=sent&status=in_transit` |
| Follow-ups today | `kpis.follow_ups_today` | `/calls` |
| Onboarded without agreement | `kpis.onboarded_without_agreement` | `/influencers?stage=onboarded&stage=package_sent&stage=delivered&agreement=missing` |

No KPI deltas / trend arrows / sparklines exist (no previous-period data in the API).

#### 1.2 `PipelineFunnel` — `src/features/dashboard/pipeline-funnel.tsx` — VISUAL (+ links)
- Rows are `Link to=/influencers?stage=<stage>`, grid `grid-cols-[7.5rem_1fr_4.5rem]`; bar width = count/max, colour
  `STAGE_META[stage].dot`; count + % of total; `sr-only` text "influencers — open the list filtered to this stage".
- Main stages in `<ol>`, side stages (On Hold, Rejected) in a second `<ul>` with `border-t`, `opacity-70`.

#### 1.3 `BarListChart` — `src/features/dashboard/bar-list-chart.tsx` — VISUAL (+ table toggle state)
- Recharts horizontal `BarChart`, single series `var(--chart-series-1)`, `barSize 22`, row height 30, no animation, custom tooltip.
- Wrapper `role="img"` with an aria-label listing every value. "Show as table" / "Show chart" link button toggles a `<table>`.
- Used for "Influencers by category" and "Top 10 cities".

#### 1.4 Reference comparison — Dashboard
| Reference element | Status | Where / note |
|---|---|---|
| KPI cards | **EXISTS** | 7 tiles, `dashboard-page.tsx` `Kpi` |
| Date filters | **ABSENT** | API has no range params; `GET /dashboard/summary` takes no query |
| Onboarded-per-week chart | **ABSENT** | no time-series in `DashboardSummary`; only scalar `onboarded_this_month` |
| Calls-per-day chart | **ABSENT** | no call counts by day anywhere in the API |
| Pipeline status | **EXISTS** | `PipelineFunnel` (horizontal stage bars, clickable) |
| Follow-up widget | **EXISTS** | `MyFollowUps` panel (today + overdue, Log call / Done) |
| (extra, not in reference) | exists | by-category bars, top-10 cities bars, recent activity feed |

#### 1.5 Regression risks — Dashboard
- `aria-label="Key numbers"` section, `aria-busy` skeleton, the chart `role="img"` labels and "Show as table" toggle (dataviz rule: table view required).
- KPI tiles are `Link`s with exact query strings (`ONBOARDED_OR_LATER`, packages status) — keep the `to` values.
- `LogCallDialog` is mounted conditionally (`logFor &&`) and kept mounted while closing for animation; don't unmount on close.
- Chart colour must stay `--chart-series-1`; stage colours from `STAGE_META`.

---

### 2. Influencers list

#### 2.1 `InfluencersPage` — `src/pages/influencers-page.tsx` — LOGIC
- **Layout**: `flex min-h-full flex-col`; content `flex-1 space-y-4 p-4 sm:p-6 pb-4`; footer **sticky** bar
  `sticky bottom-0 flex min-h-14 flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-6 py-2.5 backdrop-blur`
  holding `BulkActionsBar` (left, when selection) and `Pagination` (right).
- **Header**: title "Influencers (N)"; actions (permission-gated):
  - **Import CSV** (`useCan('data:import')`, manager/admin) → `addInfluencer.open({ tab: 'csv' })`
  - **Export** (`useCan('data:export')`) → `useExportInfluencers().exportInfluencers({ filters })`; disabled while exporting or total 0
  - **+ Add Influencer** (`useCan('influencer:create')`) → `addInfluencer.open()`
- Row 2: `ListSearch` (left, `max-w-md`) + `SavedViewsMenu` (right), `flex items-center justify-between gap-3`.
- Row 3: `InfluencerFilterBar` (`hideAssigned={!canReassign}`), Row 4: `ActiveFilters` chips.
- `InfluencersTable` with `buildColumns(team)`, `visibilityKey="influencehub-influencer-columns-v2"`, row click → `navigate('/influencers/:id')`.
- **Selection** (page-local `Map<id, Influencer>`): survives paging, resets when `viewKey(filters, sort)` changes; after bulk
  actions only failed ids stay selected (`onSettled(keepIds)`).
- `rememberListSearch(search)` → sessionStorage key `influencehub-list-return` (detail page back link restores the list).
- Auto step-back to last page when current page empties.
- **Empty/error states**: ErrorState "Couldn’t load influencers"; filtered empty "No influencers match these filters" + Clear filters;
  manager/admin empty "No influencers yet" + Add influencer; executive empty "You don’t own any influencers yet" + "Open the pool".
- **Data**: `useInfluencerList(params)` → `queryKeys.influencerList(params)` (`['influencers','list',params]`) → `GET /influencers`,
  `placeholderData: keepPreviousData` (stale rows dimmed `opacity-60`).
- **Summary metrics**: only the total count in the title and "1–25 of N" in pagination. No summary cards.

#### 2.2 `list-params.ts` — `src/features/influencers/list-params.ts` — LOGIC (no UI)
- URL ⇄ API params 1:1. Keys: `q`, `category[]`, `platform[]`, `country[]`, `state[]`, `city[]`, `stage[]`, `assigned_to[]`,
  `agreement` (signed|missing), `insights` (received|missing), `reach_min/max`, `followers_min/max`, `sort`
  (`name,total_reach,instagram_followers,followers,city,stage,created_at,updated_at`, `-` prefix = desc), `page`, `page_size` (25/50/100).
- `useInfluencerListParams()` → `setFilters` (resets page 1), `setSort`, `setPage`, `setPageSize`, `clearFilters` (keeps sort + size), `replaceAll`.
  Reads `window.location.search` live to avoid lost updates. Shared by Influencers, Pipeline and Onboarded/:platform.

#### 2.3 `ListSearch` — `src/features/influencers/list-search.tsx` — LOGIC
- `Input type="search"` with **`data-page-search`** attribute (this is what the global "/" hotkey focuses), `aria-label="Search influencers in this list"`,
  placeholder "Search name, handle, email, phone…", left `Search` icon absolute; Escape blurs; 300 ms debounce → URL `q` (`replace: true`).

#### 2.4 `SavedViewsMenu` — `src/features/influencers/saved-views-menu.tsx` — LOGIC
- Popover trigger `Button variant="outline" max-w-60` showing active view name or "Saved views" (Bookmark icon).
- List `max-h-72 overflow-y-auto`; click applies (`onApply` → `list.replaceAll({...view.filters, sort, page_size})`); active view has a Check.
- Delete (Trash, hover-revealed `opacity-0 group-hover:opacity-100 focus-visible:opacity-100`) allowed if creator or non-executive.
- "Save current view…" (disabled if no filters and no sort) → Dialog with `<form>` → `Input id="view-name" maxLength=60 autoFocus`.
- API: `GET /saved-views` (`queryKeys.savedViews`), `POST /saved-views`, `DELETE /saved-views/:id`. Toasts: "Saved view “X”", "Deleted view “X”", errors.
- Views are team-wide ("Saves the current filters and sort for the whole team").

#### 2.5 `InfluencerFilterBar` — `src/features/influencers/filter-bar.tsx` — LOGIC
- Wrapper `flex flex-wrap items-center gap-2` → `CollapsibleFilters activeCount={countActiveFilters(filters)}`.
- Filters (each a `MultiSelectFilter`): Category, Platform (with `PlatformMark`), Country → State → City (cascading; invalid states/cities
  auto-dropped with `replace: true`), Stage (with `StageDot`), Assigned (search "Search team…"), Agreement and Insights (single-choice
  via `latestChoice`), optional Followers range (Onboarded), Total followers range.
- Props `hideStage` (Pipeline, Onboarded), `hidePlatform` (Onboarded), `hideAssigned` (executives, Pool), `hideDocuments` (Pool),
  `source` ('influencers' | 'pool'), `baseFilters` (Onboarded locked rule), `showFollowers`.
- Data: `useFilterOptions` → `queryKeys.filterOptions(filters)` → `GET /influencers/filter-options` (faceted counts, `staleTime 30s`,
  `keepPreviousData`, "refreshing" dim; State/City show skeleton when the country/state hierarchy changed).

#### 2.6 `ActiveFilters` — `src/features/influencers/active-filters.tsx` — LOGIC-light
- `aria-label="Active filters"`, "Active:" label, pill chips `h-6 rounded-full border bg-muted/60`, each × button
  `aria-label="Remove filter <label>"`; "Clear all" link button. Chips for q, every list value, Owner, Agreement, Insights, Followers, Total followers.

#### 2.7 `InfluencersTable` — `src/features/influencers/influencers-table.tsx` — LOGIC (generic, shared with Pool + Onboarded)
- `rounded-lg border bg-card` → `overflow-x-auto` → shadcn `Table` (which itself wraps another `overflow-x-auto`). **No sticky header,
  no virtualisation**, server pagination (`manualSorting`, `manualPagination`).
- Header cells `bg-muted/40`; sortable headers are `<button>` with ArrowUp/ArrowDown/ArrowUpDown icons, `aria-sort` on `<th>`.
  Sort cycle: natural direction → flip → clear (`meta.sortDescFirst` for numbers).
- Extra last column: column chooser `DropdownMenu` (`aria-label="Choose columns"`, Settings2 icon) with checkbox items + "Reset to default";
  visibility persisted to localStorage under `visibilityKey`.
- Row click opens the row unless the click target is inside `a, button, input, label, [role="checkbox"], [role="menu"]`.
- Selected rows `data-state="selected"`. Loading = 8 skeleton rows (name column gets avatar + bar). Empty/error = `emptyContent` in a full-width cell.

#### 2.8 `buildColumns` / `selectColumn` / `totalReachColumn` — `src/features/influencers/columns.tsx` — LOGIC (column defs)
Column **ids** (persisted in localStorage visibility; also referenced by `onboarded/columns.tsx` `DROPPED` set and the skeleton's `column.id === 'name' | 'select'`):
`select`, `name` (avatar + link + verified BadgeCheck, `min-w-52`, not hideable), `category`, `handle` ("Primary account"), `platforms`
(PlatformMarks), `instagram_followers` (sortable desc-first, right-aligned, compact), `phone` (tel: link), `email`, `city` (sortable),
`state`, `country` (hidden by default), `stage` (StageBadge, sortable), `assigned_to` (avatar + name / "Unassigned"), `docs`
(`DocFlags`, "—" in pool), `sync` (primary account SyncStatusBadge), `last_synced_at` (hidden by default).
`totalReachColumn` id `total_reach` is only used on Onboarded tabs. `ColumnMeta` augmentation: `label, sortKey, sortDescFirst, align, hiddenByDefault, className`.

#### 2.9 `BulkActionsBar` — `src/features/influencers/bulk-actions-bar.tsx` — LOGIC
- `flex flex-wrap items-center gap-2`: "N selected", clear × (`aria-label="Clear selection"`), then:
  - **Change stage ▾** — options = standard transitions per row (`getStandardTransitions`), with "k of N" when not all eligible; no override in bulk.
    → `POST /influencers/bulk {action:'change_stage'}`; ineligible rows reported as skipped.
  - **Assign ▾** (`can(role,'influencer:reassign')`) — active team members + Unassign → `{action:'assign'}`.
  - **Sync IG** — `{action:'sync'}` → `waitForJob` with loading toast progress ("Syncing N accounts from Instagram… x%").
  - **Export** (`data:export`) — `exportInfluencers({ ids })`.
  - **Delete** (`influencer:delete`, destructive) → AlertDialog "Delete N influencers?" → `{action:'delete'}`.
- Toast `report()` helper: success / warning (partial, with `ReasonList`, 10 s) / error.
- Mutation `useBulkAction` invalidates `['influencers']`.

#### 2.10 `useExportInfluencers` — `src/features/influencers/use-export.ts` — LOGIC (no UI)
`POST /exports/influencers` → `waitForJob` → `downloadFile(download_url, influencers-<date>.csv)`; loading toast with %, success "Exported N influencers".

#### 2.11 Reference comparison — Influencers list
| Reference element | Status | Where / note |
|---|---|---|
| Directory (table of creators) | **EXISTS** | `InfluencersTable` + `buildColumns` |
| Search | **EXISTS** | `ListSearch` (debounced, URL `q`, "/" shortcut) |
| Filters | **EXISTS** | `InfluencerFilterBar` (collapsed "Filters" button) + chips |
| Saved views | **EXISTS** | `SavedViewsMenu` (team-wide) |
| Table | **EXISTS** | server sort, column chooser, selection, bulk bar |
| Platform icons | **EXISTS** | `platforms` column (`PlatformMarks`), Primary account `AccountLabel` |
| Pagination | **EXISTS** | sticky footer `Pagination` (25/50/100) |
| Summary metrics (cards above table) | **PARTIAL** | only total count in title + range in pagination; facet counts exist inside filter menus. Metric cards (e.g. totals by stage / reach) would need new data → treat as new feature |

---

### 3. Influencer detail

#### 3.1 `InfluencerDetailPage` — `src/pages/influencer-detail-page.tsx` — LOGIC
- **Layout**: `space-y-6 p-4 sm:p-6` → `InfluencerHeader` → `grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]`
  (left `SocialAccountsPanel`, right `Tabs`).
- **Tabs** (`TabsList max-w-full justify-start overflow-x-auto`): Overview, Calls (N), Packages (N), Documents, Activity.
  Tab state in URL `?tab=` (`overview` removes the param; `replace: true`).
- Queries: `useInfluencer(id)` (`['influencers','detail',id]` → `GET /influencers/:id`), `useInfluencerActivity` (infinite, 50/page →
  `GET /influencers/:id/activity`), `useInfluencerCalls` (`GET /influencers/:id/calls?page_size=100`), `usePackages({influencer_id})`
  (`GET /packages`), `usePoolItem` (only when executive got 404 → `GET /pool/:id`).
- Derived: `previousStageOf` (on-hold resume target, keeps paging activity until found), `pipelinePosition` (stepper), `hasInterestedCall`, `hasTrackedPackage`.
- States: `DetailSkeleton` (`aria-busy`), 404 → EmptyState "Influencer not found" + back link (`listReturnPath()`), other error → ErrorState with retry,
  executive + unassigned → `PoolPreviewPage` (max-w-xl card with `PoolPreview` + `PoolActions` Claim).
- Hosts `LogCallDialog` (intent optional) and `PackageDrawer` (create / edit / `intent='package_sent'`).

#### 3.2 `InfluencerHeader` + `OwnerControl` — `src/features/influencers/detail/influencer-header.tsx` — LOGIC
- Back link "← Influencers" → `listReturnPath()` (restores filtered list).
- Identity row `flex flex-wrap items-start gap-4`: avatar `size-14`, `h1` name + verified badge, primary `AccountLabel`; meta row: category pill,
  `PlatformMarks`, total followers (compact, title exact), location with MapPin.
- Action row `flex flex-wrap items-center gap-2`: `StageControl`, `OwnerControl`, then `ml-auto` group: **Log call**, **Create package**
  (hidden when `stage === 'rejected'`), **⋯** menu (`aria-label="More actions"`: Open on <Platform> (external), Copy profile link,
  Release to pool… (`canRelease`), Delete influencer (`influencer:delete`, AlertDialog)).
- `OwnerControl`: non-reassigners see a read-only "Owner: X" span with Tooltip (`tabIndex=0`); managers/admins get a dropdown of active
  members (`PATCH /influencers/:id {assigned_to}`, toast "Assigned to X") + "Release to pool…".
- Release → `ReleaseDialog` (`features/pool/release-dialog.tsx`, reason required) → `POST /influencers/:id/release`; executives are navigated to `/pool`.
- Delete → `DELETE /influencers/:id` → toast + navigate back.
- `StageStepper` below the action row.

#### 3.3 `StageControl` — `src/features/influencers/detail/stage-control.tsx` — LOGIC
- Trigger `Button variant="outline"` tinted with `STAGE_META[from].badge`, `aria-label="Stage: X. Change stage"`.
- Menu "Move to": standard transitions with hints ("Log call…", "Create package…", "Upload agreement + insights…", "Resume", "…").
  Admin-only "Override (admin)" group (ShieldAlert) for every other stage → `requestMove(..., {override:true})`.
- "Resume to <previous>" primary button when on hold and previous stage known.
- `requirementMet` decides whether the required modal opens before trying the move.

#### 3.4 `useStageMover` — `src/features/influencers/stage-mover.tsx` — LOGIC (no own markup except `dialogs`)
- Single source of stage-move UX (detail page + pipeline). `requestMove(target, to, {override, requirementMet, optimistic})`.
- Override → `StageReasonDialog` (reason required, `overrideSchema`); on_hold / rejected → `StageReasonDialog` confirm (optional reason ≤500).
- contacted requirement → `LogCallDialog intent="contacted"`; onboarded (from contacted) → sequential `DocumentUploadDialog` steps
  ("Step k of n: Onboarded needs the agreement and an insights summary"), `closeOnUpload={false}`, flow-id guards; package_sent → `PackageDrawer intent="package_sent"`.
- API `POST /influencers/:id/stage {to, reason}`; on `requirement_missing` opens the modal; toasts "<name> moved to <Stage>", "Couldn’t move to <Stage>".
- `dialogs` must be rendered once by the consumer.

#### 3.5 `StageReasonDialog` — `src/features/influencers/stage-reason-dialog.tsx` — LOGIC
- Dialog `sm:max-w-md`, `<form noValidate>`, `Textarea id="stage-reason" autoFocus`, title varies (Override / Reject X? / Put X on hold?);
  submit button destructive for rejected; cannot close while pending.

#### 3.6 `StageStepper` — `src/features/influencers/detail/stage-stepper.tsx` — VISUAL
- `ol aria-label="Pipeline progress"`, 5 main stages, `aria-current="step"`; done = filled `STAGE_META.dot` + Check, current = ring, paused (side stage) = dashed border; side stage badge at the end.

#### 3.7 `SocialAccountsPanel` / `AccountView` / `StatCards` / `RecentPosts` / `ConnectLinkButton` / `ConnectStatusBadge` / `Notice` — `src/features/influencers/detail/social-accounts-panel.tsx` — LOGIC
- Card "Social accounts" (`aria-labelledby="accounts-panel-title"`), "+ Add account" (`influencer:edit`) → `AddAccountDialog`.
- **Custom vertical tablist**: `role="tablist" aria-orientation="vertical"`, buttons `role="tab"` with ids `account-tab-<id>`,
  `aria-controls="account-panel-<id>"`, roving `tabIndex`, Arrow keys move + `document.getElementById(...).focus()`. Panel `role="tabpanel" id="account-panel-<id>"`.
- `AccountView`: sync method label + status (`ConnectStatusBadge` for connect, `SyncStatusBadge` + relative time for lookup);
  buttons **Send/Resend connect link ▾** (Copy link / Email to …; `POST /accounts/:id/connect-link`), **Sync now** (`POST /accounts/:id/sync`
  → `waitForJob` with `Progress aria-label="Sync progress"` + `aria-live`), **Edit stats** (manual accounts → `EditStatsDialog`).
  Notices (info / error `role="alert"`), `StatCards` (`dl grid grid-cols-2`, platform-specific metrics from `PLATFORM_META`), bio,
  `GrowthChart` (when tracked; `GET /accounts/:id/snapshots`), `RecentPosts` (IG/YT, 3-col grid of 6 thumbnails; `GET /accounts/:id/media`).

#### 3.8 `GrowthChart` — `src/features/influencers/detail/growth-chart.tsx` — VISUAL (+ table toggle)
Recharts `AreaChart` single series, end dot, % change, `role="img"` label, "Show as table" toggle; hidden with < 2 snapshots.

#### 3.9 `AddAccountDialog` — `src/features/influencers/detail/add-account-dialog.tsx` — LOGIC
RHF + zod `z.object({ account: accountInputSchema })`; reuses `AccountRow name="account" idPrefix="add-acc"`; duplicate check
`POST /duplicates/check` (exclude self) → `DuplicateWarning` ("Add anyway"); `POST /influencers/:id/accounts`, then auto-sync if pending;
409 → `AlreadyInCrm`. Submit disabled when handle taken.

#### 3.10 `EditStatsDialog` — `src/features/influencers/detail/edit-stats-dialog.tsx` — LOGIC
Manual stats form, inputs `id="stat-<metricKey>"`, validated with `countField` (accepts 12k / 1.2m) → `PATCH /accounts/:id {metrics}`.

#### 3.11 `OverviewTab` (+ `Section`, `AddressEditor`, `TagsEditor`) — `src/features/influencers/detail/overview-tab.tsx` — LOGIC
- `grid gap-4 xl:grid-cols-2` of small Cards: Contact (inline-edit Name, Phone, Email, Category select), Location (City, State, Country),
  Shipping address (Edit/Add → RHF `addressSchema`, field ids `addr-line1..country`), Onboarding checklist N/5 (checkboxes → PATCH
  `onboarding_checklist`), Tags (add/remove, `fieldSchemas.tag`, `MAX_TAGS`), Notes (multiline inline field).
- Inline fields: `InlineTextField` / `InlineSelectField` (`src/components/common/inline-field.tsx`) with `fieldSchemas.*`.
- All edits → `useUpdateInfluencer` → `PATCH /influencers/:id`; disabled when `!useCan('influencer:edit')`.

#### 3.12 `CallsTab` (+ `FollowUp`) — `src/features/influencers/detail/calls-tab.tsx` — LOGIC
List of call cards (`rounded-lg border bg-card p-3`), outcome pill (`CALL_OUTCOME_META.badge`), caller + relative time, notes,
follow-up line (overdue / today / Done / **Mark done** → `POST /calls/:id/done`). Empty state with "Log call".

#### 3.13 `PackagesTab` — `src/features/influencers/detail/packages-tab.tsx` — LOGIC-light
Package cards with status pill, items, courier, tracking (copy button), sent/delivered dates, address; Edit → `PackageDrawer`; Create hidden for rejected.

#### 3.14 `DocumentsTab` — `src/features/influencers/detail/documents-tab.tsx` — LOGIC (documents feature owned by the other agent)
Insights + Agreement sections, upload buttons (`document:upload`), pool influencers show an empty state.

#### 3.15 `ActivityTab` — `src/features/influencers/detail/activity-tab.tsx` — VISUAL + "Load older activity" (infinite query)
Timeline `ol.relative.border-l.pl-6` with icon bubbles per `ActivityType`.

#### 3.16 Regression risks — Influencers list & detail
- **`data-page-search`** on `ListSearch` input: the global "/" hotkey depends on it (`global-search.tsx:14`).
- **Column ids** in `columns.tsx` are persisted in localStorage (`influencehub-influencer-columns-v2`, `influencehub-onboarded-columns`) and filtered by id in `onboarded/columns.tsx` (`DROPPED`); renaming breaks saved visibility and the Onboarded table.
- Row click guard selector (`a, button, input, label, [role="checkbox"], [role="menu"]`): any new interactive element in a cell must match it or it will also navigate.
- `aria-sort` on headers, `aria-label`s on checkboxes ("Select all on this page", "Select <name>"), column chooser.
- Sticky bottom bar (`sticky bottom-0`) relies on the page wrapper `flex min-h-full flex-col` and the app shell's scroll container.
- Selection reset logic is keyed on `viewKey()`; don't move selection state into the table.
- URL param names (list-params.ts) are the API contract; saved views store them.
- `CollapsibleFilters` hides with CSS, not unmount — the State/City cascade `useEffect` in the filter bar must keep running.
- Detail: custom account tablist ids (`account-tab-*`, `account-panel-*`) and arrow-key focus code; `?tab=` URL state; `id="accounts-panel-title"`.
- `StageControl` trigger aria-label; stage colours via `STAGE_META.badge`; `useStageMover().dialogs` must remain rendered.
- Form field names/ids: `stage-reason`, `view-name`, `addr-*`, `stat-*`, `add-acc-*`.

---

### 4. Add influencer / CSV import (modal)

#### 4.1 `AddInfluencerProvider` — `src/features/add-influencer/add-influencer-provider.tsx` — LOGIC
- Context provider (wraps the app shell); `useAddInfluencer().open({ tab?, prefill? })` from `context.ts`.
- Dialog `max-h-[90svh] overflow-y-auto sm:max-w-3xl`, title "Add influencers"; Tabs: **Look up a profile** / **Manual** / **CSV import**
  (`data:import` only). `session` counter remounts tab content on every open (`key={state.session}`). Close and Esc blocked while CSV busy.
  Tab `className="min-w-0 gap-4"` (min-w-0 prevents the CSV preview stretching the dialog).

#### 4.2 `LookupTab` (+ `ProfilePreview`, `LinkedAccounts`, `SaveProfileForm`) — `src/features/add-influencer/lookup-tab.tsx` — LOGIC
- Form: platform `Select` (`aria-label="Platform"`, `LOOKUP_PLATFORMS`), `Input id="lookup-username" autoFocus`, **Fetch** button. Pasted URL picks the platform (`platformOfUrl`). Validation `handleSchema(platform)`.
- `POST /lookup` → job id → `useJob` polling `GET /jobs/:id`; `Progress aria-label="Lookup progress"` + `aria-live`.
- Failures (`personal_account` → "Enter manually" (switches to Manual tab with prefill), `not_found`, `rate_limited` → "Try again").
- 409 → `AlreadyInCrm`. Success → `ProfilePreview` + "Also found" linked accounts (each checked via `GET /influencers/check-handle`) + `DetailsFields idPrefix="ig"` (RHF `influencerDetailsSchema`) → duplicate check → `POST /influencers`; `DuplicateWarning` with "Use existing" (adds accounts via `POST /influencers/:id/accounts`) / "Create anyway"; navigates to new profile or `/pool` (`afterCreate`).
- Note: `PROFILE_LOOKUP_CONNECTED = false` (`src/lib/mode.ts:17`); lookup is not wired to real platform APIs.

#### 4.3 `ManualTab` — `src/features/add-influencer/manual-tab.tsx` — LOGIC
- RHF `manualInfluencerSchema` (`src/lib/schemas.ts:130`): `name, category, phone, email, city, state, country, assigned_to, accounts[] {platform, handle, audience, personal}, notes`.
- `Input id="m-name" autoFocus`; fieldset "Social accounts · the first is primary" with `useFieldArray` `AccountRow name="accounts.<i>" idPrefix="m-acc-<i>"`, remove ×, "+ Add another account" (appends youtube); `DetailsFields idPrefix="m" showName={false}`; Notes `m-notes`.
- `onChange` on the form clears the duplicate warning; submit disabled while any handle is taken.

#### 4.4 `AccountRow` — `src/features/add-influencer/account-row.tsx` — LOGIC
`grid grid-cols-[9.5rem_1fr_auto]`: platform Select, handle Input (live `useHandleCheck` debounce 400 ms → "Checking…" / "Not in the CRM yet" / `AlreadyInCrm`), remove button; personal-profile checkbox (IG/FB), audience input for manual accounts. Uses `useFormContext` with nested `name` paths.

#### 4.5 `DetailsFields` + `Field` — `src/features/add-influencer/details-fields.tsx` — LOGIC-light
`grid grid-cols-1 gap-3 sm:grid-cols-2`: Name, Category (active categories), Owner (executives: only self or "Unassigned (goes to the pool)"), Phone (hint "+91 is added…"), Email, City/State/Country (3-col). Field ids `<prefix>-name|category|owner|phone|email|city|state|country`; error ids `<id>-error`.

#### 4.6 `AlreadyInCrm` — `src/features/add-influencer/already-in-crm.tsx` — LOGIC
Amber `role="alert"` notice; in_pool → "Claim it" (`usePoolActions().claim`), exists → "Open profile" link, assigned_to_other → anonymous message.

#### 4.7 `conflict.ts`, `account-input.ts`, `queries.ts`, `context.ts` — LOGIC, no UI
`conflictFromError` (409 codes → notice), `useHandleCheck`, `isManualAccount`, `EMPTY_ACCOUNT`, `useCreateInfluencer` (invalidates influencers, pipeline, dashboard), `toAccountCreate`, `findDuplicates` (advisory; errors swallowed), `afterCreate`, `detailDefaults`.

#### 4.8 `CsvTab` (+ `UploadStep`, `MappingStep`, `MatchCell`, `Stat`, `Summary`) — `src/features/add-influencer/csv-tab.tsx` — LOGIC
- **Upload**: "Download template" (`templateCsv()`), drag-and-drop zone (`border-2 border-dashed`, `dragging` highlight; native HTML drag events, not dnd-kit), hidden `input type=file accept=".csv,text/csv" class="sr-only" aria-label="CSV file"`; limits 2 MB / 5000 rows; errors `role="alert"`.
- **Mapping**: `grid grid-cols-2` of field → column `Select` (`id="map-<field>"`, "— Don’t import —"), required markers; preview table (first 20 rows, `max-h-64 overflow-auto`, **sticky thead**) with error/warning cells, in-file "dup" marker, "Possible duplicate" column (`useQueries` `POST /duplicates/check`); options: "Fetch public profiles" (only if `PROFILE_LOOKUP_CONNECTED`), duplicate policy radios `name="on-duplicate"` (skip | update). Buttons "Choose another file", "Import N rows".
- **Run**: `POST /imports/csv/presign` → `POST /imports/csv/upload` → `POST /imports/csv` → `useJob` polling; progress + "Keep this window open"; busy locks the dialog.
- **Summary**: 4 `Stat` tiles (Created / Updated / Duplicates skipped / Failed), profiles line, errors table + "Download error report", "Import another file", "View influencers" (→ `/influencers?sort=-created_at`).
- Validation via `src/lib/csv-import.ts` (`validateImportRow`, `autoMatchColumns`, `missingMappings`).

#### 4.9 Regression risks — Add / Import
- Dialog `min-w-0` on Tabs and `overflow-y-auto` on content (wide CSV preview).
- `key={state.session}` remounting; busy guard on `onOpenChange` and `onEscapeKeyDown`.
- RHF field paths (`accounts.<i>.handle`, `account.handle`, etc.) and ids used by labels/`aria-describedby`.
- `autoFocus` on `lookup-username` / `m-name` / `view-name`; `aria-live` progress regions; `role="alert"` notices.
- Form-level `onChange={() => setMatches(null)}` relies on native event bubbling from inputs inside the `<form>`.
- The file input must stay in the DOM (sr-only) for the "Choose file" button's `inputRef.current.click()`.

---

### 5. Onboarded

#### 5.1 `OnboardedPage` — `src/pages/onboarded-page.tsx` — LOGIC-light
- `ul aria-label="Platforms" grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`; one `Link` card per platform
  (all 8: instagram, youtube, tiktok, facebook, threads, pinterest, linkedin, snapchat): `PlatformIcon size-10`, label, "N onboarded", ChevronRight.
- Counts: `useOnboardedCounts()` (`src/features/onboarded/queries.ts`) — `useQueries`, one `GET /influencers?stage=onboarded&stage=package_sent&stage=delivered&platform=<p>&page_size=1` per platform, `select: total`. Per-card skeleton / "Couldn’t load the count".

#### 5.2 `OnboardedPlatformPage` / `OnboardedPlatformList` — `src/pages/onboarded-platform-page.tsx` — LOGIC
- Invalid platform → `NotFoundPage`. Keyed by platform.
- Layout mirrors Influencers list: back "All platforms", PageHeader with `PlatformIcon` + "Onboarded on X (N)", `ListSearch`, `InfluencerFilterBar`
  (`baseFilters={locked} showFollowers hideStage hidePlatform hideAssigned={!canReassign}`), `ActiveFilters`, `InfluencersTable`
  (`visibilityKey="influencehub-onboarded-columns"`, **no selection**: `NO_SELECTION`, no bulk actions), sticky footer Pagination.
- Locked filters via `onboardedFilters(platform)` / `withoutLocked` (`src/features/onboarded/onboarded.ts`): URL `stage`/`platform` ignored.
- Empty states: filtered / "No onboarded creators on X yet"; error state.

#### 5.3 `buildOnboardedColumns` — `src/features/onboarded/columns.tsx` — LOGIC (column defs)
Drops `select, handle, platforms, instagram_followers, sync, last_synced_at` from base; adds `account` (platform account, not hideable),
`audience` (sortKey `followers`), `total_reach`, then base columns, then platform-specific `sync` and `last_synced_at` (hidden by default).
`accountOn()` picks primary-on-platform else largest audience.

#### 5.4 Reference comparison — Onboarded
| Reference element | Status | Where / note |
|---|---|---|
| Platform cards (Instagram / YouTube / TikTok) | **EXISTS** | `OnboardedPage` cards for all 8 platforms with onboarded count |
| Connected-account stats (per platform: followers, engagement, etc. aggregated) | **PARTIAL** | per-card only "N onboarded". Per-row audience + total reach exist in the platform table. Aggregates (sum of followers, avg engagement) are not in the API → new feature |
| Sync status | **PARTIAL** | per-row `sync` column (+ hidden `last_synced_at`) on `/onboarded/:platform`; per-account on detail page. No per-platform sync summary on the cards |
| Recent sync activity | **ABSENT here** (exists elsewhere) | Instagram-only sync run log `InstagramSettings.last_runs` lives in Settings (admin, other agent's scope, `GET /settings/instagram`); `account_synced` activities appear in dashboard recent activity / detail activity. Nothing on Onboarded; adding it = new feature |

#### 5.5 Regression risks — Onboarded
- Column ids `account`, `audience`, `total_reach`, `sync`, `last_synced_at` (localStorage visibility).
- `key={platform}` remount; locked filter logic; the `/` shortcut via `ListSearch`.
- Cards are `Link`s with `focus-visible:ring-2`; `aria-label="Platforms"` list. The `PlatformIcon` in the title is `aria-hidden`.

---

### 6. Pipeline

#### 6.1 `PipelinePage` — `src/pages/pipeline-page.tsx` — LOGIC
- `space-y-4 p-4 sm:p-6`; PageHeader "Pipeline (N)" with description "Drag a card to another stage, or focus it and press Space, then use the arrow keys."
- `ListSearch`, `InfluencerFilterBar hideStage hideAssigned={!canReassign}`, `ActiveFilters` — same URL params as the list (stage dropped).
- `usePipeline(filters)` → `pipelineKey(filters)` = `['pipeline', filters]` → `GET /pipeline` (`workspace.ts:271`), `keepPreviousData` (dim `opacity-60`).
- States: `BoardSkeleton` (5 columns, `aria-busy`), ErrorState, filtered-empty with Clear filters. **Unfiltered empty board** renders empty columns ("No influencers").

#### 6.2 `PipelineBoard` + `Column` — `src/features/pipeline/pipeline-board.tsx` — LOGIC (dnd-kit)
- `DndContext` with sensors: `PointerSensor { activationConstraint: { distance: 6 } }` and `KeyboardSensor { coordinateGetter: columnKeyboardCoordinates, keyboardCodes: PIPELINE_KEYBOARD_CODES }`; collision = `pointerWithin` fallback `rectIntersection`.
- Board `div role="region" aria-label="Pipeline board" className="flex gap-3 overflow-x-auto pb-3"`; 7 columns (`ALL_STAGES`).
- `Column`: `section` with `useDroppable({ id: stage })`, `aria-label="<Stage>, N influencers"`; main style `flex min-w-48 flex-1 basis-0 flex-col rounded-xl border bg-muted/40`;
  header dot + `h2` + count pill (+ "Override" tag while dragging) ; list `ol max-h-[calc(100svh-17rem)] min-h-24 overflow-y-auto` (per-column scroll).
  Drop feedback by `DropKind`: standard `ring-2 ring-primary/40`, override `ring-dashed ring-amber-500/60`, blocked `opacity-45`.
- Side stages (On Hold, Rejected) collapsible to a `w-14` vertical strip (`[writing-mode:vertical-rl]`), collapsed state in localStorage `influencehub-pipeline-collapsed` (default both collapsed). Collapsed columns remain droppable.
- `onDragStart` fetches previous stage for on-hold cards (`GET /influencers/:id/activity?page_size=100`). `onDragEnd`: blocked → toast error listing allowed moves; override (admin) → reason dialog; else `useStageMover().requestMove` with **optimistic** cache move (`queryClient.setQueryData(pipelineKey)`) and rollback.
- `DragOverlay` (`dropAnimation={null}`) renders `PipelineCardView overlay className="w-60"`.
- Custom screen-reader `announcements` and `screenReaderInstructions`.

#### 6.3 `PipelineCardView` / `DraggablePipelineCard` — `src/features/pipeline/pipeline-card.tsx` — VISUAL / LOGIC
- View: `space-y-2 rounded-lg border bg-card p-2.5 text-sm shadow-xs` (overlay: `rotate-2 shadow-lg ring-2`); avatar, name `Link id="pipeline-card-<id>" draggable={false}` → profile, primary account, "<reach> followers · category", owner, days-in-stage pill (amber when > `STALE_DAYS` = 14).
- Draggable wrapper: `useDraggable({ id: card.id, data: { card }, attributes: { role: 'group' } })`, spreads `attributes` + `listeners` on the **whole card** (no separate handle), `aria-labelledby="pipeline-card-<id>"`, `cursor-grab`, `focus-visible:ring-3`, dragging `opacity-40`.

#### 6.4 `keyboard.ts` — `src/features/pipeline/keyboard.ts` — LOGIC
Space start/end, Escape cancel (Enter excluded so it opens the link); Left/Right jump to adjacent column rect (+8px, +56px offsets).

#### 6.5 `queries.ts` — `src/features/pipeline/queries.ts` — LOGIC
`pipelineKey`, `usePipeline`, `fetchPreviousStage`.

#### 6.6 Reference comparison — Pipeline
| Reference element | Status | Where / note |
|---|---|---|
| Kanban | **EXISTS** | `PipelineBoard` (dnd-kit, pointer + keyboard) |
| Stage columns | **EXISTS** | 7 columns, side stages collapsible |
| Cards | **EXISTS** | `PipelineCardView` (avatar, handle, reach, category, owner, days in stage, stale flag) |
| Stats | **PARTIAL** | total in title + per-column counts. No conversion rates / avg days / value stats (data: `days_in_stage` per card exists, so averages could be computed client-side, but that is still a new feature) |
| Automation section | **ABSENT** | no rules UI. Built-in fixed rules exist server-side (call outcome → stage moves, auto-release from pool, connect-link expiry), not configurable/visible on the board |

#### 6.7 Regression risks — Pipeline
- **dnd sensors**: `distance: 6` activation (plain click must still open the profile link); keyboard codes; `columnKeyboardCoordinates` depends on droppable **rects** sorted by `left` and the `+8/+56` offsets — changing column header height/padding or layout direction (e.g. vertical stacking at narrow widths) breaks keyboard moves.
- Draggable listeners are on the whole card wrapper (`role="group"`, `aria-labelledby`); adding nested buttons inside a card would trigger drags; if a handle is introduced, keyboard focus model changes.
- Link `draggable={false}` and id `pipeline-card-<id>`.
- Droppable ids are stage values; `section` must keep `ref={setNodeRef}` (incl. collapsed state).
- Per-column scroll `max-h-[calc(100svh-17rem)]` is tuned to the header/filter height; `overflow-x-auto` board scroll.
- Announcements + `aria-label`s; `DragOverlay` width `w-60`; `mover.dialogs` must stay inside the board.
- localStorage key `influencehub-pipeline-collapsed`.

---

### 7. Calls & Follow-ups

#### 7.1 `CallsPage` (+ `Outcome`, `InfluencerCell`, `CountBadge`) — `src/pages/calls-page.tsx` — LOGIC
- PageHeader "Calls & Follow-ups", description "Every time is shown in IST."
- `Tabs` with URL state `?tab=` (today default, overdue, upcoming, history), `?scope=mine|all` (default mine for executives), `?page=`.
  Each trigger shows a `CountBadge` (separate `GET /calls/follow-ups?bucket=X&page_size=1` per tab; overdue red when > 0).
- "Only my follow-ups" `Switch id="only-mine"` (only for `influencer:reassign`, i.e. manager/admin).
- One `TabsContent` per tab (real tabpanels); only the active renders the table: `rounded-lg border bg-card` → `overflow-x-auto` → Table.
  Columns: (History: Called) · Influencer (avatar, link `?tab=calls`, primary account) · Phone (tel:) · Outcome / Last outcome (pill + truncated notes) ·
  Follow-up (IST) (datetime, overdue red, relative or "Done") · Owner / Called by · Actions (**Log call** → `LogCallDialog`; **Mark done** except History).
- Data: `useFollowUps(bucket, page, 25, mine)` (`src/hooks/use-follow-ups.ts`) → `queryKeys.followUps(...)` → `GET /calls/follow-ups`, `refetchInterval 60s`.
  Mark done → `POST /calls/:id/done` (toast "Follow-up with X marked done").
- States: 6 skeleton rows, ErrorState in table, per-tab EmptyState copy. Pagination (25/page, no size selector) only when total > 25.

#### 7.2 `LogCallDialog` — `src/features/calls/log-call-dialog.tsx` — LOGIC
- Dialog `sm:max-w-md`, RHF + `callLogSchema` (`src/lib/schemas.ts:161`): fields `outcome` (string, must be a CALL_OUTCOME), `notes` (≤1000),
  `follow_up` (dd/MM/yyyy, hh:mm a IST; required for call_back; must be future), `move_to_contacted` (bool).
- Outcome: custom `role="radiogroup"` of pill `role="radio"` buttons (`aria-checked`), coloured by `CALL_OUTCOME_META.badge`; helper text for auto-moves
  (not_interested → Rejected, no_answer / wrong_number → On Hold, call_back → Follow-ups).
- Notes `Textarea id="call-notes"`; Follow-up `DateTimeInput id="call-follow-up"` + quick picks (Today 5 PM, Tomorrow 11 AM, In 3 days, Next week).
- "Move to Contacted" checkbox shown when outcome interested and transition allowed (preselected for `intent="contacted"`).
- Submit → `POST /influencers/:id/calls` then optionally `POST /influencers/:id/stage {to:'contacted'}`; `time_taken` 409 → field error with focus;
  toasts per outcome ("Call logged · X moved to Rejected", etc.). Close blocked while busy.
- `src/features/calls/queries.ts`: `useInfluencerCalls`, `useLogCall` (invalidates influencer + follow-ups), `useMarkFollowUpDone` (invalidates follow-ups, dashboard, influencer calls).

#### 7.3 Reference comparison — Calls
| Reference element | Status | Where / note |
|---|---|---|
| Follow-up scheduling | **EXISTS** | `LogCallDialog` follow-up datetime + quick picks; tabs Due today / Overdue / Upcoming |
| Dial queue | **PARTIAL** | the "Due today" / "Overdue" tables act as a work list (sorted server-side) with tel: links and Log call; no "next call" queue / auto-advance / dialer |
| Call history | **EXISTS** | "History" tab (all logged calls) + detail page Calls tab |
| Quick actions | **EXISTS** | per-row Log call, Mark done, tel: phone link; dashboard follow-up widget |
| Calendar integration | **ABSENT** | no calendar view, no Google/Outlook sync, no ICS |
| Weekly velocity | **ABSENT** | no calls-per-week metric in any endpoint (dashboard only has `contacted_this_week` stage count) |

#### 7.4 Regression risks — Calls
- URL params `tab`, `scope`, `page` (dashboard KPI links to `/calls`; follow-up links use `?tab=calls` on detail).
- Tabs: one `TabsContent` per tab so triggers have real panels; `Switch id="only-mine"` + label `htmlFor`.
- `colSpan={7}` in error/empty rows assumes 7 columns (history) — changing columns needs matching colSpan.
- LogCallDialog: radiogroup roles/`aria-checked`, field names `outcome/notes/follow_up/move_to_contacted`, ids `call-notes`/`call-follow-up`,
  `setError('follow_up', ..., { shouldFocus: true })` requires the input to forward refs (`register` on `DateTimeInput`).
- Count badges each issue their own query; keep them inside triggers (layout change OK).

---

### 8. Services / endpoints used by these screens

| Service (file) | Endpoints |
|---|---|
| `dashboardApi` (`src/services/workspace.ts`) | `GET /dashboard/summary` |
| `pipelineApi` (`workspace.ts`) | `GET /pipeline` |
| `savedViewsApi` (`workspace.ts`) | `GET/POST /saved-views`, `DELETE /saved-views/:id` |
| `meApi`, `teamApi`, `categoriesApi` (`workspace.ts`) | `GET /me`, `GET /team`, `GET /categories` |
| `influencersApi` (`src/services/influencers.ts`) | `GET /influencers`, `GET /influencers/filter-options`, `GET /influencers/check-handle`, `GET/PATCH/DELETE /influencers/:id`, `POST /influencers`, `POST /influencers/:id/stage`, `POST /influencers/bulk`, `POST /influencers/:id/claim`, `POST /influencers/:id/release`, `GET /influencers/:id/activity`, `POST /influencers/:id/accounts`, `GET/POST /influencers/:id/calls` |
| `callsApi` (`src/services/calls.ts`) | `GET /calls/follow-ups`, `POST /calls/:id/done` |
| `accountsApi`, `lookupApi`, `duplicatesApi` (`src/services/accounts.ts`) | `PATCH /accounts/:id`, `POST /accounts/:id/sync`, `POST /accounts/:id/connect-link`, `GET /accounts/:id/snapshots`, `GET /accounts/:id/media`, `POST /lookup`, `POST /duplicates/check` |
| `jobsApi`, `importsApi`, `exportsApi` (`src/services/jobs.ts`) | `GET /jobs/:id`, `POST /imports/csv/presign`, `POST /imports/csv/upload`, `POST /imports/csv`, `POST /exports/influencers` |
| `packagesApi` (`src/services/packages.ts`) | `GET /packages` (detail Packages tab) |
| `poolApi` (`src/services/pool.ts`) | `GET /pool/:id` (executive preview on detail) |

Handlers: `src/backend/handlers/{influencers,calls,accounts,async,duplicates,packages,pool,workspace}.ts` (route list via `http.<verb>(api('...'))`).

---

### 9. Classification summary

| Component | File | Class |
|---|---|---|
| DashboardPage, MyFollowUps | `src/pages/dashboard-page.tsx` | LOGIC |
| Kpi, Panel, DashboardSkeleton, RecentActivity | same | VISUAL (RecentActivity light logic) |
| PipelineFunnel | `src/features/dashboard/pipeline-funnel.tsx` | VISUAL |
| BarListChart | `src/features/dashboard/bar-list-chart.tsx` | VISUAL |
| InfluencersPage | `src/pages/influencers-page.tsx` | LOGIC |
| list-params, queries, use-export, detail-queries | `src/features/influencers/*.ts` | LOGIC (no UI) |
| ListSearch, SavedViewsMenu, InfluencerFilterBar, InfluencersTable, columns, BulkActionsBar | `src/features/influencers/*.tsx` | LOGIC |
| ActiveFilters | `active-filters.tsx` | LOGIC-light |
| useStageMover, StageReasonDialog | `stage-mover.tsx`, `stage-reason-dialog.tsx` | LOGIC |
| InfluencerDetailPage, InfluencerHeader, OwnerControl, StageControl, SocialAccountsPanel, AddAccountDialog, EditStatsDialog, OverviewTab, CallsTab, DocumentsTab | `src/pages/influencer-detail-page.tsx`, `src/features/influencers/detail/*` | LOGIC |
| StageStepper, GrowthChart, ActivityTab, PackagesTab | `detail/*` | VISUAL (toggle / load-more / edit callbacks) |
| AddInfluencerProvider, LookupTab, ManualTab, CsvTab, AccountRow, AlreadyInCrm | `src/features/add-influencer/*` | LOGIC |
| DetailsFields / Field | `details-fields.tsx` | LOGIC-light (Field is VISUAL) |
| OnboardedPage | `src/pages/onboarded-page.tsx` | LOGIC-light |
| OnboardedPlatformPage, buildOnboardedColumns, onboarded.ts, queries.ts | `src/pages/onboarded-platform-page.tsx`, `src/features/onboarded/*` | LOGIC |
| PipelinePage, PipelineBoard, Column, DraggablePipelineCard, keyboard.ts | `src/pages/pipeline-page.tsx`, `src/features/pipeline/*` | LOGIC |
| PipelineCardView | `pipeline-card.tsx` | VISUAL |
| CallsPage, CountBadge | `src/pages/calls-page.tsx` | LOGIC |
| Outcome, InfluencerCell | same | VISUAL |
| LogCallDialog | `src/features/calls/log-call-dialog.tsx` | LOGIC |

### 10. Cross-cutting redesign notes
- Breakpoints in use: `sm:` (padding, 2-col grids), `lg:` (dashboard panels 2-col, detail page 2-col with `19rem` left column), `xl:` (KPI 7-col, overview 2-col, onboarded 4-col). Spec: desktop-first, usable at 1024 px.
- No virtualisation anywhere; no sticky table headers (only CSV preview `thead` is sticky; list pagination bars are `sticky bottom-0`).
- Light/dark: colours via CSS tokens (`bg-card`, `bg-muted`, `--chart-series-1`, `--border`); a few hard-coded palette classes exist (amber stale pill / AlreadyInCrm / override ring, sky-500 verified badge, red-600 overdue count, green connect dot) — keep dark variants when restyling.
- Stage colours must come from `STAGE_META` (dot / badge) in every screen.
- Numbers via `formatNumber` / `formatCompact`; dates via `src/lib/format.ts` and `RelativeTime` only.

---

## Appendix C — Remaining screens: functionality and components

## UI/UX audit, part 2: Documents, Possible duplicates, Unassigned Pool, Packages (Welcome Kits), Settings, Not-found

Repo: `c:/Users/ADMIN/Desktop/influencer_management`, branch `dev/aditya` (read-only audit, 19/11/2026).
Another agent covers Dashboard, Influencers (list and detail), Onboarded, Pipeline and Calls.

Legend: **VISUAL** = presentational only, safe to restyle freely. **LOGIC** = holds state, mutations, validation,
permission checks or URL/query wiring. Restyle its JSX/classes only, and keep every handler, prop, `aria-*`, `id`/`htmlFor`
and conditional exactly as it is.

---

### 0. Cross-cutting facts

- **Labels on this branch: "Packages", not "Welcome Kits".** No "Welcome Kit" string exists anywhere in `src/`, `server/`
  or `docs/` on `dev/aditya`. The rename is in commits `f93a1ee` (stage "Package Sent" renamed to "Welcome Kit"), `bb9eb0b`
  (drawer and toasts) and `090a3d9` ("call packages Welcome Kits everywhere"), and these exist only on `remotes/origin/main` and
  `remotes/origin/fix/override-review`. A redesign done on this branch will show "Packages", "Create package",
  "Package Sent" and so on. If the redesign must say "Welcome Kit", merge or rebase onto origin/main first rather than
  hand-renaming strings. That would conflict with those commits.
- **CLAUDE.md is stale.** `src/backend/persistence.ts` and `firestore-store.ts` don't exist. The prototype store is
  `src/backend/local-store.ts` (IndexedDB) and the server store is `server/pg-store.ts` (PostgreSQL). There is no sign-in. The
  account menu has "Acting as" (`X-Acting-As` header).
- **Route guards** (`src/router.tsx`): `/duplicates` is wrapped in `RequirePermission permission="influencer:merge"`
  (manager/admin). `/settings` is wrapped in `RequirePermission permission="integrations:manage"` (admin). `/pool`, `/packages`
  and `/documents` are open to every role, with scoping done server-side. Denied users see `EmptyState` with the ShieldX icon, "You don't have
  access to this page" (`src/components/common/require-permission.tsx`). `*` goes to `NotFoundPage`.
- **Permissions** (`src/lib/permissions.ts`, `useCan` from `@/hooks/use-me`):
  - Executive: `document:upload`, `influencer:claim`, `influencer:release`, `package:manage`, …
  - Manager adds `document:delete`, `influencer:reassign`, `influencer:merge`, `data:import/export`, …
  - Admin adds `team:manage`, `categories:manage`, `integrations:manage`, `pool:configure`, `stage:override`.
- **Shared building blocks used by these pages** (restyling them changes every screen):
  - `PageHeader` (`src/components/common/page-header.tsx`: `flex flex-wrap items-start justify-between gap-3`, h1 `font-heading text-xl font-semibold tracking-tight`). VISUAL.
  - `EmptyState` / `ErrorState` (`src/components/common/states.tsx`: centred column `px-6 py-14`, icon in a `size-10 rounded-full bg-muted` circle, ErrorState has a "Try again" button calling `onRetry`). VISUAL (the props carry the logic).
  - `CollapsibleFilters` (`src/components/common/collapsible-filters.tsx`): "Filters" button with an active-count pill and a chevron. The panel is hidden with `hidden`/`flex` but **stays mounted** (that is intentional: the filters inside keep their queries running). LOGIC-light. Don't switch it to conditional rendering.
  - `MultiSelectFilter`, `DateRangeFilter`, `Pagination`, `PersonAvatar`, `AccountLabel`/`PlatformMarks` (`components/common/platform-badge.tsx`), `RelativeTime`, `StageBadge`.
  - `ListSearch` (`src/features/influencers/list-search.tsx`): debounced search. "/" focuses search (global UX rule).
- **Date and number rules**: every displayed date goes through `src/lib/format.ts` (`formatDate`, `formatDay`, `formatDateTime`) or `RelativeTime`.
  Numbers use `formatNumber` / `formatCompact` (12.4K). A redesign must not format dates or numbers inline.
- **Pages padding**: every page root is `space-y-4 p-4 sm:p-6`, except Pool, which is `flex min-h-full flex-col` with a sticky bottom bar.
  Tables sit in `overflow-hidden rounded-lg border bg-card` > `overflow-x-auto` > shadcn `Table`, with the header row `bg-muted/40`.
  No page uses grid breakpoints beyond `sm:`/`md:`.

---

### 1. Documents

#### 1.1 `DocumentsPage`, `src/pages/documents-page.tsx` (258 lines). LOGIC

**Purpose**: every live document (insights summaries and agreements) the caller may see, across creators.

**Layout**
- `PageHeader` with the title "Documents (N)" (`tabular-nums` muted count) and the description "Insights summaries and agreements for the influencers you can see."
- Action: an **Upload ▾** dropdown (`FilePlus2` icon, chevron) listing the document types ("Insights summary", "Agreement"). It is shown only if `useCan('document:upload')`.
- Toolbar `flex flex-wrap items-center gap-2`:
  - `ListSearch` with the placeholder "Search creator name or handle…" (`max-w-72`).
  - `CollapsibleFilters`: Type (multi-select), Uploaded by (team multi-select, searchable), Uploaded (date range), and "Clear all" (link button, shown when any filter or `q` is set).
- Table, 7 columns:
  1. Creator: avatar, name link to `/influencers/:id?tab=documents`, primary account.
  2. Type: `DocumentTypeBadge`, `AgreementBadges` (Current / Expired), and the title truncated to `max-w-56`.
  3. Period / signed: `documentDetail()`.
  4. File: name truncated to `max-w-48`, and the size.
  5. Uploaded by: team name, or "…" while loading.
  6. Uploaded: `RelativeTime`.
  7. Actions: `DocumentButtons`, `w-28`.
- `Pagination`, right-aligned, shown only when `total > 25`.

**URL params** (all in the URL; `readParams`): `type[]` (validated against `DOCUMENT_TYPES`), `q`, `uploaded_by[]`,
`uploaded_from`, `uploaded_to`, `page`. Any filter change deletes `page`. "Clear all" replaces the URL params with an empty set.

**Data**: `useDocuments({...params, page_size: 25})`, which runs `GET /documents` with the query key `['documents','list',params]` and `placeholderData`
(keeps previous rows; while stale the table gets `opacity-60`). `useTeam()` / `useTeamMap()` supply names.

**Upload flow (two-step)**:
1. Picking a type from the dropdown sets `pickType`.
2. That opens `InfluencerPicker` with the title "Upload insights summary for…". `eligible` drops influencers with `assigned_to === null` (no documents for the pool).
3. Picking an influencer sets `target`, which opens `DocumentUploadDialog`.
4. `target` keeps the influencer while the dialog closes. `open` is toggled separately, for the close animation.

**States**:
- Loading: 6 skeleton rows × 7 cells.
- Error: `ErrorState` "Couldn't load documents" with retry.
- Empty, two variants: filtered gives `SearchX` "No documents match these filters". Unfiltered gives `FileText` "No documents yet" / "Upload an insights summary or an agreement."

**Dialogs**: `{dialogs}` from `useDocumentActions()` (preview and delete-confirm) must stay rendered once in the page.

**Bulk operations**: none.

#### 1.2 `features/documents/*`

| Component / hook | File | Kind | Notes |
|---|---|---|---|
| `DocFlags` / `DocFlag` | `src/features/documents/doc-flags.tsx` | VISUAL | "Insights ✓/✗ Agreement ✓/✗": `text-xs`, green `Check` or muted `X`, an `sr-only` "on file / missing". Used by the influencer list and Onboarded columns (other agent). |
| `DocumentTypeBadge` | `document-parts.tsx` | VISUAL | Pill (`rounded-full px-2 py-0.5 text-xs font-medium`). Agreement is violet; insights is sky; each has a dark variant. |
| `AgreementBadges` | `document-parts.tsx` | VISUAL + small logic | "Current" (green) if `is_current`. "Expired" (amber) if `isExpired(doc)`, meaning `valid_until < todayKey()`. Agreements only. |
| `DocumentButtons` | `document-parts.tsx` | LOGIC (conditions) | Ghost `icon-sm` buttons. **Preview** (`Eye`) only if `canPreview(content_type)` (PDF or image). **Download** always. **Delete** (`Trash2`) only if `actions.canDelete`. Each has an `aria-label` that includes the title. |
| `DocumentPreviewDialog` | `document-preview-dialog.tsx` | LOGIC | `Dialog sm:max-w-3xl`. Body `h-[65vh] rounded-md border bg-muted/30`. `useQuery(['documents','download',id])` calls `GET /documents/:id/download` with `staleTime 0`, `gcTime 0` (the short-lived URL). Images go in `<img object-contain>`; PDFs go in an `<iframe>`. Loading shows a full-size skeleton. Error shows `role=alert` "Couldn't load the preview. …". Footer: Download (outline) and Close. |
| `DocumentUploadDialog` | `document-upload-dialog.tsx` (295 lines) | LOGIC | See 1.3. |
| `useDocumentActions` | `use-document-actions.tsx` | LOGIC | Returns `{actions, dialogs}`. `canDelete = useCan('document:delete')`. `download` calls `documentsApi.download`, then `downloadFile(url, file_name)` (`src/lib/jobs`), and shows the toast "Couldn't download the document" on error. Delete opens the AlertDialog "Delete this document?". For the current agreement it adds "The previous version, if there is one, becomes the current agreement." The action button is `variant=destructive` with `e.preventDefault()`, and it is disabled while pending. Closing is blocked while pending. Toasts: "Document deleted" (title as description) / "Couldn't delete the document". |
| `useInfluencerDocuments`, `useDocuments`, `useUploadDocument`, `useDeleteDocument` | `queries.ts` | LOGIC | Upload runs `POST /documents/presign`, then `documentsApi.upload` (PUT to `upload_url` with progress, or IndexedDB in the prototype via `local-file:` prefix), then `POST /influencers/:id/documents`. After an upload or delete it invalidates `['documents']` and `invalidateInfluencer` (checklist, Docs column, dashboard KPI). |

Other consumers: `src/features/influencers/detail/documents-tab.tsx` (influencer detail **Documents** tab, other agent's
screen), `src/features/influencers/stage-mover.tsx` (the Onboarded rule's "Step 1 of 2" upload flow, which uses the `note` and
`closeOnUpload=false` props).

#### 1.3 `DocumentUploadDialog` in detail. LOGIC (highest regression risk on this screen)

- `Dialog` `max-h-[90vh] overflow-y-auto sm:max-w-md`. The title is "Upload insights summary" or "Upload agreement". The description is the creator's name plus an optional `note`.
- `useUploader` keeps `file`, `fileError` and `progress`. `choose()` runs `validateDocumentFile` (`src/lib/documents.ts`): the extension
  must be pdf, jpg, jpeg, png, docx or xlsx, the file must not be empty, and it must be ≤ 20 MB. **A rejected file is cleared from the input** (`e.target.value = ''`).
  `submit()` re-validates and shows "Choose a file to upload" if there is no file.
- `FileField`: a native `<Input type="file" id="document-file" accept={DOCUMENT_ACCEPT}>`, a hint under it (`DOCUMENT_FILE_HINT` "PDF, JPG,
  PNG, DOCX, XLSX · up to 20 MB", or the chosen file's name and size), `role=alert` error text, and while busy a `Progress` bar with
  "Uploading… N%" / "Saving…" in an `aria-live` region.
- **InsightsForm** (zod `insightsFormSchema`, `src/lib/schemas.ts`):
  - Fields: title (required, ≤ 120), period_start and period_end (`dateField`, dd/MM/yyyy, end ≥ start), platform (Select; "All platforms" maps to `''` and then `null`; the options are limited to the influencer's own platforms when known), notes (≤ 1000).
  - Picking a file auto-fills the title from the file name when the title is empty.
- **AgreementForm** (`agreementFormSchema`): title (defaults to "Collaboration agreement YYYY"), signed_on (defaults to today), valid_until (optional, ≥ signed_on), notes.
  It shows the note "This becomes the current agreement. Earlier versions are kept as history."
- Footer: Cancel (outline) and Upload (`FileUp` icon, "Uploading…"). Both are disabled while busy.
- Toasts: success "<Type> uploaded" with the title. Error "Couldn't upload the document" with the server message (`unsupported_file_type`, `file_too_large`, `upload_missing`, `in_pool`).
- Forms are keyed (`key="agreement"` / `"insights"`) so state resets when the type changes.

#### 1.4 `src/lib/documents.ts`. LOGIC (not UI)

Contents: `DOCUMENT_TYPE_META`, `DOCUMENT_TYPES`, `missingOnboardingDocuments`, `MAX_DOCUMENT_BYTES`, `DOCUMENT_FILE_TYPES`, `ALLOWED_CONTENT_TYPES`,
`DOCUMENT_ACCEPT`, `DOCUMENT_FILE_HINT`, `contentTypeFor`, `validateDocumentFile`, `formatFileSize`, `canPreview`,
`agreementVersions`, `documentDetail` ("01/09/2026 – 30/09/2026 · Instagram" / "Signed … · valid until …"), `isExpired`.
Leave untouched. `server/main.ts` imports `MAX_DOCUMENT_BYTES` too.

#### 1.5 Reference comparison: Documents

| Reference element | Status | Where / notes |
|---|---|---|
| Category tabs | **PARTIAL** | Type exists as a multi-select **filter** (`type[]` URL param) inside CollapsibleFilters. Tabs (All / Insights / Agreements) would be a re-skin of the same `type` param. Allowed visually only if they write the same URL param and keep multi-select semantics, or if the team accepts tab-style single select (a behaviour change). |
| Contract statistics (counts, KPIs) | **ABSENT** | The only number is the total in the header. There is no endpoint for per-type counts, expiring agreements and so on. Computing stats from the 25-row page would be wrong. This is a new feature. |
| Upload controls | **EXISTS** | Header "Upload ▾" (type menu), then `InfluencerPicker`, then `DocumentUploadDialog`. Permission `document:upload`. |
| Document table | **EXISTS** | 7-column table, pagination of 25. |
| Verification status | **PARTIAL** | Only the agreement "Current" / "Expired" badges (`AgreementBadges`). There is no verified / pending-review workflow or field. Anything beyond Current/Expired is new. |
| Bulk operations | **ABSENT** | No row selection, no bulk download or delete. |
| "Secure vault" info panel | **ABSENT** | No such copy. The real facts are files in the PostgreSQL `files` table or browser IndexedDB, executive scoping, soft delete, short-lived download URL, no sign-in yet. A static info card would be new copy, not a feature, but claiming "secure" would be misleading while there is no sign-in (`docs/server.md` "Security"). |

#### 1.6 Regression risks: Documents

1. **File input wiring**: keep `<input type="file">` with `accept={DOCUMENT_ACCEPT}`, the `onChange` that calls `choose()`, the reset of
   `e.target.value` on rejection, and `disabled={busy}`. A custom drag-and-drop dropzone must still route every file through
   `uploader.choose(file)` and must still fire `onChosen` (auto-title for insights).
2. **Type validation happens in two places** (`validateDocumentFile` client-side and presign server-side). Don't loosen `accept` or bypass `choose`.
3. **Progress bar** depends on `busy` (`upload.isPending`) and `progress`. Keep the `aria-live` region.
4. **Upload two-step state** (`pickType` → `target`). The picker's `eligible` filter (no pool influencers) is a business rule.
   `target` must persist after close (it is set to `open:false`, not to null).
5. **Delete permission**: the trash button is shown only when `canDelete`. Don't render it disabled for executives (it should stay hidden).
   The AlertDialog's `e.preventDefault()` keeps it open until the mutation settles.
6. **Preview** only for PDFs and images (`canPreview`). The iframe/img must use `link.data.url`, which is fetched fresh (`gcTime 0`).
7. **`{dialogs}` must stay mounted once** in any page using `useDocumentActions`.
8. URL-param behaviour (page reset on filter change, "Clear all").
9. The `opacity-60` stale indicator and `placeholderData` (no flash to skeleton between pages).

---

### 2. Possible duplicates

#### 2.1 `DuplicatesPage`, `src/pages/duplicates-page.tsx` (132 lines). LOGIC

**Purpose** (manager/admin, route guarded by `influencer:merge`): open duplicate pairs across the whole CRM, each with Merge or Dismiss.

**Layout**
- `PageHeader` with the title "Possible duplicates (N)" and the description "Creators that may be the same person across platforms. Merge them, or dismiss a pair that isn't."
- A vertical list `space-y-3` of `PairCard`s. Nothing else: no toolbar, filters, search, sort or pagination. All pairs come in one request with `page_size: 200`.

**`PairCard`** (in-file, LOGIC): `<article aria-label="A and B">` `space-y-3 rounded-xl border bg-card p-4`.
- Top row `flex flex-wrap items-start justify-between gap-3`:
  - Left: `ConfidenceBadge`, then a bullet list of `reasons` (`list-disc pl-5 text-sm text-muted-foreground`).
  - Right: **Dismiss** (ghost, `X` icon; disabled while pending; toasts "Dismissed — they won't be suggested again" / "Couldn't dismiss") and **Merge…** (primary, `Combine` icon), which sets `merging` and mounts `MergeDialog` (conditionally rendered, so its state resets).
- Below: `grid gap-3 md:grid-cols-2` with two `Side`s.

**`Side`** (in-file, VISUAL): `rounded-lg border p-3`, avatar + name link to `/influencers/:id`, then a `dl grid grid-cols-[7rem_1fr]` with these rows: Primary
account, Platforms, Total followers (compact, full number in the title), Email, Phone, Location, Stage, Owner ("Unassigned"
or name), Added (relative).

**States**:
- Loading: 3 `Skeleton h-56`, `aria-busy`.
- Error: `ErrorState` "Couldn't load possible duplicates".
- Empty: `CopyCheck` "No possible duplicates" / "New matches show up here as creators are added."

**Data**: `useDuplicatePairs()` runs `GET /duplicates?page_size=200` with the key `['duplicates']`, `enabled: useCan('influencer:merge')`, and
`refetchInterval: 60_000`. The sidebar count is the same query, in the app shell.

#### 2.2 `features/duplicates/*`

| Component / hook | File | Kind | Notes |
|---|---|---|---|
| `ConfidenceBadge` | `src/features/duplicates/duplicate-warning.tsx` | VISUAL | `CONFIDENCE_META`: high = red, medium = amber, low = slate. `rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset`. Text "<Level> confidence". |
| `DuplicateWarning` | same | LOGIC | The "Possible same creator" amber alert box (`role=alert`, `border-amber-500/40 bg-amber-50`) used by the add/import flows (`features/add-influencer/manual-tab.tsx`, `lookup-tab.tsx`, `features/influencers/detail/add-account-dialog.tsx`). Visible matches show avatar, link, confidence, "In the Unassigned Pool", account, city and reasons. Each has buttons: "Add account to existing" (only `access==='full'` and `onUseExisting`) and "Claim it" (`access==='pool'`, uses `usePoolActions().claim`, which calls `onLeave` on 'ok'). Restricted matches are counted only: "Matches a creator assigned to a teammate." The proceed button label comes from the caller. |
| `MergeDialog` | `merge-dialog.tsx` (170 lines) | LOGIC | See below. |
| `useDuplicatePairs`, `useDismissDuplicate`, `useMergeInfluencers` | `queries.ts` | LOGIC | Dismiss runs `POST /duplicates/:id/dismiss`. Merge runs `POST /influencers/merge` and removes the merged influencer's cache. Both refresh duplicates, influencers, pipeline, dashboard, followUpsAll and packages. |

**`MergeDialog`**:
- `Dialog max-h-[90svh] overflow-y-auto sm:max-w-2xl`, titled "Merge duplicates". The description warns "can't be undone".
- Fieldset "Keep which record?": a 2-column grid of `Choice` radio cards (native `<input type=radio>` styled `accent-primary`; the selected card has `border-primary/50 bg-primary/5`). Each card shows the name, the account count and "added dd/MM/yyyy".
  Changing the survivor **resets `choices`**.
- Fieldset "Where they differ, keep…": only the `FIELDS` whose values differ (name, category, phone, email, address, location, notes, owner). Each gets a `role=radiogroup` with 2 `Choice` cards. An empty value shows "Empty".
  The default is the survivor's value, unless it's empty and the other one isn't.
- An "After the merge" summary box (`rounded-md border bg-muted/30 p-3`): the combined account count and platform marks, "Calls, packages, activity and tags from both are combined.", and the resulting `StageBadge` (`mergedStage` = the more advanced, with "(the more advanced of the two)").
- Footer: Cancel and "Merge into <name>" / "Merging…". The dialog can't close while pending.
- Toasts: success "Merged into X" with the action "Open profile" (navigates). Error "Couldn't merge".

#### 2.3 Reference comparison: Possible duplicates

| Reference element | Status | Where / notes |
|---|---|---|
| Duplicate detection list | **EXISTS** | `PairCard` list. |
| Empty state | **EXISTS** | `CopyCheck` "No possible duplicates". |
| Matching controls (filter by confidence, signal type, sort) | **ABSENT** | No filters or sort. `GET /duplicates` takes only `page`/`page_size`. Client-side filtering of the ≤ 200 loaded pairs by `confidence` would be a new (UI-only) feature and needs approval. |
| Confidence threshold slider | **ABSENT** | Confidence is categorical (high/medium/low), not a number. The rules are fixed in `src/backend/duplicates.ts`. A slider is a new feature with no backing data. |
| "Dedup engine status" | **ABSENT** | Detection runs synchronously on each `GET /duplicates` over the whole workspace. There is no engine, job or status endpoint. |
| Scanning info (last scan, progress) | **ABSENT** | Only the implicit 60 s refetch. A truthful static note ("Checked on every load; email/phone, linked handles, same handle, similar name + city") would be copy, not a feature, but the content needs sign-off. |
| Confidence + reasons per pair | **EXISTS** | `ConfidenceBadge` and the reasons list (not in the reference list, but keep it). |
| Merge / Dismiss | **EXISTS** | Must be kept. |

#### 2.4 Regression risks: duplicates

1. **Merge dialog flow**: survivor radio resets the field choices. `differing` is recomputed per survivor. The default-choice rule; `field_choices`
   is sent only for differing fields. If the radios are replaced with custom cards, keep one choice per group, keyboard
   operability and the group `name`s.
2. `MergeDialog` is **conditionally mounted** (`{merging && …}`) so it starts fresh each time. Keep that.
3. The closing guard while `merge.isPending`, and the toast action that navigates.
4. Dismiss is immediate (no confirm). Adding a confirm would change behaviour.
5. The page is permission-guarded at the route, and the query is disabled for executives. Don't fetch elsewhere without `enabled`.
6. `DuplicateWarning` is shared by 3 add flows. The "Claim it" / "Add account to existing" visibility depends on `access`.
   The restricted text must never reveal the teammate's creator.

---

### 3. Unassigned Pool

#### 3.1 `PoolPage`, `src/pages/pool-page.tsx` (216 lines). LOGIC

**Purpose**: influencers with no owner. Executives see previews and **Claim** (single and bulk). Managers/admins see full rows and **Assign**
(single via a menu, or bulk via a dialog with round-robin).

**Layout**: root `flex min-h-full flex-col`. The content block is `flex-1 space-y-4 p-4 sm:p-6 pb-4`, followed by the **sticky bottom bar** `sticky bottom-0
flex min-h-14 flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-6 py-2.5 backdrop-blur`.
- `PageHeader` with the title "Unassigned Pool (N)". The description is role-dependent: managers get "Assign them, or let the team claim them"; executives get "Claim one to unlock their contact details…".
- `ListSearch`. The executive placeholder is "Search name, handle, city…" (the server limits executives' `q` to those fields).
- `InfluencerFilterBar source="pool" hideAssigned hideDocuments` (shared with Influencers, other agent; uses `GET /pool/filter-options`).
- `ActiveFilters` chips.
- `InfluencersTable` (shared TanStack table). Its `visibilityKey` is `influencehub-pool-columns` (manager) or `-limited` (executive), the column-visibility localStorage key. It also takes sort, selection, `onOpenRow`, `isLoading`, `isStale` and `emptyContent`.
- Bottom bar:
  - "N selected", an `X` button to clear the selection, then **Assign N…** (manager) or **Claim N** (executive).
  - `Pagination` with page-size options.

**URL params**: through `useInfluencerListParams()` (`features/influencers/list-params`): q, category, country, state, city,
stage, platform, reach_min/max, …, sort, page, page_size. **There is no owner filter and no documents filter** in the pool.

**Selection state**: `Map<id, PoolItem>`. It **resets when the filters or sort change** (`viewKey`), and `keepOnly(ids)` keeps the failed rows selected
after a bulk action. There is also a page clamp effect: if the current page empties, it jumps to the last page.

**Preview drawer state**: `{item, open}`. It keeps the item while closing, and the drawer shows the refreshed row if it is still in `rows`, otherwise the clicked copy.
A claim lost to a teammate (`already_claimed`) closes the drawer. Assigning closes it.

**Bulk assign state**: `{rows, open, pending}`. The rows are frozen when the dialog opens.

**States**:
- Loading and stale states come from `InfluencersTable`.
- Error: `ErrorState` "Couldn't load the pool".
- Filtered empty: `SearchX` "No unassigned influencers match these filters" with a "Clear filters" button.
- Empty: `Inbox` "The pool is empty" / "Every influencer has an owner. New unassigned ones will show up here."

**Data**: `usePoolList(params)` runs `GET /pool` with the key `['influencers','pool','list',params]` and `keepPreviousData`. `useTeam`, `useMe`. `useCan('influencer:reassign')`.

#### 3.2 `features/pool/*`

| Component / hook | File | Kind | Notes |
|---|---|---|---|
| `buildPoolColumns` | `src/features/pool/columns.tsx` | LOGIC | Column order: select; Influencer (avatar, name **button** that opens the drawer, not the profile; verified `BadgeCheck text-sky-500`); Category; Primary account; Platforms; Total followers (right-aligned, sort `total_reach`, desc first); **Phone and Email only if canReassign** (email hidden by default); City (sort); State; Country; Stage (sort); Added (hidden by default, sort `created_at`); Actions (manager: `AssignMenu size=sm label="Assign"`; executive: outline "Claim" button with `UserRound`). `meta.sortKey`, `hiddenByDefault` and `align` drive `InfluencersTable`. |
| `PoolPreview` | `pool-preview.tsx` | VISUAL (branches on data shape) | Header: avatar `size-14`, name, verified mark, category pill, StageBadge. A `dl divide-y` of `Row`s (`grid-cols-[7.5rem_1fr]`): Primary account, Platforms, Total followers, Location, Added. **Full rows only** add Phone, Email, Address, Tags and Notes. Executives get a lock note: "Phone, email, address, notes and call history unlock once you claim this influencer." `isFullInfluencer` = `'assigned_to' in item`. |
| `AssignMenu` | `pool-preview.tsx` | LOGIC | Outline button and dropdown "Assign to": active members with me first, "(me)", plus loading and error items. The `sr-only` influencer name completes the accessible name. |
| `PoolActions` | `pool-preview.tsx` | LOGIC | Executive: "Claim" / "Claiming…". Manager: "Open full profile" (link) and `AssignMenu`. |
| `PoolPreviewDrawer` | `pool-preview.tsx` | LOGIC | `Sheet` (right), `w-full sm:max-w-md`. Header "Unassigned influencer" / "In the pool: anyone on the team can claim them." Scrolling body, footer with the actions. |
| `BulkAssignDialog` | `bulk-assign-dialog.tsx` | LOGIC | Two steps. **Choose**: a checkbox list of members (`max-h-72 overflow-y-auto`), each with avatar, name, role and its live share count ("N influencers"); Continue is disabled until one is chosen. **Confirm**: "Assign N influencers to X?", the per-person split when there are several, Back, and "Assign N" / "Assigning…". It resets each time it opens and can't close while pending. Uses `splitRoundRobin`. |
| `ReleaseDialog` | `release-dialog.tsx` | LOGIC | Used from the influencer header (other agent's screen). Required reason (`releaseSchema`: 3–500 characters), `autoFocus` textarea, the executive warning "You'll lose access…", "Release to pool" / "Releasing…". |
| `usePoolActions` | `use-pool-actions.tsx` | LOGIC | `claim`: `POST /influencers/:id/claim`, toast "<name> is yours", **navigates to the profile**. `claimMany`: bulk `claim`; toasts success / "Nothing claimed" / "N claimed, M not" with `ReasonList` (10 s). `assign`: `PATCH /influencers/:id {assigned_to}`, toast "X assigned to Y". `assignMany`: one bulk `pool_assign` per person (`Promise.allSettled`), with a detailed toast; returns the ids to retry. `busy` flag. |
| `queries.ts` | `src/features/pool/queries.ts` | LOGIC | `usePoolList`, `usePoolCount` (sidebar badge, 60 s), `usePoolItem`, `useExpiringClaims` (bell, 60 s), `claimErrorToast` ("Already claimed by a teammate" / "Claim limit reached" / "Couldn't claim"), `useClaimInfluencer`, `useReleaseInfluencer`. |

#### 3.3 Reference comparison: Unassigned Pool

| Reference element | Status | Where / notes |
|---|---|---|
| Creator discovery | **PARTIAL** | The pool lists unassigned creators added manually or by CSV. There is no discovery or search of external platforms (lookup and sync aren't connected to platform APIs, per CLAUDE.md). A discovery or crawl UI would be new. |
| Table | **EXISTS** | `InfluencersTable` with pool columns, sorting, column visibility, row select. |
| Platform filters | **EXISTS** | Platform facet in `InfluencerFilterBar` (with counts), plus category, location, stage and reach. They sit behind the "Filters" button. Platform quick-chips/tabs would be a re-skin of the same `platform[]` param. |
| Search | **EXISTS** | `ListSearch`. |
| Assignment actions | **EXISTS** | Row Assign menu / Claim, drawer actions, bulk Assign N… (round-robin) / Claim N. |
| Routing info (assignment rules) | **PARTIAL** | Rules exist (claim limit, auto-release days in Settings → Unassigned Pool; round-robin split shown in the bulk dialog). There is no info panel on the pool page. Showing the current guards would need `GET /settings/pool`, which is **admin-only (403 for others)**. That is a new data dependency, so treat it as a new feature. Static explanatory copy is OK. |
| "Scraping status" | **ABSENT** | There is no scraping. Platform APIs aren't connected. New feature, and it would be misleading. |
| Empty state | **EXISTS** | Two variants (filtered, truly empty). |

#### 3.4 Regression risks: pool

1. **Bulk selection state**: reset on filter or sort change; `keepOnly` keeps failed rows selected; selection is across pages (Map).
   A redesigned bulk bar must keep "Clear selection" and the role-specific action, and must stay visible (sticky) with pagination.
2. **Permission-hidden actions**: contact columns, the Assign menu, "Open full profile" and BulkAssignDialog render only for `influencer:reassign`.
   Executives get Claim. Don't show disabled manager controls to executives.
3. **Drawer state**: keep `{item, open}` (content must persist during the close animation) and the refreshed-row lookup.
4. The name cell is a **button opening the drawer, not a link to the profile** (pool rows aren't anyone's yet; a profile link would 404 for executives).
5. Claim navigates to the profile on success. `already_claimed` closes the drawer.
6. BulkAssignDialog's two-step state, the reset on open, and frozen rows. Its pending guard.
7. The `visibilityKey` localStorage keys: renaming them loses users' column choices.
8. Page clamp effect after rows leave the pool.

---

### 4. Packages (the "Welcome Kits" of the reference; labelled **Packages** on this branch)

#### 4.1 `PackagesPage`, `src/pages/packages-page.tsx` (326 lines). LOGIC

**Purpose**: every package the caller may see (executives see their own influencers' packages), with status changes that can move the creator's stage.

**Layout**
- `PageHeader` with the title "Packages (N)" and **+ Create package** (primary, `Plus`). There is no description and no permission check on the button (`package:manage` belongs to every role).
- Toolbar:
  - `ListSearch` with the placeholder "Search name, handle, tracking…" (`max-w-72`).
  - `CollapsibleFilters`: Status multi-select (`PACKAGE_STATUSES`: Preparing, Sent, In transit, Delivered, Returned), Courier multi-select (`COURIERS` list), Sent date range, and "Clear all".
- Table, 8 columns:
  1. Influencer: avatar, link to `/influencers/:id?tab=packages`, account.
  2. Items: "name × qty" joined, truncated `max-w-56`, full list in the title.
  3. Status: pill, `PACKAGE_STATUS_META[status].badge` in `src/lib/constants.ts`. Slate = preparing, amber = sent, blue = in transit, green = delivered, red = returned.
  4. Courier.
  5. Tracking: `font-mono text-xs`, with a **copy** icon button that calls `copyToClipboard`, toast "Tracking number copied".
  6. Sent: `formatDate`.
  7. Delivered: `formatDate`.
  8. Actions: a `⋯` dropdown with "Edit package" and "Mark as" plus every other status except the current one and "preparing".
- Pagination of 25 (shown when `total > 25`).

**URL params**: `q`, `status[]`, `courier[]`, `sent_from`, `sent_to` (yyyy-MM-dd; unsent packages never match), `page`.

**Data**: inline `useQuery(queryKeys.packageList({...params, page_size:25}))` runs `GET /packages` with `keepPreviousData` (`opacity-60` while stale).

**Logic in the page**:
- `openDrawer(id, pkg?)` first fetches the full influencer (`GET /influencers/:id`) for the address prefill. On failure it toasts "Couldn't open the package".
- `setStatus`:
  - A shipped status (sent, in_transit, delivered or returned) without a courier and tracking number shows the info toast "Add a courier and tracking number first" and opens the drawer.
  - Delivered or returned shows `PackageStatusConfirm` first.
  - Otherwise the status is saved.
- `saveStatus` runs `PATCH /packages/:id {status}`, then `movedStage()` re-reads the influencer. The toast is "Package marked <status>" with "<name> is now in <Stage>".
- The "Create package" `InfluencerPicker` uses `eligible = stage !== 'rejected'`, then opens `PackageDrawer` in create mode.

**States**:
- Loading: 6 skeleton rows × 8 cells.
- Error: "Couldn't load packages".
- Filtered empty: "No packages match these filters".
- Empty: `PackageIcon` "No packages yet" / "Create one once an influencer is onboarded." with a **Create package** button.

#### 4.2 `features/packages/*`

| Component / hook | File | Kind | Notes |
|---|---|---|---|
| `PackageDrawer` | `src/features/packages/package-drawer.tsx` (347 lines) | LOGIC | See below. Also used from the influencer header and Packages tab and the stage mover (`intent='package_sent'`). |
| `PackageStatusConfirm` | `package-status-confirm.tsx` | LOGIC | AlertDialog "Mark package delivered?" / "Mark package returned?". The effect text is computed from `stageAfterPackage` ("X will move from Onboarded to Delivered", or "…stage won't change"). The action is destructive for "returned". `e.preventDefault()`. Can't close while pending. |
| `InfluencerPicker` | `influencer-picker.tsx` | LOGIC | `Dialog p-0 sm:max-w-md`, no close button. A cmdk `Command` with `shouldFilter={false}`. A debounced (250 ms) `GET /influencers?q=&page_size=8&sort=name|-updated_at` with the key `['influencers','picker',q]`. Rows show avatar, name, handle and StageBadge. The `eligible` filter is applied client-side. Shared by Documents and Packages. |
| `queries.ts` | `queries.ts` | LOGIC | `usePackages`, `useCreatePackage` (`POST /packages`), `useUpdatePackage` (`PATCH /packages/:id`). Both invalidate `['packages']` and the influencer. `stageAfterPackage`, `needsStatusConfirm` and `movedStage` mirror the server's `followPackage` rule. |

**`PackageDrawer`**:
- `Sheet` (right) `w-full sm:max-w-lg`. The form is `flex h-full flex-col`. The title is "Edit package" / "Ship a package" / "Create package".
- **Items**: a `useFieldArray` of rows (name input; qty `w-20` number; trash button, disabled when only 1 row) and "+ Add item".
- **Ship to**:
  - Address fields in a 2-column grid: line1 and line2 span 2; city, state, postal code and country span 1 each.
  - The "Use profile address" link button appears only when the profile has an address.
  - With no address on file, it shows a hint.
- **Shipping**:
  - Status `Select`.
  - Courier: free-text input with a `<datalist id="pkg-couriers">`.
  - Tracking number (`font-mono`), with a copy button disabled when empty.
- **zod `packageSchema`**:
  - Items: ≥ 1; each name required, ≤ 120; qty a whole number from 1 to 999.
  - Address: `addressSchema`.
  - Courier and tracking: optional, ≤ 60 each, but **required once the status is sent, in_transit, delivered or returned** (superRefine).
- Submit:
  - Delivered/returned changes go through `PackageStatusConfirm` (nested in the Sheet). On create, only delivered is confirmed.
  - `save` then creates or updates. A `savingRef` guards against double submission.
  - Toasts: "Package created/updated", "· <name> is now in <Stage>", "Package created · moved to Package Sent" (intent flow, which calls `useChangeStage`), plus warning and error variants.
- The Sheet can't close while busy. `reset(defaults)` runs on every open.

#### 4.3 Reference comparison: Welcome Kits

| Reference element | Status | Where / notes |
|---|---|---|
| Kit stats (counts by status) | **ABSENT** on this page | Only the total in the header. The Dashboard has the "packages in transit" KPI (`GET /dashboard/summary`, other agent). There is no per-status count endpoint, and counting from the 25-row page would be wrong. Stat tiles would need N extra `GET /packages?status=x&page_size=1` calls (reading `total`), which is a new data dependency, so it needs approval. |
| Shipping info | **EXISTS** (in the drawer) | Address, courier, tracking in `PackageDrawer`. In the table: courier, tracking with copy, and the sent/delivered dates. |
| Logistics tracking (carrier timeline, live status) | **ABSENT** | No courier API. The tracking number is plain text. The status is set manually. |
| Inventory cards (SKU stock) | **ABSENT** | Items are free text plus qty per package. There is no inventory model. New feature. |
| Dispatch info | **PARTIAL** | `sent_at` ("Sent") and the courier. No dispatch queue, batch or warehouse. |
| Shipment table | **EXISTS** | 8-column table. |
| Delivery status | **EXISTS** | Status pill, the "Mark as" menu, the Delivered date, the confirm dialog with its stage effect. |

#### 4.4 Regression risks: packages

1. **Drawer state**: `drawer` keeps the influencer and pkg while closing. `openDrawer` must fetch the full influencer first (address prefill).
   Keep `reset` on open, `savingRef`, and the nested `PackageStatusConfirm` inside the Sheet.
2. **Confirm dialogs**: delivered/returned always confirm, because they move the stage on the server. "Mark as" must keep the courier/tracking
   pre-check that opens the drawer.
3. The `useFieldArray` items: keep `register` names `items.${i}.name/qty`. The remove button is disabled at 1 item.
4. The conditional schema (courier and tracking required once shipped). Error messages under the fields.
5. The `<datalist>` courier suggestions (free text allowed): don't replace them with a closed Select.
6. The picker's `eligible` rule (no Rejected creators).
7. The status pill colours come from `PACKAGE_STATUS_META`, the same everywhere (influencer Packages tab too).
8. **Label rename to "Welcome Kit"**: this is copy only, but it touches toasts, the drawer and stage labels (`STAGE_META.package_sent`). Use the origin/main commits.

---

### 5. Settings (admin)

#### 5.1 `SettingsPage`, `src/pages/settings-page.tsx` (46 lines). LOGIC (URL tab)

- Route guarded by `integrations:manage` (admin).
- `PageHeader` "Settings" / "Admin only."
- shadcn `Tabs` (`gap-4`): **Instagram** (the default, no param), **Team & roles** (`?tab=team`), **Categories** (`?tab=categories`), **Unassigned Pool** (`?tab=pool`).
  Tab changes call `setSearchParams(..., {replace:true})`. Invalid values fall back to instagram.

#### 5.2 Components

| Component | File | Kind | Content / interactions |
|---|---|---|---|
| `InstagramSettings` | `src/features/settings/instagram-settings.tsx` | LOGIC | Uses `GET /settings/instagram` (key `['settings','instagram']`). Card 1 is "Instagram integration", `CardContent grid gap-6 md:grid-cols-2`. The left `dl grid-cols-[8rem_1fr]` holds Connection (Connected/Not connected icon), Business account (@username, mono ID) and Access token (pill: Valid / Expiring soon / Expired, plus relative and dd/MM/yyyy time). The right side has the **Sync frequency** Select (`SYNC_INTERVAL_OPTIONS` 3/6/12/24 h; it runs `PATCH /settings/instagram` with the toast "Syncing every N hours") and the `UsageMeter` (`role=meter`; the fill is `--chart-series-1`, amber at ≥ 70, red at ≥ 90; with a warning line). Card 2 is "Last N sync runs": a table with Started (IST), Duration, Status pill, Synced and Failed (failed is red when > 0), or "No sync runs yet." Loading shows 2 skeletons; error shows `ErrorState`. |
| `TeamSettings` (+ `AddMemberDialog`, `TextInput`) | `team-settings.tsx` (319 lines) | LOGIC | See below. |
| `CategorySettings` (+ `RenameDialog`) | `category-settings.tsx` | LOGIC | See below. |
| `PoolSettings` | `pool-settings.tsx` | LOGIC | See below. |
| `queries.ts` | `src/features/settings/queries.ts` | LOGIC | Instagram, pool, team (add/update/delete), category mutations. Pool save invalidates influencers (auto-release). Category changes invalidate influencers (rename). |

**`TeamSettings`** (uses `GET /team` via `useTeam`):
- Card header: "Team & roles", a description (it has a stray run of spaces in the JSX, a cosmetic bug), and **Add member** (`UserPlus`).
- Table columns: Member (avatar, name, "(you)", email), Role, Location, Status, Actions.
  - **Role** is an inline `Select size=sm w-36`. It is disabled for self, for inactive members and while pending. It runs `PATCH /team/:id {role}`.
  - **Location** is an `InlineTextField` validated with `memberLocationSchema` (≤ 80). It runs `PATCH`.
  - **Status** is a pill: Active (green) or Deactivated (muted).
  - **Actions**: Deactivate (ghost) / Reactivate (outline), not shown for self. **Delete** (destructive) is shown only for an inactive non-self member and goes through an AlertDialog to `DELETE /team/:id`.
  - The toasts name the member.
- Deleted members are filtered out (`deleted_at`). Inactive rows are muted.
- `AddMemberDialog` uses `teamMemberCreateSchema`: name (≤ 100), email (lowercased, valid), role Select (default executive), location (optional).
  - `409 email_taken` puts the error on the email field. Other errors go to a `role=alert` form message.
  - Success toast: "Added X as Role".
  - The dialog can't close while pending, and it resets on close.

**`CategorySettings`** (uses `GET /categories` via `useCategories`):
- Inline add form: `Input w-64` and "+ Add" outline. It is validated with `fieldSchemas.category` and runs `POST /categories`. The error appears inline.
- Table columns: Name, Influencers (count, right-aligned), Active, Actions.
  - **Active** is a `Switch` that runs `PATCH {is_active}`, with a toast.
  - **Rename** opens the RenameDialog (`PATCH {name}`, inline error, with the note "Influencers in this category move with it.").
  - **Delete**: when the count is > 0, the trash button is disabled inside a focusable span with the Tooltip "In use by N influencers — deactivate it instead". Otherwise an AlertDialog leads to `DELETE`.

**`PoolSettings`** (uses `GET/PATCH /settings/pool`):
- `Card max-w-2xl`, "Unassigned Pool".
- The form uses `poolSettingsSchema`. Each field is empty for off, or a whole number: claim_limit 1–500, auto_release_days 1–90.
- Inline sentence layout: "[__] uncontacted influencers per executive" and "Return to the pool if no call is logged within [__] days of claiming".
- Hints switch to error text in place.
- Discard and Save are both disabled unless the form is dirty. `reset` runs when the data loads and after saving.
- Toasts: "Pool settings saved" / "Couldn't save". Loading shows a `Skeleton h-64`.

#### 5.3 Regression risks: settings

- The self and last-admin guards are partly UI (disabled role select for self, no deactivate for self) and partly server (`self_change`,
  `last_admin`). Keep both.
- **Delete appears only after deactivation.** Don't expose it for active members.
- Category delete is disabled while in use, with the Tooltip. The span wrapper is needed for the tooltip on a disabled button.
- The PoolSettings dirty-state gating. Its numeric inputs are text (`inputMode=numeric`), and the schema expects strings. Don't change them to `type=number` without checking the resolver.
- The URL `?tab=` contract (dashboard and notification links may point at it).
- The UsageMeter follows the dataviz rules (one series colour, severity colours). Keep `role=meter` and the aria values.

#### 5.4 Reference: Settings and Team

Not in the reference list. No reference element to compare.

---

### 6. `NotFoundPage`, `src/pages/not-found-page.tsx` (20 lines). VISUAL

`EmptyState` (`SearchX`, "Page not found", "The page you're looking for doesn't exist or was moved.", `py-24`) with an outline
button linking to `/` ("Back to dashboard"). It renders inside AppShell (the sidebar and top bar stay). The only logic is the router `*` match.
The influencer detail page has its own 404 handling for scoped-out records (other agent).

---

### 7. Services and endpoints used by these screens

All services go through `src/services/http.ts` `request()`. It adds the `X-Acting-As` header (`currentAuthUid()`) and, in prototype mode,
lazy-loads `src/backend` and calls `handleApiRequest`; otherwise it fetches `API_BASE` (`/api/v1`). Errors become `ApiError {status, code}`.

| Service | File | Endpoints |
|---|---|---|
| `documentsApi` | `src/services/documents.ts` | `GET /influencers/:id/documents` (page_size 200), `GET /documents`, `POST /documents/presign`, `POST /influencers/:id/documents`, `GET /documents/:id/download`, `DELETE /documents/:id`, `upload()` (PUT to `upload_url` with progress, or IndexedDB `saveDocumentFile` for `local-file:` keys) |
| `duplicatesApi` | `src/services/accounts.ts` | `POST /duplicates/check`, `GET /duplicates`, `POST /duplicates/:id/dismiss` |
| `influencersApi` (pieces used here) | `src/services/influencers.ts` | `POST /influencers/merge`, `POST /influencers/:id/claim`, `POST /influencers/:id/release`, `POST /influencers/bulk` (claim, pool_assign), `PATCH /influencers/:id`, `GET /influencers/:id`, `GET /influencers` (picker) |
| `poolApi` | `src/services/pool.ts` | `GET /pool`, `GET /pool/filter-options`, `GET /pool/:id`, `GET /pool/expiring` |
| `packagesApi` | `src/services/packages.ts` | `GET /packages`, `POST /packages`, `PATCH /packages/:id` |
| `teamApi`, `categoriesApi`, `settingsApi`, `meApi` | `src/services/workspace.ts` | `GET/POST /team`, `PATCH/DELETE /team/:id`; `GET/POST /categories`, `PATCH/DELETE /categories/:id`; `GET/PATCH /settings/instagram`; `GET/PATCH /settings/pool`; `GET /me` |

Query keys (`src/lib/query.ts`):
- `['documents']`, `['documents','list',p]`, `['influencers','detail',id,'documents']`, `['documents','download',id]`
- `['duplicates']`
- `['influencers','pool',…]` (list, filter-options, item, expiring)
- `['packages']`, `['packages','list',p]`
- `['team']`, `['categories']`, `['settings','instagram']`, `['settings','pool']`
- `['influencers','picker',q]`

Backend handler routes (msw `http.*` route definitions in `src/backend/handlers/`):
- `documents.ts`: presign, influencer docs GET/POST, `/documents`, download, delete.
- `duplicates.ts`: check, list, dismiss, `/influencers/merge`.
- `pool.ts`: `/pool`, `/pool/filter-options`, `/pool/expiring`, `/pool/:id`.
- `packages.ts`: `/packages` GET/POST, `/packages/:id` PATCH.
- `workspace.ts`: `/me`, `/team…`, `/categories…`, `/settings/instagram`, `/settings/pool`, `/saved-views…`, `/pipeline`, `/dashboard/summary`.
- `influencers.ts`: influencer CRUD, bulk, claim, release, check-handle.
- `accounts.ts`, `calls.ts`.
- `async.ts`: jobs, CSV import and export, lookup.

### 8. Architecture summary (`src/backend`, `server/`)

- **`src/backend/index.ts`**: the prototype-mode in-browser API. `handleApiRequest(Request)`:
  1. Serialises requests through a promise queue.
  2. Runs `connect()` (loads the IndexedDB workspace).
  3. Resolves the acting member (`resolveActingUid`).
  4. Answers through MSW's `getResponse(handlers, request)`, or 404.
  5. Starts the job for a 202 response with a `job_id`.
  6. Runs `flush()` to save the changes, then `commitJobs()`.
  7. On an exception it runs `revertJobs()` + `revert()` and returns `500 database_error`.

  It also exports `resetPrototypeData` and `saveDocumentFile`.
- **`src/backend/handlers/index.ts`**: `http.all('/*')` first runs `runAutoRelease()` and `expireConnectLinks()`, then the duplicate, account,
  influencer, pool, call, package, document, workspace and async handlers.
- **`src/backend/db.ts`**: the in-memory `db` working copy, acting uid, `newWorkspace`, `defaultSettings`, `attachDocumentSummary`.
  `domain.ts` holds the stage rules, auto-release, etc. `duplicates.ts` holds detection (`similarNames`, Levenshtein). `documents.ts` holds the document rules.
  `social.ts` holds connect links. `jobs.ts` holds the in-memory jobs. `utils.ts` has `api()` and `apiError()`.
- **`src/backend/local-store.ts`**: the prototype store, the whole workspace in **IndexedDB** with document files as Blobs. It writes back changed records.
  **There is no `persistence.ts`** (CLAUDE.md is outdated).
- **`server/main.ts`**: a **Hono** server (`@hono/node-server`, `serveStatic`, `cors`, `bodyLimit` of 30 MB). It runs the same `handlers` through
  MSW `getResponse`, one request at a time, over the in-memory `db` loaded by `pg-store`. It also has `PUT/GET /api/v1/files/:key` (only presigned
  keys), `GET /health`, and serves `dist/`.
- **`server/pg-store.ts`**: the `postgres` (porsager) client. It loads every row at start-up and writes only the changed records in one
  transaction after each request. It works for local PostgreSQL or Supabase (`npm run server:supabase`).
- **`server/schema.sql`** tables, each `(id text PK, seq bigint identity, data jsonb, updated_at)`:
  - `team`, `categories`, `influencers`, `documents`, `calls`, `packages`, `activities`, `saved_views`, `settings`, `dismissed_duplicates`.
  - Plus `files (key PK, content_type, data bytea, created_at)`.

### 9. Summary: what a visual-only redesign may and may not add

- **Safe re-skins**:
  - Page headers.
  - Tables: density, row styling, badges.
  - Empty and error states.
  - Card layouts for duplicate pairs.
  - The drawer and dialog chrome.
  - The pool's sticky bulk bar.
  - Settings cards and tabs.
  - Type / status / platform shown as tab- or chip-style controls, **provided they read and write the same URL params**.
- **New features, not allowed without approval**:
  - Documents: contract statistics, verification workflow, bulk operations, "secure vault".
  - Duplicates: matching controls, confidence slider, dedup engine or scan status.
  - Pool: discovery, scraping status, a live routing-rules panel (admin-only endpoint).
  - Kits: kit stats, logistics tracking, inventory, dispatch.
- **Copy-only items needing a decision**: the "Welcome Kit" naming (take it from origin/main), and any explanatory info panels. These must stay truthful: no sign-in, no platform APIs, no scraping.

---

## Appendix D — Stitch reference package analysis

## InfluenceHub Stitch reference package: analysis

Source: `C:/Users/ADMIN/Desktop/stitch_influencehub_ui_visual_enhancement/` (read-only).
Contents: 9 screen folders (`screen.png` + `code.html`), `influencehub_design_system/DESIGN.md` (223 lines),
`liquid_glass_hig/DESIGN.md` (241 lines).

Abbreviations: **IH-DS** = `influencehub_design_system/DESIGN.md`; **LG-HIG** = `liquid_glass_hig/DESIGN.md`;
**HTML config** = the `<script id="tailwind-config">` block in every `code.html`.

Key headline facts (details below):

1. All nine `code.html` files share a **byte-identical Tailwind config** (md5 `a8094584…`) and an identical `<style>`
   block, sidebar markup and header markup (md5 `5ee23045…`). The config is the **LG-HIG** token set (Inter, black
   primary, grey surfaces), **not** IH-DS (Hanken/Space Grotesk, blue-tinted surfaces).
2. The HTML config **overrides the radius scale** in a way neither DESIGN.md specifies: `DEFAULT 0.25rem, lg 0.5rem,
   xl 0.75rem, full 9999px`. `rounded-2xl` (16px) and `rounded-md` (6px) fall through to Tailwind defaults. Cards
   are split between `rounded-2xl` (16px) and `rounded-[20px]`.
3. `font-code` maps to `"JetBrains Mono"` but **JetBrains Mono is never loaded** and the family has no fallback, so
   every `font-code` element renders in the browser default **serif (Times)**. This is visible in every screenshot
   (chart axes, phone numbers, "Synced 2m ago", tracking numbers, "4m ago").
4. `gap-space-gutter` (used for the main grids on Onboarded, Possible Duplicates, Welcome Kits) is **not a valid
   class** (the spacing key is `gutter`, so the class should be `gap-gutter`). In the screenshots the Onboarded platform
   cards and the Welcome Kits KPI cards **touch with zero gap**.
5. Six of the nine screens set the active sidebar item with an **inline `<script>` that rewrites `className`**, and
   each script applies a different active style. On Welcome Kits the script also strips `justify-between` from
   the "Onboarded" link, so its chevron sits next to the label (visible in screen.png).
6. There is no responsive shell (fixed `w-60` sidebar, no breakpoints on the sidebar or header), no dark mode
   (`darkMode:"class"` is configured but there are 0 `dark:` classes), no `alt` on any `<img>` (only `data-alt`), no
   `tabular-nums`, no `focus-visible`, and only 3 `aria-*` attributes in the whole package.
7. Every screen is full of hard-coded fake data, and many widgets claim **features the CRM may not have** (scraping
   crawlers, WebRTC dialler, DocuSign sync, inventory, courier pickups, Notion/Airtable sync, automation rules,
   dedupe confidence thresholds, platform API syncs, storage vault, audit trail, saved views, deals/$ revenue…).
   These are listed per screen as **reference-only feature claims**.

---

### 1. Design system documents

#### 1.1 IH-DS: "InfluenceHub Design System" (`influencehub_design_system/DESIGN.md`)

Style: "Modern Minimalism + subtle Atmospheric Glassmorphism". Opaque pure-white modules on an airy tinted
canvas with ambient cyan glows. Positioned as B2B "influencer intelligence and campaign orchestration".

##### Colour tokens (YAML front-matter, Material-3 style roles)

| Token | Hex | Token | Hex |
|---|---|---|---|
| surface | `#f8f9ff` | primary | `#006689` |
| surface-dim | `#cbdbf5` | on-primary | `#ffffff` |
| surface-bright | `#f8f9ff` | primary-container | `#00b4f0` |
| surface-container-lowest | `#ffffff` | on-primary-container | `#00425a` |
| surface-container-low | `#eff4ff` | inverse-primary | `#79d1ff` |
| surface-container | `#e5eeff` | secondary | `#54606c` |
| surface-container-high | `#dce9ff` | on-secondary | `#ffffff` |
| surface-container-highest | `#d3e4fe` | secondary-container | `#d7e4f2` |
| on-surface | `#0b1c30` | on-secondary-container | `#5a6672` |
| on-surface-variant | `#3d484f` | tertiary | `#5b5f63` |
| inverse-surface | `#213145` | on-tertiary | `#ffffff` |
| inverse-on-surface | `#eaf1ff` | tertiary-container | `#a5a8ac` |
| outline | `#6d7980` | on-tertiary-container | `#3a3d41` |
| outline-variant | `#bdc8d1` | error | `#ba1a1a` |
| surface-tint | `#006689` | on-error | `#ffffff` |
| background | `#f8f9ff` | error-container | `#ffdad6` |
| on-background | `#0b1c30` | on-error-container | `#93000a` |
| surface-variant | `#d3e4fe` | | |

Fixed roles: primary-fixed `#c3e8ff`, primary-fixed-dim `#79d1ff`, on-primary-fixed `#001e2c`,
on-primary-fixed-variant `#004c68`; secondary-fixed `#d7e4f2`, secondary-fixed-dim `#bbc8d6`, on-secondary-fixed
`#111d27`, on-secondary-fixed-variant `#3c4853`; tertiary-fixed `#e0e3e7`, tertiary-fixed-dim `#c4c7cb`,
on-tertiary-fixed `#181c1f`, on-tertiary-fixed-variant `#43474b`.

##### Colour prose (contradicts its own YAML, see conflicts)
- Primary **`#00B4F0` "Electric Cyan"**: primary CTAs, active indicators, interactive charts, metric trends, focused inputs.
- Secondary **`#0E1A24` "Slate Depth"**: nav headers, deep badges, high-priority cards, grouping blocks.
- Tertiary **`#05080B` "Base Black"**: top headlines, intense icons, terminal data values.
- Neutral **`#64748B` "Cool Slate"**: metadata, inactive, column titles, dividers.
- Canvas: linear gradient `#F8FAFC` → `#F1F5F9` + radial blooms `rgba(0,180,240,0.05)`.
- Card surface `#FFFFFF`; micro-borders `#E2E8F0`, interactive `#CBD5E1`.
- Extra one-off hexes in the component specs: active chip text `#008AB8`; secondary-button border `#1E293B`.

##### Typography (families: **Hanken Grotesk** for UI/headings, **Space Grotesk** for labels/data)

| Token | Family | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|---|
| display-lg | Hanken Grotesk | 3rem (48px) | 700 | 3.5rem (56px) | -0.03em |
| display-md | Hanken Grotesk | 2.25rem (36px) | 700 | 2.75rem (44px) | -0.025em |
| headline-xl | Hanken Grotesk | 1.75rem (28px) | 600 | 2.25rem (36px) | -0.02em |
| headline-lg | Hanken Grotesk | 1.5rem (24px) | 600 | 2rem (32px) | -0.015em |
| headline-md | Hanken Grotesk | 1.25rem (20px) | 600 | 1.75rem (28px) | -0.01em |
| headline-sm | Hanken Grotesk | 1.125rem (18px) | 600 | 1.5rem (24px) | 0 |
| body-lg | Hanken Grotesk | 1rem (16px) | 400 | 1.5rem (24px) | 0 |
| body-md | Hanken Grotesk | 0.875rem (14px) | 400 | 1.375rem (22px) | 0 |
| body-sm | Hanken Grotesk | 0.75rem (12px) | 400 | 1.125rem (18px) | 0.01em |
| label-md | Space Grotesk | 0.875rem (14px) | 600 | 1.25rem (20px) | 0.02em |
| label-sm | Space Grotesk | 0.75rem (12px) | 500 | 1rem (16px) | 0.04em |
| data-mono | Space Grotesk | 0.875rem (14px) | 700 | 1.25rem (20px) | -0.01em |

Rules: uppercase `label-sm` (+0.04em) for micro-labels, table headers, badges; `data-mono` for numeric counters
("prevent layout jank"). Note that Space Grotesk is not monospaced, so this needs `tabular-nums` to work.

##### Radius (YAML `rounded`)
`sm 0.25rem (4px) · DEFAULT 0.5rem (8px) · md 0.75rem (12px) · lg 1rem (16px) · xl 1.5rem (24px) · full 9999px`.
Prose ("roundedness: 2"): inputs/badges/buttons **8px**; dashboard containers/data cards **16px**; modals,
drawers, hero blocks **24px**; pills (9999px) **only** for status indicators, micro-tags, filter chips, avatars.

##### Spacing
`space-xs 0.25rem (4) · space-sm 0.5rem (8) · space-md 1rem (16) · space-lg 1.5rem (24) · space-xl 2rem (32) ·
gutter 1.5rem (24) · gutter-sm 1rem (16) · margin 2rem (32) · margin-mobile 1rem (16)`. 8pt grid.
Component padding: `space-md` for compact utilities, `space-lg`/`space-xl` for primary dashboard cards.

##### Grid / responsive
- Desktop ≥1280px: 12 cols, 24px gutters, 32px margins.
- Tablet 768–1279px: 8 cols, 16px gutters, 24px margins; **side nav collapses to an icon bar**.
- Mobile <768px: 4 cols, 16px gutters, 16px margins; stacked metric cards, full-width action drawers.

##### Elevation
- L0 canvas: `#F8FAFC`→`#F1F5F9`, radial glows `rgba(0,180,240,0.04–0.08)`, blur 80–140px.
- L1 base cards: `#FFFFFF`, `1px solid #E2E8F0`, shadow `0 1px 3px rgba(14,26,36,0.03), 0 6px 16px -4px rgba(14,26,36,0.04)`.
- L2 hover/active: border `#CBD5E1`, shadow `0 10px 24px -4px rgba(14,26,36,0.06), 0 0 16px rgba(0,180,240,0.12)`.
- L3 modals/popovers/drawers: white, `backdrop-filter: blur(12px)` on the overlay, border `1px solid rgba(226,232,240,0.8)`,
  shadow `0 20px 32px -8px rgba(14,26,36,0.12), 0 4px 12px rgba(0,180,240,0.06)`.

##### Components
- **Buttons**: Primary = bg `#00B4F0`, text `#05080B`, weight 600, hover brightness + `0 4px 14px rgba(0,180,240,0.35)`.
  Secondary (dark) = bg `#0E1A24`, white text, border `#1E293B`. Outline/ghost = transparent, `1px solid #E2E8F0`,
  text `#0E1A24`, hover bg `#F8FAFC` + `#00B4F0` border.
- **Cards / metric tiles**: white, `1px #E2E8F0`, 16px radius; label-sm `#64748B` category → value in data-mono or
  headline-lg `#05080B` → inline delta micro-badge (+14.2% cyan/emerald tint).
- **Chips / filter tags**: height 28–32px. Inactive bg `#F1F5F9`, text `#64748B`, border `#E2E8F0`.
  Active bg `rgba(0,180,240,0.1)`, text `#008AB8`, border `rgba(0,180,240,0.4)`.
- **Inputs**: bg white, `1px #E2E8F0`, radius 8px, padding `0.625rem 0.875rem` (10/14px), body-md `#0E1A24`.
  Focus: border `#00B4F0` + ring `0 0 0 3px rgba(0,180,240,0.15)`.
- **Tables**: header bg `#F8FAFC`, uppercase label-sm `#64748B`, bottom border `#E2E8F0`. Row white,
  bottom border `#F1F5F9`, hover `#F8FAFC` + left-edge accent indicator.
- **Influencer micro-card**: avatar with `2px solid #FFFFFF` rim, handle/platform badge, engagement rate in cyan
  data-mono, campaign status pill.
- Not specified: navigation, switches, segmented controls, modals in detail, dark mode, motion.

#### 1.2 LG-HIG: "Liquid Glass HIG" (`liquid_glass_hig/DESIGN.md`)

Style: Apple HIG discipline + "liquid glass". Translucent frosted surfaces over a gradient canvas, specular rims,
squircles, inset grouped lists, segmented pill controls; obsidian/black ink; single cyan accent.

##### Colour tokens (YAML)

| Token | Hex | Token | Hex |
|---|---|---|---|
| surface | `#f9f9f9` | primary | `#000000` |
| surface-dim | `#dadada` | on-primary | `#ffffff` |
| surface-bright | `#f9f9f9` | primary-container | `#181c1f` |
| surface-container-lowest | `#ffffff` | on-primary-container | `#818488` |
| surface-container-low | `#f3f3f4` | inverse-primary | `#c4c7cb` |
| surface-container | `#eeeeee` | secondary | `#54606c` |
| surface-container-high | `#e8e8e8` | on-secondary | `#ffffff` |
| surface-container-highest | `#e2e2e2` | secondary-container | `#d7e4f2` |
| on-surface | `#1a1c1c` | on-secondary-container | `#5a6672` |
| on-surface-variant | `#44474a` | tertiary | `#000000` |
| inverse-surface | `#2f3131` | on-tertiary | `#ffffff` |
| inverse-on-surface | `#f0f1f1` | tertiary-container | `#001e2c` |
| outline | `#75777a` | on-tertiary-container | `#008ebe` |
| outline-variant | `#c5c6ca` | error | `#ba1a1a` |
| surface-tint | `#5b5f63` | on-error | `#ffffff` |
| background | `#f9f9f9` | error-container | `#ffdad6` |
| on-background | `#1a1c1c` | on-error-container | `#93000a` |
| surface-variant | `#e2e2e2` | | |

Fixed roles: primary-fixed `#e0e3e7`, primary-fixed-dim `#c4c7cb`, on-primary-fixed `#181c1f`,
on-primary-fixed-variant `#43474b`; secondary-fixed `#d7e4f2`, secondary-fixed-dim `#bbc8d6`, on-secondary-fixed
`#111d27`, on-secondary-fixed-variant `#3c4853`; **tertiary-fixed `#c3e8ff`**, **tertiary-fixed-dim `#79d1ff`**,
on-tertiary-fixed `#001e2c`, on-tertiary-fixed-variant `#004c68`.
(LG-HIG's tertiary-* = IH-DS's primary-* cyan family; LG-HIG's primary-* = IH-DS's tertiary-* grey family.
The two docs are the same Material palette with primary and tertiary swapped.)

##### Colour prose
- Primary **`#05080B` "Deep Obsidian Black"**: primary/destructive/commit actions, dominant titles, core glyphs.
- Secondary **`#0E1A24` "Deep Slate"**: headings, secondary copy, inactive icon strokes, segmented wells.
- Tertiary/Accent **`#00B4F0` "Electric Cyan"**: the **only** chromatic accent. Only for focus rings, active tab
  indicators, selected switches, KPI progress arcs, verified badges, hover links.
- Surface/Neutral `#FFFFFF` at opacities `0.65`–`0.85` for frosted panels, inputs, sheets.
- Canvas: gradient **`#F5FAFF` (top) → `#BFE8FB` (bottom)**, blobs `#00B4F0` @12% and lilac **`#E2D9F3`** @15%.

##### Typography (families: **Inter**, plus **JetBrains Mono** for `code`)

| Token | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| display-lg | 48px | 700 | 56px | -0.03em |
| display-lg-mobile | 34px | 700 | 40px | -0.025em |
| headline-xl | 32px | 600 | 38px | -0.025em |
| headline-xl-mobile | 26px | 600 | 32px | -0.02em |
| headline-md | 22px | 600 | 28px | -0.02em |
| headline-sm | 17px | 600 | 22px | -0.015em |
| body-lg | 16px | 400 | 24px | -0.01em |
| body-md | 14px | 400 | 20px | -0.005em |
| body-sm | 12px | 400 | 16px | 0 |
| label-md | 13px | 500 | 18px | -0.005em |
| label-sm | 11px | 600 | 14px | +0.04em |
| code (JetBrains Mono) | 12px | 500 | 16px | 0 |

Rules: SF-Pro-style negative tracking on large sizes; hierarchy by weight (600), not big size jumps; uppercase
`label-sm` +0.04em; **`tnum` forced on all counts, percentages, payouts, dates**.

##### Radius
YAML is identical to IH-DS (`sm 4 · DEFAULT 8 · md 12 · lg 16 · xl 24 · full`). Prose: cards/panels **20px
continuous squircle** ("rounded-xl equivalent", which is not true for either YAML scale); buttons/inputs/search
**full pill** or **12px** squircle in dense grids; status chips pill, categorical analytics badges **8px**;
dividers hairline 0.5–1px with fading ends. Inset grouped list containers 20px.

##### Spacing / layout
Same spacing tokens as IH-DS. Base 4px rhythm, 8px steps. Fluid 12-col grid, **max-width 1440px**; tablet
**768–1024px 8 cols**; mobile **<768px single column**; desktop gutter 2rem viewport, card grid gap 1.5rem;
mobile edge padding 1rem. Inset grouped modules offset by `space-md`/`space-lg`.

##### Elevation / glass
1. L0 ambient canvas: gradient + `#00B4F0` and lavender diffusion blurs.
2. L1 frosted glass cards: fill `rgba(255,255,255,0.65–0.72)`, `backdrop-filter: blur(24px) saturate(180%)`,
   rim `1px solid rgba(255,255,255,0.6)`, inner highlight `inset 0 1px 0 0 rgba(255,255,255,0.85)`,
   shadow `0 8px 32px 0 rgba(14,26,36,0.04)`.
3. L2 floating panels/popovers: fill `rgba(255,255,255,0.82)`, `blur(32px) saturate(200%)`, rim
   `1px solid rgba(255,255,255,0.8)`, shadow `0 16px 40px rgba(14,26,36,0.08), 0 2px 6px rgba(14,26,36,0.02)`.
4. Active/focus: double ring `0 0 0 2px #FFFFFF, 0 0 0 4px #00B4F0`.

##### Components
- **Buttons**: Primary = bg `#05080B`, white label, pill, inner top highlight `inset 0 1px 0 rgba(255,255,255,0.15)`,
  hover `scale(1.01)` + `0 4px 12px rgba(5,8,11,0.15)`. Secondary/Glass = `rgba(255,255,255,0.60)`, blur 16px,
  border `rgba(255,255,255,0.70)`, text `#0E1A24`, hover `rgba(255,255,255,0.85)`. Accent/Tint = bg
  `rgba(0,180,240,0.12)`, text `#00B4F0`, border `rgba(0,180,240,0.25)`, hover bg `0.20`.
- **Inputs/search**: "glass trench" `rgba(255,255,255,0.50)`, blur 20px, border `1px rgba(14,26,36,0.08)`, radius
  12px or pill, text `#05080B`, placeholder `#0E1A24` @40%. Focus fill `0.85` + ring `0 0 0 1.5px #00B4F0`.
- **Segmented control**: track `rgba(14,26,36,0.06)`, padding 3px, radius 12px or pill; active item white pill,
  shadow `0 2px 8px rgba(14,26,36,0.08)`, text `#05080B` semibold; inactive transparent, `#0E1A24` @65%.
- **Switch**: track 52×32 pill, off `rgba(14,26,36,0.12)`, on `#00B4F0`; thumb 28px white, shadow
  `0 2px 6px rgba(0,0,0,0.15)`, spring transition.
- **Inset grouped list**: 20px frosted card; rows ≥52px; hairline `1px rgba(14,26,36,0.06)` indented to text;
  trailing chevron `#0E1A24` @30%, badges or switches; row hover `rgba(255,255,255,0.35)`.
- **Cards/media panels**: 20px squircle, 24px padding, fill `rgba(255,255,255,0.68)`, blur 24px, top sheen
  `inset 0 1px 0 rgba(255,255,255,0.9)`; title left `#0E1A24`, trailing chip/segmented control right.
- **Chips / stat pills**: height 26px, padding `0 10px`, pill. Neutral bg `rgba(14,26,36,0.05)` text `#0E1A24`.
  Accent/verified bg `rgba(0,180,240,0.12)`, text `#00B4F0`, border `0.5px rgba(0,180,240,0.3)`.
- Not specified: tables (beyond "inset grouped"), navigation/sidebar, modals, dark mode, charts.

#### 1.3 Conflicts between the two documents (and with the HTML)

| # | Topic | IH-DS | LG-HIG | What the 9 screens actually use |
|---|---|---|---|---|
| 1 | Font families | Hanken Grotesk + Space Grotesk | Inter + JetBrains Mono | Inter (loaded); JetBrains Mono configured but **not loaded** (renders as serif) |
| 2 | Role of cyan | `primary` (YAML `#006689`/container `#00b4f0`; prose `#00B4F0`); used on primary CTAs | `tertiary`/accent only (focus, active tab, switches, verified, progress); never a CTA fill | Cyan only as accent (`on-tertiary-container #008ebe`, `tertiary-fixed #c3e8ff`); CTAs are black |
| 3 | Primary button | Cyan fill + black text | Black pill + white text | Black pill (`bg-primary` = `#000000`, not `#05080B`) |
| 4 | Primary colour value | YAML `#006689`; prose `#00B4F0` (internal conflict) | YAML `#000000`; prose `#05080B` (internal conflict) | `#000000` |
| 5 | Secondary | YAML `#54606c`; prose `#0E1A24` | YAML `#54606c`; prose `#0E1A24` | `#54606c` (`text-secondary`) is the main muted text colour; `#0E1A24` appears only inside rgba shadows |
| 6 | Neutral / metadata grey | `#64748B` (Tailwind slate-500) | (none; uses `#0E1A24` at opacities) | `#54606c`, `#75777a` (outline) |
| 7 | Surfaces | Blue-tinted (`#f8f9ff`, `#eff4ff`…`#d3e4fe`), ink `#0b1c30` | Neutral grey (`#f9f9f9`, `#f3f3f4`…`#e2e2e2`), ink `#1a1c1c` | Grey LG set |
| 8 | Canvas | `#F8FAFC`→`#F1F5F9` (near-white slate) + 4–8% cyan glows | `#F5FAFF`→`#BFE8FB` (noticeably blue) + 12% cyan + 15% lilac `#E2D9F3` | Flat `bg-surface #f9f9f9` + 3 fixed blurred orbs: `tertiary-fixed/35` (580px, blur 120), `secondary-fixed/40` (460px, blur 130), `tertiary-fixed-dim/20` (520px, blur 140). No gradient, no lilac |
| 9 | Card surface | Opaque `#FFFFFF` + `1px #E2E8F0` border | Translucent white 0.65–0.72 + blur 24px saturate 180% + white rim + inset highlight | Translucent `bg-surface-container-lowest/65…/80` + `backdrop-blur-2xl` (40px, not 24) or `-xl` (24px); **no borders anywhere**, no inset highlight, no saturate |
| 10 | Card radius | 16px | 20px | Mixed: `rounded-2xl` 16px (Dashboard, Influencers, Pipeline, Documents) vs `rounded-[20px]` (Onboarded, Calls, Duplicates, Pool, Welcome Kits) |
| 11 | Button / input radius | 8px | Pill or 12px | Pills for most buttons; `rounded-xl` (=12px after override) for header search, segmented items, toolbar buttons |
| 12 | Pill usage | Pills only for status/chips/avatars | Pills for buttons, inputs, search, chips | Pills everywhere |
| 13 | Modal radius | 24px | (not given; popovers are L2 glass) | Only one popover (Documents upload menu): `rounded-2xl` + `bg-…/90 backdrop-blur-2xl shadow-xl` |
| 14 | Card shadow | `0 1px 3px …0.03, 0 6px 16px -4px …0.04` | `0 8px 32px 0 rgba(14,26,36,0.04)` | LG value `shadow-[0_8px_32px_0_rgba(14,26,36,0.04)]` plus Tailwind `shadow-sm`/`shadow-md` and invalid `shadow-xs` |
| 15 | Hover elevation | Border `#CBD5E1` + cyan glow 0.12 | Scale 1.01 (buttons) | Cards: `hover:-translate-y-0.5/1` + bigger shadow (`0_12px_36px…0.08` or cyan `0_16px_40px_0_rgba(0,180,240,0.12)`) |
| 16 | Focus state | Cyan border + 3px ring @15% | Double ring 2px white + 4px cyan; inputs 1.5px cyan | `focus:ring-1 focus:ring-on-tertiary-container` on some inputs; many `outline-none` with no replacement; buttons have none |
| 17 | Type scale | headline-xl 28, headline-md 20, headline-sm 18, body-md lh 22, label-md 14/600, label-sm 12/500 | headline-xl 32, headline-md 22, headline-sm 17, body-md lh 20, label-md 13/500, label-sm 11/600 | LG values |
| 18 | Extra type tokens | display-md, headline-lg, data-mono | *-mobile variants, code | LG tokens; `display-lg-mobile` used as a desktop KPI size |
| 19 | Letter-spacing on body | 0 / +0.01em | -0.01 / -0.005em | LG |
| 20 | Numerals | `data-mono` Space Grotesk (proportional) | Force `tnum` | Neither (`tabular-nums` used 0 times) |
| 21 | Chips height/colour | 28–32px, active text `#008AB8` | 26px, accent text `#00B4F0` | ~20–24px (`px-2 py-0.5` + 11px text), mixed tints |
| 22 | Table styling | Header `#F8FAFC`, borders `#E2E8F0`/`#F1F5F9`, row hover + left accent | Inset grouped rows ≥52px, indented hairlines | `bg-surface-container-low/40–70` header, `divide-y divide-surface-container`, no left accent, no indent |
| 23 | Breakpoints | 768 / 1280 (tablet 768–1279) | 768 / 1024 (tablet 768–1024), max 1440 | Tailwind defaults sm 640 / md 768 / lg 1024; max-width 1440 on Calls only, 1400 on Pool, `max-w-7xl` (1280) on Duplicates, none elsewhere |
| 24 | Columns on mobile | 4 cols | 1 col | No shell responsiveness at all |
| 25 | Tablet nav | Sidebar collapses to icon bar | (not specified) | Always 240px |
| 26 | Elevation for modals | blur 12px on overlay | blur 32px saturate 200% panel | n/a |
| 27 | Contrast | Cyan `#00B4F0` as CTA fill under black text is fine, but `#00B4F0` text on white is **2.4:1** | Cyan text `#00B4F0` on white (accent buttons/chips) is **2.4:1** and fails | Screens use `#008ebe` for cyan text: **3.7:1**, which fails AA for body text (passes for ≥18.66px bold / UI glyphs) |
| 28 | Radius tokens in config | `DEFAULT .5rem, lg 1rem, xl 1.5rem` | same | HTML overrides: `DEFAULT .25rem, lg .5rem, xl .75rem` (matches neither) |

#### 1.4 Recommended unified system (keeps the look of the nine screens)

The screens are visually **LG-HIG**: black pill CTAs, Inter, grey-white translucent cards on a soft cyan-orb canvas,
cyan as the only accent. The unified system should therefore use LG-HIG as the base. It should take from IH-DS the
parts that make a dense CRM easier to read: opaque card option, table rules, 16px radius consistency, tighter
breakpoints, and an accessible cyan. Suggested decisions:

**Colour**
- Ink / primary action: `#05080B` (prose value) or keep `#000000`. Pick one; recommend `#0B0F14`-ish near-black via
  token `--primary` so dark mode can invert it. White text on it.
- Text: `--fg #1a1c1c`, `--fg-muted #54606c` (6.4:1 on white), `--fg-subtle #75777a` (4.5:1, placeholders and meta only).
- Accent (single): two tokens:
  - `--accent #00B4F0`: **fills/indicators only** (active dot, progress bar, switch-on, chart series, focus ring).
  - `--accent-ink #006689` (IH-DS primary, **6.4:1** on white): any cyan **text or icon-as-meaning** (links,
    "Show as table", deltas, verified label). Replaces `#008ebe` (3.7:1) for text.
  - `--accent-soft #c3e8ff` (tertiary-fixed) for tinted pills/active nav; `--accent-soft-ink #001e2c`/`#004c68` on it.
- Surfaces: LG grey set (`#f9f9f9` canvas base, `#ffffff`, `#f3f3f4`, `#eeeeee`, `#e8e8e8`, `#e2e2e2`).
  Canvas = flat `#f9f9f9` + the three fixed orbs (that is what the screenshots show). Drop the LG `#BFE8FB` gradient
  and lilac (not in any screen) and drop IH-DS blue-tinted surfaces.
- Status colours: define **one** semantic set and use it everywhere instead of the pipeline's Apple hexes
  (`#34C759`, `#FF9500`, `#FF3B30`, `#007AFF`, `#AF52DE`, `#8E8E93`) and the Documents hexes (`#10b981`, `#f59e0b`):
  success, warning, danger (`#ba1a1a` / `#ffdad6` / `#93000a` already exist), info. Stage colours must come from
  a single stage map (the app already has `STAGE_META`); the reference has three different stage palettes (see §3).
- Hairline: add a real border token `rgba(14,26,36,0.08)` (LG input rim). The translucent cards have no edge on
  white areas, so a hairline keeps them visible when blur is off or in dark mode.

**Typography**
- Inter only, loaded with fallbacks: `Inter, ui-sans-serif, system-ui, sans-serif`. Drop Hanken/Space Grotesk.
- Mono: either load JetBrains Mono or (simpler) use `ui-monospace, SFMono-Regular, Menlo, monospace`; **always
  with a fallback stack**. Prefer Inter + `font-variant-numeric: tabular-nums` for numbers and use mono only for
  IDs/codes.
- Scale (LG-HIG values, which the screens use): display 48/56, headline-xl 32/38 (page title; 26/32 below 768px),
  headline-md 22/28, headline-sm 17/22, body-lg 16/24, body-md 14/20, body-sm 12/16, label-md 13/18 500,
  label-sm 11/14 600 +0.04em uppercase. Minimum text size 12px (the screens use 10–11px in places: avatar initials
  `text-[10px]`, kbd, counts).

**Shape**
- Radius tokens (restore a coherent scale and stop overriding Tailwind): `sm 6px` (kbd, tiny tags),
  `md 8px` (inputs in dense grids, icon buttons, menu items), `lg 12px` (segmented controls, toolbars, inner tiles),
  `xl 16px` (**all cards and table containers**: this matches 4 of the 9 screens and IH-DS), `2xl 20–24px`
  (modals/drawers/sheets), `full` (buttons, chips, avatars, search). Choose 16px **or** 20px for cards and apply it
  to all nine screens. Recommend 16px (dense CRM; matches IH-DS and the dashboard).

**Elevation / glass**
- L0 canvas (flat + orbs), L1 card = `rgba(255,255,255,0.70)` + `backdrop-blur(24px)` + hairline rim
  `rgba(14,26,36,0.06)` + `0 8px 32px rgba(14,26,36,0.04)`, L1-hover = `0 12px 36px rgba(14,26,36,0.08)` and
  `translateY(-2px)` **only on clickable cards**, L2 popover/menu = `rgba(255,255,255,0.90)` + blur 32px +
  `0 16px 40px rgba(14,26,36,0.08), 0 2px 6px rgba(14,26,36,0.02)`, L3 modal = opaque white, 20–24px radius.
- Limit `backdrop-filter` to the shell (sidebar, header) and top-level cards. The screens put blur on 10–12 elements
  per page, including nested pills and table footers, which costs scroll performance at 1024px on low-end machines.
  Provide `@supports not (backdrop-filter)` and `prefers-reduced-transparency` fallbacks to opaque white.
- Dark mode: define the same roles for dark (canvas `#0b0f14`, card `rgba(24,28,31,0.7)`, ink `#f0f1f1`, accent stays
  `#00B4F0`, accent-ink becomes `#79d1ff`). The reference has none and the app requires light/dark.

**Controls**
- Primary button: black pill, white label, 36px (header) / 40px (page) height, hover `scale(1.01)` +
  `0 4px 12px rgba(5,8,11,0.15)`. **Do not** invert to grey on hover as the screens do
  (`hover:bg-surface-container-highest hover:text-on-surface`), because the button looks disabled on hover.
- Secondary: white/80 glass pill + hairline + `shadow-sm`. Tertiary/ghost: text button, `--accent-ink`.
- Destructive: `#ba1a1a` fill or outline (the reference has no destructive button style at all).
- Segmented control: LG spec (track `rgba(14,26,36,0.06)` or `surface-container-high/60`, 3–4px padding, active
  white + `shadow-sm` + semibold). Use **one** shape (pill) everywhere; the screens mix pill and 12px.
- Inputs/search: 36–40px height, pill for global search, 12px radius in forms, hairline rim, focus ring
  `0 0 0 2px #fff, 0 0 0 4px #00B4F0` via `:focus-visible` on **every** interactive element.
- Switch: LG spec (52×32, accent on). Checkbox: 16px, accent `--primary`.
- Chips/badges: 22–26px, pill, 12px text minimum; status chips = dot + label with semantic tint.

**Tables**
- Container card (L1, 16px radius, `overflow-hidden`), header `surface-container-low/60` uppercase label-sm muted,
  rows 52–56px, `divide-y` hairline, hover `accent-soft/20`, selected `accent-soft/30` + left 2px accent bar
  (IH-DS), numbers right-aligned + tabular, sticky header, horizontal scroll inside the card. A
  column-configure gear in the last header cell is fine.

**Layout / responsive**
- Shell: sidebar 240px (`w-60`) ≥1280px, **collapses to a 64–72px icon rail at 1024–1279px** (IH-DS rule; the app must
  be usable at 1024px), off-canvas drawer below 1024px. Header 64px, sticky, glass.
- Content: `px-8` (32px) ≥1280, `px-6` 1024–1279, `px-4` below; content max-width 1440px everywhere (not 1400/1280/none).
- Grid: 12 cols / 24px gap desktop, 16px gap below 1280.

---

### 2. Shared shell (identical markup in all 9 files)

#### 2.1 `<head>` and global
- `<meta name="shell-type" content="web_dashboard">` (Stitch marker).
- `<style>`: `@layer base{html,body{margin:0;padding:0}body{overscroll-behavior:none}main>:first-child{margin-top:0!important}main>:last-child{margin-bottom:0!important}}` and
  **`::-webkit-scrollbar{display:none}`**, which hides all scrollbars, including the horizontal table/kanban
  scrollers (an accessibility and discoverability problem).
- Tailwind via **Play CDN** `https://cdn.tailwindcss.com` (v3 JIT in-browser; not for production).
- Tailwind config (identical in all 9): `darkMode:"class"`; colours = LG-HIG YAML set (all 49 roles listed in §1.2);
  `borderRadius {DEFAULT:.25rem, lg:.5rem, xl:.75rem, full:9999px}`; `spacing {space-xs .25rem, space-sm .5rem,
  space-md 1rem, space-lg 1.5rem, space-xl 2rem, gutter 1.5rem, gutter-sm 1rem, margin 2rem, margin-mobile 1rem}`;
  `fontFamily` every LG token → `["Inter"]`, `code` → `["JetBrains Mono"]` (no fallbacks); `fontSize` = LG table
  (size + lineHeight + letterSpacing + fontWeight per token).
- `<body class="bg-surface text-on-surface font-body-md text-body-md antialiased min-h-screen relative overflow-x-hidden selection:bg-tertiary-fixed selection:text-on-tertiary-fixed">`.
- Ambient layer: `div.fixed.inset-0.pointer-events-none.z-0.overflow-hidden` with 3 orbs:
  `absolute -top-32 left-1/4 w-[580px] h-[580px] rounded-full bg-tertiary-fixed/35 blur-[120px]`,
  `absolute top-1/3 -left-20 w-[460px] h-[460px] rounded-full bg-secondary-fixed/40 blur-[130px]`,
  `absolute bottom-10 right-10 w-[520px] h-[520px] rounded-full bg-tertiary-fixed-dim/20 blur-[140px]`.
  Most screens add 1–2 more local orbs (`blur-3xl`/`blur-[100–120px]`, `-z-10`).
- Screenshots: 1600px wide images; the 240px sidebar renders 300px wide, so they were captured at a **1280px CSS
  viewport at 1.25× DPR**. Nothing in the package shows tablet/mobile.

#### 2.2 Sidebar (`<aside>`)
- `fixed left-0 top-0 h-screen w-60 (240px) z-50 flex flex-col bg-surface-container-lowest/65 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(14,26,36,0.04)]`. No border; no responsive classes.
- Brand row `h-16 px-space-md gap-space-sm`: logo tile `w-9 h-9 rounded-xl (12px) bg-primary text-on-primary` "IH"
  (headline-sm); wordmark "InfluenceHub" (headline-sm semibold, `text-primary`) over "PLATFORM" (label-sm,
  `tracking-widest uppercase text-secondary`).
- `<nav class="flex-1 px-space-sm py-space-xs space-y-0.5 overflow-y-auto" data-active-classes="bg-tertiary-fixed/40 text-primary font-medium shadow-sm">`.
- Item: `<a class="flex items-center gap-space-sm px-space-sm py-2 rounded-xl text-secondary hover:bg-surface-container-low hover:text-on-surface transition-all duration-150">` + Material Symbol `text-[19px]` + label `font-label-md text-label-md` (13px/500). Item height ≈ 36px. All `href="#"`.
- Items (order, icon, `data-path`):
  1. Dashboard: `grid_view`: `dashboard`
  2. Influencers: `group`: `influencers`
  3. Unassigned Pool: `inbox`: `unassigned-pool`
  4. Possible duplicates: `content_copy`: `possible-duplicates` (sentence case, unlike the others)
  5. Pipeline: `filter_alt`: `pipeline`
  6. Calls & Follow-ups: `ring_volume`: `calls-and-follow-ups`
  7. Welcome Kits: `inventory_2`: `welcome-kits`
  8. Documents: `folder`: `documents`
  9. Onboarded: `verified`: `onboarded`, with a trailing `expand_more` (16px, `text-outline`), i.e. an expandable
     group (`justify-between`).
  - Footer block `px-space-sm py-space-sm bg-surface-container-lowest/40`, 1px divider `bg-surface-container`,
    then **Settings** (`settings` icon).
- No user/profile block, no workspace switcher, no collapse button, no badges/counts on items (except the
  Onboarded sub-nav injected on that screen).

#### 2.3 Header (`<header>`)
- `fixed top-0 left-60 right-0 h-16 (64px) bg-surface-container-lowest/70 backdrop-blur-2xl shadow-[0_1px_8px_rgba(0,0,0,0.03)] z-40 px-space-xl flex items-center justify-between gap-space-lg`.
- Left: global search `flex-1 max-w-lg` (512px): icon `search` 18px `text-outline` absolutely positioned; input
  `w-full bg-surface-container-low/60 hover:bg-surface-container-low focus:bg-surface-container-lowest placeholder:text-secondary/70 font-body-sm pl-9 pr-9 py-2 rounded-xl (12px) outline-none focus:ring-1 focus:ring-on-tertiary-container`,
  placeholder "Search influencers..."; `<kbd>` "/" (`px-1.5 py-0.5 rounded text-[10px] font-code bg-surface-container-highest`).
- Right (`gap-space-md`): **Add Influencer** black pill (`bg-primary text-on-primary px-4 py-2 rounded-full shadow-sm hover:bg-surface-container-highest hover:text-on-surface hover:scale-[1.01] active:scale-[0.99]`, `add` icon 16px); notifications
  icon button (`w-9 h-9 rounded-xl bg-surface-container-lowest/80 shadow-sm`, `notifications` 20px, no unread
  badge); avatar `w-8 h-8 rounded-full bg-primary` with `person` icon (no image, no menu affordance).
- No breadcrumbs, no page title in header, no theme toggle, no sign-out.
- Content wrapper `div.pl-60.relative.z-10.min-h-screen.flex.flex-col` → `<main class="flex-1 pt-16 w-full px-space-xl py-space-lg">`. `pt-16` and
  `py-space-lg` conflict on padding-top. Tailwind emits `pt-*` after `py-*`, so the top padding is exactly the 64px
  header height and the page has **no breathing room** below the fixed header. In every screenshot the eyebrow
  text starts only ~8px below the header edge.

#### 2.4 Icon set
**Material Symbols Outlined** (Google Fonts variable font) everywhere; filled variants via inline
`style="font-variation-settings: 'FILL' 1"`. Brand logos on Onboarded are inline SVG paths (Instagram gradient,
YouTube, TikTok, Facebook, Threads, Pinterest, LinkedIn, Snapchat). Platforms elsewhere are shown with generic Material
glyphs (`photo_camera` = Instagram, `smart_display` = YouTube, `music_video` = TikTok, `tag` = X, `feed` = Substack),
which is inconsistent with the Onboarded brand marks.

---

### 3. Screen-by-screen

Common page-header pattern: optional eyebrow (uppercase label-sm and/or a pulsing dot plus a "live/synced" code tag) →
`h1 font-headline-xl text-headline-xl text-primary tracking-tight font-semibold` (32px) → optional count pill →
`p font-body-md text-secondary` subtitle; right side: segmented control or secondary + black primary buttons;
`flex-col md:flex-row md:items-end justify-between`.

#### 3.1 Dashboard (`influencehub_dashboard`)
Active nav: Dashboard, static `aria-current="page"` + `bg-tertiary-fixed/40 text-primary font-medium shadow-sm`.
`main > div.flex.flex-col.w-full.space-y-space-lg` (no max-width).

Sections top→bottom:
1. **Greeting header**: eyebrow pulsing dot `w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse` +
   "OPERATIONAL INTELLIGENCE" (label-sm uppercase tracking-wider secondary); h1 "Welcome back, Admin"; subtitle
   "Where the pipeline stands today." Right: **segmented time range** `inline-flex p-1 bg-surface-container-low/80 backdrop-blur-xl rounded-full shadow-sm`, items `px-3.5 py-1.5 rounded-full font-label-md`; active `bg-surface-container-lowest text-primary shadow-sm font-semibold`: Today / This Week / Month to Date.
2. **7 KPI glass cards**: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-space-md`; card
   `group relative flex flex-col justify-between p-space-md rounded-2xl bg-surface-container-lowest/70 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(14,26,36,0.04)] hover:shadow-[0_12px_36px_0_rgba(14,26,36,0.08)] hover:-translate-y-0.5 transition-all duration-200`.
   Anatomy: label (label-sm medium, truncate) + sub-label (body-sm `text-secondary/60`) + 6px cyan dot top-right;
   1px divider `bg-surface-container-highest my-3`; value `font-headline-md` 22px semibold + trailing meta.
   Cards: Total Influencers 1,248 ↑4.2% "Active roster"; Unassigned Pool 24 "Needs triage" + `Pending` pill
   (`bg-secondary-fixed text-on-secondary-fixed`); Contacted 38 "This week" ↑12%; Onboarded 42 "This month" +
   `Goal +9` pill (`bg-tertiary-fixed text-on-tertiary-fixed`); Welcome Kits 19 "In transit" + `local_shipping`;
   Follow-ups 8 "Due today" "Calls set"; No Agreement 5 "Action item" + `warning` "Review" in `text-error`
   (last card `col-span-2 sm:col-span-1`). At 1280px the labels truncate ("Total Influen…", "Unassigned …") in the
   screenshot, so 7 columns is too dense at that width.
3. **Two charts** `grid grid-cols-1 lg:grid-cols-2 gap-space-lg`, cards `p-space-lg rounded-2xl …/70 backdrop-blur-2xl`.
   - "Onboarded per week", "Last 12 weeks performance trajectory": hand-drawn **SVG area chart** (viewBox 540×180,
     `preserveAspectRatio="none"`, so it distorts), gradient `#008ebe`@0.32 → `#79d1ff`@0.12 → `#c3e8ff`@0, stroke
     2.5px gradient, dashed grid `#c5c6ca`@0.35, peak marker + dark tag `#001e2c` "26 peak", axis W1–W12 in
     `font-code text-[11px]` (renders serif).
   - "Calls per day", "Last 30 days outbound & screening volume": 30 div bars `flex-1 rounded-t-sm`
     `bg-secondary-fixed/50 hover:bg-on-tertiary-container`, last three cyan/black; `title` tooltips; tick labels
     "30 days ago / 15 days ago / 7 days ago / Today".
   - Both have a "Show as table →" text button (`text-on-tertiary-container`), which matches the app's dataviz rule.
4. **Bottom row** `grid grid-cols-1 lg:grid-cols-12 gap-space-lg`:
   - `lg:col-span-7` **Pipeline Status** card: `filter_alt` icon + title + pill "126 Total In Flight"
     (`bg-surface-container`); 5 stage rows (dot, 144px label, 10px track `bg-surface-container-highest rounded-full`
     with **gradient fill `bg-gradient-to-r from-on-tertiary-container to-primary`** (cyan→black), count + % in
     `font-code`): Data Gathered 34 (27%), Contacted 28 (22%), Onboarded 24 (19%), **Welcome Kit** 19 (15%),
     Delivered 21 (17%); divider; side stages On Hold 12 (10%) (`bg-secondary`, `opacity-85`), Rejected 6 (5%)
     (`bg-outline`, `opacity-70`). Stage dots are black at decreasing opacity, then cyan for Delivered (a third stage
     palette, see §4). Footer "Conversion rate from Gathered to Delivered: 61.7%" + text button "Manage pipeline stages".
   - `lg:col-span-5` **My follow-ups**: `ring_volume` + title + "Today & overdue"; **empty state**: 80px circle
     `bg-tertiary-fixed/60 shadow-inner` > 56px white circle > filled `check_circle` 30px cyan + blur glow; "You're all
     caught up" + copy "No pending follow-ups scheduled for today. New outreach triggers will show up here
     automatically." + pill button "Schedule follow-up" (`schedule` icon). Footer "Next scheduled check: 16:00 GMT" +
     `refresh` icon button.
- Interactions implied: time-range switch, card hover lift, bar hover, chart→table toggle, schedule follow-up, refresh.
- Responsive classes: `sm:grid-cols-3 sm:col-span-1 md:flex-row md:items-end md:self-auto lg:grid-cols-7 lg:grid-cols-2 lg:grid-cols-12 lg:col-span-7 lg:col-span-5`.
- External: Google Fonts (Material Symbols ×2 URLs, Inter), Tailwind CDN. **No images.**
- **Reference-only feature claims**: date-range segmented filter (Today/Week/MTD); KPI deltas vs prior period
  (↑4.2%, ↑12%); onboarding **goal** tracking ("Goal +9"); "No Agreement" KPI; "Calls per day: outbound & screening
  volume"; "Manage pipeline stages" (configurable stages); "New outreach triggers… automatically" (automation);
  "Next scheduled check: 16:00 GMT" (a scheduled background check, and GMT not IST); conversion-rate metric.

#### 3.2 Influencers (`influencehub_influencers`)
Active nav: Influencers (static `aria-current`). `main > div.flex.flex-col.w-full.relative` + 2 local orbs.

1. **Header**: h1 "Influencers" + "(1,248)" (body-md secondary) + pill "• Live Pool" (`bg-tertiary-fixed/60
   text-on-tertiary-fixed-variant`, pulsing dot). Right: **Import CSV** (white/80 pill, `upload_file`), **Export**
   (disabled: `bg-surface-container-lowest/40 text-secondary/40 cursor-not-allowed`, `ios_share`), **Add Influencer**
   (black pill). A second "Add Influencer" sits in the global header, so there are two identical CTAs.
2. **Filter bar** `flex-col lg:flex-row`: search pill (`bg-surface-container-lowest/70 backdrop-blur-md rounded-full
   py-2.5 pl-10`, "Search by name, handle, or email..."); **Filters** pill with black count badge "3" (`w-4 h-4
   rounded-full bg-primary text-[10px] font-code`) + `expand_more`; segmented `hidden sm:flex bg-surface-container-high/60
   p-1 rounded-full`: All / Active / Negotiating; right: **Saved views** pill (`bookmarks`) with tag "Q3 High
   Value" (`text-[10px] font-code`) + chevron; view toggle (black circle `table_rows` active / `view_kanban`).
3. **Table card** `bg-surface-container-lowest/75 backdrop-blur-2xl rounded-2xl shadow-[0_8px_32px_0_rgba(14,26,36,0.04)] overflow-hidden`;
   inner `overflow-x-auto`, `table min-w-[1240px]`. Header row `bg-surface-container-low/70 text-secondary font-label-sm uppercase tracking-wider`, cells `py-3.5 px-3`.
   Columns: checkbox (select-all, `accent-primary`) | **Influencer** (sorted ↑, `text-primary`) | Category (sortable
   `unfold_more`) | Primary Account | Platforms | **IG Followers** (right-aligned, sortable) | Phone | Email |
   Location | Stage | Assigned to | Docs | Sync | gear "Configure columns" (`settings`).
   Body `divide-y divide-surface-container text-body-sm`; row `group hover:bg-tertiary-fixed/20`, cells `py-3 px-3`
   (≈64px rows). Cell components: 40px round avatar photo + name (**headline-sm 17px** semibold, large for a table)
   + filled cyan `verified` + handle `font-code text-[11px]`; category pill `px-2 py-0.5 rounded-full text-[11px]
   bg-surface-container-high` (wraps to 2 lines in the screenshot); primary account = coloured dot + name (YouTube
   `bg-error` red, Instagram `bg-secondary`, X `bg-primary`, TikTok `bg-on-tertiary-container`); platform glyphs 16px;
   followers `font-code font-semibold` raw "892,000" (not compact 892K); phone `font-code text-[11px]`; email
   truncate `max-w-[140px]`; stage chip `px-2.5 py-0.5 rounded-full text-[11px] font-semibold shadow-xs` + dot;
   assignee 20px initials circle (`bg-primary`/`bg-secondary`/`bg-surface-container-highest`) + name; docs status
   (`description` filled "Signed", `pending_actions` "Pending", `visibility` "In Review"); sync "⟳ Synced"
   `text-on-tertiary-container font-code`; row action `more_horiz` revealed on hover (`opacity-0 group-hover:opacity-100`,
   hidden from keyboard users).
   Stage values shown: **Content Live, In Negotiation, Brief Sent, Kit Dispatched, Pitch Accepted**. None of these
   are CRM stages (data_gathered / contacted / onboarded / package_sent / delivered / on_hold / rejected).
   Screenshot: at 1280px only up to "Location" is visible; Stage/Assigned/Docs/Sync are off-screen in a hidden-scrollbar scroller.
4. **Pagination footer** `px-space-md py-space-sm bg-surface-container-low/40 backdrop-blur-md`: "Showing 1–5 of
   1,248 influencers"; "Rows per page:" native `<select>` 5/15/50/100 (`hidden sm:flex`); first/prev (disabled
   `text-secondary/40`), page circles `w-8 h-8 rounded-full` (active black), "…", 250, next/last.
5. **3 insight cards** `grid grid-cols-1 md:grid-cols-3 gap-space-md`, `p-space-md rounded-2xl bg-surface-container-lowest/60 backdrop-blur-xl shadow-[0_8px_32px_0_rgba(14,26,36,0.03)]`:
   "ACTIVE DEALS **$248.5K**" +14.2% from last month (`payments` tile `w-12 h-12 rounded-xl bg-tertiary-fixed/60`);
   "CONTRACT COMPLETION **94.8%**" 12 pending execution (`verified_user`); "TOTAL AUDIENCE REACH **38.4M**" Tier 1
   Tech & AI Verticals (`radar`).
- Inline script: select-all/row checkbox toggling adds `bg-tertiary-fixed/30`, sets `indeterminate`.
- Responsive: `sm:flex sm:flex-row sm:items-center sm:self-auto md:flex-row md:items-center md:grid-cols-3 lg:flex-row lg:items-center lg:self-auto`.
- External: Fonts + Tailwind CDN + **5 `lh3.googleusercontent.com/aida-public/…` AI-generated portraits** (with
  `data-alt` prompts, no `alt`).
- Fake data: Sara Chen @saratechstack (San Francisco), Marcus Sterling @marcusproductivity (New York), Dr. Aris
  Thorne @aris_datascience (Cambridge UK), Mia Lindqvist @mialind_design (Stockholm), Koji Tanaka @koji_builds
  (Tokyo); team Alex Lee, Elena Ramos, Tom Cooke; US/UK/SE/JP phone numbers; 1,248 total / 250 pages.
- **Reference-only feature claims**: **Saved views** ("Q3 High Value"); quick segments "Active / Negotiating";
  table↔**kanban view toggle** on this page; **Configure columns**; **Export** (disabled); per-row **Sync** status
  ("Synced", meaning platform sync); **Docs** column with Signed/Pending/In Review states; **verified** creator badges;
  non-CRM stage names (Content Live, Brief Sent, Pitch Accepted…); **Active Deals $ / Contract Completion % /
  Total Audience Reach** insight tiles (deal value tracking, currency USD); "Live Pool" live indicator.

#### 3.3 Onboarded (`influencehub_onboarded`)
Active nav: set by inline script (adds `bg-tertiary-fixed/40 text-primary font-medium shadow-sm` to Onboarded, swaps
chevron to `expand_less`, **injects a nested sub-nav** `ml-6 pl-3 border-l border-surface-container space-y-1`
with rows `py-1.5 px-2.5 rounded-lg text-[12px]`: Instagram 42 (active, `bg-surface-container-lowest/80`),
YouTube 38, TikTok 29, Other (5) 67; counts `font-code text-[10px]`). Uses undefined class `animate-fadeIn`.
`main > div.flex.flex-col.w-full.space-y-space-xl`.

1. **Header**: pill "• LIVE NETWORK STATUS" (`bg-tertiary-fixed/60 text-on-tertiary-container`) + "SYNCED 2M AGO"
   (`font-code text-[11px]`, renders serif); h1 "Onboarded by Platform" (no `font-semibold` here, unlike other
   h1s; the token weight 600 still applies); subtitle "Breakdown of creators active across connected social
   channels and distribution networks." Right: segmented `p-1 bg-surface-container-high/60 backdrop-blur-md
   rounded-2xl`, items `rounded-xl`: **All Channels** / High Growth / Pending Review.
2. **Platform grid** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-gutter` (**invalid class, so there
   is no gap and the cards touch in the screenshot**). 8 cards `group relative flex flex-col justify-between p-6 rounded-[20px] bg-surface-container-lowest/70 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(14,26,36,0.04)] hover:shadow-[0_16px_40px_0_rgba(0,180,240,0.12)] hover:-translate-y-1 cursor-pointer overflow-hidden`.
   Anatomy: 52px brand squircle `rounded-[14px] shadow-md` with official colour (Instagram radial gradient
   `#fdf497 → #fd5949 → #d6249f → #285AEB`; YouTube `#FF0000`; TikTok `#000000` with `#00F2FE`/`#FE2C55` layers;
   Facebook `#1877F2`; Threads `#000000`; Pinterest `#E60023`; LinkedIn `#0A66C2`; Snapchat `#FFFC00`) + inline SVG
   logo; top-right tag (`font-code text-[11px] rounded-full bg-surface-container-high/60 group-hover:bg-tertiary-fixed`)
   + `chevron_right`; platform name `font-headline-md` (22px); count `font-display-lg text-display-lg-mobile font-bold`
   (34px) + "onboarded" label; 4px progress bar `bg-gradient-to-r from-tertiary-fixed-dim to-on-tertiary-container`.
   Data: Instagram 42 "Tier 1" 78%; YouTube 38 "Video" 68%; TikTok 29 "Viral" 52%; Facebook 14 "Social" 25%;
   Threads 18 "Feed" 32%; Pinterest 8 "Visual" 15%; LinkedIn 22 "B2B" 40%; Snapchat 5 "AR" 10%.
   Uses invalid `w-13 h-13` alongside `w-[52px] h-[52px]`.
3. **Summary banner** `mt-space-lg p-6 rounded-[20px] bg-surface-container-lowest/80 backdrop-blur-2xl shadow-[…0.03] flex-col md:flex-row`:
   `hub` tile `w-12 h-12 rounded-2xl bg-tertiary-fixed/50`; "Total Connected Channels" / "8 Platforms • 176 Creator
   Accounts Active"; buttons **Export Audit** (white pill, `download`) and **Connect New Network** (black pill,
   `add_link`), `flex-1 md:flex-none`.
4. **Inset grouped list** "Recent Authentication Syncs" (`history` icon, header strip `px-6 py-4 bg-surface-container-low/40`,
   right "8/8 PLATFORMS HEALTHY" `font-code`); rows `px-6 py-3.5 divide-y divide-surface-container hover:bg-surface-container-lowest/40`:
   cyan dot + "Instagram Graph API v19.0" + "Token refresh executed successfully for 42 handles" + "4m ago";
   "YouTube Data Reporting" + "Batch metrics ingested for creator tier: Partner" + "18m ago"; "TikTok Open Creator
   API" + "Webhook verification ping passed (latency 34ms)" + "1h ago".
- Responsive: `sm:grid-cols-2 lg:grid-cols-4 md:flex-row md:flex-none md:w-auto md:self-auto md:items-end`.
- External: Fonts (Material Symbols URL loaded twice) + Tailwind CDN. No images (logos are inline SVG).
- **Reference-only feature claims**: **connected platform networks / OAuth** ("Connect New Network",
  "Total Connected Channels"); **platform API syncs** (Instagram Graph API token refresh, YouTube Data Reporting
  batch ingest, TikTok Open Creator API webhooks, "8/8 platforms healthy", "Live network status", "Synced 2m ago");
  **Export Audit**; growth segmentation (High Growth / Pending Review); platform tiers/tags (Tier 1, Viral, B2B, AR);
  per-platform progress % against an unspecified target; Threads/Pinterest/LinkedIn/Snapchat as platforms (the app's
  platform list may differ: check `src/lib/platforms.ts`). The app explicitly has **no platform API** ("lookup and sync
  aren't connected to a platform API yet").

#### 3.4 Pipeline (`influencehub_pipeline`)
Active nav: inline script sets Pipeline to `bg-tertiary-fixed/60 text-primary font-medium shadow-sm` + cyan filled icon.
`main > div.flex.flex-col.w-full.gap-space-lg.select-none` (`select-none` blocks text selection on the whole page).

1. **Header**: eyebrow "WORKFLOW ENGINE" (label-sm uppercase tracking-widest semibold) + pulsing cyan dot + "LIVE SYNC ·
   12 ACTIVE CREATORS" (`font-code`, serif); h1 "Pipeline" + pill "12 active" (`bg-surface-container-highest/80`);
   subtitle "Drag and drop creators across lifecycle milestones to synchronize outreach, agreements, and kit
   fulfillment." Right: **metric strip** `bg-surface-container-lowest/60 backdrop-blur-xl p-1.5 rounded-2xl shadow-sm`
   with dividers `w-px h-7`: Est. Reach **3.58M**; Avg. Conversion **18.4%** (cyan); Kits En Route **3**.
2. **Toolbar** `flex flex-wrap p-2 rounded-2xl bg-surface-container-lowest/70 backdrop-blur-2xl shadow-[…0.04]`:
   search trench `bg-surface-container-low/70 rounded-xl shadow-inner` "Search pipeline by name, handle, or tag..."
   + trailing `tune`; segmented `p-0.5 rounded-xl bg-surface-container-low/80` **Stages** (`view_kanban` filled,
   active) / **Grid** (`table_rows`); **Filters** (`filter_list` + cyan dot); **Sort: High Reach** (`swap_vert`);
   divider; **Export** (`ios_share`); **Quick Enlist** black pill (`person_add`). Mix of `rounded-xl` and `rounded-full`.
3. **Kanban board** `relative overflow-x-auto pb-6 pt-1` > `flex items-start gap-space-md min-w-[1360px]` (forces
   horizontal scroll at ≤1360px content width; at the 1280px screenshot the Delivered/On Hold/Rejected columns are off-screen, with no visible scrollbar).
   Column `flex-1 min-w-[240px] rounded-2xl bg-surface-container-lowest/65 backdrop-blur-2xl shadow-[…0.04] p-space-sm`;
   header = 10px glowing dot + title (headline-sm) + 20px count circle.
   **Stage colours (Apple system palette, hard-coded)**: Data Gathered `#8E8E93` (3), Contacted `#007AFF` (4),
   Onboarded `#AF52DE` (2), Welcome Kit `#FF9500` (2), Delivered `#34C759` (1); each dot has a 8px glow
   `shadow-[0_0_8px_rgba(...,0.4)]`. Counts do not match cards shown (3/4/2/2/1 vs 2/2/1/1/1 cards).
   **Creator card** `group relative flex flex-col p-3.5 rounded-2xl bg-surface-container-lowest/90 shadow-[0_4px_20px_rgba(0,180,240,0.06)] hover:shadow-[0_8px_28px_rgba(0,180,240,0.12)] hover:-translate-y-0.5 cursor-grab active:cursor-grabbing`:
   40px **rounded-xl (square-ish) avatar** (round elsewhere) + name label-md semibold + verified + handle `font-code`;
   `more_horiz`; metric row `p-2 rounded-xl bg-surface-container-low/50` (platform glyph + "892K subs" + category
   pill `bg-secondary-fixed/50`); optional status strip; footer = 20px owner avatar photo + name, right meta.
   Card status strips: Contacted/Marcus "Pitch Sent: v2 Deck · Yesterday" (`bg-tertiary-fixed/30`, `mail`) +
   "Follow-up due: 24h"; Contacted/Elena green dot "Replied: Rate Card · 3h ago"; Onboarded/Aris "Contract Signed
   **$4,500 / post**" (`task_alt #34C759`) + "Ready for Kit"; Welcome Kit/Mia amber box `bg-[#FFF8EB]`, text
   `#8F5200`, track `#FFE5B4`, fill `#FF9500` 75%, "Kit Shipped · DHL · 9400 1209 · Expected delivery: Tomorrow, 2
   PM" + "Custom Tier II"; Delivered/Koji pill `bg-[#E8F8EE] text-[#1E7E34]` "Delivered", "Unboxing Video · Posted",
   "142K views". Data Gathered/Sara "Audited"; Alex Vance "Unassigned · Added 2d ago".
   Column add/drop affordances: dashed "＋ Add Creator Card" (`border-dashed border-outline-variant/60 rounded-xl`);
   "Drop negotiated creators here" (`move_to_inbox`, dashed, `py-6`).
   **Collapsed side-stage drawers** `w-14 self-stretch rounded-2xl bg-surface-container-lowest/50` with vertical
   text (`[writing-mode:vertical-rl] rotate-180`): **On Hold** (`bg-outline` dot, 2) and **Rejected** (`#FF3B30`
   dot, 1), each with a `chevron_left` expand button.
4. **Automation banner** `p-space-md rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl shadow-sm`:
   `auto_awesome` tile `bg-tertiary-fixed`; "Smart Lifecycle Automation": "Dragging a creator into "Welcome Kit"
   automatically triggers logistics dispatch & kit inventory reservation."; buttons **Configure Automations**
   (`rounded-xl bg-surface-container-low`) and **Sync to Notion / Airtable** (black, `rounded-xl`, not a pill).
- Responsive: `sm:block md:flex-row lg:flex-row lg:items-end` only.
- External: Fonts (Material Symbols ×2) + Tailwind CDN + **12 lh3 images** (7 creator portraits, 5 team-member avatars).
- Fake data: Sara Chen, Alex Vance @vance_hardware, Marcus Sterling, Elena Rostova @elena_devsec, Dr. Aris Thorne,
  Mia Lindqvist, Koji Tanaka; owners Liam D., Chloë K., Kenji T.; DHL 9400 1209; $4,500/post; 142K views.
- **Reference-only feature claims**: **pipeline automation** ("Smart Lifecycle Automation", "Configure Automations",
  auto logistics dispatch + **kit inventory reservation**); **Sync to Notion / Airtable**; **Quick Enlist**; "Live
  sync"; header KPIs **Est. Reach / Avg. Conversion / Kits En Route**; Stages↔Grid view; Sort by reach; per-card
  **email/pitch tracking** ("Pitch Sent: v2 Deck", "Replied: Rate Card"); **contract value** ($4,500/post);
  **courier tracking + ETA progress** on cards; **content verification + view counts** ("Unboxing Video Posted, 142K
  views"); "Audited" flag; "Custom Tier II"; "Add Creator Card" inside a column; drag and drop (the app does use
  dnd-kit, but the stage-move rules/modals via `useStageMover` must still apply).

#### 3.5 Calls & Follow-ups (`influencehub_calls_follow_ups`)
Active nav: inline script sets `bg-tertiary-fixed/60 text-primary font-semibold shadow-sm` + cyan filled icon.
`main > div > div.max-w-[1440px].w-full.mx-auto.space-y-space-lg` (only screen with 1440 cap).

1. **Header**: breadcrumb-like eyebrow "OUTREACH CADENCE / UTC +05:30" (the offset is a cyan code pill
   `bg-tertiary-fixed/30 rounded-full`); h1 "Calls & Follow-ups"; subtitle "Every scheduled call and pending
   touchpoint is shown in Indian Standard Time (IST)." Right: metric cluster `bg-surface-container-lowest/80
   backdrop-blur-xl p-1.5 rounded-2xl shadow-sm`: "• Dial Queue **4 Due**" (tile `rounded-xl bg-surface-container-low/70`)
   | `timer` "Average TAT **18m**".
2. **Filter dock** `bg-surface-container-lowest/70 backdrop-blur-2xl p-space-sm rounded-2xl shadow-sm flex-col lg:flex-row`:
   segmented tabs `inline-flex p-1 bg-surface-container-high/60 rounded-xl overflow-x-auto`, buttons `.tab-btn px-4
   py-2 rounded-lg`: **Due today** `4` (count chip `bg-tertiary-fixed text-on-tertiary-fixed`), **Overdue** `1`
   (`bg-error-container text-on-error-container`), **Upcoming** `8`, **History** `26` (grey chips; counts `font-code`
   so they render serif). Right: filter input "Filter by owner or handle..." (`filter_list`, `rounded-xl shadow-inner`,
   `min-w-[220px]`); **iOS switch** "Only my follow-ups" (`w-12 h-7` track, `after:` 24px thumb,
   `peer-checked:bg-on-tertiary-container`; checked).
3. **Table card** `bg-surface-container-lowest/80 backdrop-blur-2xl rounded-[20px] shadow-[…0.04] overflow-hidden`:
   - Utility strip `px-space-lg py-space-md bg-surface-container-low/40`: select-all checkbox + "SELECT ALL ON PAGE";
     "|" divider; "Showing **4** priority syncs scheduled for today"; buttons **Sync with Calendar**
     (`calendar_today`) and **Export CSV** (`download`), `rounded-xl bg-surface-container-lowest shadow-sm`.
   - Table (no min-width): header `bg-surface-container-low/20 uppercase label-sm`, `scope="col"`, sr-only
     "Selection"; columns: checkbox | Influencer | Contact / Phone | Last Outcome | Follow-Up (IST) | Owner | Quick Actions.
     Rows `py-4 hover:bg-surface-container-low/50`: 40px round avatar + name (headline-sm) + verified + handle (body-sm,
     not code here, unlike Influencers); phone chip `font-code bg-surface-container-low/70 rounded-lg` with `call` icon
     (in the screenshot it **wraps to 4 lines**, because it has no `whitespace-nowrap`); outcome pill `px-3 py-1 rounded-full
     max-w-[240px] truncate` coloured by sentiment (cyan `bg-tertiary-fixed/30` "Brief shared, interested in Q2
     sponsor"; grey "Requested custom DevKit hardware"; blue-grey `bg-secondary-fixed` "Agreed to 1x dedicated
     YouTube"; red `bg-error-container/60` "Awaiting technical review from legal"); follow-up "`schedule` 3:30 PM IST"
     + relative "Today, in 42 mins"; owner 24px initials + name; actions: `phone_in_talk` "Initiate Instant Call"
     (hover cyan fill, white icon), `edit_note` "Add Note / Log Call", `more_vert` (all `p-2 rounded-xl`, the 3rd is
     cut off in the screenshot).
   - Footer `bg-surface-container-low/30 border-t border-surface-container/40`: `info` "Calls dialed via InfluenceHub
     bridge provide automatic recording & AI transcription." + **Customize Table Columns** (`tune`).
4. **Bottom grid** `grid-cols-1 lg:grid-cols-3 gap-space-lg`:
   - **WebRTC Bridge** card (`rounded-[20px] p-space-lg`): `headset_mic`; "Ready" chip (`font-code`); "Direct
     high-fidelity SIP outbound calling. No external cellular hardware required."; "• Audio Engine connected";
     black pill **Dialpad** (uses invalid `active:scale-98`).
   - **Weekly Pipeline Velocity** (`lg:col-span-2`): "IST Conversion outcome rates from call touches."; legend
     squares Positive Outcome (78%) cyan / Rescheduled (22%) grey (only one series is drawn); SVG sparkline
     viewBox 600×64 `#008ebe` 2.5px + gradient `cyanSpark`, 4 point markers; x labels Mon…Fri, "Today (IST)".
     No "show as table".
- Inline script: forces sidebar active state; select-all; tab switching (visual only).
- Responsive: `sm:flex-nowrap md:flex-row md:items-end md:self-auto lg:flex-row lg:items-center lg:justify-end lg:grid-cols-3 lg:col-span-2`.
- External: Fonts (Material Symbols ×2) + Tailwind CDN + **4 lh3 portraits**.
- Fake data: Sara Chen, Marcus Sterling, Koji Tanaka, Dr. Aris Thorne; owners Alex Lee, Elena Ramos, Tom Cooke;
  times 3:30/5:00/6:15/7:45 PM IST; counts 4/1/8/26; TAT 18m.
- **Reference-only feature claims**: **in-app calling / WebRTC SIP bridge / Dialpad / "Initiate Instant Call"**;
  **call recording & AI transcription**; **Sync with Calendar** (calendar integration); **Export CSV** of calls;
  **Average TAT** metric and "Dial Queue"; **Weekly Pipeline Velocity** chart with outcome rates; **Customize
  Table Columns**; History tab with counts. (Log Call, due/overdue/upcoming and "only mine" are plausible CRM
  features; the app has a Log Call dialog in `features/calls`.)

#### 3.6 Documents (`influencehub_documents`)
Active nav: inline script `bg-tertiary-fixed/60 text-primary font-medium shadow-sm` + cyan filled icon.
`main > div.flex.flex-col.w-full.space-y-space-lg`.

1. **Header**: h1 "Documents" + count pill "24" (`bg-secondary-container/60 text-on-secondary-fixed`); subtitle
   "Contracts, NDAs, creative briefs, and tax forms associated with onboarded creators." Right: **Audit Trail**
   (white pill, `history`), **Upload** black pill with `expand_more` → dropdown (`hidden absolute right-0 mt-2 w-52
   rounded-2xl bg-surface-container-lowest/90 backdrop-blur-2xl shadow-xl p-1.5 z-50`, items `px-3 py-2 rounded-xl
   hover:bg-tertiary-fixed/30`): Upload Contract / SOW (`description`), Upload Executed NDA (`draw`), Campaign
   Brief Form (`article`), divider, **Sync from DocuSign** (`cloud_sync`). Upload hover is `hover:bg-primary-container` (#181c1f).
2. **4 stat cards** `grid sm:grid-cols-2 lg:grid-cols-4 gap-space-md`, `bg-surface-container-lowest/65 backdrop-blur-2xl
   rounded-2xl p-space-md shadow-sm`, label-sm uppercase + value headline-md **bold** + unit + 40px icon tile
   `rounded-xl`: STORAGE USED **48.2** MB of 5 GB (`folder_data`); FULLY VERIFIED **19** 79.1% (`verified`);
   PENDING ACTION **5** Review queue (`pending_actions`); AVG CLEARANCE **1.8** Business Days (`speed`).
3. **Category segmented tabs** `#category-tabs inline-flex p-1 rounded-2xl bg-surface-container-highest/50 shadow-inner`,
   `.tab-pill px-3.5 py-1.5 rounded-xl`: All Documents 24 / Contracts & SOWs 14 / Creative Briefs 6 / Tax & W-9 4.
   Right: icon buttons `w-8 h-8 rounded-lg` "Download Selected Batch" (`file_download`), "View Options" (`view_column`).
4. **Search bar card** `rounded-2xl p-space-sm`: input `#doc-search-input` "Search documents, creators, file names,
   or signees..." (`rounded-xl focus:ring-1`), **All Document Types** dropdown (`layers`), **Filters** (`tune` + cyan dot).
5. **Table card** `rounded-[20px] bg-surface-container-lowest/70 backdrop-blur-2xl shadow-[…0.04]`:
   context strip "SHOWING **5 of 24 Documents**" + "• Auto-indexed via secure cloud vault"; columns: checkbox (14px) |
   Creator (32px avatar + name label-md + handle) | Document Type (pill `bg-secondary-fixed/50`, wraps to 2–3 lines) |
   Period / Signed Date (`calendar_today` "Signed Oct 14, 2024"; `send`-style "Sent Oct 20, 2024"; hourglass "Pending
   Review") | File Name & Size (`picture_as_pdf text-error` + filename `truncate max-w-[190px]` + size) | Uploaded By
   (20px initials + name) | Status (pill `bg-surface-container` + dot **`#10b981`** Verified / cyan Active /
   **`#f59e0b`** Pending) | Actions (`visibility` Preview, `download`, `more_vert`; Actions header + the 2nd/3rd buttons
   are cut off at 1280px).
   Rows: Sara Chen MSA & SOW DevSecOps_SOW_Signed.pdf 1.4 MB; Marcus Sterling Master Service Agreement
   Q4_Retainer_Contract.pdf 890 KB; Koji Tanaka Creative Brief v2 Kubernetes_Sponsor_Brief.pdf 2.1 MB; Dr. Aris Thorne
   Mutual NDA Mutual_NDA_Executed.pdf 420 KB; Mia Lindqvist W-8BEN Tax Form Tax_Form_Signed.pdf 650 KB (uploader
   "Sarah Jenkins").
   Pagination: "Showing records 1–5 of 24", prev (disabled), `w-7 h-7 rounded-lg` 1/2/3 (active white + shadow, not
   black as on Influencers), next.
6. **3 inset cards** `grid lg:grid-cols-3 gap-space-md`, `rounded-2xl p-space-md`:
   **ESIGN & UETA Compliant** (`verified_user`): "All contracts executed via InfluenceHub carry cryptographic audit
   certificates with IP verification and dual-key signatures." + "Vault Hash ID: 0x8f2a...98b1"; **Bulk Operations**
   (`batch_prediction`): "Export verified tax documentation directly to Intuit or download unified zip bundles…" +
   buttons Export W-9 CSV / Download ZIP (`rounded-xl bg-surface-container`); **Secure Vault** "Encrypted AES-256
   Cloud" + SVG ring gauge 24% + "Renewal Cycle: Auto-renews Dec 2025".
- Inline scripts: sidebar active; upload dropdown toggle; tab switching; **"/" focuses the page search**
  (conflicts with the header's "/" kbd hint for the global search).
- Responsive: `sm:flex-row sm:items-center sm:self-auto sm:grid-cols-2 md:flex-row md:items-end md:self-auto md:w-auto lg:grid-cols-4 lg:grid-cols-3`.
- External: Fonts (Material Symbols ×2) + Tailwind CDN + **5 lh3 portraits**.
- **Reference-only feature claims**: **Audit Trail**; **Sync from DocuSign** (e-signature integration); **e-sign
  compliance (ESIGN/UETA), cryptographic audit certificates, IP verification, dual-key signatures, Vault Hash ID**;
  **Secure Vault / AES-256 / storage quota (48.2 MB of 5 GB) / auto-renew subscription**; **Export to Intuit**, Export
  W-9 CSV, Download ZIP bulk ops; **document verification workflow** (Verified/Active/Pending, "Fully verified 79.1%",
  "Pending action review queue", "Avg clearance 1.8 business days"); document categories Contracts & SOWs / Creative
  Briefs / Tax & W-9 (US tax forms; the app's documents are insights summaries and agreements, see
  `docs/dates-and-documents.md`); "Campaign Brief Form"; batch download of selected rows; "Auto-indexed via secure
  cloud vault". Dates are "Oct 14, 2024" (US format; the app requires dd/MM/yyyy).

#### 3.7 Possible Duplicates (`influencehub_possible_duplicates`)
Active nav: inline script sets **full `bg-tertiary-fixed`** (100%, stronger than every other screen) + `font-semibold` +
cyan filled icon. `main > div > div.relative.w-full.max-w-7xl.mx-auto.flex.flex-col.min-h-[calc(100vh-7rem)].justify-between`.

1. **Header**: eyebrow "ROSTER INTEGRITY / VERIFIED" (VERIFIED in `font-code tracking-widest text-on-tertiary-container`,
   but in the screenshot it renders sans; the `font-label-sm` class comes later in the cascade); h1 "Possible Duplicates" +
   count pill "0" (`bg-surface-container-low shadow-sm`); subtitle "Potential duplicate creator profiles detected
   across automated scraper imports and manual entries awaiting review." Right: segmented `p-1 rounded-xl
   bg-surface-container-low/70` **Exact Match** / Fuzzy Identity (labels wrap to 2 lines at 1280px); **Scan Now**
   (`sync`, `rounded-xl`, also wraps).
2. **Empty-state canvas** `flex-1 flex flex-col items-center justify-center p-space-xl rounded-[20px] bg-surface-container-lowest/65 backdrop-blur-2xl shadow-[…0.04] min-h-[460px] overflow-hidden`
   with a 1px top specular line (`bg-gradient-to-r from-transparent via-surface-container-lowest to-transparent`):
   glass squircle icon `w-24 h-24 rounded-[24px] bg-surface-container-lowest/80 backdrop-blur-2xl shadow-[0_16px_40px_rgba(14,26,36,0.06),0_2px_8px_rgba(14,26,36,0.04)]`
   + white gradient rim + halo `bg-tertiary-fixed-dim/30 blur-2xl`; icons `content_copy` 36px + filled
   `check_circle` 20px cyan badge (`drop-shadow-[0_2px_4px_rgba(0,142,190,0.3)]`); hover scale/translate.
   Title "No possible duplicates" (headline-md); copy "All creator handles, contact emails, and social profiles in
   your workspace are unique. Newly scanned profiles will be deduplicated against the master roster automatically.";
   status pill with `animate-ping` dot "Deduplication Engine Active • 0 in quarantine". Bottom strip (absolute,
   `opacity-70`): `security` "Heuristic ruleset: Handle syntax, fuzzy bio comparison, Instagram ID, YouTube UID" +
   "Synced 2m ago" (`font-code`, serif).
3. **3 meta cards** `grid md:grid-cols-3 gap-space-gutter` (**invalid gap class**; in the screenshot the cards touch),
   `p-space-md rounded-[20px] …/65 backdrop-blur-2xl shadow-sm` + 36px icon tile `rounded-xl bg-surface-container-low`:
   MATCHING THRESHOLD **92% Confidence** "Handles with similarity ≥ 92% flagged" (`tune`); SCANNED SOURCES **4
   Channels** "Instagram, TikTok, YouTube, CSV Imports" (`hub`); AUTO-MERGE STRATEGY **Human Review** "Zero
   automatic destructive merges" (`how_to_reg`).
- Only the empty state is designed: **no design for the populated list or the duplicate pair/merge comparison**,
  which is the main job of this screen (the app has `DuplicateWarning` / `MergeDialog`).
- Responsive: `sm:flex-row sm:mt-0 md:flex-row md:items-end md:grid-cols-3`.
- External: Fonts (Material Symbols ×2) + Tailwind CDN. No images.
- **Reference-only feature claims**: **deduplication engine** running continuously ("Engine Active", "Synced 2m
  ago", "0 in quarantine" = a **quarantine** state); **Scan Now** manual reconciliation; **Exact Match vs Fuzzy
  Identity** modes; **confidence threshold 92%** (configurable, `tune`); **heuristic ruleset** (fuzzy bio comparison,
  Instagram ID, YouTube UID); **scraper imports**; scanned-sources config; **auto-merge strategy** setting.

#### 3.8 Unassigned Pool (`influencehub_unassigned_pool`)
Active nav: static `aria-current` + `bg-tertiary-fixed/40`. `main > div.flex.flex-col.w-full.max-w-[1400px].mx-auto.space-y-space-lg`.

1. **Header**: two pills "QUEUE STATUS • SYNCED" (`bg-secondary-fixed/50 font-code uppercase`, renders serif) and
   "Live Stream" (`bg-surface-container-high`); h1 "Unassigned Pool" + "(0)" (headline-sm secondary normal);
   subtitle "Creators discovered and imported awaiting assignment to account leads." Right: **Routing Logs** (white
   pill, `history`), **Import CSV** black pill (`file_upload`), both `py-2.5`.
2. **Filter bar** `bg-surface-container-lowest/70 backdrop-blur-2xl p-2 rounded-2xl shadow-[…0.03]`: search pill
   "Search unassigned pool..." with `<kbd>⌘K</kbd>` (**different shortcut from the header's "/"**, and Mac-only);
   platform segmented `bg-surface-container-low/70 p-1 rounded-full`: All / TikTok / Instagram / YouTube; **Filters**
   (count "3" on `bg-tertiary-fixed`, which differs from the black badge on Influencers); **Sort: Recently Scraped**
   (`hidden md:inline` label); refresh icon button `w-9 h-9 rounded-full` (`sync`).
3. **Table card** `rounded-[20px] …/70 backdrop-blur-2xl shadow-[…0.04] overflow-hidden`, `table min-w-[1100px]`;
   header `bg-surface-container-low/60`: disabled checkbox | Influencer | Category | Primary Account | Platforms |
   Total Followers | Phone | City | State | Country | Stage | Actions (City/State/Country split here vs a single
   "Location" on Influencers; "Total Followers" here vs "IG Followers" there).
   **Empty state row** `td colspan=12 py-20`: halo `bg-tertiary-fixed blur-3xl opacity-60`; 80px circle
   `bg-secondary-fixed/50 shadow-inner` > 56px white circle > `move_to_inbox` 30px (`'wght' 300`); odd corner badge
   `arrow_back_ios_new` (renders as a "<" chevron); "The pool is empty" (headline-sm); copy "All discovered
   influencers have been assigned to team members. Newly discovered talent from social scrapers or discovery
   pipelines will land here automatically."; CTAs **Import Discovered Creators** (black pill `px-6 py-3
   shadow-[0_4px_16px_rgba(5,8,11,0.18)]`, `person_add`) + **Open Discovery Hub** (`explore`, `bg-surface-container-low`);
   footnote pill "• Auto-assignment engine: Active (Next sync in 4m 12s)" (`font-code`, serif).
   Footer `px-6 py-3.5 bg-surface-container-low/40`: "Showing 0 of 0 creators • 0 selected"; "Rows per page: 25";
   disabled prev/next `w-8 h-8 rounded-lg opacity-40`; "Page 1 of 1".
4. **3 context cards** `grid md:grid-cols-3 gap-space-md`, `rounded-2xl p-space-md bg-surface-container-lowest/60
   backdrop-blur-xl shadow-[0_4px_20px_0_rgba(14,26,36,0.02)]` + 40px icon tile: **Active Scraping Crawlers**
   (`radar`) "Crawling Instagram and TikTok tags #TechStyle and #MinimalHome."; **Direct Routing Policy**
   "Round-robin" (`alt_route`) "Creators with >50K followers route instantly to Senior Brand Leads."; **Deduplication
   Gate** "Zero Dups" (`fingerprint`) "Fuzzy handle matching is screening 14 prospective profiles in quarantine." (this
   contradicts the Duplicates screen's "0 in quarantine").
- Only the empty state is designed: **no populated pool rows, no claim/assign/bulk-claim actions** (the app has
  `usePoolActions`, `PoolPreview`, `ReleaseDialog`).
- Responsive: `sm:flex-row sm:items-center sm:pb-0 md:flex-row md:items-end md:self-auto md:inline md:grid-cols-3`.
- External: Fonts + Tailwind CDN. No images.
- **Reference-only feature claims**: **social scraping crawlers** (hashtag crawling); **Discovery Hub**; **Import
  Discovered Creators**; **auto-assignment engine with sync countdown**; **routing policy** (round-robin, follower
  threshold → "Senior Brand Leads"); **Routing Logs**; **dedupe quarantine**; "Live Stream" / "Queue status synced";
  **⌘K command palette** hint; Sort "Recently Scraped".

#### 3.9 Welcome Kits (`influencehub_welcome_kits`)
Active nav: inline script **resets every nav link's className** (which removes `justify-between` from Onboarded, so
its chevron jumps next to the label; visible in screen.png) then sets `bg-tertiary-fixed/60` + cyan filled icon.
`main > div.flex.flex-col.w-full` (no max width).

1. **Header** (`md:items-center`, unlike `md:items-end` elsewhere): h1 "Welcome Kits" in **`text-on-surface`**
   (`#1a1c1c`; other h1s use `text-primary` `#000`) + count pill "19"; subtitle "Track creator seeding bundles,
   unboxing merchandise, and shipment delivery statuses." Right: **Export Manifest** (white pill, `file_download`),
   **Create Welcome Kit** black pill (`add`).
2. **3 KPI cards** `grid md:grid-cols-3 gap-space-gutter` (**invalid; the cards touch**), `rounded-[20px] …/65
   backdrop-blur-2xl p-space-lg shadow-sm hover:shadow-md`: label label-md + 32px round icon; value
   **`font-display-lg text-display-lg` 48px bold** (the only use of 48px in the package) + tag; meta row; 6px progress bar.
   Kits in Transit **12** "Active Logistics" (cyan pill, pulsing) · "8 reaching by Friday" · "66% on track" (cyan bar);
   Delivered & Verified **34** "+4 this week" · "Unboxing rate 92% confirmed" (black bar); Awaiting Dispatch **5**
   "Pack pending" (`bg-error-container/60`) · "Stock allocation / Ready in warehouse" (grey bar 40%).
3. **Filter row** `flex-col lg:flex-row`: search `rounded-xl bg-surface-container-lowest/70 backdrop-blur-xl`
   "Search welcome kits, influencer…" (placeholder truncated at 1280px); segmented `p-1 bg-surface-container/60
   rounded-xl`: All Kits / Active Dispatches / Delivered; **Filters** "2"; **Status: All Statuses**; **Courier: All
   Couriers** (all `rounded-xl`, labels `text-label-sm`).
4. **Table card** `rounded-[20px] …/70 backdrop-blur-2xl shadow-sm`: columns checkbox | Influencer (36px avatar +
   name label-md + handle body-sm) | Items / Bundle (name + 11px item list) | Status (pill: In Transit cyan
   `bg-tertiary-fixed/40`; Preparing grey; Delivered appears greyed/disabled in the screenshot) | Courier (icon
   `flight_takeoff`/`local_shipping` + "FedEx Priority", "DHL Express", "UPS Ground", "FedEx Int") | Tracking #
   (`font-code rounded-md bg-surface-container-low select-all`, wraps to 2 lines, serif) | Sent Date ("Oct 22, 2024") |
   Delivered Date ("Est. Tomorrow" cyan, "Est. Oct 26", italic "Pending pickup", "Oct 22, 2024") | Actions ("View
   Tracking ↗" pill, off-screen at 1280px).
   Rows: Sara Chen @sarachen.dev DevKit Pro Bundle v2 (Mech keyboard + mic + Desk Mat) #FX-98210492; Liam Vance
   @vanceaudio Audio Creator Swag Kit #DHL-4892019; Mia Lindqvist @mialind Designer Swag Box v3 #UPS-7482910; Koji
   Tanaka @tanaka.cloud Cloud Infra VIP Pack #FX-8392819; Dr. Aris Thorne @aris_thorne Data Science Workstation Kit
   #DHL-938210. Handles differ from the other screens (@saratechstack, @mialind_design, @koji_builds, @aris_datascience).
   Pagination "Showing 1 - 5 of 19 welcome kits", `rounded-md` page chips 1–4 (active white), `w-8 h-8 rounded-lg` arrows.
5. **Bottom grid** `lg:grid-cols-2 gap-space-gutter` (invalid gap):
   **Warehouse Kit Stock** (`package_2`, "Real-time sync"): inset rows `p-3 rounded-xl bg-surface-container-low/40`:
   Custom Mechanical Keyboards **42** In Stock (`keyboard`); Studio Reference Monitors **18** In Stock (`headphones`);
   InfluenceHub Heavyweight Hoodies **88** High supply (`apparel`).
   **Scheduled Courier Pickups** (`markunread_mailbox`, "Today" pill): "Couriers arrive daily at **4:30 PM EST**. The
   following 5 batches are currently queued for automatic label generation and packaging."; tiles FEDEX SCHEDULED
   **2 Kits** Cutoff 3:45 PM / DHL EXPRESS **3 Kits** Cutoff 4:15 PM; footer "All packing slips auto-printed" +
   **Manage Pickups ›**.
- Responsive: `sm:flex-row md:flex-row md:items-center md:self-auto md:grid-cols-3 lg:flex-row lg:items-center lg:grid-cols-2`.
- External: Fonts (Material Symbols ×2) + Tailwind CDN + **5 lh3 portraits**.
- **Reference-only feature claims**: **kit bundles/items catalogue** ("Create Welcome Kit", bundle contents);
  **warehouse inventory / stock levels with real-time sync**; **courier integration** (FedEx/DHL/UPS, tracking numbers,
  "View Tracking", ETAs, "8 reaching by Friday", "66% on track"); **scheduled courier pickups, cutoffs, automatic label
  generation, auto-printed packing slips, Manage Pickups**; **unboxing verification rate**; **Export Manifest**;
  status/courier filters. The CRM's equivalent is the **package** (stage `package_sent`, Package drawer in
  `features/packages`), with no warehouse, courier or label features. The naming "Welcome Kit" itself differs from
  the app's "package".

---

### 4. Cross-screen inconsistencies

**Shell / navigation**
- Active nav styling has **four variants**: `bg-tertiary-fixed/40 font-medium` with outline icon (Dashboard,
  Influencers, Pool static; Onboarded via script); `bg-tertiary-fixed/60 font-medium` + filled cyan icon (Pipeline,
  Documents, Welcome Kits); `/60 font-semibold` + filled cyan icon (Calls); `bg-tertiary-fixed` 100% + semibold +
  filled cyan icon (Duplicates). `aria-current="page"` is present only on Dashboard, Influencers and Unassigned Pool.
- Six screens fix the sidebar with JS DOM rewrites (Calls, Documents, Onboarded, Pipeline, Duplicates, Welcome
  Kits); Welcome Kits' rewrite breaks the Onboarded row layout; only Onboarded shows the expanded sub-nav.
- Global-search shortcut hint "/" (header) vs "⌘K" (Pool search); Documents binds "/" to its own page search.
- "Add Influencer" appears both in the header and as a page CTA (Influencers); other pages put a different black
  CTA next to the header's black CTA, so there are two competing primary buttons on every page (Import CSV, Upload, Create
  Welcome Kit, Quick Enlist, Connect New Network).
- Content max-width: none (Dashboard, Influencers, Onboarded, Pipeline, Documents, Welcome Kits), `1440px`
  (Calls), `1400px` (Pool), `max-w-7xl` 1280px (Duplicates).
- Vertical rhythm of the page wrapper: `space-y-space-lg` (24px), `space-y-space-xl` (32px, Onboarded),
  `gap-space-lg` (Pipeline), manual `mb-space-xl`/`mb-space-lg` (Influencers, Welcome Kits, Duplicates).

**Page headers**
- Eyebrows differ on every screen ("OPERATIONAL INTELLIGENCE", "LIVE NETWORK STATUS / SYNCED 2M AGO", "WORKFLOW
  ENGINE · LIVE SYNC", "OUTREACH CADENCE / UTC +05:30", "ROSTER INTEGRITY / VERIFIED", "QUEUE STATUS • SYNCED / Live
  Stream"; none on Influencers, Documents, Welcome Kits).
- Count indicator styles: "(1,248)" text (Influencers), "(0)" headline-sm (Pool), pill `bg-surface-container-highest`
  (Welcome Kits "19"), pill `bg-secondary-container/60` (Documents "24"), pill `bg-surface-container-low shadow-sm`
  (Duplicates "0"), pill "12 active" (Pipeline), none (Calls, Onboarded).
- h1 colour `text-primary` (#000) everywhere except Welcome Kits (`text-on-surface` #1a1c1c); `font-semibold` missing
  on Onboarded/Documents h1 (token weight 600 still applies).
- Header alignment `md:items-end` vs `md:items-center` (Influencers, Welcome Kits).

**Cards**
- Radius: `rounded-2xl` (16px) vs `rounded-[20px]`, sometimes within the same page (Calls: dock `rounded-2xl`, table
  `rounded-[20px]`; Documents: stats `rounded-2xl`, table `rounded-[20px]`).
- Fill opacity: /60, /65, /70, /75, /80, /90 with no rule. Blur: `backdrop-blur-2xl` (40px), `-xl` (24px), `-md`
  (12px), `-sm`.
- Shadow: `shadow-[0_8px_32px_0_rgba(14,26,36,0.04)]`, `…0.03`, `shadow-[0_4px_20px_0_rgba(14,26,36,0.02)]`,
  Tailwind `shadow-sm`, `shadow-md`; hover: `…0.08` lift, cyan glow `rgba(0,180,240,0.12)`, `shadow-md`.
- Padding: `p-space-md` (16), `p-space-lg` (24), `p-6` (24), `p-3.5` (14) for comparable tiles.
- KPI tile anatomy differs on every page: dashboard (label/sub-label/dot/divider/value), Documents (uppercase label
  + bold value + icon tile right), Influencers insights (uppercase label + value + delta + 48px icon tile), Welcome
  Kits (label + icon circle + **48px** value + tag + progress), Pipeline (inline strip), Calls (pill cluster),
  Duplicates (uppercase label + headline-sm value + icon). KPI value sizes: 22px (dashboard, Documents, Influencers),
  17px (Pipeline, Duplicates), 34px (Onboarded), 48px (Welcome Kits).

**Controls**
- Segmented controls: pill track/pill items (Dashboard, Influencers, Pool), `rounded-2xl` track/`rounded-xl`
  items (Onboarded, Documents), `rounded-xl` track/`rounded-lg` items (Pipeline, Calls, Welcome Kits, Duplicates).
  Track colours: `surface-container-low/80`, `-high/60`, `-highest/50`, `surface-container/60`.
- Toolbar buttons: pills (Influencers, Pool, header) vs `rounded-xl` (Pipeline, Documents, Welcome Kits, Calls,
  Duplicates). Black CTAs are pills except Pipeline's "Sync to Notion / Airtable" (`rounded-xl`).
- Filter count badges: black circle (Influencers), cyan `tertiary-fixed` (Pool), grey (Welcome Kits), dot only
  (Pipeline, Documents).
- Pagination: black active circle `rounded-full` (Influencers), white active `rounded-lg` square (Documents), white
  `rounded-md` chip (Welcome Kits), text "Page 1 of 1" (Pool); rows-per-page as a native select (Influencers) vs
  static text (Pool).
- Search inputs: `rounded-xl` (header, Pipeline, Documents, Calls, Welcome Kits) vs `rounded-full` (Influencers, Pool);
  focus ring present only on header/Documents search.
- Checkbox sizes 16px vs 14px (Documents).

**Tables**
- Avatar sizes 40px (Influencers, Calls), 36px (Welcome Kits), 32px (Documents), and 40px `rounded-xl` squares
  (Pipeline cards). Name sizes 17px headline-sm (Influencers, Calls) vs 13px label-md (Documents, Welcome Kits,
  Pipeline). Handles in `font-code` (Influencers, Pipeline) vs body-sm (Calls, Documents, Welcome Kits).
- Header fills `bg-surface-container-low/20`, `/40`, `/60`, `/70`. Row hover `tertiary-fixed/20` vs
  `surface-container-low/50` vs `surface-container-lowest/90`. Row heights ≈ 64–76px.
- Same column, different name: "IG Followers" (Influencers) vs "Total Followers" (Pool); "Location" vs
  City/State/Country; "Assigned to" vs "Owner" vs "Uploaded By".
- Followers formatting: raw "892,000" in the Influencers table vs compact "892K" in Pipeline (the app rule is 12.4K / 1.2M).
- Row actions: hover-only `more_horiz` (Influencers) vs always-visible icon buttons (Calls, Documents) vs text
  pill "View Tracking" (Welcome Kits).

**Colour drift**
- **Three stage palettes**: Dashboard (black→graded black opacity, Delivered cyan, On Hold `secondary`, Rejected
  `outline`); Pipeline (Apple `#8E8E93/#007AFF/#AF52DE/#FF9500/#34C759/#FF3B30`); Influencers (stage chips in cyan/grey
  tints with unrelated stage names). The app requires "same stage colors everywhere".
- Success green: `#34C759`/`#1E7E34`/`#E8F8EE` (Pipeline), `#10b981` (Documents), none in tokens. Warning amber:
  `#FF9500`/`#8F5200`/`#FFF8EB`/`#FFE5B4` (Pipeline), `#f59e0b` (Documents). Neither is in the Tailwind config.
- Platform colour dots in Influencers: YouTube = `bg-error` (red), Instagram = `secondary`, X = `primary`, TikTok =
  cyan. They are arbitrary token reuse, not brand colours, and differ from Onboarded's real brand colours.
- Cyan text uses `#008ebe` (3.7:1 on white, fails AA for small text) throughout: links, deltas, "Synced", counts.

**Data / copy drift**
- Same creators with different handles: Sara Chen @saratechstack vs @sarachen.dev; Mia @mialind_design vs @mialind;
  Koji @koji_builds vs @tanaka.cloud; Aris @aris_datascience vs @aris_thorne.
- Team members: Alex Lee / Elena Ramos / Tom Cooke (Influencers, Calls, Documents) vs Liam D. / Chloë K. / Kenji T.
  (Pipeline) vs Sarah Jenkins (Documents).
- Time zones: "16:00 GMT" (Dashboard), "IST / UTC +05:30" (Calls), "4:30 PM EST" (Welcome Kits). Date formats "Oct 14,
  2024" (US) everywhere; no dd/MM/yyyy.
- Counts: Dashboard Unassigned Pool KPI **24** vs Pool page **(0)**; Welcome Kits in transit 19 (dashboard) vs 12
  (Welcome Kits page) vs "Kits En Route 3" (Pipeline); quarantine 0 (Duplicates) vs 14 (Pool).
- Stage names: "Welcome Kit" (Dashboard/Pipeline) vs app `package_sent`; Influencers uses non-stage statuses.
- Currency USD ($248.5K, $4,500/post) and US tax forms (W-9, W-8BEN) while the app is IST-based.

---

### 5. External resources, hard-coded data, and build hygiene

| Screen | Google Fonts (Material Symbols) | Google Fonts (Inter) | Tailwind Play CDN | lh3.googleusercontent.com images | Inline SVG |
|---|---|---|---|---|---|
| Dashboard | 2 URLs | 1 | yes | 0 | area chart |
| Influencers | 2 | 1 | yes | 5 | — |
| Onboarded | 2 (one duplicated → 3 `<link>`s) | 1 | yes | 0 | 8 brand logos |
| Pipeline | 3 links | 1 | yes | 12 | — |
| Calls & Follow-ups | 3 links | 1 | yes | 4 | sparkline |
| Documents | 3 links | 1 | yes | 5 | ring gauge |
| Possible Duplicates | 3 links | 1 | yes | 0 | — |
| Unassigned Pool | 2 | 1 | yes | 0 | — |
| Welcome Kits | 3 links | 1 | yes | 5 | — |

URLs:
- `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`
- `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap` (repeated)
- `https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap`
- `https://cdn.tailwindcss.com` (Play CDN, runtime JIT; explicitly not for production)
- 36 total `https://lh3.googleusercontent.com/aida-public/AB6AXu…` AI-generated portrait URLs (Stitch-hosted,
  may expire, third-party request on page load). Each `<img>` has a `data-alt` generation prompt and **no `alt`**.
- **Not loaded**: JetBrains Mono (configured for `font-code`), so all `font-code` text falls back to serif.

Hard-coded fake data (all screens): every name, handle, phone, email, city, follower count, KPI, percentage, file name,
size, tracking number, courier, stock count, time, "synced Xm ago", chart path and bar height is literal markup.
Charts are hand-drawn SVG/div bars (no data binding, `preserveAspectRatio="none"` distortion). The app forbids sample
or invented data, so none of it can be carried over; only the layouts and empty states can.

Invalid / no-op classes found (Tailwind v3 CDN): `gap-space-gutter` (Onboarded, Duplicates, Welcome Kits ×2: no
gap), `shadow-xs` (Influencers 12×, Welcome Kits 13×; not in v3), `py-0.2` (Calls 4×, Influencers, Pool),
`w-13 h-13` (Onboarded), `active:scale-98` (Calls), `animate-fadeIn` (Onboarded), `stroke-dasharray` as a class
(Dashboard), `text-code` combined with `text-[11px]` (redundant), `pt-16` + `py-space-lg` conflicting on `<main>` (no gap
under the header).

Accessibility gaps (relevant to porting): no `alt`; 3 `aria-current` total; no `aria-label` on icon-only buttons
(notifications, view toggles, row actions; only `title`); no `:focus-visible` styles and many `outline-none`/
`focus:ring-0`; hover-only row actions; hidden scrollbars on horizontal scrollers; `select-none` on the whole Pipeline;
10–11px text in many places; cyan text at 3.7:1; drag-and-drop with no keyboard alternative shown; no `prefers-reduced-motion`
handling for `animate-pulse`/`animate-ping`/hover lifts; no dark mode.

Responsive summary: only content-level `sm:/md:/lg:` stacking (grids 1→2/3/4/7 columns, header rows `flex-col` →
`md:flex-row`). The shell (240px fixed sidebar, `left-60` header, `pl-60` content) has **no breakpoints**; tables
and kanban rely on `min-w-[1100–1360px]` horizontal scrolling. Nothing collapses the sidebar at 1024px. No
`xl:`/`2xl:` classes anywhere.
