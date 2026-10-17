import type {
  Group,
  GroupCreate,
  GroupUpdate,
  Page,
  ScheduleReplace,
  ScheduleSlot,
} from '@kidzzy/shared';
import type { ListParams } from '@/lib/hooks';

/** The API's group shapes (openapi.yaml, tag Groups). */
export type { Group, GroupCreate, GroupUpdate, Page, ScheduleReplace, ScheduleSlot };

/** One page of the groups list, as kept in the URL: page, search and status. */
export type GroupListParams = ListParams;
