import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { User } from '../../api/apiSlice';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  // False until tokens have been read from localStorage on the client.
  // Route guards must wait for this before deciding to redirect.
  hydrated: boolean;
}

// SSR-safe: localStorage doesn't exist on the server, so the store starts
// empty there and is hydrated from localStorage on the client in Providers.
const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  hydrated: false,
};

function persist(accessToken: string | null, refreshToken: string | null) {
  if (typeof window === 'undefined') return;
  if (accessToken) localStorage.setItem('accessToken', accessToken);
  else localStorage.removeItem('accessToken');
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  else localStorage.removeItem('refreshToken');
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ user: User; accessToken: string; refreshToken: string }>) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      persist(action.payload.accessToken, action.payload.refreshToken);
    },
    // Refreshed tokens (no user payload) — used by the re-auth flow.
    setTokens(state, action: PayloadAction<{ accessToken: string; refreshToken: string }>) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      persist(action.payload.accessToken, action.payload.refreshToken);
    },
    hydrateFromStorage(state, action: PayloadAction<{ accessToken: string | null; refreshToken: string | null }>) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.hydrated = true;
    },
    logout(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      persist(null, null);
    },
  },
});

export const { setCredentials, setTokens, hydrateFromStorage, logout } = authSlice.actions;
export default authSlice.reducer;
