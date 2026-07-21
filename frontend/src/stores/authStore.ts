import { create } from "zustand";

import { loginRequest, logoutRequest, meRequest, refreshRequest } from "@/services/auth";
import type { AuthUser } from "@/types/auth";

const REFRESH_TOKEN_KEY = "agentic_hrms_refresh_token";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
  hasPermission: (permission: string) => boolean;
};

function getStoredRefreshToken() {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

function storeRefreshToken(token: string | null) {
  if (token) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: getStoredRefreshToken(),
  user: null,
  status: "idle",

  login: async (email, password) => {
    set({ status: "loading" });
    const tokens = await loginRequest(email, password);
    storeRefreshToken(tokens.refresh_token);
    const user = await meRequest(tokens.access_token);
    set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      user,
      status: "authenticated",
    });
  },

  logout: async () => {
    const refreshToken = get().refreshToken ?? getStoredRefreshToken();
    await logoutRequest(refreshToken);
    storeRefreshToken(null);
    set({ accessToken: null, refreshToken: null, user: null, status: "unauthenticated" });
  },

  initialize: async () => {
    if (get().status === "authenticated" || get().status === "loading") return;
    const refreshToken = get().refreshToken ?? getStoredRefreshToken();
    if (!refreshToken) {
      set({ status: "unauthenticated" });
      return;
    }

    set({ status: "loading" });
    try {
      const tokens = await refreshRequest(refreshToken);
      storeRefreshToken(tokens.refresh_token);
      const user = await meRequest(tokens.access_token);
      set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        user,
        status: "authenticated",
      });
    } catch {
      storeRefreshToken(null);
      set({ accessToken: null, refreshToken: null, user: null, status: "unauthenticated" });
    }
  },

  refreshSession: async () => {
    const refreshToken = get().refreshToken ?? getStoredRefreshToken();
    if (!refreshToken) return null;

    try {
      const tokens = await refreshRequest(refreshToken);
      storeRefreshToken(tokens.refresh_token);
      set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
      return tokens.access_token;
    } catch {
      storeRefreshToken(null);
      set({ accessToken: null, refreshToken: null, user: null, status: "unauthenticated" });
      return null;
    }
  },

  hasPermission: (permission) => {
    const user = get().user;
    if (!user) return false;
    return user.is_superuser || user.permissions.includes(permission);
  },
}));
