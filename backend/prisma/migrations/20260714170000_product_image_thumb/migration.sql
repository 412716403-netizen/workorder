-- Phase 3.H：产品主图缩略图（列表 lite 只返回 image_thumb，原图按需 get）
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_thumb" TEXT;
