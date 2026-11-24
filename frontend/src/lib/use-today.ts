'use client';

import { useEffect, useState } from 'react';

function formatLocalDate(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function useTodayString() {
  const [today, setToday] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setToday(formatLocalDate(new Date())), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return today;
}
