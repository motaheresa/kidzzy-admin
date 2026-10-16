import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { AppProviders } from './providers';
import { createAppRouter } from './router';

/**
 * The app: providers around the router. The session is the ['auth', 'me'] query (useSession),
 * not component state, so reopening the app with a valid session lands on the home page.
 */
export default function App() {
  const [router] = useState(createAppRouter);
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
