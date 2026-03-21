-- AlterTable: widen refresh_tokens.token from varchar(500) to text
ALTER TABLE "refresh_tokens" ALTER COLUMN "token" TYPE TEXT;
