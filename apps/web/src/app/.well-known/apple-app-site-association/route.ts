import { NextResponse } from "next/server";

/** Совпадает с apps/mobile app.json → ios.bundleIdentifier */
const IOS_APP_BUNDLE_ID = "ru.gafus.app";

/**
 * Apple App Site Association: Universal Links для открытия приложения по https://gafus.ru/training…
 * и веб-маршрутам /trainings/…. Нужен APPLE_TEAM_ID (Membership в Apple Developer).
 */
function buildAasaBody(teamId: string | undefined): Record<string, unknown> {
  const id = teamId?.trim();
  if (!id) {
    return { applinks: { details: [] } };
  }
  return {
    applinks: {
      details: [
        {
          appIDs: [`${id}.${IOS_APP_BUNDLE_ID}`],
          paths: ["/training", "/training/*", "/trainings", "/trainings/*"],
        },
      ],
    },
  };
}

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const body = buildAasaBody(process.env.APPLE_TEAM_ID);
  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
