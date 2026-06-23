import { Router } from '../core/router';
import { LeaderboardController } from '../controllers/leaderboard.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { globalLeaderboardQuerySchema } from '../validators/leaderboard.validator';

const router = new Router();

router.use(authenticate);

router.get(
  '/',
  validate(globalLeaderboardQuerySchema, 'query'),
  LeaderboardController.global,
);

export default router;
