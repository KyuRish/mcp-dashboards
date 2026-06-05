import {
  Chart,
  Tooltip,
} from "chart.js";
import { WordCloudController, WordElement } from "chartjs-chart-wordcloud";
import { getCSSVar, tooltipStyle, escapeHtml, resolveColors, addExportButton, addRefreshButton, sendClickMessage, deferResize, registerChart } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

Chart.register(WordCloudController, WordElement, Tooltip);

interface WordItem {
  text: string;
  value: number;
}

interface WordCloudData {
  type: "wordcloud";
  title: string;
  data: WordItem[];
  options: {
    colors?: string[];
  };
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderWordCloudChart(container: HTMLElement, payload: WordCloudData): void {
  const { title, data, options } = payload;

  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title${theme?.effects.shimmerTitle ? " shimmer-text" : ""}">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">${data.length} words</div>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas")!;
  const palette = resolveColors(options.colors, Math.min(data.length, 10));

  // Scale font sizes: largest word = 48px, smallest = 12px
  const maxVal = Math.max(...data.map(d => d.value));
  const minVal = Math.min(...data.map(d => d.value));
  const range = maxVal - minVal || 1;

  const chartInstance = new Chart(canvas, {
    type: "wordCloud" as any,
    data: {
      labels: data.map(d => d.text),
      datasets: [{
        data: data.map(d => 12 + ((d.value - minVal) / range) * 36),
        color: data.map((_, i) => palette[i % palette.length]),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, elements) => {
        if (elements.length === 0) return;
        const idx = elements[0].index;
        const item = data[idx];
        if (item) sendClickMessage(`"${item.text}": ${item.value} in "${title}"`);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            label: (ctx: any) => {
              const item = data[ctx.dataIndex];
              return item ? `${item.text}: ${item.value.toLocaleString()}` : "";
            },
          },
        },
      },
    },
  });

  deferResize(chartInstance);
  addExportButton(container, chartInstance, title);
  addRefreshButton(container);
}

registerChart("wordcloud", "render_wordcloud_chart", renderWordCloudChart);
