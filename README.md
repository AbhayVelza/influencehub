# InfluenceHub — frontend

Internal CRM for finding, calling, onboarding and shipping packages to influencers.
React 19 + TypeScript + Vite, with a mock API (MSW) so it runs without a backend.

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

## Environment variables

| Variable | Meaning |
| --- | --- |
| `VITE_API_URL` | API origin, without `/api/v1`. Empty = same origin. |
| `VITE_USE_MOCKS` | `true` serves the API from MSW in the browser (`src/mocks`). Read at build time: a production build without it contains no mock code. |

Copy `.env.example` to `.env.local` to override. `.env.development` turns the mocks on for `npm run dev`;
`npm run build` has them off unless you set `VITE_USE_MOCKS=true`.

## Mock data

- 50 influencers (70% in Indian cities) across every stage, plus calls, packages, activity and a 4-person team.
  Dates shift on load, so "due today" and "overdue" follow-ups are always current.
- Data lives in memory: a full page reload resets it.
- Instagram usernames that simulate failures (lookup in **Add influencer**, and **Sync now**):

  | Username contains | Result |
  | --- | --- |
  | `personal` | Personal account: not synced, offered "Enter manually" |
  | `notfound` | Account not found |
  | `ratelimit` | Instagram rate limit |
  | anything else | A generated Business/Creator profile |

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
| Reassign, delete, reopen rejected, import / export |  | ✓ | ✓ |
| Stage override (with reason), Settings (incl. pool guards) |  |  | ✓ |

## More

`CLAUDE.md` holds the data model, the API contract and every contract decision the backend must match.
