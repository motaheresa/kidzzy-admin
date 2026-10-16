import { toInstructor, toInstructorDetail } from './instructor.mapper';
import type { InstructorRow } from './instructor.repository';

const row: InstructorRow & { passwordHash: string } = {
  id: '6f1c2c3e-1b52-4c43-9d1e-2f6b8a7c9d10',
  name: 'Mona',
  email: 'mona@kidzzy.test',
  phone: null,
  isActive: true,
  createdAt: new Date('2026-10-16T08:30:00.000Z'),
  // A column the API must never show, even when a row carries it.
  passwordHash: '$argon2id$secret',
};

describe('instructor mapper', () => {
  it('builds the Instructor response with a UTC timestamp and no other column', () => {
    expect(toInstructor(row)).toEqual({
      id: row.id,
      name: 'Mona',
      email: 'mona@kidzzy.test',
      phone: null,
      isActive: true,
      createdAt: '2026-10-16T08:30:00.000Z',
    });
  });

  it('adds the groups for the detail', () => {
    const groups = [{ id: 'g1', name: 'جروب A' }];
    expect(toInstructorDetail(row, groups)).toEqual({ ...toInstructor(row), groups });
  });
});
