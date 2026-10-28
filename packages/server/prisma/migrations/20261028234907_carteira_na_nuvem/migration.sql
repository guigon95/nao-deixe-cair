-- CreateTable
CREATE TABLE "Wallet" (
    "playerId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "owned" TEXT[],
    "skin" TEXT NOT NULL,
    "trail" TEXT NOT NULL,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("playerId","game")
);

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
