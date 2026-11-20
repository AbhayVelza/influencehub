# InfluenceHub — Responsive Implementation Report

| | |
|---|---|
| Date | 19/11/2026 |
| Branch | `dev/aditya` — nothing committed, pushed or deployed |
| Audit | `RESPONSIVE_AUDIT_REPORT.md` (findings F1–F5, measured before any change) |
| Testing | Headless Chrome over the DevTools protocol against the dev server (prototype mode), clean empty workspace — no fake data |

## 1. Existing responsive implementation (kept as-is)

Already working before this task and **not rewritten**:

- **Shell:** the app shell's scroll model.
- **Mobile drawer:** the Radix `Sheet` below 1024px, with overlay, focus trap, Escape, scroll lock, focus return, and close after navigating.
- **Header:** flexible search; Add Influencer collapses to an icon below 640px.
- **Page padding:** the responsive page frame.
- **Dashboard grids:** the KPI and panel grids.
- **Tables:** contained table scroll everywhere.
- **Pinned empty states:** Influencers, Pool, Onboarded platform and Calls.
- **Pipeline:** the board's contained horizontal scroll and collapsible side stages.
- **Dialogs:** sizing, internal scroll and focus return.
- **Reduced motion:** the global reduced-motion rule.

## 2. Components already responsive vs requiring improvement

| Component | Before | Action |
|---|---|---|
| App shell, header, page frame, dashboard grids, pipeline board, dialogs, sheets, mobile drawer | Responsive | None |
| Sidebar 1024–1279px | Full sidebar, no compact mode | **Icon rail + tooltips (F1)** |
| Tabs (Settings, Calls, detail, Add/Import) | Scrolled; active tab could be hidden | **Wrap below 640px (F2, F3)** |
| Documents / Packages empty states | Off-screen on phones | **Pinned to visible width (F4)** |
| Empty/error state text in any table | Inherited `whitespace-nowrap` from table cells; long descriptions clipped at 320px (found in the visual check) | **Text wraps (root fix)** |
| Touch targets | No touch-specific hit areas; some text buttons under 24px | **Coarse-pointer hit areas + taller text buttons (F5)** |

## 3. Files modified (this task only)

| File | Change |
|---|---|
| `src/components/layout/sidebar.tsx` | 1024–1279px icon rail. Labels become `sr-only` (same accessible names); badges move to the icon's corner; the Onboarded chevron and platform sub-list are hidden in rail mode (platforms stay reachable from the Onboarded overview); the brand wordmark is hidden. Tooltips are shown only in rail mode (`useSyncExternalStore` + `matchMedia`) and wrap each link in a `span`, so the Slot doesn't merge into NavLink's `className` function. Same routes, items, order, badges and permission gates. Desktop ≥1280px and the <1024px drawer are unchanged. |
| `src/components/layout/app-shell.tsx` | Loading skeleton sidebar matches the rail width at 1024–1279px. |
| `src/components/ui/tabs.tsx` | Tab lists wrap onto extra rows below 640px instead of scrolling (`max-sm:flex-wrap`), so the active tab is always visible. One root fix covers Settings, Calls, detail and Add/Import. |
| `src/components/ui/button.tsx` | On touch screens (`pointer: coarse`) every Button gets an invisible 4px hit-area extension (`after:-inset-1`), so 36px buttons hit like 44px and 32px icon buttons like 40px. No visual size change. |
| `src/components/common/states.tsx` | Empty/error states set `whitespace-normal`, so descriptions wrap inside table cells. |
| `src/pages/documents-page.tsx`, `src/pages/packages-page.tsx` | Table scroll container is an `@container`; empty/error rows are pinned with `sticky left-0 w-[100cqw]` (the Influencers/Calls pattern). Content and conditions unchanged. |
| `src/features/influencers/influencers-table.tsx` | Sort header buttons get a 28px minimum hit height (negative margin keeps the header row height). |
| `src/features/dashboard/bar-list-chart.tsx`, `src/features/influencers/detail/growth-chart.tsx` | "Show as table" toggles get a 28px minimum hit height. |

Not modified: backend, services, API contracts, database, routing, permissions, state management, event handlers, query keys, URL params, validation, data models, `stage-mover.tsx`, `keyboard.ts`, drag-and-drop code, filter mounting.

## 4. Breakpoints tested

1920×1080, 1440×900, 1280×800, 1024×768, 900×1200, 768×1024, 430×932, 390×844, 360×780, 320×640, plus 844×390 (phone landscape). Touch was emulated below 1024px. There were 15 views (all 13 application views, with Settings counted per tab) at 11 sizes, for 165 page measurements, plus 40 dialog/menu checks and drawer checks at 390, 768 and 1023px.

