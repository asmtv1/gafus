// /lib/actions/checkUserConfirmed.ts
"use server";

import { parsePhoneNumberFromString } from "libphonenumber-js";

import { prisma } from "@gafus/prisma";

export async function checkUserConfirmed(phone: string) {
  const parsed = parsePhoneNumberFromString(phone, "RU");
  const normalizedPhone = parsed?.isValid() ? parsed.format("E.164") : null;
  if (!normalizedPhone) return false;

  const user = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
    select: { isConfirmed: true },
  });

  return user?.isConfirmed ?? false;
}
