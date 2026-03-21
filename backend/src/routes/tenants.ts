import { Router } from 'express';
import * as ctrl from '../controllers/tenants.controller.js';

const router = Router();

router.post('/', ctrl.createTenant);
router.get('/', ctrl.listTenants);
router.get('/lookup', ctrl.lookupByInviteCode);
router.get('/my-applications', ctrl.getMyApplications);
router.post('/:id/select', ctrl.selectTenant);
router.get('/:id', ctrl.getTenant);
router.put('/:id', ctrl.updateTenant);
router.get('/:id/members', ctrl.getMembers);
router.get('/:id/reportable-members', ctrl.getReportableMembers);
router.put('/:id/members/:uid', ctrl.updateMemberRole);
router.put('/:id/members/:uid/perms', ctrl.updateMemberPermissions);
router.put('/:id/members/:uid/milestones', ctrl.updateMemberMilestones);
router.delete('/:id/members/:uid', ctrl.removeMember);
router.post('/:id/apply', ctrl.applyToJoin);
router.get('/:id/applications', ctrl.getApplications);
router.put('/:id/applications/:appId', ctrl.reviewApplication);

export default router;
