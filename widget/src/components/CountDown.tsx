'use client';

import React, { useEffect, useRef, useState } from 'react';

interface CountDownProps {
  startTime: number;
  onExpired: () => void;
  durationSeconds?: number;
}

const CountDown: React.FC<CountDownProps> = ({ startTime, onExpired, durationSeconds = 30 }) => {
  const [timeLeft, setTimeLeft] = useState<number>(durationSeconds);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const firedRef = useRef(false);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    firedRef.current = false;
  }, [startTime]);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const startTimeMs = startTime > 9999999999 ? startTime : startTime * 1000;
      const expirationTime = startTimeMs + durationSeconds * 1000;
      const remaining = Math.max(0, expirationTime - now);
      const remainingSeconds = Math.floor(remaining / 1000);

      if (remainingSeconds <= 0) {
        setTimeLeft(0);
        if (!firedRef.current) {
          firedRef.current = true;
          setIsExpired(true);
          onExpiredRef.current();
        }
        return;
      }

      setTimeLeft(remainingSeconds);
      setIsExpired(false);
    };

    if (isExpired) return;

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [startTime, isExpired]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isExpired) return null;

  return <span className="text-xs font-sans">{formatTime(timeLeft)}</span>;
};

export default CountDown;
