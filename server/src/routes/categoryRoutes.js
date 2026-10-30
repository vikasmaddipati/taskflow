import express from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/categoryController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  createCategorySchema,
  updateCategorySchema,
  deleteCategorySchema
} from '../validations/categorySchemas.js';
import { taskIdParamSchema } from '../validations/taskSchemas.js';

const router = express.Router();

// All category routes require active authentication & organization context
router.use(protect);
router.use(resolveTenant);

router
  .route('/')
  .get(getCategories)
  .post(validate({ body: createCategorySchema }), createCategory);

router
  .route('/:id')
  .put(validate({ params: taskIdParamSchema, body: updateCategorySchema }), updateCategory)
  .delete(validate({ params: taskIdParamSchema, body: deleteCategorySchema }), deleteCategory);

export default router;
