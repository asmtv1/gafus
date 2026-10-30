/** Opt-in REAL local synthetic Hono/PG test. Never run in the standard Mobile suite. */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { syntheticG05Create } from "./g05SyntheticCreateAdapter";
import { preparePetCreateIntent } from "./pet-create-intent";
const allowed = process.env.G05_AG3_REAL_ENDPOINT_TEST === "1";
const run = allowed ? describe : describe.skip;
type Actor = { id: string; accessToken: string };
function fixtures(): { url: string; a: Actor; b: Actor } {
  const root = "/Users/asmtv1/Desktop/gafus-refactor";
  const ready = JSON.parse(
    readFileSync(
      resolve(root, "apps/api/g1-g05-mobile-consumer-v1/G05_AG1_AG3_TEST_ENDPOINT_READY.v1.json"),
      "utf8",
    ),
  );
  const privatePath = resolve(ready.credentialsFile);
  if (!privatePath.startsWith(root + "/") || (statSync(privatePath).mode & 0o777) !== 0o600)
    throw Error("PRIVATE_SCOPE_DENIED");
  const secret = JSON.parse(readFileSync(privatePath, "utf8"));
  if (ready.url !== "http://127.0.0.1:4128/api/v1/pets" || secret.endpoint !== ready.url)
    throw Error("ENDPOINT_SCOPE_DENIED");
  if (Date.now() >= Date.parse(ready.leaseExpiresUTC)) throw Error("LEASE_EXPIRED");
  return { url: ready.url, a: secret.ownerA, b: secret.ownerB };
}
const base = {
  name: "AG3 G05 synthetic питомец",
  type: "DOG" as const,
  breed: "Корги",
  birthDate: "2020-02-29",
  weightKg: 4.25,
};
const uuid = () => crypto.randomUUID();
run("AG3 G05 Mobile adapter true localhost JWT→Hono→packaged Core→PG", () => {
  it("create, identical retry, lost response after COMMIT, immutable snapshot conflict, owner A/B and epoch rotation", async () => {
    const f = fixtures();
    const aIntent = preparePetCreateIntent(
      null,
      { ownerId: f.a.id, authEpoch: uuid() },
      base,
      uuid,
    );
    const body = { ...aIntent.payload, clientRequestId: aIntent.clientRequestId };
    const call = (b: typeof body, actor: Actor, fetcher: typeof fetch = fetch) =>
      syntheticG05Create(
        b,
        { ownerId: actor.id, accessToken: actor.accessToken },
        { url: f.url, fetcher },
      );
    const first = await call(body, f.a);
    expect(first).toMatchObject({
      status: 201,
      ownerId: f.a.id,
      replayed: false,
      uncertain: false,
    });
    const retry = await call(body, f.a);
    expect(retry).toMatchObject({ status: 201, petId: first.petId, replayed: true });
    // Actual POST receives a committed 201 from real Hono, then response is deliberately lost to the Mobile adapter.
    let committed = false;
    const lostAck: typeof fetch = async (input, init) => {
      const result = await fetch(input, init);
      if (result.status !== 201) throw Error("LOST_ACK_SETUP_NOT_COMMITTED");
      committed = true;
      throw new TypeError("synthetic lost ACK after server response");
    };
    const lostIntent = preparePetCreateIntent(
      null,
      { ownerId: f.a.id, authEpoch: uuid() },
      { ...base, name: "AG3 lost ACK питомец" },
      uuid,
    );
    const lostBody = { ...lostIntent.payload, clientRequestId: lostIntent.clientRequestId };
    const unknown = await call(lostBody, f.a, lostAck);
    expect(committed).toBe(true);
    expect(unknown).toMatchObject({ status: 0, uncertain: true });
    const recovered = await call(lostBody, f.a);
    expect(recovered).toMatchObject({ status: 201, replayed: true, ownerId: f.a.id });
    const conflict = await call({ ...body, name: "other content" }, f.a);
    expect(conflict).toMatchObject({ status: 409, uncertain: false });
    const foreign = await call(body, f.b);
    expect(foreign).toMatchObject({ status: 201, ownerId: f.b.id, replayed: false });
    expect(foreign.petId).not.toBe(first.petId);
    // Same user new verified authEpoch must produce a fresh key; an old pending operation isn't automatically replayed.
    const fresh = preparePetCreateIntent(
      aIntent,
      { ownerId: f.a.id, authEpoch: uuid() },
      base,
      uuid,
    );
    expect(fresh.clientRequestId).not.toBe(aIntent.clientRequestId);
    const freshResult = await call(
      { ...fresh.payload, clientRequestId: fresh.clientRequestId },
      f.a,
    );
    expect(freshResult).toMatchObject({ status: 201, replayed: false, ownerId: f.a.id });
  });
});
