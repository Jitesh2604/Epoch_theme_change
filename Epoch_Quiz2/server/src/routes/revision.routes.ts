import { Router } from '../core/router';
import { RevisionController } from '../controllers/revision.controller';
import { authenticate } from '../middlewares/authenticate';

const router = new Router();

router.get('/dashboard', authenticate, RevisionController.dashboard);
router.post('/start', authenticate, RevisionController.start);

export default router;
