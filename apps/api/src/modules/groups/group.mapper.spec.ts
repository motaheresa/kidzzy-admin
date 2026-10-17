import { toGroup } from './group.mapper';
import type { GroupRow } from './group.repository';

const row: GroupRow & { academyId: string; searchText: string } = {
  id: 'g1',
  name: 'جروب A',
  level: 'Scratch 1',
  startDate: new Date('2026-11-01T00:00:00.000Z'),
  isActive: true,
  instructor: { id: 'u1', name: 'مدرس 1' },
  slots: [
    { weekday: 6, startTime: new Date('1970-01-01T16:00:00.000Z'), durationMin: 60 },
    { weekday: 2, startTime: new Date('1970-01-01T16:00:00.000Z'), durationMin: 60 },
  ],
  _count: { sessions: 3 },
  sessions: [{ scheduledAt: new Date('2026-11-03T14:00:00.000Z') }],
  // Columns the API must never show.
  academyId: 'a1',
  searchText: 'x',
};

describe('group mapper', () => {
  it('builds the Group response: local date, sorted schedule, no other column', () => {
    expect(toGroup(row)).toEqual({
      id: 'g1',
      name: 'جروب A',
      level: 'Scratch 1',
      instructor: { id: 'u1', name: 'مدرس 1' },
      startDate: '2026-11-01',
      isActive: true,
      schedule: [
        { weekday: 2, startTime: '16:00', durationMin: 60 },
        { weekday: 6, startTime: '16:00', durationMin: 60 },
      ],
      studentCount: 0,
      heldCount: 3,
      nextSessionAt: '2026-11-03T14:00:00.000Z',
    });
  });

  it('has no next session when none is ahead', () => {
    expect(toGroup({ ...row, sessions: [] }).nextSessionAt).toBeNull();
  });
});
