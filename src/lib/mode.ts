// Two ways to run the app, chosen by the build env:
// - Firebase configured (VITE_FIREBASE_API_KEY, _AUTH_DOMAIN, _PROJECT_ID): real sign-in, data in Firestore, files in
//   Storage. See docs/auth.md.
// - Otherwise: PROTOTYPE mode for demos and testing. No sign-in; everything is saved in this browser (IndexedDB), so it
//   survives reloads but isn't shared. An "Acting as" switch in the account menu lets you try each role.

export const FIREBASE_CONFIGURED = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY?.trim() &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
)

export const PROTOTYPE = !FIREBASE_CONFIGURED

/** The admin a prototype workspace starts with (there is no other data until you add it). */
export const PROTOTYPE_OWNER_ID = 'usr_owner'

/**
 * No social-platform API is connected yet, so profile lookup and sync can't fetch stats (they say so). Options that
 * only make sense with it, like "Fetch public profiles" on CSV import, stay hidden until this is true.
 */
export const PROFILE_LOOKUP_CONNECTED = false
