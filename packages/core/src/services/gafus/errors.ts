export type GafusErrorCode =
  | "GAFUS_DISABLED"
  | "GAFUS_INSUFFICIENT_BALANCE"
  | "GAFUS_INVALID_AMOUNT"
  | "GAFUS_TARGET_NOT_ELIGIBLE"
  | "GAFUS_IDEMPOTENCY_CONFLICT";

export class GafusError extends Error {
  constructor(
    public readonly code: GafusErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GafusError";
  }
}
