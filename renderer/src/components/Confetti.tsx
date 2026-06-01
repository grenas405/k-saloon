import { useEffect, useRef } from "react";
import { COLORS } from "../catalog-meta";

const COUNT = 120;
const DURATION_MS = 1400;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Hand-rolled confetti burst on a full-screen canvas. No dependencies.
 *  Renders nothing (and fires onDone immediately) when reduced-motion is set. */
export function Confetti({ active, onDone }: { active: boolean; onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      onDoneRef.current?.();
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = globalThis.devicePixelRatio || 1;
    const w = globalThis.innerWidth;
    const h = globalThis.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Burst from two upper "cannons".
    const particles: Particle[] = Array.from({ length: COUNT }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const originX = fromLeft ? w * 0.2 : w * 0.8;
      const angle = (fromLeft ? -1 : 1) * (Math.PI / 4) + (Math.random() - 0.5) * 0.9;
      const speed = 7 + Math.random() * 9;
      return {
        x: originX,
        y: h * 0.32,
        vx: Math.sin(angle) * speed,
        vy: -Math.abs(Math.cos(angle)) * speed,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        size: 6 + Math.random() * 7,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.vy += 0.28; // gravity
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (elapsed < DURATION_MS) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w, h);
        onDoneRef.current?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      aria-hidden="true"
    />
  );
}
