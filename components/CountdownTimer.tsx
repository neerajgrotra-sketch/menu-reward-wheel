'use client';

import { useEffect, useMemo, useState } from 'react';

export function CountdownTimer({ minutes = 20 }: { minutes?: number }) {
  const expiresAt = useMemo(() => Date.now() + minutes * 60 * 1000, [minutes]);
  const [remaining, setRemaining] = useState(expiresAt - Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining(Math.max(0, expiresAt - Date.now()));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);

  const totalSeconds = Math.ceil(remaining / 1000);
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');

  return <span>{mins}:{secs}</span>;
}
