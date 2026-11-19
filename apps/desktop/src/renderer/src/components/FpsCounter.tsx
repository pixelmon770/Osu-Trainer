import { useEffect, useRef } from 'react';

/**
 * Licznik klatek: liczy wywołania requestAnimationFrame i co pół sekundy wpisuje wynik prosto do DOM
 * (bez przerysowywania Reacta, żeby licznik sam nie obciążał ćwiczenia).
 * Pokazuje średnie FPS i najdłuższą klatkę z ostatniego pół sekundy – skoki tej drugiej to „przycięcia”.
 */
export default function FpsCounter({ className = '' }: { className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let worst = 0;
    let last = performance.now();
    let windowStart = last;
    const tick = (now: number) => {
      frames++;
      worst = Math.max(worst, now - last);
      last = now;
      if (now - windowStart >= 500) {
        const fps = (frames * 1000) / (now - windowStart);
        if (el.current) el.current.textContent = `${Math.round(fps)} FPS · ${worst.toFixed(1)} ms`;
        frames = 0;
        worst = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={el} className={`fps-counter ${className}`} aria-live="off" />;
}
