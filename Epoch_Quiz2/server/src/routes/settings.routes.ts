import { Router } from '../core/router';
import { SettingsController } from '../controllers/settings.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { ADMIN_ROLES } from '../utils/roles';

const router = new Router();

router.use(authenticate);
router.use(authorize(...ADMIN_ROLES));

router.get('/',              SettingsController.getAll);
router.get('/:category',     SettingsController.getCategory);
router.patch('/',            SettingsController.updateMany);

export default router;
