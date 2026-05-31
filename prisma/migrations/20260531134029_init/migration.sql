-- CreateTable
CREATE TABLE "civilizations" (
    "id" SMALLINT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "civilizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "races" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "races_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sets" (
    "id" SERIAL NOT NULL,
    "set_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "product_type" TEXT,
    "series" TEXT,
    "released_at" DATE,
    "released_ym" CHAR(7),
    "source" TEXT,

    CONSTRAINT "sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "name_reading" TEXT,
    "card_type" TEXT NOT NULL,
    "cost" SMALLINT,
    "power" INTEGER,
    "text" TEXT,
    "flavor_text" TEXT,
    "illustrator" TEXT,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_civilizations" (
    "card_id" INTEGER NOT NULL,
    "civilization_id" SMALLINT NOT NULL,

    CONSTRAINT "card_civilizations_pkey" PRIMARY KEY ("card_id","civilization_id")
);

-- CreateTable
CREATE TABLE "card_races" (
    "card_id" INTEGER NOT NULL,
    "race_id" INTEGER NOT NULL,

    CONSTRAINT "card_races_pkey" PRIMARY KEY ("card_id","race_id")
);

-- CreateTable
CREATE TABLE "printings" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "set_id" INTEGER NOT NULL,
    "card_number" TEXT,
    "rarity" TEXT,

    CONSTRAINT "printings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rulesets" (
    "id" SMALLINT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "rulesets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restriction_types" (
    "id" SMALLINT NOT NULL,
    "name" TEXT NOT NULL,
    "max_copies" SMALLINT NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "restriction_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_restrictions" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "ruleset_id" SMALLINT NOT NULL,
    "restriction_type_id" SMALLINT NOT NULL,
    "effective_from" DATE,

    CONSTRAINT "card_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "civilizations_name_key" ON "civilizations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "races_name_key" ON "races"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sets_set_code_key" ON "sets"("set_code");

-- CreateIndex
CREATE UNIQUE INDEX "cards_name_key" ON "cards"("name");

-- CreateIndex
CREATE UNIQUE INDEX "printings_set_id_card_number_key" ON "printings"("set_id", "card_number");

-- CreateIndex
CREATE UNIQUE INDEX "rulesets_code_key" ON "rulesets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "restriction_types_name_key" ON "restriction_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "card_restrictions_card_id_ruleset_id_effective_from_key" ON "card_restrictions"("card_id", "ruleset_id", "effective_from");

-- AddForeignKey
ALTER TABLE "card_civilizations" ADD CONSTRAINT "card_civilizations_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_civilizations" ADD CONSTRAINT "card_civilizations_civilization_id_fkey" FOREIGN KEY ("civilization_id") REFERENCES "civilizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_races" ADD CONSTRAINT "card_races_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_races" ADD CONSTRAINT "card_races_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printings" ADD CONSTRAINT "printings_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printings" ADD CONSTRAINT "printings_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_restrictions" ADD CONSTRAINT "card_restrictions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_restrictions" ADD CONSTRAINT "card_restrictions_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rulesets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_restrictions" ADD CONSTRAINT "card_restrictions_restriction_type_id_fkey" FOREIGN KEY ("restriction_type_id") REFERENCES "restriction_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
