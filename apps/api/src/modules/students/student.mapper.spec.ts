import { toDecimal } from '../prisma/money';
import { toStudent } from './student.mapper';
import type { StudentRow } from './student.repository';

const row: StudentRow & { academyId: string; createdAt: Date } = {
  id: '0b6c7e3a-77d1-4d38-9a4e-5f1a2b3c4d5e',
  code: 'KC-001',
  name: 'طالب 1',
  age: 9,
  parentName: 'ولي امر',
  parentPhone: '01012345678',
  notes: null,
  isActive: true,
  enrollments: [],
  cycles: [],
  // Columns the API must never show, even when a row carries them.
  academyId: 'a1',
  createdAt: new Date('2026-10-16T08:30:00.000Z'),
};

describe('student mapper', () => {
  it('builds the Student response, with no group or cycle, and no other column', () => {
    expect(toStudent(row)).toEqual({
      id: row.id,
      code: 'KC-001',
      name: 'طالب 1',
      age: 9,
      parentName: 'ولي امر',
      parentPhone: '01012345678',
      notes: null,
      isActive: true,
      currentGroup: null,
      currentCycle: null,
    });
  });

  it('shows the open enrollment as currentGroup and the cycle in progress, money as a string', () => {
    const student = toStudent({
      ...row,
      enrollments: [
        {
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          group: { id: 'g1', name: 'جروب A', instructorId: 'u1' },
        },
      ],
      cycles: [
        {
          id: 'c1',
          payeeType: 'student',
          studentId: row.id,
          instructorId: null,
          cycleNumber: 1,
          sessionsPerCycle: 4,
          openingCount: 2,
          sessionsCounted: 2,
          status: 'in_progress',
          dueAt: null,
          paidAt: null,
          student: { name: 'طالب 1' },
          instructor: null,
          plan: { amount: toDecimal('1500') },
        },
      ],
    });
    expect(student.currentGroup).toEqual({ id: 'g1', name: 'جروب A' });
    expect(student.currentCycle).toEqual({
      id: 'c1',
      payeeType: 'student',
      payeeId: row.id,
      payeeName: 'طالب 1',
      cycleNumber: 1,
      sessionsPerCycle: 4,
      amount: '1500.00',
      openingCount: 2,
      sessionsCounted: 2,
      status: 'in_progress',
      dueAt: null,
      paidAt: null,
    });
  });
});
