"use server";

import { prisma } from "@gafus/prisma";

import type { ErrorFilters } from "@gafus/types";

export async function getErrorFilters(): Promise<ErrorFilters> {
  try {
    const [appNames, environments] = await Promise.all([
      prisma.errorReport.findMany({
        select: { appName: true },
        distinct: ["appName"],
      }),
      prisma.errorReport.findMany({
        select: { environment: true },
        distinct: ["environment"],
      }),
    ]);

    return {
      appNames: appNames.map((item: { appName: string }) => item.appName).filter(Boolean) as string[],
      environments: environments.map((item: { environment: string }) => item.environment).filter(Boolean) as string[],
      dateRange: { from: null, to: null },
    };
  } catch (error) {
    console.error("Ошибка при получении фильтров:", error);
    return {
      appNames: [],
      environments: [],
      dateRange: { from: null, to: null },
    };
  }
}
