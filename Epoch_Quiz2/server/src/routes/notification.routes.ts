import { z } from 'zod';
import { Router } from '../core/router';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { paginationSchema } from '../utils/pagination';
import { NotificationType } from '../lib/enums';
import { ADMIN_ROLES } from '../utils/roles';

// Coerces `page`/`limit` from query strings to numbers so LIMIT/OFFSET
// receive numeric params (raw string params make MySQL reject `LIMIT '20'`).
const listNotificationsQuerySchema = paginationSchema.extend({
  type: z.nativeEnum(NotificationType).optional(),
});

const router = new Router();

router.use(authenticate);

router.get('/',     validate(listNotificationsQuerySchema, 'query'), NotificationController.list);
router.post('/',    authorize(...ADMIN_ROLES), NotificationController.create);
router.get('/:id',  NotificationController.getById);
router.delete('/:id', authorize(...ADMIN_ROLES), NotificationController.remove);

export default router;
