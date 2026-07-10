import { Router } from 'express';
import * as ctrl from '../controllers/roles.controller.js';
import { requireTenantOwner } from '../middleware/tenant.js';

const router = Router();

router.get('/', requireTenantOwner(), ctrl.listRoles);
router.post('/', requireTenantOwner(), ctrl.createRole);
router.put('/:id', requireTenantOwner(), ctrl.updateRole);
router.delete('/:id', requireTenantOwner(), ctrl.deleteRole);

export default router;
