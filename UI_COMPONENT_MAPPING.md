# InfluenceHub — UI Component Mapping

Maps every existing component and file to its counterpart in the proposed redesign (the Stitch "liquid glass" reference,
unified as described in [UI_UX_AUDIT_REPORT.md](UI_UX_AUDIT_REPORT.md) §9). Branch `dev/aditya` at `70ae216`, 19/11/2026.

**Change type:** **T** tokens/CSS only · **R** restyle inside the component (same props, handlers, ids, aria) · **S**
structural layout (wrappers, grids, breakpoints) with no behaviour change · **N** new presentational component built from
existing primitives · **—** no change.
**Logic:** **V** purely visual · **L** contains functional logic (restyle markup only).
**Reference:** the Stitch screen/pattern it maps to (Shell = shared sidebar/header of all nine files).
Reference-only features (no app counterpart) are listed at the end and are **not** mapped to anything.

---

## 1. Tokens and global styles

| Existing | File | Redesign counterpart | Type | Must preserve |
|---|---|---|---|---|
| Neutral shadcn tokens (light/dark), radius 10px base | `src/index.css` | Unified tokens: `#f9f9f9` canvas + orbs, glass `--card`/`--popover`, `--primary #05080b`, `--accent-brand #00b4f0`, `--accent-ink #006689`, `--accent-soft #c3e8ff`, hairline `--border`, semantic success/warning/info, shadow scale, radius sm6/md8/lg12/xl16/2xl20, dark set, blur fallbacks | T | `@custom-variant dark`, `--chart-series-1` name, `.dark` class strategy |
| Geist Variable font | `src/index.css`, `package.json` | Keep Geist, or Inter (needs approval) with tabular-nums rule | T | Self-hosted font (no Google Fonts) |
| `STAGE_META`, `CALL_OUTCOME_META`, `PACKAGE_STATUS_META`, `SYNC_STATUS_META` | `src/lib/constants.ts` | Same maps; optional tint tuning for glass | T | Literal class strings; badge/dot/hex kept in sync; same stage colours everywhere (do **not** adopt reference Apple palette) |
| `PLATFORM_META` badges | `src/lib/platforms.ts` | Same; prefer brand glyph rendering | T | Literal class strings |
| Theme provider + pre-paint script | `src/providers/*`, `index.html` | Same | — | localStorage key `influencehub-theme` |

## 2. Shell — reference: Shell (sidebar, header, canvas)

| Existing | File | Logic | Redesign counterpart | Type | Must preserve |
|---|---|---|---|---|---|
| `AppShell` | `components/layout/app-shell.tsx` | L | Glass shell with fixed canvas orb layer (`aria-hidden`), content `max-w-[1440px]` | S | `h-svh overflow-hidden` + `main overflow-y-auto`, `min-w-0`, `/me` gating, Suspense |
| `ShellSkeleton`, `PageSkeleton` | same | V | Skeletons matching new geometry (240/72px sidebar, 64px header) | R | `aria-busy` |
| `Sidebar` (224px, ≥1024) | `components/layout/sidebar.tsx` | V | Glass sidebar 240px ≥1280px; **72px icon rail 1024–1279px** with tooltips | S | Width also used by skeleton |
| `MobileNav` (Sheet <1024) | same | L | Same pattern, glass Sheet | R | Close-on-navigate via `closest('a')` |
| `SidebarBody` (logo, items, badges) | same | L | Logo tile `rounded-xl` black "IH" + wordmark; items 36px `rounded-xl`; active = `--accent-soft` fill + indicator + `aria-current`; badges coloured by meaning | R | 3 live badge queries, `useCan` gates, Settings pinned bottom |
| `SidebarLink` | same | V | Reference nav item | R | `end` on `/` |
| `OnboardedGroup` (8 logo tiles) | same | L | Expandable group (reference shows a list sub-nav); keep logo tiles or switch to list rows | R | `aria-expanded`, auto-open on `/onboarded*` |
| `TopBar` (56px) | `components/layout/top-bar.tsx` | V | Sticky glass header 64px | R | Add Influencer gated by `influencer:create` |
| `GlobalSearch` | `components/layout/global-search.tsx` | L | Search field `rounded-xl`/pill with "/" kbd, `max-w-lg` | R | "/" hotkey, `data-page-search` hand-off, Esc blur, submit → `/influencers?q=` |
| `NotificationsMenu`, `FollowUpRow` | `components/layout/notifications-menu.tsx` | L | 36px glass icon button, L2 glass menu, token badge | R | Queries, sr-only label, item links |
| `UserMenu`, `ActingAs` | `components/layout/user-menu.tsx` | L | Avatar button + glass menu; optional visible theme toggle in header | R | `switchUser` → `resetSession`; reset prototype data (swap `window.confirm` → AlertDialog, same behaviour) |

