# InfluenceHub — Responsive Audit Report

| | |
|---|---|
| Date | 19/11/2026 |
| Branch | `dev/aditya` (uncommitted Stitch redesign in the working tree) |
| Scope | Audit of the existing responsive behaviour **before** any responsive fixes. Fixes are in `RESPONSIVE_IMPLEMENTATION_REPORT.md`. |
| Method | Code inspection + automated measurement in headless Chrome (DevTools protocol) against the dev server in prototype mode, on a **clean, empty workspace** (no seeded or sample data, per the brief). |

## 1. Baseline

| Check | Result |
|---|---|
| `git status` | 102 modified files under `src/` (the uncommitted Stitch redesign), `package.json` / `package-lock.json` (adds `@fontsource-variable/inter`), untracked `UI_UX_AUDIT_REPORT.md`, `UI_COMPONENT_MAPPING.md`, `.claude/`. |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (0 warnings) |
| `npm run build` | Pass; largest chunk 374.66 kB (limit 500 kB) |
| Tests | No test script exists in `package.json`; no pre-existing test failures to record. |
| `UI_REDESIGN_IMPLEMENTATION_REPORT.md` | Does not exist. |

## 2. What was measured

15 views × 11 viewports = **165 measurements**, plus 40 dialog/menu checks, mobile-drawer behaviour at three widths, the rail tooltip, and the "/" shortcut.

- **Views (all 13 application views):** Dashboard `/`, Influencers `/influencers`, Pool `/pool`, Onboarded `/onboarded`, Onboarded platform `/onboarded/instagram`, Pipeline `/pipeline`, Calls `/calls`, Documents `/documents`, Packages (Welcome Kits) `/packages`, Possible duplicates `/duplicates`, Settings (4 tabs: Instagram, Team, Categories, Pool), Not-found. The influencer detail page and the Add/Import modal need data or a click to open: Add/Import was opened in every viewport; the detail page cannot be reached on an empty workspace (see §6).
- **Viewports:** 1920×1080, 1440×900, 1280×800, 1024×768, 900×1200, 768×1024, 430×932, 390×844, 360×780, 320×640, and 844×390 (phone landscape). Touch emulation on below 1024px.
- **Per view:** page-level horizontal overflow (document and `main` scroll width) and the elements causing it; header overflow and overlapping header controls; global search width; sidebar mode; tab-strip containment and whether the active tab is visible; whether empty/error states are horizontally visible; interactive targets under 24px and under 40px; text clipped by `truncate`; text under 11px.
- **Dialogs/menus** at 1440, 768, 390, 320 and 844×390: Add/Import (all three tabs), Documents creator picker, Packages creator picker, Add member, account menu, notifications menu — fits the viewport horizontally and vertically, scrolls internally, no clipped buttons.
- **Mobile drawer** at 390, 768 and 1023px: opens, overlay, background scroll lock, focus moves inside, Escape closes, focus returns to the menu button, closes after navigating.

## 3. Existing responsive implementation (already in place)

| Area | Existing behaviour | Status |
|---|---|---|
| App shell | `h-svh` with `main` as the only scroll container; `min-w-0` on the content column | Responsive |
| Sidebar ≥1024px | Fixed 256px glass sidebar | Partially responsive — no compact mode at 1024–1279px |
| Sidebar <1024px | Radix `Sheet` drawer behind a menu button (`MobileNav`): overlay, focus trap, Escape, scroll lock, focus return, closes on link click | Responsive (all behaviours verified) |
| Header | Flexible search (`max-w-lg`, shrinks to 120px at 320px), Add Influencer collapses to an icon below 640px, "/" hint hidden below 640px | Responsive |
| Page frame | `px-4 py-6 sm:px-6 lg:px-space-xl` | Responsive |
| Dashboard | KPI grid `2 / sm:3 / lg:7`, panels `lg:grid-cols-12`, charts in `ResponsiveContainer` | Responsive |
| Tables | Every table sits in its own `overflow-x-auto` container inside its card | Responsive (contained scroll) |
| Empty states in tables | Influencers / Pool / Onboarded platform table and Calls pin the empty state to the visible width (`@container` + `sticky left-0 w-[100cqw]`) | Responsive |
| Empty states — Documents, Packages | Centred on the full table width | **Not responsive** |
| Tabs | `TabsList` scrolls horizontally inside itself (`max-w-full overflow-x-auto`) | Partially — active tab can start out of view |
| Pipeline | Board is a `role=region` with `overflow-x-auto`; columns `min-w-60`; side stages collapse | Responsive (contained scroll) |
| Dialogs | `max-w-[calc(100%-2rem)]`, `max-h-[calc(100svh-2rem)]`, `overflow-y-auto`, focus return | Responsive |
| Sheets | `w-3/4 sm:max-w-sm` / drawer-specific widths, focus return | Responsive |
| Touch targets | Default buttons 36px, icon buttons 32–36px, checkboxes have enlarged hit areas | Partially — no touch-specific sizing |
| Reduced motion | Global `prefers-reduced-motion` rule in `index.css` | Responsive |

