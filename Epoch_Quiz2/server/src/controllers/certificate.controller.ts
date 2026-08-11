import type { Request, Response } from '../core/types';
import { CertificateService } from '../services/certificate.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { Actor } from '../services/assessment.service';
import type { CertificateIdParams } from '../validators/certificate.validator';

export const CertificateController = {
  // Always computed for the authenticated caller only — never accepts a
  // target student id, so a student can only ever fetch their own
  // certificates (see certificate.service.ts's myCertificates).
  mine: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const actor: Actor = { id: req.user.id, role: req.user.role };
    const items = await CertificateService.myCertificates(actor);
    ApiResponse.ok(res, items);
  }),

  // Public — no authenticate middleware on this route (see
  // certificate.routes.ts). Looks up by the certificate's public code only;
  // never accepts or exposes a student id/email.
  verify: asyncHandler(async (req: Request, res: Response) => {
    const { certificateId } = req.params as unknown as CertificateIdParams;
    const result = await CertificateService.verify(certificateId);
    ApiResponse.ok(res, result);
  }),
};
