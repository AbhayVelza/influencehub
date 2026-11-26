# InfluenceHub daily shift logs

Shift windows: Morning 9:30–11:30 · Midday 11:30–1:30 · Afternoon 2:00–4:30 · Wrap-up 4:30–6:30

These logs come from the timestamps of the InfluenceHub Claude Code chats. Windows with no chat activity are left out.

## Fri 30 Oct
- **Morning:** wrote the README covering the whole application.
- **Midday:** connected the GitHub repo and created the working branch `data/abhay`.

## Mon 2 Nov
- **Morning:** wrote the pull request description.
- **Midday:** pulled the team's GitHub changes into my branch.

## Tue 3 Nov
- **Morning:** Onboarded section now shows platform icons in a grid, with logos on the dashboard.
- **Midday:** added a followers filter; all filters are now behind a Filter button.
- **Afternoon:** turned off login to make a working demo prototype; added the followers tab.
- **Wrap-up:** fixed a bug where creators marked Onboarded in the pipeline didn't appear in the Onboarded tab.

## Wed 4 Nov
- **Morning:** go-live planning (database choice, storage for 1,000 and 10,000 creators, 22 devices); added the Email column and removed Total Reach from the Influencers tab.
- **Afternoon:** the Email column now also shows "managed by @agency" text.

## Thu 5 Nov
- **Morning:** set up the GitHub CLI.
- **Midday:** added the new creator categories, also in Settings.
- **Afternoon:** wrote a document describing each column and its limits.
- **Wrap-up:** onboarded creators stay in the Onboarded tab at every later stage; the account insight document is now required along with the agreement.

## Fri 6 Nov
- **Afternoon:** calls and meetings can no longer be booked at the same date and time.

## Fri 13 Nov
- **Midday:** wrote a data inventory: what to store and where each piece comes from.
- **Afternoon:** removed Firestore; PostgreSQL is now the only database, in prototype mode built for production.
- **Wrap-up:** set up and connected the PostgreSQL database.

## Sat 14 Nov
- **Midday:** removed login so the app could be shown to management.

## Tue 17 Nov
- **Midday:** connected the Supabase test database; shared a live test link with the testers.
- **Afternoon:** replaced the expiring link with a permanent one.
- **Wrap-up:**
  - made the app responsive on all devices
  - renamed Total Reach
  - hid "create package" for rejected creators
  - logged the testers' changes in the Claude doc

## Wed 18 Nov
- **Morning:** refreshed the live test link.
- **Midday:** renamed "Package Sent" to Welcome Kit everywhere.
- **Afternoon:** added the brand specialist role and its Influencers tab, new responsive tables and graphs, and darker outlines.
- **Wrap-up:** duplicate check now uses the Instagram handle only; pipeline overrides are limited to Onboarded; fixed the code-review issues.

## Thu 19 Nov
- **Morning:** designed the relational schema (keys and indexes) and started the migration on a test database.
- **Midday:** connected the database on Vercel; finished the P1 tasks.
- **Afternoon:** set up the daily backup job and its secrets.
- **Wrap-up:** added the Meta Graph API key and saved the keys in Render.

## Fri 20 Nov
- **Morning:** auto-sync for all 295 creators, plus an admin Sync button in Influencers and Settings.
- **Afternoon:** finished the P2 architecture and schema work, except end-to-end tests per role; merged and cleaned up the GitHub branches.
- **Wrap-up:** fixed text wrapping letter by letter.

## Sat 21 Nov
- **Wrap-up:** reviewed the P3 summary.

## Mon 23 Nov
- **Morning:** fixed broken profile image links; added the Overall analytics button; set sync to every 7 days with a manual Sync button.
- **Midday:** updated the schema docs; checked the P4 docs against the code; fixed three code issues and the chart.
- **Afternoon:** reset all users and data ready for a fresh upload.
- **Wrap-up:** traced the duplicate count to backup data (83 real profiles); updated the profile layout.

## Tue 24 Nov
- **Morning:** fixed the sync-policy and spec errors (tasks 25–28 in the tracker).
- **Midday:** removed unused files and code from the app.
- **Afternoon:** increased the heading and description text sizes; fixed the failing performance tests.
