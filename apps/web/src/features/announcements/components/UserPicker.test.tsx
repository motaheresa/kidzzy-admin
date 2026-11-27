import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AudienceUser } from '../types';
import { UserPicker } from './UserPicker';

const person = (index: number): AudienceUser => ({
  id: `u-${index}`,
  name: `Person ${index}`,
  roles: [],
});

// The page the picker shows: the 200th and the 201st person. The search and the paging through
// the API are covered in app/announcements.routes.test.tsx.
vi.mock('../hooks/useAnnouncements', () => ({
  useAudienceUsers: () => ({
    isPending: false,
    isError: false,
    data: { data: [person(199), person(200)], meta: { page: 1, pageSize: 10, total: 2 } },
  }),
}));

function Picker() {
  const [selected, setSelected] = useState(() =>
    Array.from({ length: 199 }, (_, index) => person(index)),
  );
  return <UserPicker selected={selected} onChange={setSelected} />;
}

describe('UserPicker', () => {
  it('stops at 200 people, and removing one frees a place', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const last = screen.getByRole('checkbox', { name: 'Person 199' });
    const extra = screen.getByRole('checkbox', { name: 'Person 200' });
    expect(extra).toBeEnabled();

    await user.click(last);
    expect(screen.getByText('اخترت 200 من 200، وده اقصى عدد')).toBeInTheDocument();
    expect(extra).toBeDisabled();
    // A chosen one can still be taken off.
    expect(last).toBeEnabled();

    await user.click(last);
    expect(screen.getByText('اخترت 199 من 200')).toBeInTheDocument();
    expect(extra).toBeEnabled();
  }, 20_000);
});
