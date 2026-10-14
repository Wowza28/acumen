import { prisma } from "./db";

const RATE_KEY = "usdToAedRate";
const DEFAULT_RATE = 3.67;

async function aedRate(): Promise<number> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: RATE_KEY } });
    const r = Number(s?.value);
    return Number.isFinite(r) && r > 0 ? r : DEFAULT_RATE;
  } catch {
    return DEFAULT_RATE;
  }
}

// Revenue = sum of DIRECTLY linked transactions, converted to AED then
// divided by 1.05 (amounts are VAT-inclusive). People-linked transactions are
// never counted. Kept in sync on every link/unlink and whenever the project
// detail page is opened, so it always reflects the live linked set.
export async function syncProjectRevenue(projectId: string): Promise<number> {
  const links = await prisma.transactionLink.findMany({
    where: { projectId },
    include: { transaction: true },
  });
  const rate = await aedRate();
  const totalAed = links.reduce((s, l) => {
    const amount = Number(l.transaction?.amount) || 0;
    const cur = (l.transaction?.currency || "").toUpperCase();
    return s + (cur === "USD" ? amount * rate : amount);
  }, 0);
  const revenue = Math.round((totalAed / 1.05) * 100) / 100;
  await prisma.project.update({ where: { id: projectId }, data: { revenue } });
  return revenue;
}
