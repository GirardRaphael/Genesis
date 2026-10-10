import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, SankeyChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  AriaComponent,
  LegendComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
echarts.use([
  BarChart,
  HeatmapChart,
  SankeyChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  AriaComponent,
  LegendComponent,
  SVGRenderer,
]);
export const palette = ["#167887", "#65649a", "#925e27", "#366a4d", "#a3423d"];
export const vehicleColor = (id: string) =>
  palette[
    Math.max(0, Number(id.match(/^van-(\d+)$/)?.[1] || 1) - 1) % palette.length
  ];
export function Chart({
  option,
  label,
  height = 260,
  onSelect,
}: {
  option: EChartsCoreOption;
  label: string;
  height?: number;
  onSelect?: (data: { name?: string; data?: { key?: string } }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    chartRef.current = chart;
    chart.on("click", (event) => {
      const data = event.data;
      selectRef.current?.({
        name: event.name,
        data:
          data &&
          typeof data === "object" &&
          "key" in data &&
          typeof data.key === "string"
            ? { key: data.key }
            : undefined,
      });
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);
  useEffect(() => {
    chartRef.current?.setOption(
      {
        animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
        animationDuration: 300,
        animationDurationUpdate: 300,
        textStyle: {
          fontFamily: "Inter Variable, sans-serif",
          color: "#56616a",
          fontSize: 12,
        },
        aria: { enabled: true },
        ...option,
      },
      { notMerge: true },
    );
  }, [option]);
  return (
    <div role="img" aria-label={label} style={{ height }}>
      <div ref={ref} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
