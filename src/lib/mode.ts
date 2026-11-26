// Two ways to run the app, chosen by the build env.
// - VITE_API_SERVER=true: email + password sign-in; data and document files in PostgreSQL behind the API server
//   (server/). See docs/server.md.
// - Otherwise: PROTOTYPE mode for demos and testing. No sign-in (an "Acting as" switch in the account menu picks the
//   team member) and no server; everything is saved in this browser (IndexedDB), so it survives reloads but isn't shared.

/** The API server (an SSR build of the same code) is never a prototype, whatever its build env holds. */
export const PROTOTYPE = import.meta.env.VITE_API_SERVER?.trim() !== 'true' && !import.meta.env.SSR

/** The admin a new workspace starts with (there is no other data until you add it). */
export const OWNER_ID = 'usr_owner'
