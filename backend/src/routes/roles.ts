import { Router } from 'express';
import * as ctrl from '../controllers/roles.controller.js';

const router = Router();

router.get('/', ctrl.listRoles);
router.post('/', ctrl.createRole);
router.put('/:id', ctrl.updateRole);
router.delete('/:id', ctrl.deleteRole);

export default router;
