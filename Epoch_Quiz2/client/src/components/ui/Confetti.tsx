import React, { useState, useEffect, useRef } from 'react';

interface ConfettiPiece {
  id: number;
  left: number;
  dx: string;
  r: string;
  delay: number;
  bg: string;
}

interface ConfettiBurstProps {
  count?: number;
  duration?: number;
  onDone?: () => void;
}

export const ConfettiBurst: React.FC<ConfettiBurstProps> = ({ count = 36, duration = 2400, onDone }) => {
  const pieces = useRef<ConfettiPiece[] | null>(null);
  if (!pieces.current) {
    const colors = ['#D4148A', '#7B52D4', '#F052B5'];
    pieces.current = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      dx: (Math.random() - 0.5) * 500 + 'px',
      r: (Math.random() * 540 - 270) + 'deg',
      delay: Math.random() * 250,
      bg: colors[i % colors.length],
    }));
  }
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [duration, onDone]);
  return (
    <div className="confetti-wrap" aria-hidden="true">
      {pieces.current.map(p => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left + '%',
            background: p.bg,
            animationDelay: p.delay + 'ms',
            '--dx': p.dx,
            '--r': p.r,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
};
