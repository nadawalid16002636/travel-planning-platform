"use client";

import { useEffect, useState } from "react";

export function useRemaining(expiresAt?: string) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);
  return expiresAt && now
    ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000))
    : null;
}

export function Countdown({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null;
  if (seconds === 0)
    return (
      <p role="status" className="error">
        Your seat hold has expired.
      </p>
    );
  const clock =
    Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  return (
    <p className="timer" role="timer" aria-label="Time left on seat hold">
      Seats held for <strong>{clock}</strong>
    </p>
  );
}
