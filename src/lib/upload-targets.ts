// Where a presign step tells the client to put a file: document files are PUT to the API server (stored in
// PostgreSQL) or, in prototype mode, kept in this browser; CSV text is posted to the API.

/** `local-file:<key>`: prototype mode keeps the document file in this browser (IndexedDB) under <key>. */
export const LOCAL_FILE_PREFIX = 'local-file:'

/** `local-upload:<key>`: post the file's text to the API under <key> (importsApi.uploadToPresignedUrl). */
export const LOCAL_UPLOAD_PREFIX = 'local-upload:'
