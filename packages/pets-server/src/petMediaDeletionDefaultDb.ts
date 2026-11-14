/** Single authorized Prisma singleton adapter for the explicitly gated local
 * WEB2 pet-media janitor. No production provider or cleanup runner here;
 * Core must enable its isolated-workstation safety gate before this call.
 */
import {prisma} from '@gafus/prisma';
import type {PetMediaProvider} from './petMediaDeletionOutbox.js';
import {runOnePetMediaDeletionSql} from './petMediaDeletionSql.js';
export async function runOnePetMediaDeletionSqlFromDefaultDb(
 provider:(type:PetMediaProvider,locator:string)=>Promise<void>,
){
 return runOnePetMediaDeletionSql(prisma as never,provider);
}
