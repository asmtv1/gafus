export const runtime = "edge";

export async function GET() {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "trainer-panel",
      timestamp: new Date().toISOString(),
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

