import { Router } from '../core/router';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { ADMIN_ROLES } from '../utils/roles';
import { ContentController } from '../controllers/content.controller';

const router = new Router();

// All content-sync administration is admin-only.
router.use(authenticate);

router.post('/sync',        authorize(...ADMIN_ROLES), ContentController.sync);
router.get('/sync/status',  authorize(...ADMIN_ROLES), ContentController.status);
router.get('/sync/logs',    authorize(...ADMIN_ROLES), ContentController.logs);

export default router;
