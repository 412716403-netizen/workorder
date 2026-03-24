import { Router } from 'express';
import { z } from 'zod';
import * as authCtrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的11位中国大陆手机号'),
  password: z.string().min(6).max(100),
  displayName: z.string().max(100).optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const updateMeSchema = z
  .object({
    displayName: z.string().max(100).optional(),
    oldPassword: z.string().optional(),
    newPassword: z.union([z.string().min(6).max(100), z.literal('')]).optional(),
  })
  .refine(
    (b) =>
      b.displayName !== undefined || (b.newPassword !== undefined && String(b.newPassword).length > 0),
    { message: '请至少修改一项' },
  )
  .refine((b) => !b.newPassword || b.oldPassword, { message: '修改密码需填写原密码' });

const phoneSendOldSchema = z.object({
  oldPhone: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的11位手机号'),
});
const phoneVerifyOldSchema = z.object({
  oldPhone: z.string().regex(/^1[3-9]\d{9}$/),
  code: z.string().min(4).max(8),
});
const phoneSendNewSchema = z.object({
  phaseToken: z.string().min(10),
  newPhone: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的新手机号'),
});
const phoneCompleteSchema = z.object({
  phaseToken: z.string().min(10),
  newPhone: z.string().regex(/^1[3-9]\d{9}$/),
  code: z.string().min(4).max(8),
});

router.post('/register', validate(registerSchema), authCtrl.register);
router.post('/login', validate(loginSchema), authCtrl.login);
router.post('/refresh', authCtrl.refresh);
router.post('/logout', authCtrl.logout);
router.get('/me', authMiddleware, authCtrl.getMe);
router.put('/me', authMiddleware, validate(updateMeSchema), authCtrl.updateMe);
router.post('/phone-change/send-code-old', authMiddleware, validate(phoneSendOldSchema), authCtrl.phoneChangeSendOld);
router.post(
  '/phone-change/verify-old-code',
  authMiddleware,
  validate(phoneVerifyOldSchema),
  authCtrl.phoneChangeVerifyOldCode,
);
router.post('/phone-change/send-code-new', authMiddleware, validate(phoneSendNewSchema), authCtrl.phoneChangeSendNew);
router.post('/phone-change/complete', authMiddleware, validate(phoneCompleteSchema), authCtrl.phoneChangeComplete);

export default router;
