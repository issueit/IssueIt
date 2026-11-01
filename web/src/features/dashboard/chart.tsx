import { useEffect, useMemo, useRef } from "react";
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type ChartType,
  type TooltipModel,
} from "chart.js";
import { useAppearance } from "../../lib/theme";

/**
 * Direct labels: the value at the end of each bar. Only drawn for charts with
 * a single bar series, so numbers never pile up on stacks.
 */
const valueLabels = {
  id: "valueLabels",
  afterDatasetsDraw(chart: Chart, _args: unknown, opts: { display?: boolean; color?: string; font?: string }) {
    if (!opts?.display) return;
    const bars = chart.data.datasets.map((d, i) => ({ d, i })).filter(({ d, i }) => ((d as { type?: string }).type ?? (chart.config as { type?: string }).type) === "bar" && chart.isDatasetVisible(i));
    if (bars.length !== 1) return;
    const meta = chart.getDatasetMeta(bars[0].i);
    const horizontal = chart.options.indexAxis === "y";
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = opts.color ?? "#888";
    ctx.font = `500 11px ${opts.font ?? "sans-serif"}`;
    ctx.textBaseline = horizontal ? "middle" : "bottom";
    ctx.textAlign = horizontal ? "left" : "center";
    meta.data.forEach((el, j) => {
      const v = bars[0].d.data[j] as number;
      if (!v) return;
      const { x, y } = el.getProps(["x", "y"], true) as { x: number; y: number };
      ctx.fillText(v.toLocaleString("en-GB"), horizontal ? x + 5 : x, horizontal ? y : y - 4);
    });
    ctx.restore();
  },
};

