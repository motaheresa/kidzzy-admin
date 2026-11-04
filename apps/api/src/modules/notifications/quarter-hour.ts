/**
 * Every quarter hour, in whatever zone the process clock uses. Cairo's offset is a whole number
 * of hours, so :00, :15, :30 and :45 are the same instants (ADR-0016).
 */
export const QUARTER_HOUR_CRON = '0,15,30,45 * * * *';
