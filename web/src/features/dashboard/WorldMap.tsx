import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Chart, Tooltip, type ChartConfiguration } from "chart.js";
import { ChoroplethController, ColorLogarithmicScale, ColorScale, GeoFeature, ProjectionScale, topojson, type Feature } from "chartjs-chart-geo";
import worldUrl from "world-atlas/countries-110m.json?url";
import type { Count } from "../../lib/types";
import { Skeleton } from "../../components/ui/feedback";
import { ChartCanvas, type VizTheme } from "./chart";
import { numericCode } from "./countries";
import { countryName } from "./format";

Chart.register(ChoroplethController, GeoFeature, ColorScale, ColorLogarithmicScale, ProjectionScale, Tooltip);

/** Antarctica has no reporters and takes a fifth of the map. */
const ANTARCTICA = "010";

function useCountries() {
  return useQuery({
    queryKey: ["world-atlas"],
    staleTime: Infinity,
    queryFn: async () => {
      const world = await (await fetch(worldUrl)).json();
      const all = (topojson.feature(world, world.objects.countries) as unknown as { features: Feature[] }).features;
      return all.filter((f) => (f as { id?: string }).id !== ANTARCTICA);
    },
  });
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** One hue, light to dark: a straight blend between the two ends of the ramp. */
export function ramp(from: string, to: string) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return (t: number) => {
    const k = Math.max(0, Math.min(1, t));
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
  };
}

export function WorldMap({ countries, theme, height, scale, animations }: { countries: Count[]; theme: VizTheme; height: number; scale: "linear" | "log"; animations: boolean }) {
  const shapes = useCountries();
  const config = useMemo((): ChartConfiguration<"choropleth"> | null => {
    if (!shapes.data) return null;
    const byNumeric = new Map<string, number>();
    for (const c of countries) {
      const id = numericCode[c.key];
      if (id) byNumeric.set(id, (byNumeric.get(id) ?? 0) + c.n);
    }
    const names = new Map(countries.map((c) => [numericCode[c.key], countryName(c.key)]));
    const max = Math.max(1, ...byNumeric.values());
    return {
      type: "choropleth",
      data: {
        labels: shapes.data.map((f) => names.get((f as { id?: string }).id ?? "") ?? (f.properties as { name: string }).name),
        datasets: [
          {
            label: "Reports",
            outline: shapes.data,
            showOutline: false,
            borderColor: theme.surface,
            borderWidth: 0.6,
            hoverBorderColor: theme.text,
            hoverBorderWidth: 1,
            // Countries with no reports have no value, so they take the neutral "missing" colour.
            data: shapes.data.map((feature) => ({ feature, value: byNumeric.get((feature as { id?: string }).id ?? "") ?? (null as unknown as number) })),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: animations ? { duration: 260 } : false,
        showGraticule: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.text,
            bodyColor: theme.text2,
            borderColor: theme.axis,
            borderWidth: 1,
            padding: 9,
            cornerRadius: 8,
            displayColors: false,
            titleFont: { family: theme.font, size: 12, weight: 600 },
            bodyFont: { family: theme.font, size: 12 },
            callbacks: {
              label: (ctx) => {
                const v = (ctx.raw as { value: number | null }).value;
                return v ? `${v.toLocaleString("en-GB")} ${v === 1 ? "report" : "reports"}` : "No reports";
              },
            },
          },
        },
        scales: {
          projection: { axis: "x", projection: "equalEarth" },
          color: {
            axis: "x",
            type: scale === "log" ? "colorLogarithmic" : "color",
            min: scale === "log" ? 1 : 0,
            max,
            interpolate: ramp(theme.seqLow, theme.seqHigh),
            missing: theme.empty,
            legend: { position: "bottom-left", align: "bottom", length: 150, width: 8, indicatorWidth: 6, margin: { left: 6, right: 6, top: 6, bottom: 20 } },
            ticks: { color: theme.text3, font: { family: theme.font, size: 10.5 }, maxTicksLimit: 4, precision: 0 },
            border: { display: false },
            grid: { display: false },
          },
        },
      } as ChartConfiguration<"choropleth">["options"],
    };
  }, [shapes.data, countries, theme, scale, animations]);

  if (shapes.isError) return <p className="text-sm text-text-3">Couldn't load the map.</p>;
  if (!config) return <Skeleton h={height} />;
  const total = countries.reduce((n, c) => n + c.n, 0);
  return <ChartCanvas config={config} height={height} label={`World map of reports by country: ${countries.length} countries, ${total} reports with a known location`} />;
}
