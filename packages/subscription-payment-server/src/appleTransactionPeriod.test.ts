import { describe, expect, it } from "vitest";
import { parseAppleTransactionPeriod } from "./appleTransactionPeriod";

const purchaseDate = Date.parse("2026-11-20T00:00:00Z");
const expiresDate = Date.parse("2026-12-20T00:00:00Z");

describe("verified Apple transaction period", () => {
  it("preserves the signed paid interval", () => {
    expect(parseAppleTransactionPeriod({purchaseDate, expiresDate})).toEqual({
      periodStart:new Date(purchaseDate),periodEnd:new Date(expiresDate),isRevoked:false,
    });
  });
  it("rejects missing, nonfinite, reversed and invalid periods instead of granting a trial", () => {
    for (const payload of [
      {purchaseDate}, {expiresDate}, {purchaseDate,expiresDate:0},
      {purchaseDate,expiresDate:Infinity}, {purchaseDate,expiresDate:purchaseDate},
      {purchaseDate,expiresDate:purchaseDate-1}, {purchaseDate,expiresDate:1e16},
      {purchaseDate,expiresDate,revocationDate:NaN},
    ]) expect(parseAppleTransactionPeriod(payload)).toBeNull();
  });
  it("does not ignore verified revocation", () => {
    expect(parseAppleTransactionPeriod({purchaseDate,expiresDate,revocationDate:purchaseDate+1}))
      .toMatchObject({isRevoked:true});
  });
});
