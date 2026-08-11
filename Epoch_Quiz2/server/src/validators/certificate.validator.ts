import { z } from 'zod';

export const certificateIdParamsSchema = z.object({
  certificateId: z.string().trim().min(1, 'certificateId is required'),
});

export type CertificateIdParams = z.infer<typeof certificateIdParamsSchema>;
