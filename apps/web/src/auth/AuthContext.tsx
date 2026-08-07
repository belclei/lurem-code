// apps/web/src/auth/AuthContext.tsx
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  login as apiLogin,
  logout as apiLogout,
  fetchMe,
  refreshAccessToken,
} from "./api-client";
import { setAccessToken } from "./token-store";
import type { MeResponse } from "./types";

export interface AuthContextValue {
  accessToken: string | null;
  user: MeResponse | null;
  /** True until the boot-time silent refresh attempt has resolved. Routes
   * that need a session should wait for this before deciding to redirect
   * to /login — otherwise a returning user with a valid cookie would flash
   * the login screen before the refresh call comes back. */
  isBooting: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetches `/v1/me` and updates `user` — call after a settings mutation
   * (name/birthDate/theme) since `user` here lives in this context's own
   * state, not react-query's cache, so invalidating a query key alone
   * wouldn't refresh what components read via `useAuth().user`. */
  refreshUser: () => Promise<void>;
  /** Adopts an access token obtained outside of login() (US-8.3 — the
   * registration endpoint returns one directly, same as login, but arrives
   * via a plain fetch call from RegisterPage rather than the login() flow). */
  adoptSession: (accessToken: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [isBooting, setIsBooting] = useState(true);

  // Boot-time silent session restore: try the refresh cookie once before
  // ever showing /login, so a returning user isn't asked to log in again
  // just because the SPA reloaded and lost its in-memory access token.
  //
  // bootStarted guards against firing the network call twice — without it,
  // StrictMode's dev-only mount→cleanup→mount double-invoke fires this
  // effect's fetch(/v1/auth/refresh) twice with the same refresh-token
  // cookie. The server's single-use rotation treats the loser of that race
  // as token reuse and revokes the whole family, including the winner's
  // brand-new token — logging the user out on every single page load.
  // isMounted (checked at resolve time, not a per-invocation closure bool)
  // reflects whether the LATEST mount is still active, so the surviving
  // boot() call's result isn't discarded because of the first mount's
  // now-stale cleanup.
  const bootStarted = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    async function boot() {
      const token = await refreshAccessToken();
      if (!isMounted.current) return;
      if (token) {
        setAccessTokenState(token);
        try {
          const me = await fetchMe();
          if (isMounted.current) setUser(me);
        } catch {
          if (isMounted.current) {
            setAccessTokenState(null);
            setUser(null);
          }
        }
      }
      if (isMounted.current) setIsBooting(false);
    }

    if (!bootStarted.current) {
      bootStarted.current = true;
      void boot();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const token = await apiLogin(email, password);
    setAccessTokenState(token);
    const me = await fetchMe();
    setUser(me);
  }

  async function logout(): Promise<void> {
    await apiLogout();
    setAccessTokenState(null);
    setUser(null);
  }

  async function refreshUser(): Promise<void> {
    const me = await fetchMe();
    setUser(me);
  }

  async function adoptSession(newAccessToken: string): Promise<void> {
    setAccessToken(newAccessToken);
    setAccessTokenState(newAccessToken);
    const me = await fetchMe();
    setUser(me);
  }

  // Applies immediately (US-3.13) — packages/ui and this app's own
  // tailwind.css both key the `dark:` variant off `[data-theme="dark"]`
  // (not Tailwind's default `.dark` class, not the OS media query — see
  // that file's comment), so persisting themePref to the DB alone does
  // nothing visually until something writes the attribute back to the DOM.
  // No user (logged out, e.g. /login) falls back to light, matching the
  // app's behavior before this attribute existed at all.
  useEffect(() => {
    document.documentElement.dataset.theme = user?.themePref ?? "light";
  }, [user?.themePref]);

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        user,
        isBooting,
        login,
        logout,
        refreshUser,
        adoptSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