## 5. Results

### Desktop (1920, 1440, 1280)
- **Sidebar:** the full 256px sidebar is unchanged.
- **Layout:** no overflow and no header overlap. Tables and the pipeline scroll inside their containers.
- **Visual identity:** matches the Stitch reference as before; no visual changes at these widths apart from the hit areas, which are invisible.

### Small laptop and tablet (1024, 900, 768)
- **1024px:** the 76px icon rail replaces the full sidebar, giving 948px of content instead of 768px.
  - Each item is a 44×44 target with a centred icon.
  - The active item keeps its cyan tint and accent bar.
  - Hovering shows the label in a tooltip on the right (verified: "Pipeline").
  - Badges show as corner dots.
- **900 and 768px:** the drawer, unchanged; every behaviour verified.
- **Overflow:** none on any view.

### Mobile (430, 390, 360, 320, 844×390 landscape)
- **Overflow:** no page-level horizontal overflow on any view.
- **Header:** controls never overlap; at 320px the search box is 120px wide.
- **Tabs:** they wrap. On Settings the active tab is always visible, and the Add/Import dialog shows all three tabs at 320px.
- **Empty states:** visible within the screen and wrapping on every table, verified at 320px on Calls, Documents, Packages and Influencers.
- **Dialogs:** all fit horizontally and vertically, with no clipped buttons. In landscape, Add member scrolls internally.

### Horizontal overflow
**0** page-level horizontal overflow in 165 measurements, before and after. All horizontal scrolling is contained inside table cards and the pipeline board.

## 6. Accessibility improvements

- **Rail:** tooltips name each icon-only link, and the links keep their full accessible names (labels are `sr-only`, not removed). The badges' spoken text ("3 due today") is unchanged.
- **Touch:** larger tap areas on touch devices for every Button. Sort headers and chart toggles are at least 28px.
- **Tabs:** the active tab is never hidden off-screen.
- **Unchanged:** existing focus rings, dialog focus return, the drawer's focus trap and return, and reduced-motion support.
- **Remaining under 24px:** only the select-all checkbox's visual box (16px). It already has a larger invisible hit area.

## 7. Functional regression results

| Check | Result |
|---|---|
| "/" focuses the page search (1440 and 390px) | Pass |
| Mobile drawer: open, overlay, scroll lock, focus inside, Escape, focus restore, close on navigate (390, 768, 1023px) | Pass |
| Rail links: all 10 routes render as 44×44 links with working active styling (1024px) | Pass |
| Rail tooltip on hover | Pass ("Pipeline") |
| Add/Import dialog opens with all three tabs; Documents and Packages creator pickers open; Add member opens; account and notifications menus open and fit | Pass, all viewports |
| Uncaught errors during all runs | 0 |
| Filter panels | Not changed (`CollapsibleFilters` untouched; panels stay mounted) |
| Pipeline drag-and-drop | Not changed in this task (no edits to the board, cards, sensors or `keyboard.ts`). Not re-run here because the brief forbids seeding data and the empty workspace has no cards. It last passed (keyboard move → required Log Call dialog) in the redesign check, which used a throwaway test profile. |

**One regression found and fixed during this task:** in the first version of the rail, the tooltip trigger merged into NavLink's `className` function. That stringified it, and between 1024 and 1279px the links lost their active and hover styling. Each tooltip now wraps its link in a `span`. Re-measured: all links are correct.

## 8. Build and test results

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (0 warnings) |
| `npm run build` | Pass; largest chunk 374.66 kB (unchanged, limit 500 kB) |
| Automated responsive audit (final run) | 0 overflow, 0 header overlaps, 0 tab issues, 0 hidden empty states, 40/40 dialogs fit, drawer 3/3, rail and tooltip pass, "/" pass, 0 errors |
| Project tests | None exist (`package.json` has no test script) |

## 9. Remaining limitations

- **Empty workspace:** no fake data was inserted, as the brief requires. Populated tables (long names in cells), kanban cards at phone widths, chart label density with real values, and the influencer detail page were not re-measured in this pass. Load real data, or a team test workspace, and re-check those, especially Pipeline drag and drop with the mouse and keyboard.
- **Browsers and devices:** tested in headless Chrome with emulated touch only. Run a quick pass on a real iPhone and an Android phone (Safari's `backdrop-filter` and the `svh` units) before release.
- **Wide tables:** on phones, wide tables (Influencers, Pool, Documents) still scroll sideways inside their cards. That's the brief's accepted approach, and no columns were hidden or converted to cards, to avoid removing information or actions.
- **Rail sub-list:** in rail mode the Onboarded per-platform sub-list is hidden; the platforms stay one click away on the Onboarded overview.
