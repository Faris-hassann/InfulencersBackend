-- AlterTable
ALTER TABLE "books" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "titleAr" VARCHAR(250),
ALTER COLUMN "youtubeUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "firstNameAr" VARCHAR(100),
ADD COLUMN     "lastNameAr" VARCHAR(100);

-- AlterTable
ALTER TABLE "news" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "titleAr" VARCHAR(250),
ALTER COLUMN "youtubeUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "newsletters" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "titleAr" VARCHAR(250),
ALTER COLUMN "youtubeUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "podcasts" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "titleAr" VARCHAR(250),
ALTER COLUMN "youtubeUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tips_and_tricks" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "titleAr" VARCHAR(250),
ALTER COLUMN "youtubeUrl" DROP NOT NULL;

-- CreateTable
CREATE TABLE "article_categories" (
    "id" SERIAL NOT NULL,
    "nameEn" VARCHAR(250) NOT NULL,
    "nameAr" VARCHAR(250) NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "createdOn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" SERIAL NOT NULL,
    "titleEn" VARCHAR(250) NOT NULL,
    "titleAr" VARCHAR(250) NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "articleCategoryId" INTEGER,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedOn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "awards" (
    "id" SERIAL NOT NULL,
    "titleEn" VARCHAR(250) NOT NULL,
    "titleAr" VARCHAR(250) NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedOn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_categories_createdOn_id_idx" ON "article_categories"("createdOn", "id");

-- CreateIndex
CREATE INDEX "articles_publishedOn_id_idx" ON "articles"("publishedOn", "id");

-- CreateIndex
CREATE INDEX "articles_articleCategoryId_idx" ON "articles"("articleCategoryId");

-- CreateIndex
CREATE INDEX "awards_publishedOn_id_idx" ON "awards"("publishedOn", "id");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_articleCategoryId_fkey" FOREIGN KEY ("articleCategoryId") REFERENCES "article_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
