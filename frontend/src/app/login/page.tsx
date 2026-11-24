'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/app-shell';
import { api, errorMessage } from '@/lib/api';
import type { User } from '@/lib/hotel-types';
import type { FormEvent } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/my-reservations');
  }, [loading, user, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await api<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      signIn(result.user);
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next?.startsWith('/') ? next : '/my-reservations');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-wrap">
      <section className="login-card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in</h1>
        <p>Pick up where your next trip begins.</p>
        <form className="login-form" onSubmit={submit}>
          <label className="control-label">
            Email address
            <input
              className="text-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="control-label">
            Password
            <input
              className="text-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="form-note form-note-error" role="alert">{error}</p>}
          <button className="button button-dark button-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in securely'}
          </button>
        </form>
        <p className="form-note" style={{ marginTop: 18 }}>
          New to Tripwise? Account registration is available through the team account service.
        </p>
        <Link className="button-link" href="/hotels">Continue exploring stays</Link>
      </section>
    </main>
  );
}
