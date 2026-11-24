/** One figure for the statement upload, used by the reader, the form and the Server Action body limit in next.config.ts. */
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
/** Room on top of the file for the rest of the form (account, password, dates) and multipart framing. */
export const IMPORT_BODY_OVERHEAD = 1024 * 1024;
export const IMPORT_TOO_LARGE = "That file is too large (over 15 MB).";
