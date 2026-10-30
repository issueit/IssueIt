import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Small motion helpers for the marketing site. Everything here honours
 * prefers-reduced-motion: scenes jump to their finished state instead of
 * playing.
 */

const reducedQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => !!reducedQuery?.matches);
  useEffect(() => {
    if (!reducedQuery) return;
    const on = () => setReduced(reducedQuery.matches);
    reducedQuery.addEventListener("change", on);
    return () => reducedQuery.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** True while the element is on screen (or once, with `once`). */
export function useInView<T extends Element>(ref: RefObject<T | null>, { once = false, margin = "0px 0px -15% 0px", threshold = 0 } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { rootMargin: margin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, margin, threshold]);
  return inView;
}

/**
 * Reveals every `[data-rv]` inside the root as it scrolls into view by
 * setting `data-in`. One observer for the whole page.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.in = "";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    const watch = () => el.querySelectorAll("[data-rv]:not([data-in])").forEach((n) => io.observe(n));
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [root]);
}

/**
 * Scroll progress of an element through the viewport, 0 when its top meets
 * the bottom of the screen and 1 when its bottom meets the top (or, with
 * `sticky`, when its bottom meets the bottom: the span a sticky child pins).
 * Written to a CSS variable on every frame rather than React state, and
 * handed to `onProgress` for anything that needs to react.
 */
export function useScrollProgress<T extends HTMLElement>(ref: RefObject<T | null>, { sticky = false, onProgress }: { sticky?: boolean; onProgress?: (p: number) => void } = {}) {
  const cb = useRef(onProgress);
  cb.current = onProgress;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let last = -1;
    const measure = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const span = sticky ? r.height - vh : r.height + vh;
      const travelled = sticky ? -r.top : vh - r.top;
      const p = Math.min(1, Math.max(0, span > 0 ? travelled / span : 0));
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      el.style.setProperty("--p", p.toFixed(4));
      cb.current?.(p);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, sticky]);
}

/** Thrown into a scene when it is cancelled, so awaits unwind quietly. */
export class Cancelled extends Error {}

/**
 * Runs an async scene while `active`, restarting it whenever it finishes.
 * The scene gets `wait(ms)`, which rejects once the scene is cancelled.
 */
export function useScene(active: boolean, scene: (wait: (ms: number) => Promise<void>) => Promise<void>, deps: unknown[] = []) {
  const fn = useRef(scene);
  fn.current = scene;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timers = new Set<number>();
    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        if (cancelled) return reject(new Cancelled());
        const t = window.setTimeout(() => {
          timers.delete(t);
          if (cancelled) reject(new Cancelled());
          else resolve();
        }, ms);
        timers.add(t);
      });
    (async () => {
      while (!cancelled) {
        try {
          await fn.current(wait);
        } catch (e) {
          if (e instanceof Cancelled) return;
          throw e;
        }
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);
}

/** Types `text` out one character at a time while `run` is true. */
export function useTyping(text: string, run: boolean, { speed = 28, delay = 0 } = {}) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (reduced) return setN(text.length);
    setN(0);
    let i = 0;
    let t = window.setTimeout(function tick() {
      i += 1;
      setN(i);
      if (i < text.length) t = window.setTimeout(tick, speed * (text[i - 1] === "\n" ? 8 : 0.6 + Math.random() * 0.8));
    }, delay);
    return () => clearTimeout(t);
  }, [text, run, reduced, speed, delay]);
  return run ? n : 0;
}

/**
 * Jumps to the section named in the address, instantly, and keeps it in
 * place while content above it is still loading (the integration wall
 * arrives after the first render). Stops as soon as the reader scrolls.
 * Instant on purpose: a long smooth scroll during page load crashes WebKit.
 */
export function arriveAtHash(): () => void {
  const id = decodeURIComponent(window.location.hash.slice(1));
  const target = id ? document.getElementById(id) : null;
  if (!target) {
    window.scrollTo({ top: 0, behavior: "instant" });
    return () => {};
  }
  const pin = () => target.scrollIntoView({ behavior: "instant" });
  pin();
  const watch = new ResizeObserver(pin);
  watch.observe(document.body);
  const stop = () => {
    watch.disconnect();
    clearTimeout(timer);
    for (const e of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(e, stop);
  };
  const timer = window.setTimeout(stop, 3000);
  for (const e of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(e, stop, { passive: true });
  return stop;
}