## 3. Primitives (`src/components/ui`) — edit in place, never regenerate

| Existing | Importers | Redesign counterpart | Type | Must preserve |
|---|---|---|---|---|
| `button.tsx` | 59 | Black pill primary, white glass secondary, accent-ink ghost, destructive; no grey hover inversion | R | Variant/size names, `active:translate-y-px`, focus ring |
| `card.tsx` | 7 (+19 hand-rolled boxes to migrate) | L1 glass card, 16px radius, hairline, soft shadow; `interactive` hover lift | R | Slot structure |
| `input.tsx`, `textarea.tsx`, `select.tsx`, `input-group.tsx` | 17 / 6 / 10 / 1 | 12px radius (pill for search), hairline, glass fill, focus-visible ring | R | `aria-invalid` styling |
| `tabs.tsx` | 4 | Segmented pill control (default) + line variant; list `max-w-full overflow-x-auto` | R | Radix semantics |
| `table.tsx` | 7 | Header `--muted`/60 caps label-sm, hairline rows, hover/selected tints, sticky header option | R | `overflow-x-auto` wrapper, `whitespace-nowrap`, `data-state=selected` |
| `dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx` | 14 / 3 / 6 | Opaque raised surface, 20px radius, overlay `bg-black/30 backdrop-blur-sm` | R | **`useReturnFocus`**, dialog `max-h-[calc(100svh-2rem)] overflow-y-auto` |
| `dropdown-menu.tsx`, `popover.tsx`, `command.tsx`, `tooltip.tsx` | 10 / 4 / 2 / 3 | L2 glass (90% fill, blur 32) | R | cmdk structure |
| `checkbox.tsx`, `switch.tsx` | 7 / 2 | Checkbox 16px primary; switch accent-on | R | Hit-area expanders |
| `badge.tsx` (unused) | 0 | Base for `CountBadge` / `StatusPill` | N | — |
| `progress.tsx`, `skeleton.tsx`, `avatar.tsx`, `label.tsx` | 4 / 24 / 1 / 18 | Accent progress; skeleton on glass | R | — |
| `sonner.tsx` | 1 | Token-styled toasts (drop `richColors`) | R | Theme from `resolvedTheme` |
| `scroll-area.tsx`, `separator.tsx` (unused) | 0 | Optional use | — | — |

## 4. Shared components (`src/components/common`)

