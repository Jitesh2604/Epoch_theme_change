import { z } from 'zod';

export const uploadQuerySchema = z.object({
  dryRun:       z.coerce.boolean().optional().default(false),
  assessmentId: z.string().min(1).optional(),
  // If true, refuse the whole upload when any row fails validation.
  // If false (default), valid rows are imported and errors are reported.
  stopOnError:  z.coerce.boolean().optional().default(false),
});

export type UploadQuery = z.infer<typeof uploadQuerySchema>;
