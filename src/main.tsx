import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isForbidden } from './api/client';
import { AuthProvider } from './auth/AuthProvider';
import { App } from './App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Catalog data barely changes; batch endpoints are gone so every item is
      // fetched individually and caching does the heavy lifting.
      staleTime: 5 * 60 * 1000,
      /*
       * A refusal is never worth asking twice. Spotify answers 403 for every
       * playlist this account does not own — which is most of what a search for
       * a Hörspiel returns — and retrying that only makes a kid wait longer for
       * the same answer. Everything else keeps its one retry.
       */
      retry: (count, error) => !isForbidden(error) && count < 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
