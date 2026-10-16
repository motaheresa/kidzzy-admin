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
  // Columns the API must never show, even when a row carries them.
  academyId: 'a1',
  createdAt: new Date('2026-10-16T08:30:00.000Z'),
};

describe('student mapper', () => {
  it('builds the Student response, with no group or cycle yet, and no other column', () => {
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
});
