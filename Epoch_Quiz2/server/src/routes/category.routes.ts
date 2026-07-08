import { Router } from '../core/router';
import { CategoryController } from '../controllers/category.controller';

const router = new Router();

router.get('/', CategoryController.list);

export default router;
