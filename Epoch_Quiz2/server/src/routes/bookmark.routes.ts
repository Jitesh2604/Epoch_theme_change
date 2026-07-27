import { Router } from '../core/router';
import { BookmarkController } from '../controllers/bookmark.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { bookmarkBodySchema, questionIdParamsSchema } from '../validators/bookmark.validator';

const router = new Router();

router.get('/', authenticate, BookmarkController.list);
router.post('/', authenticate, validate(bookmarkBodySchema), BookmarkController.add);
router.delete(
  '/:questionId',
  authenticate,
  validate(questionIdParamsSchema, 'params'),
  BookmarkController.remove,
);

export default router;
