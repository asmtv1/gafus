/** Read-only settings adapter; business defaults and price invariants live in Core. */
import {prisma} from "@gafus/prisma";

export async function getGafusSettingsRow() {
  return prisma.gafusSettings.findUnique({where:{key:"default"}});
}
