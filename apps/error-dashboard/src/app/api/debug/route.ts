import { prisma } from "@gafus/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const errors = await prisma.errorReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const stats = await prisma.errorReport.count();

    return NextResponse.json({
      success: true,
      totalErrors: stats,
      errors: errors.map((error: { id: string; message: string; appName: string; environment: string; createdAt: Date; resolved: boolean; url: string | null; userAgent: string | null }) => ({
        id: error.id,
        message: error.message,
        appName: error.appName,
        environment: error.environment,
        createdAt: error.createdAt,
        resolved: error.resolved,
        url: error.url,
        userAgent: error.userAgent,
      })),
    });
  } catch (error) {
    console.error("Debug API error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
