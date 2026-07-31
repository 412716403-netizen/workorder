import { Router } from 'express';
import * as ctrl from '../controllers/wxMp.controller.js';

/**
 * 微信服务号绑定（个人级，与 todos 相同：仅 auth + tenant，不挂 requireSubPermission）。
 */
const router = Router();

router.get('/status', ctrl.getStatus);
router.post('/bind-qrcode', ctrl.createBindQrcode);
router.post('/unbind', ctrl.unbind);

export default router;
