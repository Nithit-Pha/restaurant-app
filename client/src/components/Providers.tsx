'use client';

import { useEffect, useRef } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { makeStore, type AppStore, type AppDispatch } from '../app/store';
import { hydrateFromStorage } from '../features/auth/authSlice';
import { ThemeProvider } from '../context/ThemeContext';

function AuthHydrator({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    // localStorage only exists in the browser — hydrate the persisted JWTs
    // into Redux after mount so SSR output never depends on it.
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    if (accessToken || refreshToken) {
      dispatch(hydrateFromStorage({ accessToken, refreshToken }));
    }
  }, [dispatch]);

  return <>{children}</>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const ref = useRef<AppStore | null>(null);
  if (!ref.current) {
    ref.current = makeStore();
  }

  return (
    <Provider store={ref.current}>
      <ThemeProvider>
        <AuthHydrator>{children}</AuthHydrator>
      </ThemeProvider>
    </Provider>
  );
}
