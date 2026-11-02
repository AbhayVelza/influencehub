# API contract

The MSW mocks implement this. Behaviour the backend must match is in `contract-decisions.md`.

Base `VITE_API_URL` + `/api/v1`. Lists → `{ items, total, page, page_size }`. Errors → `{ error: { code, message } }`.
- GET /influencers (q, category[], platform[], country[], state[], city[], stage[], assigned_to[], reach_min,
  reach_max, agreement=signed|missing, insights=received|missing, sort, page, page_size) · GET /influencers/filter-options?country=&state= (cascading, with counts)
- POST /influencers · GET/PATCH/DELETE /influencers/{id} · GET /influencers/check-handle?platform=&handle=
- POST /influencers/{id}/stage {to, reason} · POST /influencers/bulk {ids, action, value}
- GET /influencers/{id}/activity · POST /influencers/{id}/accounts · POST /influencers/merge
- PATCH /accounts/{id} {metrics} · POST /accounts/{id}/sync → {job_id} · POST /accounts/{id}/connect-link
  {send_email?} → {url, expires_at, emailed_to} · GET /accounts/{id}/snapshots · GET /accounts/{id}/media
- POST /duplicates/check · GET /duplicates · POST /duplicates/{id}/dismiss
- GET/POST /influencers/{id}/calls · GET /calls/follow-ups?bucket=today|overdue|upcoming|history · POST /calls/{id}/done
- GET/POST/PATCH /packages · GET /pipeline · GET /dashboard/summary
- GET /influencers/{id}/documents · POST /influencers/{id}/documents {key, type, title, ...metadata} ·
  GET /documents (type[], q, uploaded_by[], uploaded_from, uploaded_to, page, page_size) ·
  POST /documents/presign {influencer_id, type, file_name, content_type, size} → {upload_url, key} ·
  GET /documents/{id}/download → {url} · DELETE /documents/{id}
- POST /lookup {platform, username} → {job_id} · POST /imports/csv/presign · POST /imports/csv → {job_id}
- POST /exports/influencers → {job_id} · GET /jobs/{id} → {status, progress, result, error}
- GET /me · GET/POST/PATCH /team · GET/POST/PATCH /categories · GET/POST/DELETE /saved-views
- GET /pool (same filters, sort and pagination as /influencers) · GET /pool/filter-options · GET /pool/{id} ·
  GET /pool/expiring · POST /influencers/{id}/claim · POST /influencers/{id}/release {reason} ·
  POST /influencers/bulk action `claim` · GET/PATCH /settings/pool {claim_limit, auto_release_days}
Async actions return job_id; UI polls GET /jobs/{id} every 2 s.
