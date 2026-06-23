/**
 * Excel file upload middleware — replaces multer.
 * Uses our native multipart parser (src/core/middleware/multipart.ts).
 */

import { singleUpload } from '../core/middleware/multipart';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const allowedMime = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls
  'application/octet-stream',                                          // some browsers
]);

const allowedExt = /\.(xlsx|xls)$/i;

export const excelUpload = singleUpload('file', {
  maxFileSize: MAX_FILE_BYTES,
  allowedMime,
  allowedExt,
});
