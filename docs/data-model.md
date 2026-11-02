# Data model

Must match the backend exactly.
Source of truth: `src/types/index.ts`. Update both together.

- **Stage** (value · label · color): data_gathered·Data Gathered·slate | contacted·Contacted·blue |
  onboarded·Onboarded·violet | package_sent·Package Sent·amber | delivered·Delivered·green |
  on_hold·On Hold·gray | rejected·Rejected·red
- **Transitions**: data_gathered → contacted/on_hold/rejected; contacted → onboarded/on_hold/rejected;
  onboarded → package_sent/on_hold/rejected; package_sent → delivered/onboarded (returned);
  on_hold → previous stage/rejected; rejected → data_gathered (manager/admin only). Admin can override.
  → contacted requires a call log with outcome "interested"; → onboarded (from contacted) requires a current
  agreement; → package_sent requires a package with courier + tracking number.
- **CallOutcome**: interested, not_interested, call_back, no_answer, wrong_number
- **DocumentType**: insights_summary, agreement
- **PackageStatus**: preparing, sent, in_transit, delivered, returned
- **AccountType**: business, creator, personal, unknown · **SyncStatus**: synced, pending, not_synced, error
- **Role**: admin, manager, executive
- **Categories**: Fashion, Beauty, Food, Tech, Travel, Fitness, Lifestyle, Gaming, Finance, Parenting, Other
- **Platform**: instagram, youtube, tiktok, facebook, threads, pinterest, linkedin, snapchat
- **SyncMethod** (default per platform): `lookup` = instagram, youtube, threads, facebook (public Pages);
  `connect` = tiktok, pinterest; `manual` = linkedin, snapchat, and personal Instagram / Facebook profiles.
  **ConnectStatus** (connect accounts): not_connected, link_sent, connected, expired.
- **SocialAccount**: id, influencer_id, platform, handle (lowercase, no @; unique per platform), profile_url,
  is_primary, sync_method, sync_status, last_synced_at, connect_status, connect_link_expires_at, display_name,
  profile_pic_url, bio, links[], is_verified, created_at, **metrics** (per platform, every value nullable):
  instagram {followers, following, posts, engagement_rate %, avg_likes, avg_comments, account_type} ·
  youtube {subscribers, total_views, video_count, avg_views_recent, channel_country} ·
  tiktok {followers, following, total_likes, video_count} · facebook {page_followers, page_likes, page_category} ·
  threads {followers, avg_likes_recent, avg_replies_recent} · pinterest {followers, monthly_views, pin_count,
  board_count} · linkedin {followers, connections} · snapchat {subscribers}.
  Labels, audience metric and URL patterns live in `src/lib/platforms.ts` (`PLATFORM_META`).
- **Influencer**: id, name, category, phone (E.164, default +91), email, address {line1, line2, city, state,
  postal_code, country}, city, state, country, profile_pic_url (primary account's), is_verified (any account),
  accounts[] (≥1, primary first), total_reach, stage, assigned_to, tags[], notes,
  onboarding_checklist {called, agreement_signed, insights_received, address_collected, ig_connected},
  documents {insights_count, has_agreement} | null (derived; null while unassigned), created_at, updated_at
- **CallLog**: id, influencer_id, called_by, outcome, notes, follow_up_date, follow_up_done, created_at
- **Package**: id, influencer_id, items [{name, qty}], address, courier, tracking_number, status, sent_at, delivered_at
- **Document**: id, influencer_id, type, title, file_name, content_type, size (bytes), uploaded_by, uploaded_at, notes.
  `insights_summary` adds period_start, period_end (yyyy-MM-dd), platform (optional). `agreement` adds signed_on,
  valid_until (optional) (yyyy-MM-dd), is_current.
- **Activity**: id, influencer_id, actor, type, payload, created_at. Types: created, updated, stage_changed, assigned,
  call_logged, package_created, package_updated, claimed `{}`, released `{from, reason, auto?}`,
  account_synced `{platform, handle, audience}`, account_added `{platform, handle}`,
  connect_link_sent `{platform, handle, emailed_to}`, merged `{merged_id, merged_name, fields, stage_from?, stage_to?}`,
  document_uploaded `{document_id, type, title}`, document_deleted `{document_id, type, title}`
- **AccountSnapshot**: audience, captured_at · **MediaItem**: thumbnail, permalink, likes, comments, posted_at
- **Permissions**: executive = view/add/edit/call/package/change stage on **their own** influencers, see the pool
  (preview only), claim from it, release their own to it; manager += see everything, assign/reassign, release anyone's,
  reopen rejected, delete, import/export, review & merge duplicates; admin += override stages, manage team,
  categories, integrations, pool guards.
  **Documents**: upload = executive (own influencers only), manager, admin; delete (soft) = manager and admin only;
  view follows influencer scoping and is never offered for pool (unassigned) influencers.
