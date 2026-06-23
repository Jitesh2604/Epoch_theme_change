import { Router } from '../core/router';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { ADMIN_ROLES } from '../utils/roles';

const router = new Router();

router.use(authenticate);

router.get('/',     NotificationController.list);
router.post('/',    authorize(...ADMIN_ROLES), NotificationController.create);
router.get('/:id',  NotificationController.getById);
router.delete('/:id', authorize(...ADMIN_ROLES), NotificationController.remove);

export default router;
