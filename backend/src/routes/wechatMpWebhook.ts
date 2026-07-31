import { Router } from 'express';
import * as ctrl from '../controllers/wechatMpWebhook.controller.js';

/** 公开回调：无 JWT；安全性靠微信 signature 验签 */
const router = Router();

router.get('/', ctrl.verify);
router.post('/', ctrl.receive);

export default router;
