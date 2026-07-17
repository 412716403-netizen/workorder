-- AlterTable: 资料库附件保存原始文件名，用于卡片展示与下载 Content-Disposition
ALTER TABLE "knowledge_assets" ADD COLUMN "file_name" VARCHAR(255);
