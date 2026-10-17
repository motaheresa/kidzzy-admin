import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EnrollStudentDto } from './enroll-student.dto';

async function errorsOf(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(EnrollStudentDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const paths: string[] = [];
  const walk = (list: typeof errors, prefix: string) => {
    for (const error of list) {
      const path = `${prefix}${error.property}`;
      if (error.constraints) paths.push(path);
      walk(error.children ?? [], `${path}.`);
    }
  };
  walk(errors, '');
  return paths;
}

const base = {
  studentId: '0b6c7e3a-77d1-4d38-9a4e-5f1a2b3c4d5e',
  startDate: '2026-10-17',
  plan: { sessionsPerCycle: 4, amount: '1500.00' },
};

describe('EnrollStudentDto', () => {
  it('accepts a plan with a decimal-string amount, with or without a starting point', async () => {
    expect(await errorsOf(base)).toEqual([]);
    expect(await errorsOf({ ...base, openingCount: 3 })).toEqual([]);
    expect(
      await errorsOf({ ...base, plan: { sessionsPerCycle: 100, amount: '99999999.99' } }),
    ).toEqual([]);
  });

  it('requires the plan (AC: a plan is required)', async () => {
    expect(await errorsOf({ ...base, plan: undefined })).toEqual(['plan']);
  });

  it.each([
    ['a number', 1500],
    ['no decimals', '1500'],
    ['one decimal', '1500.0'],
    ['three decimals', '1500.000'],
    ['zero', '0.00'],
    ['a negative amount', '-1.00'],
    ['more than numeric(10,2) holds', '100000000.00'],
    ['a comma', '1,500.00'],
  ])('refuses an amount that is %s', async (_label, amount) => {
    expect(await errorsOf({ ...base, plan: { ...base.plan, amount } })).toEqual(['plan.amount']);
  });

  it.each([0, 101, 2.5])('refuses %p sessions per cycle', async (sessionsPerCycle) => {
    expect(await errorsOf({ ...base, plan: { ...base.plan, sessionsPerCycle } })).toEqual([
      'plan.sessionsPerCycle',
    ]);
  });

  it.each([
    ['a negative starting point', { openingCount: -1 }, 'openingCount'],
    ['a date that does not exist', { startDate: '2026-02-30' }, 'startDate'],
    ['a student id that is not a UUID', { studentId: 'KC-001' }, 'studentId'],
  ])('refuses %s', async (_label, change, field) => {
    expect(await errorsOf({ ...base, ...change })).toEqual([field]);
  });
});
