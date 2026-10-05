import { prisma } from "@gafus/prisma";
import { syncProfitFinance } from "@gafus/core/services/appSubscription";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--apply", "--dry-run"].includes(arg)) || args.length > 1) {
    throw new Error("Usage: profit:sync [--dry-run | --apply]");
  }
  const report = await syncProfitFinance(args.includes("--apply"));
  console.log(JSON.stringify(report, null, 2));
  if (
    report.failedPayments ||
    report.missingFinance ||
    report.completedPayments !== report.paymentsVerified
  ) {
    process.exitCode = 2;
  }
}

main()
  .catch(() => {
    console.error(
      "Financial reconciliation failed. Check credentials, provider availability and financial data. No secrets are logged.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
