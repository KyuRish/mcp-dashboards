import { Chart, ArcElement, Tooltip, Legend, PieController, DoughnutController } from "chart.js";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, addExportButton, addRefreshButton, sendClickMessage, deferResize } from "./shared.js";

Chart.register(ArcElement, Tooltip, Legend, PieController, DoughnutController);

interface PieData {
  title: string;
  data: Array<{ label: string; value: number }>;
  options: {
    donut?: boolean;
    showLegend?: boolean;
    colors?: string[];
  };
}

export function renderPieChart(container: HTMLElement, payload: PieData): void {
  const { title, data, options } = payload;
  const showLegend = options.showLegend !== false;
  const isDonut = options.donut === true;

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">${data.length} segments</div>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas")!;
  const total = data.reduce((s, d) => s + d.value, 0);
  const palette = resolveColors(options.colors);
  const colors = data.map((_, i) => palette[i % palette.length]);

  const chartInstance = new Chart(canvas, {
    type: isDonut ? "doughnut" : "pie",
    data: {
      labels: data.map((d) => d.label),
      datasets: [
        {
          data: data.map((d) => d.value),
          backgroundColor: colors,
          borderColor: getCSSVar("--bg-card"),
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: isDonut ? "55%" : 0,
      onClick: (_event, elements) => {
        if (elements.length === 0) return;
        const idx = elements[0].index;
        const item = data[idx];
        const pct = ((item.value / total) * 100).toFixed(1);
        sendClickMessage(`I clicked "${item.label}" in the "${title}" chart (value: ${item.value.toLocaleString()}, ${pct}% of total). Tell me more about this.`);
      },
      plugins: {
        legend: {
          display: showLegend,
          position: "bottom",
          labels: {
            color: getCSSVar("--text-secondary"),
            padding: 12,
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 3,
            useBorderRadius: true,
            font: { size: 11 },
          },
        },
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed;
              const pct = ((val / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${val.toLocaleString()} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  deferResize(chartInstance);
  addExportButton(container, chartInstance, title);
  addRefreshButton(container, () => (window as any).__mcpRefresh?.());
}
