import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Prisma 7 для SQLite требует driver adapter. Мы создаем его один раз и переиспользуем
// через globalThis, чтобы nodemon не открывал лишние подключения при hot reload.
const globalForPrisma = globalThis;

const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";

const adapter =
  globalForPrisma.prismaAdapter ||
  new PrismaBetterSqlite3({ url: databaseUrl });

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaAdapter = adapter;
}

export default prisma;