'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { User } from '@/lib/hotel-types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (user: User) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AppShell');
  return context;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<User>('/auth/me')
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          setUser(null);
          return;
        }
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      user,
      loading,
      error,
      signIn: setUser,
      signOut,
    }),
    [user, loading, error, signOut],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      <SiteHeader />
      {error && (
        <div className="shell-error" role="alert">
          Could not verify your session: {error}
        </div>
      )}
      {children}
      <footer className="site-footer">
        <Link className="brand footer-brand" href="/">
          <span className="brand-mark">T</span>
          <span>Tripwise</span>
        </Link>
        <p>Thoughtful stays, wherever you’re headed.</p>
        <span>© 2026 Tripwise Travel</span>
      </footer>
    </AuthContext.Provider>
  );
}

function SiteHeader() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    try {
      await signOut();
      router.push('/');
    } catch {
      setMenuOpen(false);
    }
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="Tripwise home">
          <span className="brand-mark">T</span>
          <span>Tripwise</span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link href="/hotels">
            Find a stay
          </Link>
          <Link href="/flights">Find a flight</Link>
          {user && (
            <Link href="/my-reservations">
              My reservations
            </Link>
          )}
          {user && <Link href="/flights/bookings">My flight bookings</Link>}
        </nav>
        <div className="header-actions">
          {loading ? (
            <span className="header-skeleton" aria-label="Checking session" />
          ) : user ? (
            <>
              <span className="header-greeting">Hello, {user.firstName}</span>
              <button className="button button-outline button-small" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link className="button button-outline button-small" href="/login">
              Sign in
            </Link>
          )}
        </div>
        <button
          className="mobile-menu-button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
      </div>
      {menuOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <Link href="/hotels" onClick={() => setMenuOpen(false)}>Find a stay</Link>
          <Link href="/flights" onClick={() => setMenuOpen(false)}>Find a flight</Link>
          {user ? (
            <>
              <Link href="/my-reservations" onClick={() => setMenuOpen(false)}>My reservations</Link>
              <Link href="/flights/bookings" onClick={() => setMenuOpen(false)}>My flight bookings</Link>
              <button onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <Link href="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
          )}
        </nav>
      )}
    </header>
  );
}
