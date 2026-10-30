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
  tooltipBg: string;
  tooltipText: string;
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
      tooltipBg: v("--surface-2"),
      tooltipText: v("--text"),
      success: v("--success"),
      warning: v("--warning"),
      danger: v("--danger"),
      font: v("--font-sans") || "system-ui, sans-serif",
      other: v("--text-4"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance]);
}

/** Shared look: recessive grid and axes, text in text colours, a quiet tooltip. */
export function baseOptions(
  t: VizTheme,
  o: { grid: boolean; animations: boolean; legend: "top" | "bottom" | "right" | false; axes?: boolean; horizontal?: boolean; stacked?: boolean; values?: boolean },
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
    animation: o.animations ? { duration: 260 } : (false as const),
    indexAxis: o.horizontal ? ("y" as const) : ("x" as const),
    interaction: { mode: "index" as const, intersect: false },
    layout: { padding: { top: o.values && !o.horizontal ? 16 : 4, right: o.values && o.horizontal ? 34 : 4, bottom: 0, left: 0 } },
    plugins: {
      valueLabels: { display: !!o.values, color: t.text2, font: t.font },
      legend: o.legend
        ? { display: true, position: o.legend, align: "start" as const, labels: { color: t.text2, font: { family: t.font, size: 11.5 }, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "rectRounded" as const, padding: 12 } }
        : { display: false },
      tooltip: {
        backgroundColor: t.tooltipBg,
        titleColor: t.tooltipText,
        bodyColor: t.text2,
        borderColor: t.axis,
        borderWidth: 1,
        padding: 9,
        cornerRadius: 8,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        usePointStyle: true,
        titleFont: { family: t.font, size: 12, weight: 600 as const },
        bodyFont: { family: t.font, size: 12 },
      },
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
