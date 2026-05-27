export function jsonRequest(path: string, method: string, body?: unknown, headers?: HeadersInit) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function bearerHeaders(userId = "user-1"): HeadersInit {
  return {
    authorization: `Bearer test-token-${userId}`,
  };
}