## 4. Findings (before fixes)

| # | Finding | Where | Widths | Severity |
|---|---|---|---|---|
| F1 | No compact sidebar: the full 256px sidebar stays at 1024–1279px, leaving 768px for content at 1024px. The brief requires an icon-only rail with tooltips there. | `components/layout/sidebar.tsx` | 1024–1279 | High (requirement) |
| F2 | Settings tab strip scrolls, but when the active tab is near the end (Categories, Unassigned Pool) it starts scrolled out of view. | `components/ui/tabs.tsx` (used by Settings, Calls, detail page, Add/Import) | ≤430 | Medium |
| F3 | Add/Import dialog: the "CSV import" tab sits outside the visible part of the scrolling tab strip (same cause as F2). | `components/ui/tabs.tsx` | 320 | Medium |
| F4 | Documents and Packages: the empty state is centred on the full table width, so on phones it sits off-screen. | `pages/documents-page.tsx`, `pages/packages-page.tsx` | ≤430 | High |
| F5 | Touch targets: sort-header buttons and "Show as table" toggles under 24px; most buttons 32–36px on touch screens. | `features/influencers/influencers-table.tsx`, chart toggles, `components/ui/button.tsx` | all | Medium |

No other issues were found:

- **Page-level horizontal overflow:** none in any of the 165 measurements, including 320px and phone landscape. The earlier Calls/Settings overflow (`UI_UX_AUDIT_REPORT.md` R1) had already been fixed by the redesign.
- **Header:** no overlapping controls and no header overflow at any width.
- **Dialogs and menus:** all fit the viewport and scroll internally when the viewport is short (Add member at 844×390).
- **Mobile drawer:** every required behaviour works at 390, 768 and 1023px.
- **"/" shortcut:** focuses the page search at 1440 and 390px.
- **Text:** no text under 11px; nothing clipped by `truncate` on the empty workspace.
- **Console:** no uncaught errors.

## 5. Screen-by-screen assessment (before fixes)

| View | Desktop (≥1280) | Small laptop (1024) | Tablet (768–900) | Mobile (320–430) | Issues |
|---|---|---|---|---|---|
| Dashboard | Matches reference | Full sidebar narrows content; KPI grid 7 → tiles narrow | KPI 3 columns, panels stack | KPI 2 columns, panels stack, charts resize | F1 |
| Influencers | Table scrolls in card | Same | Same | Same; empty state pinned | F1, F5 |
| Pool | As Influencers | Same | Same | Same | F1, F5 |
| Onboarded | 4-column platform grid | 3 columns | 2 columns | 1 column | F1 |
| Onboarded platform | As Influencers | Same | Same | Same | F1, F5 |
| Pipeline | Board scrolls inside its region | Same | Same | One column visible, board scrolls | F1 |
| Calls | Tabs + switch in one dock row | Same | Dock stacks | Tabs scroll; empty state pinned | F1 |
| Documents | Table scrolls in card | Same | Same | **Empty state off-screen** | F1, F4 |
| Packages | Table scrolls in card | Same | Same | **Empty state off-screen** | F1, F4 |
| Possible duplicates | Pair cards / empty canvas | Same | Same | Stacks | F1 |
| Influencer detail | Not reachable without data (§6) | — | — | — | Code review: `lg:grid-cols-[19rem_minmax(0,1fr)]`, tabs scroll (F2) |
| Add/Import | Dialog `sm:max-w-3xl`, scrolls | Same | Same | Fits; tab strip partly hidden at 320 | F3 |
| Settings | Tabs + cards | Same | Same | **Active tab can be out of view** | F1, F2 |
| Not-found | Illustrated empty state | Same | Same | Same | — |

## 6. Limits of this audit

- **No data:** the workspace was empty by design (no fake data). Long names, populated table cells, kanban cards, chart labels and the influencer detail page were therefore not measured in this pass. They were reviewed in code, and the redesign's earlier visual pass used a throwaway test profile.
- **Emulated, not physical:** touch was emulated; no physical devices were used.
- **Browser:** only headless Chrome was used, because the Chrome extension was disconnected. Safari, Firefox and real Android/iOS browsers were not run.

## 7. Prioritised fix list

1. F4 — pin Documents/Packages empty and error states to the visible width (reuse the Influencers/Calls pattern).
2. F1 — icon rail with tooltips at 1024–1279px, without duplicating navigation.
3. F2/F3 — tab strips wrap below 640px so the active tab is always visible (root fix in the Tabs primitive).
4. F5 — larger touch hit areas on touch devices, without changing the visual size; raise the smallest text-button hit heights.
