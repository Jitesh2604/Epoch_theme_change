import { z } from 'zod';
import { UploadStatus } from '../lib/enums';
import { paginationSchema } from '../utils/pagination';

export const uploadQuerySchema = z.object({
  dryRun:       z.coerce.boolean().optional().default(false),
  assessmentId: z.string().min(1).optional(),
  // If true, refuse the whole upload when any row fails validation.
  // If false (default), valid rows are imported and errors are reported.
  stopOnError:  z.coerce.boolean().optional().default(false),
});

export const listUploadsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(UploadStatus).optional(),
});

export type UploadQuery      = z.infer<typeof uploadQuerySchema>;
export type ListUploadsQuery = z.infer<typeof listUploadsQuerySchema>;
