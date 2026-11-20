/** Registration contracts SQL composition. All callbacks retain the original
 * Prisma.TransactionClient; only this boundary may translate opaque Core Tx
 * to the real DB transaction. It never creates an additional connection.
 */
import { registerRegistrationContractRowsPort } from "@gafus/core/services/auth";
import type { RegistrationContractRowsPort } from "@gafus/core/services/auth";
import {
  withRegistrationTransaction,
  readRegistrationPromoRowTx, saveRegistrationPromoRowTx,
  lockRegistrationEmailAttemptTx, readRegistrationEmailAttemptTx,
  insertRegistrationEmailAttemptTx, finishRegistrationEmailAttemptTx,
  type RegistrationContractDbTx,
} from "@gafus/identity-write-server/registration-contract-rows";

const transaction = (opaque: unknown): RegistrationContractDbTx => opaque as RegistrationContractDbTx;
const rows: RegistrationContractRowsPort = {
  withRegistrationTransaction: (callback, options) =>
    withRegistrationTransaction(tx => callback(tx), options),
  readRegistrationPromoRowTx: (tx, code) => readRegistrationPromoRowTx(transaction(tx), code),
  saveRegistrationPromoRowTx: (tx, userId, promoId) => saveRegistrationPromoRowTx(transaction(tx), userId, promoId),
  lockRegistrationEmailAttemptTx: (tx, tempSessionId) => lockRegistrationEmailAttemptTx(transaction(tx), tempSessionId),
  readRegistrationEmailAttemptTx: (tx, tempSessionId) => readRegistrationEmailAttemptTx(transaction(tx), tempSessionId),
  insertRegistrationEmailAttemptTx: (tx, input) => insertRegistrationEmailAttemptTx(transaction(tx), input),
  finishRegistrationEmailAttemptTx: (tx, id, input) => finishRegistrationEmailAttemptTx(transaction(tx), id, input),

};
registerRegistrationContractRowsPort(rows);
