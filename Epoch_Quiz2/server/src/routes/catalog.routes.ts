import { Router } from '../core/router';
import { authenticate } from '../middlewares/authenticate';
import { listBoards, listClasses, listSeries, listBooks, getTeacherByCode } from '../controllers/catalog.controller';

const router = new Router();

router.use(authenticate);

router.get('/boards',        listBoards);
router.get('/classes',       listClasses);
router.get('/series',        listSeries);
router.get('/books',         listBooks);
router.get('/teacher/:code', getTeacherByCode);

export default router;
