import { create } from 'zustand';
import { AuthUser, LoginResponse } from '../types';
import { api, setToken, clearToken, getToken } from '../api/client';

interface AuthState {
  token: string;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loadMe: () => Promise<void>;
}

const USER_KEY = 'cp_user';

function loadUser(): AuthUser | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export const useAuth = create<AuthState>((set) => ({
  token: getToken(),
  user: loadUser(),

  async login(username, password) {
    const res = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    set({ token: res.access_token, user: res.user });
  },

  logout() {
    clearToken();
    localStorage.removeItem(USER_KEY);
    set({ token: '', user: null });
  },

  async loadMe() {
    const user = await api<AuthUser>('/auth/me');
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user });
  },
}));
