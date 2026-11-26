# WorkDesk v2 – update prompt for Google AI Studio

Paste everything below the line into your WorkDesk app's chat in AI Studio (Build mode).

---

Update WorkDesk to v2. Keep the current visual style (warm beige background, dark pill buttons, rounded cards, same fonts), the 9:30 AM – 6:30 PM shift, and the existing owner-locked Firestore rules. Do not delete existing data; migrate it.

## 1. Data model (Firestore)

**tasks**: title, notes, project, area, priority (high|medium|low), startDate, endDate (optional), status (todo|in_progress|done), nextStep, completedAt, createdAt, updatedAt.

**shiftLogs**: date, window (full|morning|midday|afternoon|wrapup), project, area, summary, notes, taskId (optional), createdAt.

**settings** (single doc): displayName (default "Abhay"), projects (default ["InfluenceHub", "Traceability CRM", "Other"]), areas (default ["Docs", "Ops", "Planning", "Sync", "Schema", "Release", "Platform", "UI"]), shiftStart "09:30", shiftEnd "18:30".

**Migration (run once, then remember it ran):**
- Existing tasks: project "InfluenceHub", area "Other". Map active → todo and completed → done, keeping completedAt.
- Existing shift logs: project "InfluenceHub", area "Other".

## 2. Sidebar

DAILY SHIFT: Log Shift, Shift Logs (count), Focus Timer
TASK PIPELINE: Add Task, Active Tasks (count), Completed (count)
REPORTING: EOD Reports, Analytics
DATA: Import / Export
SETTINGS: Settings

Remove the "Antigravity Sync" page and any service-account / MCP setup text completely.

Shift Rhythm card: keep the progress bar. Below it show "Today's updates" (shift logs today + tasks completed today) and "Task completion %" (done ÷ all tasks due by today).

## 3. Log Shift

- Fields: "What did you work on?" (required), Notes (optional), Project (dropdown, required, remembers the last one used), Area (dropdown, required).
- Optional "Related task" picker listing active tasks of the chosen project. When one is picked, show a "Mark this task done" checkbox. Checking it sets status done and completedAt now.
- Shift Window chips: pre-select the window that contains the current time. Keep Full Shift as an option.
- Shift Date defaults to today.
- After saving, show a toast "Logged to <project>" and clear the form.
- Under the form, list today's logs as small cards (time window · project · summary) with edit and delete.

## 4. Add Task

- Fields: Task title (required), Deliverables / notes, Project, Area, Priority (High/Medium/Low pills), Start Date, End Date (optional), Next step (optional, one line).
- Remove "Target Span" (End Date replaces it).
- The header shows "N active now".

## 5. Active Tasks

- Table view with columns #, Task, Status, Due, Project, Area, Next step.
- Status is an inline dropdown: To do (gray), In progress (blue), Done (green).
- Filters at the top: Project, Area, Status, Priority, and a search box. Remember the last filter choices in localStorage.
- Overdue rows (End Date before today and not done) get a red "Overdue" tag.
- Clicking a row opens a side drawer to edit every field.

## 6. Completed

The same table, filtered to done and sorted by completedAt (newest first), with a "Reopen" button.

## 7. EOD Reports (fix the current bugs)

- "0 logs" bug: the report must include that day's shift logs AND the tasks completed that day.
- Group bullets by Project with a bold project heading. Each bullet is the task or log summary, at most 100 characters, never with notes appended.
- "Next Up": up to 3 open tasks, sorted by due date then priority, formatted as "<title> (due Wed 25 Nov)". Never include done tasks and never cut a word in half.
- If nothing was logged, show "No updates logged yet today" and still show Next Up.
- Sign off with settings.displayName instead of "Personal Work Desk".
- Templates:
  - EOD Summary Email: has a Subject line.
  - Slack / Teams Standup: Yesterday / Today / Blockers.
  - Weekly 7-Day Digest: grouped by project, then by day.
- Short Summary shows bullets only. Full Detailed adds notes and next steps.
- Keep the "Include Next Priorities" checkbox, the date picker and the Copy Report button. Show the counts "X logs · Y completed · Z words".

## 8. Analytics

- Cards: Tasks done this week, Logs this week, On-time completion %, Overdue count.
- Charts:
  - Tasks completed per day over the last 14 days (bar).
  - Work split by Project (donut).
  - Work split by Area (horizontal bar).

## 9. Import / Export

- **Import CSV** for tasks:
  - Accepted headers (case-insensitive): "#", "Main task", "Status", "When", "Area", "What it covers", "What's left / next step", and optional "Project".
  - Mapping: Main task → title, What it covers → notes, What's left → nextStep, When → startDate. Parse "Wed 25 Nov" in the current year; for a range like "Wed 28 Oct to Fri 30 Oct", use the first date as start and the last as end.
  - Status: Done → done, In progress → in_progress, anything else → todo.
  - Project: the CSV column, or a dropdown chosen before importing.
  - Upsert by title + project. An existing task is updated, never duplicated.
  - Show a preview table first: N new, M updated, K skipped. Write only after "Confirm import".
- **Export CSV** of tasks in the same columns, so it round-trips with the Excel / Claude Sheet tracker.
- **Export CSV** of shift logs: date, window, project, area, summary, notes.

## 10. Settings

Edit displayName, the projects list, the areas list and the shift start/end times (the shift window chips follow these times).

## 11. Quality

- Show loading and empty states on every page.
- Show inline validation messages on required fields.
- Every list and form must work at 375px phone width.
- All dates use the format "Tue 24 Nov 2026" in the UI, ISO strings in Firestore.
- No console errors. Firestore rules still allow only the owner account.

## 12. Done when

- [ ] Logging work with "Mark this task done" updates Shift Logs, Active Tasks, Completed and the EOD report immediately.
- [ ] The EOD report for today lists today's logs and completed tasks grouped by project, signed with my name.
- [ ] Importing the tracker CSV twice creates no duplicates.
- [ ] Antigravity Sync is gone from the sidebar and the code.
- [ ] Existing 59 logs and 34 completed tasks are still there after the migration.
