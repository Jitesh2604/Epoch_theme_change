import type { Request, Response } from '../core/types';
import { ExcelService } from '../services/excel.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { Actor } from '../services/assessment.service';
import type { UploadQuery } from '../validators/upload.validator';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

export const UploadController = {
  importQuestions: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw ApiError.badRequest('No file uploaded — expected field "file"');
    const { dryRun, assessmentId, stopOnError } = req.query as unknown as UploadQuery;

    const summary = await ExcelService.importQuestions(actorFrom(req), req.file.buffer, {
      dryRun:       Boolean(dryRun),
      stopOnError:  Boolean(stopOnError),
      assessmentId: typeof assessmentId === 'string' ? assessmentId : undefined,
    });

    ApiResponse.ok(res, summary, summary.dryRun ? 'Dry-run completed' : 'Import completed');
  }),

  downloadTemplate: asyncHandler(async (_req: Request, res: Response) => {
    const buf = ExcelService.buildTemplateBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="epoch-quiz-questions-template.xlsx"');
    res.setHeader('Content-Length', buf.length.toString());
    res.send(buf);
  }),
};
