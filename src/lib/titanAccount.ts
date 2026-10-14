import { prisma } from "./db";
// The single active Titan account. Credentials live in the DB (set via
// Settings → Accounts) and fall back to .env when no account has been
// configured yet — so existing .env setups keep working until first
// configured in-app. Cached and invalidated on every change so edits apply
// instantly without a restart.

export type TitanAccount = {
  email: string;
  password: string;
  source: "db" | "env";
};

let cache: { at: number; data: TitanAccount | null } | null = null;
const TTL = 3000;

export function invalidateTitanAccount() {
  cache = null;
}

function envAccount(): TitanAccount | null {
  const email = process.env.TITAN_EMAIL;
  const password = process.env.TITAN_PASSWORD;
  if (email && password) return { email, password, source: "env" };
  return null;
}

const SUPPRESS_KEY = "titanEnvSuppressed";

/** Suppress (or un-suppress) the .env fallback account after a user delete. */
export async function setEnvSuppressed(suppressed: boolean): Promise<void> {
  try {
    if (suppressed) {
      await prisma.appSetting.upsert({
        where: { key: SUPPRESS_KEY },
        create: { key: SUPPRESS_KEY, value: "1" },
        update: { value: "1" },
      });
    } else {
      await prisma.appSetting.deleteMany({ where: { key: SUPPRESS_KEY } });
    }
  } catch { /* best-effort */ }
  cache = null;
}

/** The active Titan account, or null when none is configured. */
export async function getTitanAccount(): Promise<TitanAccount | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL) return cache.data;
  let data: TitanAccount | null = null;
  try {
    const row = await prisma.titanAccount.findFirst({ orderBy: { updatedAt: "desc" } });
    if (row && row.email) {
      data = { email: row.email, password: row.password, source: "db" };
    } else {
      const suppress = await prisma.appSetting.findUnique({ where: { key: SUPPRESS_KEY } });
      data = suppress ? null : envAccount();
    }
  } catch {
    data = envAccount();
  }
  cache = { at: now, data };
  return data;
}

/** The active account's email (or "" when none) — used to scope EventLink rows. */
export async function activeAccountEmail(): Promise<string> {
  const acct = await getTitanAccount();
  return acct?.email || "";
}

/** True when any Titan account is configured (DB or env). */
export async function hasTitanAccount(): Promise<boolean> {
  return (await getTitanAccount()) !== null;
}
