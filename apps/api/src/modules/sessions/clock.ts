import { Injectable } from '@nestjs/common';

/**
 * The current time, behind a class so tests can fix it (createTestApp({ now })): generation
 * depends on "today", and a test must not depend on the day it runs.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
