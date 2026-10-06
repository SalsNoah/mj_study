import { useEffect, useState, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

/** Page tests use the production data-router APIs, including navigation blocking. */
export function TestRouter({ children, initialEntries = ['/'] }: { children: ReactNode; initialEntries?: string[] }) {
  const [router] = useState(() => createMemoryRouter([{ path: '*', element: children }], { initialEntries }));
  useEffect(() => () => router.dispose(), [router]);
  return <RouterProvider router={router} />;
}
