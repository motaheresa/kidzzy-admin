import { Prisma } from '../../generated/prisma/client';

// Money is never a JS number (0.1 + 0.2 !== 0.3): numeric(10,2) in the database, Prisma Decimal in
// code and a decimal string with two places in the API ("1500.00"). These helpers live in the
// prisma module because only it and the repositories may import the generated client (ADR-0011).

/** "1500.00" (the API form, already validated) -> a Decimal for a numeric(10,2) column. */
export function toDecimal(amount: string): Prisma.Decimal {
  return new Prisma.Decimal(amount);
}

/** A numeric(10,2) value -> the API form, always two places ("1500.00"). */
export function toMoney(amount: Prisma.Decimal): string {
  return amount.toFixed(2);
}