| Existing | Logic | Reference pattern | Redesign counterpart | Type | Must preserve |
|---|---|---|---|---|---|
| `PageHeader` | V | Page header (eyebrow, 32px title, count pill, subtitle, actions) | PageHeader v2: optional eyebrow, 28px title, count pill, icon, actions | R | Props `title, description, actions` (extend, don't break) |
| `EmptyState`, `ErrorState` | V | Illustrated empty state (layered circles, halo) | Size variants page/card/inline | R | `role=alert`, retry |
| `Pagination` | L | Footer pagination | Pill page buttons, active = primary; compact mode <640px | R | `aria-label="Rows per page"`, page/size callbacks |
| `CollapsibleFilters` | L | "Filters" pill + count | `FilterTrigger` + glass tray | R | Children stay mounted, `aria-expanded/controls`, flex-wrap parent |
| `MultiSelectFilter` | L | Dropdown filters | Same with `FilterTrigger` | R | `latest` ref toggle, `[&>svg:last-child]:hidden` |
| `DateRangeFilter`, `FollowersFilter` | L | — | Same with `FilterTrigger` | R | dd/MM/yyyy, validation |
| `DateInput`, `DateTimeInput` | L | — | Leading icon | R | Text inputs (never native date), forwarded refs |
| `InlineTextField`, `InlineSelectField` | L | — | Visible hover/edit affordance | R | Enter/Esc/Ctrl+Enter, readOnly while saving |
| `StageBadge`, `StageDot` | V | Stage chips | Same colours, softer glass tint | R | `STAGE_META` |
| `PlatformMark(s)`, `AccountLabel` | V | Platform glyphs | Optional brand glyph mode | R | `relative` wrapper around sr-only text |
| `PlatformIcon` | V | Brand squircles (Onboarded) | `rounded-xl`/14px squircle | R | — |
| `PersonAvatar` | V | Avatars (40/32/24px) | Same sizes per context | R | `referrerPolicy` |
| `SyncStatusBadge` | V | "Synced" chips | StatusPill | R | — |
| `RelativeTime`, `EmailValue`, `ReasonList` | V | — | Tooltip instead of `title` (optional) | R | `formatRelative` / IST |
| `RequirePermission` | L | — | Same, nicer empty state | R | Gate logic |
| *(new)* `StatTile` | V | KPI tile | Built on Card | N | Values only from existing queries |
| *(new)* `FilterTrigger`, `CountBadge` | V | Filters pill, count badges | Extracted from 4 duplicates | N | — |
| *(new)* `DataTableCard` | V | Glass table card | Card + Table, sticky header, empty state pinned to visible width | N | — |
| *(new)* `StatusPill` | V | Status pills | Dot + label | N | Meta maps |
| *(new)* `CanvasBackground` | V | Ambient orbs | Fixed layer in AppShell | N | `pointer-events-none`, `aria-hidden` |

## 5. Screens

### 5.1 Dashboard — reference `influencehub_dashboard`

| Existing | File | Logic | Redesign counterpart | Type |
|---|---|---|---|---|
| `DashboardPage` | `pages/dashboard-page.tsx` | L | Greeting header with eyebrow; KPI row; 2-col panels; activity | S |
| `Kpi` (7) | same | V | Glass KPI tiles (`StatTile`); grid 2 / 3 / **4+3 at lg** / 7 at 2xl; no deltas | R/S |
| `Panel` | same | V | Glass card panel | R |
| `PipelineFunnel` | `features/dashboard/pipeline-funnel.tsx` | V | "Pipeline Status" card: stage rows with track bars (STAGE_META colours, not the reference gradient), total pill | R |
| `MyFollowUps` | same page | L | "My follow-ups" card + illustrated empty state | R |
| `BarListChart` (category, cities) | `features/dashboard/bar-list-chart.tsx` | V | Glass chart cards, accent series, "Show as table →" | R |
| `RecentActivity` | same page | V | Inset list card | R |
| *(none)* | — | — | Reference date filter, weekly/daily charts, deltas, goals, conversion rate | **Not mapped (ABSENT)** |

### 5.2 Influencers — reference `influencehub_influencers`

| Existing | File | Logic | Redesign counterpart | Type |
|---|---|---|---|---|
| `InfluencersPage` | `pages/influencers-page.tsx` | L | Header (title + count pill, Import CSV / Export / Add), toolbar row, table card, sticky footer | S |
| `ListSearch` | `features/influencers/list-search.tsx` | L | Pill search | R |
| `InfluencerFilterBar` + `CollapsibleFilters` | `features/influencers/filter-bar.tsx` | L | Filters pill with count + tray | R |
| `ActiveFilters` | `features/influencers/active-filters.tsx` | L | Chip row | R |
| `SavedViewsMenu` | `features/influencers/saved-views-menu.tsx` | L | "Saved views" pill with active view tag | R |
| `InfluencersTable` | `features/influencers/influencers-table.tsx` | L | `DataTableCard`: caps header, 48px rows, hover tint, gear column chooser | R |
| `buildColumns` cells | `features/influencers/columns.tsx` | L | Avatar + name + verified + handle, platform glyphs, compact followers, StageBadge, owner avatar, DocFlags, sync pill | R |
| `BulkActionsBar` | `features/influencers/bulk-actions-bar.tsx` | L | Glass sticky bar | R |
| `Pagination` footer | `common/pagination.tsx` | L | Reference footer | R |
| *(none)* | — | — | Segments All/Active/Negotiating, table↔kanban toggle, deals/completion/reach insight cards, "Live Pool" | **Not mapped** |

### 5.3 Onboarded — reference `influencehub_onboarded`

| Existing | File | Logic | Redesign counterpart | Type |
|---|---|---|---|---|
| `OnboardedPage` cards (8) | `pages/onboarded-page.tsx` | L | Platform glass cards: brand squircle, platform name, large count, chevron, hover lift; grid 1/2/3/4 with real gap | R |
| `OnboardedPlatformPage` | `pages/onboarded-platform-page.tsx` | L | Same structure as Influencers list | R |
| `buildOnboardedColumns` | `features/onboarded/columns.tsx` | L | Same cell styles | R |
| `OnboardedGroup` (sidebar) | `components/layout/sidebar.tsx` | L | Expanded sub-nav (no counts unless an existing query provides them) | R |
| *(none)* | — | — | Tier tags, progress %, segments, Connected Channels banner, Export Audit, Connect New Network, Recent Authentication Syncs | **Not mapped** |

### 5.4 Pipeline — reference `influencehub_pipeline`

| Existing | File | Logic | Redesign counterpart | Type |
|---|---|---|---|---|
| `PipelinePage` | `pages/pipeline-page.tsx` | L | Header + glass toolbar (search, Filters) | R |
| `PipelineBoard`, `Column` | `features/pipeline/pipeline-board.tsx` | L | Glass columns 16px, dot + title + count circle; collapsed side-stage strips (already match reference) | R (geometry-sensitive) |
| `PipelineCardView` | `features/pipeline/pipeline-card.tsx` | V | Creator card: avatar, name, handle, metric row (reach · category), owner footer, stale pill | R |
| `DraggablePipelineCard` | same | L | Same wrapper | — |
| `keyboard.ts` | `features/pipeline/keyboard.ts` | L | Unchanged (update offsets only if header geometry changes) | — |
| *(none)* | — | — | Metric strip, Stages/Grid toggle, sort, export, Quick Enlist, card status strips, Add Creator Card, automation banner, Notion/Airtable | **Not mapped** |

### 5.5 Calls & Follow-ups — reference `influencehub_calls_follow_ups`

| Existing | File | Logic | Redesign counterpart | Type |
|---|---|---|---|---|
| `CallsPage` | `pages/calls-page.tsx` | L | Header (subtitle "Every time is shown in IST"), filter dock (segmented tabs with count chips + only-mine switch), table card | R/S |
| `CountBadge` | same | L | Count chips (overdue = destructive container) | R |
| `Outcome`, `InfluencerCell` | same | V | Outcome pill, avatar + name + handle | R |
| Row actions | same | L | Icon buttons: Log call, Mark done; `tel:` phone chip (`whitespace-nowrap`) | R |
| `LogCallDialog` | `features/calls/log-call-dialog.tsx` | L | Glass dialog, outcome pill radios, quick-pick chips | R |
| *(none)* | — | — | Dial Queue / TAT metrics, owner filter input, row selection, Sync with Calendar, Export CSV, WebRTC bridge, recording/AI, velocity chart, customise columns | **Not mapped** |

### 5.6 Documents — reference `influencehub_documents`

| Existing | File | Logic | Redesign counterpart | Type |
|---|---|---|---|---|
| `DocumentsPage` | `pages/documents-page.tsx` | L | Header with count pill + black "Upload ▾"; search + Filters bar; table card | R |
| Type filter (`type[]`) | same | L | Optional segmented All / Insights / Agreements **writing the same `type` param** (decision) | R |
| `DocumentTypeBadge`, `AgreementBadges` | `features/documents/document-parts.tsx` | V | Type pill; status pill (Current / Expired) | R |
| `DocumentButtons` | same | L | Preview / Download / Delete icon buttons | R |
| `DocumentUploadDialog` | `features/documents/document-upload-dialog.tsx` | L | Glass dialog; optional dropzone styling around the same file input | R |
| `DocumentPreviewDialog` | `features/documents/document-preview-dialog.tsx` | L | Large glass dialog | R |
| `InfluencerPicker` | `features/packages/influencer-picker.tsx` | L | Command palette style dialog | R |
| `DocFlags` | `features/documents/doc-flags.tsx` | V | Icon flags | R |
| *(none)* | — | — | Stats (storage, verified, pending, clearance), Audit Trail, DocuSign, categories Contracts/Briefs/Tax, bulk ops, ESIGN, Secure Vault | **Not mapped** |

### 5.7 Possible Duplicates — reference `influencehub_possible_duplicates`

| Existing | File | Logic | Redesign counterpart | Type |
|---|---|---|---|---|
| `DuplicatesPage` | `pages/duplicates-page.tsx` | L | Header with count pill; list of pair cards; illustrated empty state (reference) | R |
| `PairCard`, `Side` | same | L / V | Glass pair card with two side panels (no reference — design with tokens) | R |
| `ConfidenceBadge` | `features/duplicates/duplicate-warning.tsx` | V | StatusPill | R |
| `MergeDialog` | `features/duplicates/merge-dialog.tsx` | L | Glass dialog with radio cards | R |
| `DuplicateWarning` | same | L | Warning callout (semantic warning tokens) | R |
| *(none)* | — | — | Exact/Fuzzy toggle, Scan Now, confidence threshold, engine status, quarantine, ruleset cards | **Not mapped** (static explainer copy only with sign-off) |

### 5.8 Unassigned Pool — reference `influencehub_unassigned_pool`

| Existing | File | Logic | Redesign counterpart | Type |
|---|---|---|---|---|
| `PoolPage` | `pages/pool-page.tsx` | L | Header; glass filter bar (search, Filters, optional platform chips over `platform[]`); table card; sticky bulk bar | R |
| `buildPoolColumns` | `features/pool/columns.tsx` | L | Same cell styles; Assign / Claim row actions | R |
| `PoolPreviewDrawer`, `PoolPreview`, `PoolActions`, `AssignMenu` | `features/pool/pool-preview.tsx` | L | Glass Sheet | R |
| `BulkAssignDialog` | `features/pool/bulk-assign-dialog.tsx` | L | Glass dialog | R |
| `ReleaseDialog` | `features/pool/release-dialog.tsx` | L | Glass dialog | R |
| Empty states (2) | `pages/pool-page.tsx` | V | Illustrated empty state (reference) without discovery CTAs | R |
| *(none)* | — | — | Live stream / synced pills, Routing Logs, ⌘K, Sort "Recently Scraped", Discovery Hub, scraping crawlers, routing policy, auto-assignment engine, dedupe gate cards | **Not mapped** |

### 5.9 Welcome Kits (Packages on this branch) — reference `influencehub_welcome_kits`

| Existing | File | Logic | Redesign counterpart | Type |
|---|---|---|---|---|
| `PackagesPage` | `pages/packages-page.tsx` | L | Header with count pill + black "Create …"; search + Filters bar; table card | R |
| Status pill, tracking copy, ⋯ menu | same | L | StatusPill; mono tracking chip (`whitespace-nowrap`); actions menu | R |
| Status filter (`status[]`) | same | L | Optional segmented All / Active / Delivered **over the same param** (decision) | R |
| `PackageDrawer` | `features/packages/package-drawer.tsx` | L | Glass Sheet | R |
| `PackageStatusConfirm` | `features/packages/package-status-confirm.tsx` | L | AlertDialog restyle | R |
| Labels "Package" | many | — | "Welcome Kit" via `origin/main` commits, not hand edits | — |
| *(none)* | — | — | Kit stat cards, logistics/ETA, View Tracking, warehouse stock, courier pickups, labels, Export Manifest | **Not mapped** |

### 5.10 Screens without a reference design

| Existing | File | Logic | Redesign counterpart | Type |
|---|---|---|---|---|
| `InfluencerDetailPage` | `pages/influencer-detail-page.tsx` | L | Glass header card + two-column layout; segmented tabs | R |
| `InfluencerHeader`, `OwnerControl`, `StageControl`, `StageStepper` | `features/influencers/detail/*` | L/V | Token restyle; stage colours unchanged | R |
| `SocialAccountsPanel`, `GrowthChart`, `AddAccountDialog`, `EditStatsDialog` | same | L/V | Glass card, vertical tablist styling | R |
| `OverviewTab`, `CallsTab`, `PackagesTab`, `DocumentsTab`, `ActivityTab` | same | L/V | Glass cards, timeline styling | R |
| `useStageMover`, `StageReasonDialog` | `features/influencers/stage-mover.tsx`, `stage-reason-dialog.tsx` | L | Dialog restyle only | R |
| `AddInfluencerProvider`, `LookupTab`, `ManualTab`, `CsvTab`, `AccountRow`, `DetailsFields`, `AlreadyInCrm` | `features/add-influencer/*` | L | Glass dialog, segmented tabs, dropzone styling | R |
| `SettingsPage` + `InstagramSettings`, `TeamSettings`, `CategorySettings`, `PoolSettings` | `pages/settings-page.tsx`, `features/settings/*` | L | Glass cards, segmented tabs (wrapping) | R |
| `NotFoundPage` | `pages/not-found-page.tsx` | V | Illustrated empty state | R |

---

## 6. Reference-only features (no app counterpart — not mapped)

Porting any of these is a **new feature** and needs a separate decision (project rule: no features beyond the spec
without asking; no sample or invented data).

| Screen | Items |
|---|---|
| Dashboard | Date-range filter, Onboarded-per-week chart, Calls-per-day chart, KPI deltas, goal tracking, conversion rate, "Manage pipeline stages", scheduled check |
| Influencers | Quick segments, table↔kanban toggle, Active Deals $, Contract completion %, audience-reach insight cards, "Live Pool" |
| Onboarded | Platform API sync log, Connect New Network, Export Audit, platform health, tiers, progress targets, growth segments |
| Pipeline | Header KPIs, Grid view, sort, export, Quick Enlist, automation rules, Notion/Airtable sync, pitch/contract/courier/views strips, Add Creator Card |
| Calls | Dial queue metric, TAT, owner filter, row selection, calendar sync, export, WebRTC/SIP dialler, recording + AI transcription, weekly velocity chart |
| Documents | Storage/verification/clearance stats, Audit Trail, DocuSign, ESIGN/UETA, secure vault, Intuit/W-9 export, ZIP bulk download, Contracts/Briefs/Tax categories, row selection |
| Duplicates | Exact/Fuzzy modes, Scan Now, confidence threshold, dedupe engine status, quarantine, ruleset/sources/auto-merge cards |
| Pool | Discovery Hub, scraping crawlers, auto-assignment engine, routing logs, routing policy panel, ⌘K palette, "Recently Scraped" sort |
| Welcome Kits | Kit stat cards, logistics tracking/ETA, inventory, scheduled pickups, label printing, Export Manifest |
