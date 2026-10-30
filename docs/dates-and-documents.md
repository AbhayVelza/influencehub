# Dates and documents

Contract decisions for the dd/MM/yyyy date format and for Documents.

- **Dates** (display and input only; API values stay ISO 8601, no contract change): every displayed date is
  `dd/MM/yyyy`; date-times are `dd/MM/yyyy, hh:mm a` in Asia/Kolkata ("28/10/2026, 04:30 PM"); chart axes are `dd/MM`;
  a time on its own is `hh:mm a`. Relative times ("2h ago") always carry the exact `dd/MM/yyyy, hh:mm a` time in
  their tooltip. Date inputs are text fields that show and accept `dd/MM/yyyy` (also `dd-MM-yyyy`, `dd.MM.yyyy`,
  `d/M/yyyy`); date-time inputs accept `dd/MM/yyyy, hh:mm a` or 24-hour `HH:mm`, read as IST. Calendar-only values
  (`period_start`, `signed_on`, `sent_from`, …) are `yyyy-MM-dd` on the wire and shown without any timezone shift.
  CSV import's optional `created_at` column ("Added on", new creators only) accepts `dd/MM/yyyy` or ISO 8601 (a date
  or time without an offset is IST); anything else is a row error. CSV export writes `created_at` as `dd/MM/yyyy`.
- **Documents**: `GET /influencers/{id}/documents` → every live document of that influencer, newest first (agreement
  history included). Upload = `POST /documents/presign` (validates type + size → `422 unsupported_file_type` /
  `file_too_large`; `{upload_url, key}`) → client PUTs the file to `upload_url` (the UI shows progress) →
  `POST /influencers/{id}/documents {key, type, title, notes?, …}` → 201 Document (`422 upload_missing` when the file
  never arrived; `422 validation_error` for bad metadata). Insights: `period_start`, `period_end` (start ≤ end),
  `platform?`. Agreement: `signed_on`, `valid_until?` (≥ signed_on). Allowed files: PDF, JPG, PNG, DOCX, XLSX, at most
  20 MB, validated in the UI before anything is uploaded and again at presign.
  Insights: many per influencer. Agreement: a new upload becomes `is_current`; older versions stay as history.
  Uploading ticks the checklist (`agreement_signed` / `insights_received`); deleting doesn't untick it.
  `DELETE /documents/{id}` is a soft delete (manager/admin, else `403`; 204): it is logged (`document_deleted`) and no
  longer served; deleting the current agreement makes the newest remaining version current.
  `GET /documents/{id}/download` → `{url}` (short-lived; used for download and for the PDF / image preview).
  `GET /documents` = every live document the caller may see, `{…Document, influencer: InfluencerSummary}`, newest
  upload first; `q` matches creator name / handles; `uploaded_from` / `uploaded_to` are IST calendar days.
  Scoping: executives only reach documents of influencers they own (anything else is 404 on every documents endpoint).
  Documents are never shown for pool influencers: for an unassigned influencer a manager/admin gets `409 in_pool` from
  the list / presign / create endpoints, `GET /documents` leaves them out, `Influencer.documents` is null and the
  Agreement / Insights filters match neither value. Merging two influencers moves the documents to the survivor (the
  newest agreement stays current).
  `Influencer.documents = {insights_count, has_agreement}` drives the list's Docs column and the filters
  `agreement=signed|missing`, `insights=received|missing` (single value each); PATCH can't change it.
  **Onboarded rule**: a standard move contacted → onboarded needs a current agreement, else
  `422 requirement_missing` (the UI then opens the agreement upload and finishes the move). Resuming from hold and a
  returned package keep what's on file; an admin override (e.g. data_gathered → onboarded, with a reason) skips it.
