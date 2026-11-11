-- Thai / English: the website language a user chose, and optional Thai
-- names and descriptions for menu items. Only adds columns; existing users
-- get English.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "nameTh" TEXT,
ADD COLUMN     "descriptionTh" TEXT;
