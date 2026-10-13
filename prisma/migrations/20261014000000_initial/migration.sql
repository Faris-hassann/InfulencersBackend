-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "books" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" VARCHAR(2048) NOT NULL,
    "youtubeUrl" VARCHAR(2048) NOT NULL,
    "publishedOn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "podcasts" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" VARCHAR(2048) NOT NULL,
    "youtubeUrl" VARCHAR(2048) NOT NULL,
    "publishedOn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "podcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tips_and_tricks" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" VARCHAR(2048) NOT NULL,
    "youtubeUrl" VARCHAR(2048) NOT NULL,
    "publishedOn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tips_and_tricks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" VARCHAR(2048) NOT NULL,
    "youtubeUrl" VARCHAR(2048) NOT NULL,
    "publishedOn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletters" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" VARCHAR(2048) NOT NULL,
    "youtubeUrl" VARCHAR(2048) NOT NULL,
    "publishedOn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" SERIAL NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phoneNumber" VARCHAR(32) NOT NULL,
    "createdOn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "books_publishedOn_id_idx" ON "books"("publishedOn", "id");

-- CreateIndex
CREATE INDEX "podcasts_publishedOn_id_idx" ON "podcasts"("publishedOn", "id");

-- CreateIndex
CREATE INDEX "tips_and_tricks_publishedOn_id_idx" ON "tips_and_tricks"("publishedOn", "id");

-- CreateIndex
CREATE INDEX "news_publishedOn_id_idx" ON "news"("publishedOn", "id");

-- CreateIndex
CREATE INDEX "newsletters_publishedOn_id_idx" ON "newsletters"("publishedOn", "id");

-- CreateIndex
CREATE INDEX "contacts_createdOn_id_idx" ON "contacts"("createdOn", "id");
