/** Revoke a user's live Centrifugo subscription after membership loss.
 * This is best-effort in local tests with the Chat2 API disabled, but fail-closed
 * when Chat2 API has been explicitly enabled in its isolated environment.
 * Never log API keys, signed links, usernames or private content.
 */
export async function revokeLiveRoomSubscription(userId: string, conversationId: string) {
  const raw = process.env.CHAT2_CENTRIFUGO_HTTP_API;
  const key = process.env.CHAT2_CENTRIFUGO_API_KEY;
  if (!raw || !key) {
    if (process.env.CHAT2_API_ENABLED === "enabled")
      throw new Error("CHAT2_REALTIME_REVOKE_UNAVAILABLE");
    return { skipped: true };
  }
  const url = new URL(raw);
  if (
    url.pathname !== "/api/publish" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    // Only the explicitly configured private Docker service or isolated
    // nonprod loopback is allowed. Never send the broker key to arbitrary
    // HTTPS domains, even when the environment is misconfigured.
    (url.href !== "http://chat2-centrifugo:8000/api/publish" &&
      !(
        process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  )
    throw new Error("CHAT2_UNSAFE_REVOKE_ENDPOINT");
  url.pathname = "/api/unsubscribe";
  const result = await fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(4000),
    headers: { "Content-Type": "application/json", "X-API-Key": key },
    body: JSON.stringify({ user: userId, channel: `chat2:${conversationId}` }),
  });
  if (!result.ok) throw new Error("CHAT2_REALTIME_REVOKE_FAILED");
  const answer = (await result.json()) as { error?: unknown };
  if (answer.error) throw new Error("CHAT2_REALTIME_REVOKE_REJECTED");
  return { skipped: false };
}
