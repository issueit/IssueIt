import { useEffect, useRef } from "react";

/**
 * The page's background: a field of monospace dots and slashes drifting
 * like wind over water. Each cell's slash follows a slowly turning flow;
 * the pointer stirs a small eddy and a click sends out a ring. Drawn on a
 * canvas from a pre-rendered glyph atlas, at most 30 frames a second, and
 * paused while the tab is hidden. With reduced motion it draws one still
 * frame. No CSS filters: they crash WebKit.
 *
 * Kept cheap on purpose: only cells whose glyph changed are redrawn, and
 * the flow's waves are split into per-row and per-column terms so each
 * cell costs one sine.
 *
 * The field is fixed to the screen and never moves with the page. A
 * scroll-following version (a transform on the canvas plus redraws) crashed
 * WebKit during long smooth scrolls, and the page reads as a layer over the
 * field without it.
 */

const CELL_W = 13;
const CELL_H = 19;
const SHADES = 4;
// Calm to busy. Direction glyphs replace the middle band.
const RAMP = [" ", ".", "·", ":", "+"];
const DIRECTIONS = ["-", "\\", "|", "/"];
const GLYPHS = [...RAMP, ...DIRECTIONS, "×"];

type Ripple = { x: number; y: number; born: number };

export function AsciiField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let w = 0;
    let h = 0;
    let atlas: HTMLCanvasElement | null = null;
    let frame = 0;
    let last = 0;
    // What each cell currently shows: glyph * SHADES + shade + 1, or 0 for empty.
    let drawn = new Uint8Array(0);
    let colA = new Float32Array(0);
    let colQ = new Float32Array(0);
    const pointer = { x: -9999, y: -9999, seen: -9 };
    let ripples: Ripple[] = [];

    /** Every glyph in every shade, drawn once per theme and size. */
    const buildAtlas = () => {
      const styles = getComputedStyle(document.documentElement);
      const colours = [styles.getPropertyValue("--text-4"), styles.getPropertyValue("--text-4"), styles.getPropertyValue("--text-3"), styles.getPropertyValue("--text-3")].map(
        (c) => c.trim() || "#777",
      );
      const alphas = [0.22, 0.36, 0.4, 0.55];
      const a = document.createElement("canvas");
      a.width = GLYPHS.length * CELL_W * dpr;
      a.height = SHADES * CELL_H * dpr;
      const g = a.getContext("2d")!;
      g.scale(dpr, dpr);
      g.font = `500 12px ${styles.getPropertyValue("--font-mono") || "monospace"}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      for (let s = 0; s < SHADES; s++) {
        g.globalAlpha = alphas[s];
        g.fillStyle = colours[s];
        GLYPHS.forEach((ch, i) => g.fillText(ch, i * CELL_W + CELL_W / 2, s * CELL_H + CELL_H / 2 + 0.5));
      }
      atlas = a;
      repaint();
    };

    /** Forget what's on the canvas so the next frame draws every cell. */
    const repaint = () => {
      drawn.fill(0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (reduced) draw(0);
    };

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      cols = Math.ceil(w / CELL_W) + 1;
      rows = Math.ceil(h / CELL_H) + 1;
      canvas.width = Math.ceil(w * dpr);
      canvas.height = Math.ceil(rows * CELL_H * dpr);
      canvas.style.height = `${rows * CELL_H}px`;
      drawn = new Uint8Array(cols * rows);
      colA = new Float32Array(cols * 7);
      colQ = new Float32Array(cols);
      for (let c = 0; c < cols; c++) {
        const qx = (c * CELL_W - w / 2) / Math.min(560, w * 0.42);
        colQ[c] = Math.exp(-qx * qx);
      }
      buildAtlas();
    };

    const draw = (time: number) => {
      if (!atlas) return;
      const t = time / 1000;
      const scrollY = window.scrollY;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (ripples.length) ripples = ripples.filter((r) => t - r.born < 2.2);
      const near = t - pointer.seen < 1.5 ? 1 - (t - pointer.seen) / 1.5 : 0;

      // The flow is a sum of drifting waves. Each wave's phase is a column
      // part plus a row part, so sin(a + b) = sin a cos b + cos a sin b lets
      // the trigonometry be done once per column and once per row.
      for (let c = 0; c < cols; c++) {
        const k = c * 7;
        colA[k] = Math.sin(c * 0.07 + t * 0.35);
        const p = c * 0.045 + t * 0.18;
        colA[k + 1] = Math.sin(p);
        colA[k + 2] = Math.cos(p);
        const q = c * 0.09 - t * 0.5;
        colA[k + 3] = Math.sin(q);
        colA[k + 4] = Math.cos(q);
        const s = c * 0.036 - t * 0.9;
        colA[k + 5] = Math.sin(s);
        colA[k + 6] = Math.cos(s);
      }

      for (let r = 0; r < rows; r++) {
        const gy = r;
        const py = r * CELL_H;
        // Fade towards the bottom of the screen, and a touch at the very top.
        const vertical = Math.min(1, (py + 40) / 160) * (1 - Math.max(0, (py - h * 0.55) / (h * 0.6)));
        const rowB = Math.sin(gy * 0.11 - t * 0.27);
        const rpS = Math.sin(gy * 0.045);
        const rpC = Math.cos(gy * 0.045);
        const rqS = Math.sin(-gy * 0.117);
        const rqC = Math.cos(-gy * 0.117);
        const rsS = Math.sin(gy * 0.06);
        const rsC = Math.cos(gy * 0.06);
        // Quieter behind the hero copy, so the headline reads cleanly.
        const qy = (py + scrollY - 430) / 300;
        const rowQ = 0.7 * Math.exp(-qy * qy);
        const dy = py - pointer.y;
        const rowNear = near > 0 && Math.abs(dy) < 150;

        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          let code = 0;
          if (vertical > 0.02) {
            const k = c * 7;
            const px = c * CELL_W;
            const f = colA[k] + rowB + (colA[k + 1] * rpC + colA[k + 2] * rpS) + 0.6 * (colA[k + 3] * rqC + colA[k + 4] * rqS);
            let angle = f * 0.9;
            let energy = 0.5 + 0.5 * Math.sin(f * 1.7 + t * 0.6);
            // A slow diagonal swell that brightens a band as it passes.
            const swell = colA[k + 5] * rsC + colA[k + 6] * rsS;
            energy *= 0.55 + 0.45 * (swell > 0 ? swell : 0);

            // The pointer stirs an eddy: slashes turn to circle it.
            if (rowNear) {
              const dx = px - pointer.x;
              const d = Math.hypot(dx, dy);
              if (d < 150) {
                const s = (1 - d / 150) ** 2 * near;
                angle = angle * (1 - s) + (Math.atan2(dy, dx) + Math.PI / 2) * s;
                energy = Math.min(0.8, energy + s * 0.45);
              }
            }
            let ring = false;
            for (const rp of ripples) {
              const age = t - rp.born;
              if (Math.abs(Math.hypot(px - rp.x, py - rp.y) - age * 420) < 14) {
                energy = Math.min(1, energy + (1 - age / 2.2) * 0.9);
                ring = true;
              }
            }

            const e = energy * vertical * (1 - rowQ * colQ[c]);
            if (e >= 0.16) {
              let glyph: number;
              if (ring && e > 0.55) glyph = GLYPHS.length - 1;
              else if (e < 0.3) glyph = 1;
              else if (e < 0.42) glyph = 2;
              else if (e < 0.78) {
                const bucket = Math.round((((angle % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 4)) % 4;
                glyph = RAMP.length + bucket;
              } else glyph = e > 0.92 ? 4 : 3;
              code = glyph * SHADES + Math.min(SHADES - 1, Math.floor(e * SHADES)) + 1;
            }
          }
          if (code === drawn[i]) continue;
          drawn[i] = code;
          const x = c * CELL_W;
          const y = r * CELL_H;
          ctx.clearRect(x, y, CELL_W, CELL_H);
          if (code) {
            const glyph = Math.floor((code - 1) / SHADES);
            const shade = (code - 1) % SHADES;
            ctx.drawImage(atlas, glyph * CELL_W * dpr, shade * CELL_H * dpr, CELL_W * dpr, CELL_H * dpr, x, y, CELL_W, CELL_H);
          }
        }
      }
    };

    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (time - last < 33) return;
      last = time;
      draw(time);
    };

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.seen = performance.now() / 1000;
    };
    const onDown = (e: PointerEvent) => {
      if (ripples.length < 4)
        ripples.push({
          x: e.clientX,
          y: e.clientY,
          born: performance.now() / 1000,
        });
    };
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduced) frame = requestAnimationFrame(loop);
    };
    // Theme or accent changes recolour the atlas.
    const themeWatch = new MutationObserver(buildAtlas);

    resize();
    themeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-accent"],
    });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    const still = () => draw(0);
    document.fonts?.ready.then(buildAtlas);
    if (reduced) {
      window.addEventListener("scroll", still, { passive: true });
    } else {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      frame = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(frame);
      themeWatch.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", still);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="ascii-field" aria-hidden />;
}
