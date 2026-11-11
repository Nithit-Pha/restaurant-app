-- Username login: everyone signs in with a username instead of an email.
-- Existing users get a username made from the part of their email before '@'
-- (lowercased, characters outside a-z 0-9 . _ - removed, padded to 3 chars,
-- a number added on clashes). Email becomes optional for staff accounts.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT;

-- Backfill existing users
WITH cleaned AS (
  SELECT "id", "createdAt",
         left(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g'), 28) AS "raw"
  FROM "User"
), base AS (
  -- rpad also truncates, so only pad names shorter than 3
  SELECT "id", "createdAt",
         CASE WHEN length("raw") < 3 THEN rpad("raw", 3, '0') ELSE "raw" END AS "name"
  FROM cleaned
), numbered AS (
  SELECT "id", "name", row_number() OVER (PARTITION BY "name" ORDER BY "createdAt", "id") AS "n"
  FROM base
)
UPDATE "User" u
SET "username" = CASE WHEN numbered."n" = 1 THEN numbered."name" ELSE numbered."name" || numbered."n" END
FROM numbered
WHERE u."id" = numbered."id";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
