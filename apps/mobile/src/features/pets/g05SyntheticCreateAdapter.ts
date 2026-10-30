/** AG4 G05 isolated synthetic consumer. Never a production/mobile default endpoint. */
import type { CreatePetData } from "@/shared/lib/api/pets";
export type SyntheticPetCreateBody = Readonly<CreatePetData> & { clientRequestId: string };
export type SyntheticPetCreateResult = {
  status: number;
  code?: string;
  petId?: string;
  ownerId?: string;
  replayed: boolean;
  uncertain: boolean;
};
const ONLY_ENDPOINT = "http://127.0.0.1:4128/api/v1/pets";
export async function syntheticG05Create(
  body: SyntheticPetCreateBody,
  session: { ownerId: string; accessToken: string },
  dependencies: { url: string; fetcher: (url: string, init: RequestInit) => Promise<Response> },
): Promise<SyntheticPetCreateResult> {
  if (dependencies.url !== ONLY_ENDPOINT) throw new Error("G05_SYNTHETIC_ENDPOINT_DENIED");
  if (!session.ownerId || !session.accessToken) throw new Error("G05_UNVERIFIED_SYNTHETIC_SESSION");
  let response: Response;
  try {
    response = await dependencies.fetcher(dependencies.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { status: 0, replayed: false, uncertain: true };
  }
  const raw = (await response.json().catch(() => null)) as {
    data?: { id?: string; ownerId?: string };
    code?: string;
  } | null;
  if (
    response.status === 201 &&
    raw?.data?.ownerId === session.ownerId &&
    typeof raw.data.id === "string" &&
    raw.data.id.length > 0
  ) {
    return {
      status: 201,
      petId: raw.data.id,
      ownerId: session.ownerId,
      replayed: response.headers.get("Idempotent-Replayed") === "true",
      uncertain: false,
    };
  }
  if (response.status === 201) throw new Error("G05_UNTRUSTED_CREATE_RESPONSE");
  return {
    status: response.status,
    code: raw?.code,
    replayed: false,
    uncertain: response.status === 503,
  };
}
