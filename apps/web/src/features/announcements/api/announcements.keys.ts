// Query keys of the announcements feature, built in one place so a key is never retyped by hand.
export const announcementKeys = {
  all: ['announcements'] as const,
  lists: () => [...announcementKeys.all, 'list'] as const,
  list: (page: number) => [...announcementKeys.lists(), page] as const,
  roles: () => [...announcementKeys.all, 'roles'] as const,
  users: (params: { search: string; page: number }) =>
    [...announcementKeys.all, 'users', params] as const,
};
