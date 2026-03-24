const DEFAULT_WEB_HOST = "gafus.ru";

export function isPaymentSuccessReturnUrl(url: string, expectedHost = DEFAULT_WEB_HOST): boolean {
  /* eslint-disable @gafus/require-client-catch-tracer -- невалидный URL → false */
  try {
    const parsed = new URL(url);
    const paid = parsed.searchParams.get("paid");
    const from = parsed.searchParams.get("from");
    return (
      parsed.host === expectedHost &&
      parsed.pathname.startsWith("/trainings/") &&
      paid === "1" &&
      from === "app"
    );
  } catch {
    return false;
  }
  /* eslint-enable @gafus/require-client-catch-tracer */
}

