import { Router } from '../core/router';
import { LeaderboardController } from '../controllers/leaderboard.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import {
  globalLeaderboardQuerySchema,
  scopedLeaderboardQuerySchema,
  myRankingQuerySchema,
} from '../validators/leaderboard.validator';

const router = new Router();

router.use(authenticate);

router.get(
  '/',
  validate(globalLeaderboardQuerySchema, 'query'),
  LeaderboardController.global,
);

// ── Assessment Leaderboard (School / State / Global) ──────────────────────
router.get('/sessions', LeaderboardController.sessions);

router.get(
  '/assessment/me',
  validate(myRankingQuerySchema, 'query'),
  LeaderboardController.myRanking,
);

router.get(
  '/assessment',
  validate(scopedLeaderboardQuerySchema, 'query'),
  LeaderboardController.scoped,
);

export default router;
