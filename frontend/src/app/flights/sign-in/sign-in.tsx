"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { bookingApi, errorMessage } from "../booking-api";

export function SignIn({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await bookingApi("auth/login", {
        email: String(data.get("email")).trim(),
        password: data.get("password"),
      });
      router.replace(next);
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <form className="panel stack narrow" onSubmit={submit}>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
