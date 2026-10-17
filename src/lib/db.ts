import { PrismaClient } from "@prisma/client";

// Shared Prisma client. In dev (hot-reload) the client is cached on globalThis
// so each module reload doesn't open a new DB connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