Chart.register(valueLabels, BarController, BarElement, LineController, LineElement, PointElement, DoughnutController, PieController, ArcElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

/** Colours and type for charts, read from the design tokens so charts follow the theme. */
export type VizTheme = {
  series: string[];
  /** Low, medium, high, critical. */
  ordinal: string[];
  seqLow: string;
  seqHigh: string;
  surface: string;
  empty: string;
  grid: string;
  axis: string;
  text: string;
  text2: string;
  text3: string;
  success: string;
  warning: string;
  danger: string;
  font: string;
  other: string;
};

export function useVizTheme(): VizTheme {
  const appearance = useAppearance();
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    return {
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--viz-${i}`)),
      ordinal: [1, 2, 3, 4].map((i) => v(`--viz-ord-${i}`)),
      seqLow: v("--viz-seq-0"),
      seqHigh: v("--viz-seq-1"),
      surface: v("--surface"),
      empty: v("--surface-3"),
      grid: v("--viz-grid"),
      axis: v("--viz-axis"),
      text: v("--text"),
      text2: v("--text-2"),
      text3: v("--text-3"),
      success: v("--success"),
      warning: v("--warning"),
      danger: v("--danger"),
      font: v("--font-sans") || "system-ui, sans-serif",
      other: v("--text-4"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance]);
}

/**
 * How long to wait for a resize to settle before redrawing. Long enough to
 * cover a CSS width transition, short enough not to look stuck.
 */
export const RESIZE_DELAY = 220;

/* ------------------------------------------------------------------ tooltip */

/**
 * Chart.js draws its tooltip into the canvas, which means bitmap text that
 * ignores the interface scale and the themed type. Ours is a real element
 * instead, so it reads like every other tooltip in the app. One element is
 * enough: only one chart can be under the pointer.
 */
let tipEl: HTMLDivElement | null = null;

function chartTipElement() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "chart-tip";
    // The chart carries its own text description, so this is decoration.
    tipEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

export const hideChartTip = () => {
  if (tipEl) delete tipEl.dataset.show;
};

function paint(el: HTMLDivElement, title: string, rows: Array<{ text: string; colour?: string }>) {
  // Built as elements, never as markup: the labels are project names, page
  // addresses and browser strings, none of which we wrote.
  el.replaceChildren();
  if (title) {
    const head = document.createElement("div");
    head.className = "chart-tip__title";
    head.textContent = title;
    el.append(head);
  }
  for (const row of rows) {
    const line = document.createElement("div");
    line.className = "chart-tip__row";
    if (row.colour) {
      const dot = document.createElement("span");
      dot.className = "chart-tip__dot";
      dot.style.background = row.colour;
      line.append(dot);
    }
    const text = document.createElement("span");
    text.textContent = row.text;
    line.append(text);
    el.append(line);
  }
}

type TooltipContext = { chart: Chart; tooltip: TooltipModel<ChartType> };

function external({ chart, tooltip }: TooltipContext) {
  const el = chartTipElement();
  if (!tooltip.opacity) return hideChartTip();
  const colours = tooltip.options?.displayColors === false ? [] : tooltip.labelColors;
  paint(
    el,
    tooltip.title.join(" "),
    tooltip.body.map((b, i) => ({ text: b.lines.join(" "), colour: colours[i] ? String(colours[i].backgroundColor) : undefined })),
  );
  el.dataset.show = "1";
  // Above the point if it fits, below it if not, and never off either edge.
  const canvas = chart.canvas.getBoundingClientRect();
  const x = canvas.left + tooltip.caretX;
  const y = canvas.top + tooltip.caretY;
  el.style.left = `${Math.max(8, Math.min(x - el.offsetWidth / 2, window.innerWidth - el.offsetWidth - 8))}px`;
  el.style.top = `${y - el.offsetHeight - 12 < 8 ? y + 14 : y - el.offsetHeight - 12}px`;
}

/** The tooltip half of the shared look, so the world map can use it too. */
export const tipOptions = () => ({ enabled: false, external, displayColors: true, padding: 0 });

/** Shared look: recessive grid and axes, text in text colours, a quiet tooltip. */
export function baseOptions(
  t: VizTheme,
  o: { grid: boolean; animations: boolean; legend: "top" | "bottom" | "right" | false; axes?: boolean; horizontal?: boolean; stacked?: boolean; values?: boolean; tooltip?: "all" | "one" },
) {
  const tick = { color: t.text3, font: { family: t.font, size: 11 } };
  const axis = (isValue: boolean) => ({
    stacked: o.stacked,
    grid: { display: o.grid && isValue, color: t.grid, drawTicks: false },
    border: { display: !isValue, color: t.axis },
    ticks: { ...tick, padding: 6, maxRotation: 0, autoSkipPadding: 12, precision: 0 },
    beginAtZero: true,
  });
  return {
    responsive: true,
    maintainAspectRatio: false,
    // Coalesce a run of resizes into one redraw. Without this, a window drag
    // or the sidebar collapsing reallocates every canvas on every frame, which
    // WebKit does not survive on a high-density screen.
    resizeDelay: RESIZE_DELAY,
    animation: o.animations ? { duration: 260 } : (false as const),
    indexAxis: o.horizontal ? ("y" as const) : ("x" as const),
    // "all" reads every series at that point in one tooltip; "one" reads only
    // what the pointer is actually on.
    interaction: o.tooltip === "one" ? { mode: "nearest" as const, intersect: true } : { mode: "index" as const, intersect: false },
    layout: { padding: { top: o.values && !o.horizontal ? 16 : 4, right: o.values && o.horizontal ? 34 : 4, bottom: 0, left: 0 } },
    plugins: {
      valueLabels: { display: !!o.values, color: t.text2, font: t.font },
      legend: o.legend
        ? { display: true, position: o.legend, align: "start" as const, labels: { color: t.text2, font: { family: t.font, size: 11.5 }, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "rectRounded" as const, padding: 12 } }
        : { display: false },
      tooltip: tipOptions(),
    },
    ...(o.axes === false ? {} : { scales: { x: axis(!!o.horizontal), y: axis(!o.horizontal) } }),
  };
}

/** A Chart.js canvas. Updates in place when the data changes; rebuilds when the chart type does. */
export function ChartCanvas<T extends ChartType>({ config, height, label }: { config: ChartConfiguration<T>; height: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart<T> | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    chart.current = new Chart(canvas.current, config);
    return () => {
      chart.current?.destroy();
      chart.current = null;
      // A chart can go away while its tooltip is up, on a card being hidden.
      hideChartTip();
    };
    // Rebuild only when the kind of chart changes; data and options update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type]);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.data = config.data;
    if (config.options) c.options = config.options;
    c.update();
  }, [config]);

  return (
    <div style={{ position: "relative", height }}>
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
