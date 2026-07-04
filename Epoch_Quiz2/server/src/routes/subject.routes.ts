import { Router } from '../core/router';
import { SubjectController } from '../controllers/subject.controller';

const router = new Router();

// Public catalogue — subjects/categories are not sensitive and are needed by
// the (logged-out) marketing home page as well as the Quiz Play page.
router.get('/', SubjectController.list);

export default router;
