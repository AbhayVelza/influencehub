// Where a presign step tells the client to put a file. The "URL" names the target: document files go to Firebase
// Storage under the key (or stay in this browser in prototype mode), CSV text is posted to the API.

/** `firebase-storage:<key>`: upload the file to Firebase Storage at <key> (documentsApi.upload). */
export const STORAGE_UPLOAD_PREFIX = 'firebase-storage:'

/** `local-file:<key>`: prototype mode keeps the document file in this browser (IndexedDB) under <key>. */
export const LOCAL_FILE_PREFIX = 'local-file:'

/** `local-upload:<key>`: post the file's text to the API under <key> (importsApi.uploadToPresignedUrl). */
export const LOCAL_UPLOAD_PREFIX = 'local-upload:'
