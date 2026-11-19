// Two ways to run the app, chosen by the build env. Neither has sign-in (for now): an "Acting as" switch in the
// account menu picks which team member you are.
// - VITE_API_SERVER=true: data and document files in PostgreSQL behind the API server (server/). See docs/auth.md.
// - Otherwise: PROTOTYPE mode for demos and testing. No server; everything is saved in this browser (IndexedDB), so it
//   survives reloads but isn't shared.

/** The API server (an SSR build of the same code) is never a prototype, whatever its build env holds. */
export const PROTOTYPE = import.meta.env.VITE_API_SERVER?.trim() !== 'true' && !import.meta.env.SSR

/** The admin a new workspace starts with (there is no other data until you add it). */
export const OWNER_ID = 'usr_owner'

/**
 * No social-platform API is connected yet, so profile lookup and sync can't fetch stats (they say so). Options that
 * only make sense with it, like "Fetch public profiles" on CSV import, stay hidden until this is true.
 */
export const PROFILE_LOOKUP_CONNECTED = false
