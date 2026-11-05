// Where a presign step tells the client to put a file. There is no server to hand out presigned URLs, so the
// "URL" names the target instead: document files go to Firebase Storage under the key, CSV imports stay in this tab.

/** `firebase-storage:<key>`: upload the file to Firebase Storage at <key> (documentsApi.upload). */
export const STORAGE_UPLOAD_PREFIX = 'firebase-storage:'

/** `local-file:<key>`: prototype mode keeps the document file in this browser (IndexedDB) under <key>. */
export const LOCAL_FILE_PREFIX = 'local-file:'

/** `local-upload:<key>`: hand the file to the data layer in this tab (importsApi.uploadToPresignedUrl). */
export const LOCAL_UPLOAD_PREFIX = 'local-upload:'
