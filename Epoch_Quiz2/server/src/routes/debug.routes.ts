// ── TEMPORARY CONTENT CLIENT DEBUG ──
// Dev-only route file. NEVER mounted at all when isDev is false — see the
// `if (isDev)` guard around `router.use('/debug', debugRoutes)` in
// routes/index.ts. That means this endpoint does not exist in production,
// not just "returns 404" — there is no route to match at any layer.
import { Router } from '../core/router';
import { authenticate } from '../middlewares/authenticate';
import { DebugController } from '../controllers/debug.controller';

const router = new Router();

router.use(authenticate);

// GET /api/v1/debug/content-client/questions?subjectId=&boardId=&standardId=&bookId=&chapterId=&limit=&offset=
router.get('/content-client/questions', DebugController.rawContentClientQuestions);

// GET /api/v1/debug/content-client/all — boards + standards + subjects +
// series + books + chapters (first book) + a small questions sample, all in one response.
router.get('/content-client/all', DebugController.rawContentClientAll);

export default router;
// ── END TEMPORARY CONTENT CLIENT DEBUG ──
