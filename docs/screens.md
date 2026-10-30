# Screens

Implementation is under `src/pages/`, `src/components/` and `src/services/`.

1. **App shell**: sidebar (Dashboard, Influencers, Unassigned Pool w/ count, Possible duplicates w/ count
   (manager/admin), Pipeline, Calls & Follow-ups w/ due-today badge, Packages, Documents, Settings admin-only); top bar: global
   search, "+ Add Influencer", notifications, user menu w/ theme toggle.
2. **Dashboard**: KPIs (total, pool, contacted this week, onboarded this month, packages in transit, follow-ups today, onboarded without agreement → filtered list),
   pipeline funnel (click → filtered list), by-category + top-cities bars, my follow-ups, activity feed.
3. **Influencers list**: header w/ count + Import CSV / Export / + Add; search; Saved views; filters
   Category/Platform/Country/State/City/Stage/Assigned/Agreement (signed, missing)/Insights (received, missing)/Total reach; chips; table; bulk bar; pagination. Columns:
   name+avatar+verified, category, primary account, platforms, total reach, primary followers, phone, email, city,
   state, country, stage, assigned to, docs (Insights ✓/✗, Agreement ✓/✗; — in the pool), sync (primary), last synced
   (primary). Filters in URL.
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
10. **Unassigned Pool**: list filters (no owner filter) in the URL; row → preview drawer (not the profile).
   Executives: preview fields + Claim / bulk Claim. Managers/admins: full details + Assign to… / bulk assign.
   An executive opening an unassigned influencer's URL gets the preview with Claim; another's influencer is 404.
11. **Possible duplicates** (manager/admin): pairs side by side with confidence + reasons; Merge (pick survivor,
   per-field values, owner if different; summary of combined accounts and resulting stage) or Dismiss.
12. **Documents** (sidebar page): every document you can see with creator, type, period / signed date, file, uploaded by
   and uploaded at; filters type, creator search, uploaded by, uploaded date range (all in the URL); preview / download /
   delete (manager/admin); "Upload" asks for the creator first, then the same upload dialog as the influencer's
   **Documents** tab (Insights summaries; Agreement = current one + version history; upload buttons, metadata forms,
   preview dialog for PDF and images, progress bar while uploading).

## Phases (all complete)
1. Scaffold, theme, app shell, routing, types, API client, MSW mocks + fixtures. 2. Influencers list.
3. Influencer detail. 4. Add / Import modal. 5. Pipeline, Calls, Packages. 6. Dashboard, Settings, polish.
Then: Unassigned Pool; multi-platform accounts, Facebook, connect links, duplicate detection and merge.
