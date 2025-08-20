"use server";

export async function getPublicKeyAction() {
  const key = process.env.VAPID_PUBLIC_KEY;

  console.warn("🔑 VAPID_PUBLIC_KEY from env:", key);

  return {
    publicKey: key ?? null,
    isDefined: Boolean(key),
  };
}
