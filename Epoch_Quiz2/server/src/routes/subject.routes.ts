import { Router } from '../core/router';
import { authenticate } from '../middlewares/authenticate';
import { SubjectController } from '../controllers/subject.controller';

const router = new Router();

router.use(authenticate);
router.get('/', SubjectController.list);

export default router;
