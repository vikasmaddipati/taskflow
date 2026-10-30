import express from 'express';
import {
  chatWithAi,
  parseTaskPrompt,
  breakdownProject,
  optimizeSchedule
} from '../controllers/aiController.js';
import { protect } from '../middleware/auth.js';
import { resolveTenant } from '../middleware/tenant.js';

const router = express.Router();

// Apply auth and tenant resolution to all AI endpoints
router.use(protect);
router.use(resolveTenant);

router.post('/chat', chatWithAi);
router.post('/parse', parseTaskPrompt);
router.post('/breakdown', breakdownProject);
router.post('/optimize', optimizeSchedule);

export default router;
