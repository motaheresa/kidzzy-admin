import type { Student } from '@kidzzy/shared';
import { toPaymentCycle } from '../payments/payment-cycle.mapper';
import type { StudentRow } from './student.repository';

/**
 * openapi.yaml: Student. Built field by field, so a new column never leaks into the API.
 * currentGroup is the group of the open enrollment (US-08); currentCycle the cycle in progress.
 */
export function toStudent(row: StudentRow): Student {
  const group = row.enrollments[0]?.group;
  const cycle = row.cycles[0];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    age: row.age,
    parentName: row.parentName,
    parentPhone: row.parentPhone,
    notes: row.notes,
    isActive: row.isActive,
    currentGroup: group ? { id: group.id, name: group.name } : null,
    currentCycle: cycle ? toPaymentCycle(cycle) : null,
  };
}
