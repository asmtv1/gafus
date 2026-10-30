/**
 * Legacy 410 is a permanent user-visible retirement, and is permitted only
 * after explicit cutover AND a fresh real replacement readiness check.
 * Every failed/timeout/stale dependency response is retryable 503 instead.
 * This function never grants Chat2 message/room or media access.
 */
export async function chat2CanRetireLegacy(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): Promise<boolean> {
  // Literal, disposable QA ports/DB only; never substitutes a production host
  // or permits arbitrary caller-controlled readiness URLs.
  const isolated = env.NODE_ENV === "test" &&
    env.GAFUS_CHAT2_FULL_ISOLATED_ACCEPTANCE === "1" &&
    env.API_HOST === "127.0.0.1" && env.API_PORT === "58341" &&
    env.CHAT2_LOCAL_WORKER_PORT === "58342" &&
    env.REDIS_URL === "redis://127.0.0.1:56339" &&
    env.DATABASE_URL === "postgresql://asmtv1@127.0.0.1:55445/chat2_agent2_qa" &&
    env.CHAT2_PUBLIC_WS_URL === "ws://127.0.0.1:58339/connection/websocket" &&
    env.CHAT2_CENTRIFUGO_HTTP_API === "http://127.0.0.1:58339/api/publish";
  if (env.CHAT2_LEGACY_RETIRE_ENABLED !== "enabled" ||
      env.CHAT2_API_ENABLED !== "enabled" ||
      env.CHAT2_WORKER_ENABLED !== "enabled" ||
      env.CHAT2_PRIVATE_MEDIA_ENABLED !== "enabled" ||
      (env.CHAT2_CENTRIFUGO_TOKEN_SECRET?.length ?? 0) < 32 ||
      (env.CHAT2_CENTRIFUGO_API_KEY?.length ?? 0) < 16 ||
      (!isolated && (!["wss://gafus.ru/connection/websocket",
        "wss://www.gafus.ru/connection/websocket"].includes(env.CHAT2_PUBLIC_WS_URL ?? "") ||
        env.CHAT2_CENTRIFUGO_HTTP_API !== "http://chat2-centrifugo:8000/api/publish")))
    return false;

  const key = env.CHAT2_CENTRIFUGO_API_KEY!;
  const port = env.API_PORT ?? "3001";
  const workerAddress = isolated ? "http://127.0.0.1:58342/internal/chat2/ready" :
    "http://worker:3003/internal/chat2/ready";
  const brokerAddress = isolated ? "http://127.0.0.1:58339/api/info" :
    "http://chat2-centrifugo:8000/api/info";
  if (!/^\d{2,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) return false;
  const options = { redirect: "error" as const, signal: AbortSignal.timeout(1600) };
  try {
    const [api, worker, broker] = await Promise.all([
      request(`http://127.0.0.1:${port}/ready`, { ...options, method: "GET" }),
      request(workerAddress, {
        ...options, method: "GET", headers: { "X-Chat2-Readiness-Key": key },
      }),
      request(brokerAddress, {
        ...options, method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": key }, body: "{}",
      }),
    ]);
    if ([api, worker, broker].some(r => r.status !== 200)) return false;
    const [a, w, b] = await Promise.all([api.json(), worker.json(), broker.json()]);
    const object = (v: unknown): v is Record<string, unknown> =>
      !!v && typeof v === "object" && !Array.isArray(v);
    return object(a) && a.status === "ready" &&
      object(w) && w.ready === true &&
      object(b) && !b.error && object(b.result);
  } catch { return false; }
}
