import type {
  Instructor,
  InstructorCreate,
  InstructorDetail,
  InstructorUpdate,
  Page,
} from '@kidzzy/shared';
import type { ListParams } from '@/lib/hooks';

/** The API's instructor shapes (openapi.yaml, tag Instructors). */
export type { Instructor, InstructorCreate, InstructorDetail, InstructorUpdate, Page };

/** One page of the instructors list, as kept in the URL. */
export type InstructorListParams = ListParams;
