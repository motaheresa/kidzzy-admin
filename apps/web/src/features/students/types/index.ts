import type { Page, Student, StudentCreate, StudentUpdate } from '@kidzzy/shared';
import type { ListParams } from '@/lib/hooks';

/** The API's student shapes (openapi.yaml, tag Students). */
export type { Page, Student, StudentCreate, StudentUpdate };

/** One page of the students list, as kept in the URL. The search arrives with US-06. */
export type StudentListParams = Omit<ListParams, 'search'>;
