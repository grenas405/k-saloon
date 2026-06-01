import { useCallback, useState } from "react";

const STORAGE_KEY = "pos_sound";

type WebkitWindow = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function reducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

let ctx: AudioContext | null = null;
function audioContext(): AudioContext | null {
  const Ctor = globalThis.AudioContext ?? (globalThis as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** A short, synthesized two-note "cha-ching" — no audio asset, fully offline.
 *  Persists the on/off preference in localStorage; silent when off or when the
 *  user prefers reduced motion. */
export function useSound() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const play = useCallback(() => {
    if (!enabled || reducedMotion()) return;
    const ac = audioContext();
    if (!ac) return;
    if (ac.state === "suspended") ac.resume().catch(() => {});

    // Two quick ascending notes for a bright register-bell feel.
    [
      { freq: 988, at: 0, dur: 0.12 }, // B5
      { freq: 1319, at: 0.1, dur: 0.22 }, // E6
    ].forEach(({ freq, at, dur }) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t0 = ac.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    });
  }, [enabled]);

  return { enabled, toggle, play };
}
