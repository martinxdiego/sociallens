import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import SocialLens from './features/sociallens/SocialLens';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';

async function start() {
  const root = createRoot(document.getElementById('root')!);
  if (window.location.pathname === '/') {
    root.render(
      <ErrorBoundary>
        <SocialLens />
      </ErrorBoundary>
    );
    return;
  }
  // Existing optional-category analysis and its local IndexedDB remain available.
  const [{ createBrowserRouter, RouterProvider }, { routes }, { initI18n }] = await Promise.all([
    import('react-router-dom'),
    import('./routes'),
    import('./locales'),
    import('./styles.css'),
  ]);
  await initI18n({ isClient: true });
  const legacyRoutes = routes.map(route =>
    !route.index && route.path === '/'
      ? {
          ...route,
          children: [
            ...(route.children ?? []),
            { path: 'legacy', element: route.children?.find(child => child.index)?.element },
          ],
        }
      : route
  );
  root.render(<RouterProvider router={createBrowserRouter(legacyRoutes)} />);
}
void start();
