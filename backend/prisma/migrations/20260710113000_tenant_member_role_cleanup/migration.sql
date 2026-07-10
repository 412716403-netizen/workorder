-- 企业内身份收口为 owner（创建者）/ worker（成员）。
-- 历史 admin 成员保留 role_id，后续业务权限完全由自定义角色决定。
UPDATE "tenant_memberships"
SET "role" = 'worker', "updated_at" = NOW()
WHERE "role" = 'admin';

-- dashboard 为已下线的经营看板历史权限；新工作台仅使用 workbench / workbench:<pageId>。
UPDATE "roles"
SET "permissions" = "permissions" - 'dashboard', "updated_at" = NOW()
WHERE "permissions" ? 'dashboard';

UPDATE "tenant_memberships"
SET "permissions" = "permissions" - 'dashboard', "updated_at" = NOW()
WHERE "permissions" ? 'dashboard';
