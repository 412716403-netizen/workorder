-- 开发款主图缩略图（列表 omit 原图，详情/点击预览再取 image_url）
ALTER TABLE "dev_styles" ADD COLUMN IF NOT EXISTS "image_thumb" TEXT;
