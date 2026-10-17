/** A YYYY-MM-DD date -> the Date Prisma writes to a DATE column (midnight UTC, no zone). */
export function stringToDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
