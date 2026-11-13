// Two ways to run the app, chosen by the build env:
// - Firebase configured (VITE_FIREBASE_API_KEY, _AUTH_DOMAIN, _PROJECT_ID): real sign-in (Firebase Auth), data in
//   PostgreSQL behind the API server (server/), files in Firebase Storage. See docs/auth.md.
// - Otherwise: PROTOTYPE mode for demos and testing. No sign-in and no server; everything is saved in this browser
//   (IndexedDB), so it survives reloads but isn't shared. An "Acting as" switch in the account menu lets you try each role.

export const FIREBASE_CONFIGURED = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY?.trim() &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
)

/** The API server (an SSR build of the same code) is never a prototype, whatever its build env holds. */
export const PROTOTYPE = !FIREBASE_CONFIGURED && !import.meta.env.SSR

/** The admin a prototype workspace starts with (there is no other data until you add it). */
export const PROTOTYPE_OWNER_ID = 'usr_owner'

/**
 * No social-platform API is connected yet, so profile lookup and sync can't fetch stats (they say so). Options that
 * only make sense with it, like "Fetch public profiles" on CSV import, stay hidden until this is true.
 */
export const PROFILE_LOOKUP_CONNECTED = false
