import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { http, setAuthToken } from '../api/http';
import type { AuthUser, LoginResponse } from './types';
import { registerForPushNotificationsAsync } from '../push/registerForPushNotifications';

type AuthState = {
  initializing: boolean;
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const TOKEN_KEY = 'lachart_token_v1';
const USER_KEY = 'lachart_user_v1';

const AuthContext = createContext<AuthState | null>(null);

async function persistAuth(token: string | null, user: AuthUser | null) {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);

  if (user) await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  else await SecureStore.deleteItemAsync(USER_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshProfile = useCallback(async () => {
    // /user/profile exists in this backend and is used in the web app
    const resp = await http.get('/user/profile');
    if (resp?.data) {
      setUser((prev) => ({ ...(prev || {}), ...(resp.data || {}) }));
      await persistAuth(token, { ...(user || {}), ...(resp.data || {}) });
    }
  }, [token, user]);

  const registerPushToken = useCallback(
    async (activeToken: string) => {
      try {
        const expoToken = await registerForPushNotificationsAsync();
        if (!expoToken) return;
        // Backend endpoint will be added in server: POST /user/push-token
        await http.post('/user/push-token', { expoPushToken: expoToken });
      } catch {
        // keep silent for MVP; we'll surface nicer UI later
      }
    },
    []
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const resp = await http.post<LoginResponse>('/user/login', { email, password });
      const nextToken = resp.data?.token;
      const nextUser = resp.data?.user;
      if (!nextToken || !nextUser) {
        throw new Error('Invalid login response');
      }
      setAuthToken(nextToken);
      setToken(nextToken);
      setUser(nextUser);
      await persistAuth(nextToken, nextUser);
      await registerPushToken(nextToken);
    },
    [registerPushToken]
  );

  const logout = useCallback(async () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    await persistAuth(null, null);
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        const storedUserStr = await SecureStore.getItemAsync(USER_KEY);
        const storedUser = storedUserStr ? (JSON.parse(storedUserStr) as AuthUser) : null;
        if (storedToken) {
          setAuthToken(storedToken);
          setToken(storedToken);
          setUser(storedUser);
          // best-effort refresh
          try {
            await refreshProfile();
          } catch {
            // token might be expired; keep user logged in for now, let API calls fail and user can re-login
          }
        }
      } finally {
        setInitializing(false);
      }
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      initializing,
      token,
      user,
      login,
      logout,
      refreshProfile,
    }),
    [initializing, token, user, login, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}



