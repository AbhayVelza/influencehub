# Screens

Implementation is under `src/pages/`, `src/components/` and `src/services/`.

**Filters are collapsed everywhere** (Influencers, Pipeline, Pool, Onboarded tabs, Documents, Packages): one "Filters" button
(with the number of active filters, and "Clear all" beside it on Documents / Packages) opens them; search and the chips of
active filters stay visible. `CollapsibleFilters` in `components/common/collapsible-filters.tsx`.

1. **App shell**: sidebar (Dashboard, Influencers, Unassigned Pool w/ count, Possible duplicates w/ count
   (manager/admin), Pipeline, Calls & Follow-ups w/ due-today badge, Packages, Documents, Onboarded (expands to a grid of platform logo links, 4 per row),
   Settings admin-only); top bar: global
   search, "+ Add Influencer", notifications, account menu ("Account menu"): theme, **Acting as** (pick a team member; there is no
   sign-in yet) and, in prototype mode, **Reset prototype data**.
2. **Dashboard**: KPIs (total, pool, contacted this week, onboarded this month, packages in transit, follow-ups today, onboarded without agreement → filtered list),
   pipeline funnel (click → filtered list), by-category + top-cities bars, my follow-ups, activity feed.
3. **Influencers list**: header w/ count + Import CSV / Export / + Add; search; Saved views; filters
   Category/Platform/Country/State/City/Stage/Assigned/Agreement (signed, missing)/Insights (received, missing)/Total reach; chips; table; bulk bar; pagination. Columns:
   name+avatar+verified, category, primary account, platforms, Instagram followers, phone, email (shown by default), city,
   state, country, stage, assigned to, docs (Insights ✓/✗, Agreement ✓/✗; — in the pool), sync (primary), last synced
   (primary). Filters in URL. Every option shows a count that follows the other active filters (ticking Stage updates the
   Category / Country / … counts, and the reverse); options with nothing left stay listed, dimmed at 0. Clear one filter
   ("Clear <filter>" in its menu, a chip's ×) or all ("Clear all").
4. **Influencer detail**: header (avatar, name, primary account, category, platforms, total reach, location, Stage ▾,
   Owner ▾, Log call, Create package, ⋯) + stage stepper. Left: **Social accounts** — a list of accounts (tabs), each
   with its platform's stat cards (`PLATFORM_META` labels), method + status (Sync now / Send connect link (copy or
   email) / Edit stats), growth chart where snapshots exist, recent posts (Instagram, YouTube); + Add account (with
   duplicate check). Right tabs: Overview, Calls, Packages, Documents, Activity.
5. **Add / Import modal**: Look up a profile (platform + username → job → preview with the platform's stats, "Also
   found" linked accounts → details → duplicate check → save); Manual (several accounts, personal-profile toggle,
   audience for manual accounts); CSV (per-platform columns, optional "Added on" date column, preview w/ errors +
   "Possible duplicate" column).
   "Possible same creator" warning: Add account to existing / Create anyway; teammates' matches stay anonymous.
6. **Pipeline kanban** · 7. **Calls & Follow-ups** · 8. **Packages** (as before; handles show as primary account).
9. **Settings (admin)**: Instagram integration status + sync frequency, team & roles, categories, pool guards.
   **Team**: "Add member" → "Add a team member" dialog (Name, Email, Role, Location) → toast "Added <name> as <Role>";
   change role, edit location inline, deactivate / reactivate.
10. **Unassigned Pool**: list filters (no owner filter) in the URL; row → preview drawer (not the profile).
   Executives: preview fields + Claim / bulk Claim. Managers/admins: full details + Assign to… / bulk "Assign N…"
   dialog (tick one or more people with each one's share shown → confirm with the counts → "Assigning…" → toast;
   rows not assigned stay selected unless they've left the pool).
   An executive opening an unassigned influencer's URL gets the preview with Claim; another's influencer is 404.
11. **Possible duplicates** (manager/admin): pairs side by side with confidence + reasons; Merge (pick survivor,
   per-field values, owner if different; summary of combined accounts and resulting stage) or Dismiss.
12. **Documents** (sidebar page): every document you can see with creator, type, period / signed date, file, uploaded by
   and uploaded at; filters type, creator search, uploaded by, uploaded date range (all in the URL); preview / download /
   delete (manager/admin); "Upload" asks for the creator first, then the same upload dialog as the influencer's
   **Documents** tab (Insights summaries; Agreement = current one + version history; upload buttons, metadata forms,
   preview dialog for PDF and images, progress bar while uploading).
13. **Onboarded** (every role; executives see their own): `/onboarded` = one card per platform with its count;
   `/onboarded/:platform` = every onboarded creator (stage Onboarded, Package Sent or Delivered) with an account on that platform (documents not
   required; the docs column and the Agreement / Insights filters show what's missing). Same search / filters / chips /
   sort / pagination as the list (no Stage or Platform filter: the rule is fixed) plus a **Followers** range filter on that platform's own account (next to Total
   reach; `followers_min/max` in the URL, a chip, the other filters' counts follow it); columns: name, that platform's account + audience, category, total reach, stage,
   phone, email, city, state, country, owner, docs, that account's sync status. No bulk actions. "All platforms" link
   back. Rules: `contract-decisions.md` (Onboarded tabs).

## Phases (all complete)
1. Scaffold, theme, app shell, routing, types, API client, data layer. 2. Influencers list.
3. Influencer detail. 4. Add / Import modal. 5. Pipeline, Calls, Packages. 6. Dashboard, Settings, polish.
Then: Unassigned Pool; multi-platform accounts, Facebook, connect links, duplicate detection and merge; Documents;
Onboarded tabs; PostgreSQL behind the API server (Firebase removed; no sign-in yet).
