'use client';

import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  endsAt: string;
  label?: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function CountdownTimer({ endsAt, label = 'Deal ends in' }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(endsAt).getTime();

    function calc() {
      const diff = target - Date.now();
      setTimeLeft(diff > 0 ? diff : 0);
    }

    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (timeLeft === null) return null;
  if (timeLeft <= 0) return null;

  const totalSeconds = Math.floor(timeLeft / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm">
      <span className="text-red-500">⏱</span>
      <span className="text-red-700 font-medium">{label}:</span>
      <div className="flex items-center gap-1 font-mono font-bold text-red-700">
        {days > 0 && <><span>{days}d</span><span className="text-red-400">:</span></>}
        <span>{pad(hours)}</span>
        <span className="text-red-400">:</span>
        <span>{pad(minutes)}</span>
        <span className="text-red-400">:</span>
        <span>{pad(seconds)}</span>
      </div>
    </div>
  );
}
