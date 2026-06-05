import { Chart, PointElement, Tooltip } from "chart.js";
import { ChoroplethController, BubbleMapController, GeoFeature, ColorScale, SizeScale, ProjectionScale } from "chartjs-chart-geo";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import { getCSSVar, tooltipStyle, escapeHtml, addExportButton, addRefreshButton, sendClickMessage, deferResize, registerChart, addCanvasZoom } from "./shared.js";
import { resolveTheme, applyTheme } from "../themes.js";

Chart.register(ChoroplethController, BubbleMapController, GeoFeature, ColorScale, SizeScale, ProjectionScale, PointElement, Tooltip);

// ISO 3166-1 alpha-2 -> numeric code mapping for world-atlas feature IDs
export const ALPHA2_TO_NUMERIC: Record<string, string> = {
  AF: "004", AL: "008", DZ: "012", AO: "024", AQ: "010",
  AR: "032", AM: "051", AU: "036", AT: "040", AZ: "031",
  BS: "044", BD: "050", BY: "112", BE: "056", BZ: "084",
  BJ: "204", BT: "064", BO: "068", BA: "070", BW: "072",
  BR: "076", BN: "096", BG: "100", BF: "854", BI: "108",
  KH: "116", CM: "120", CA: "124", CF: "140", TD: "148",
  CL: "152", CN: "156", CO: "170", CG: "178", CD: "180",
  CR: "188", CI: "384", HR: "191", CU: "192", CY: "196",
  CZ: "203", DK: "208", DJ: "262", DO: "214", EC: "218",
  EG: "818", SV: "222", GQ: "226", ER: "232", EE: "233",
  SZ: "748", ET: "231", FK: "238", FJ: "242", FI: "246",
  FR: "250", TF: "260", GA: "266", GM: "270", GE: "268",
  DE: "276", GH: "288", GR: "300", GL: "304", GT: "320",
  GN: "324", GW: "624", GY: "328", HT: "332", HN: "340",
  HU: "348", IS: "352", IN: "356", ID: "360", IR: "364",
  IQ: "368", IE: "372", IL: "376", IT: "380", JM: "388",
  JP: "392", JO: "400", KZ: "398", KE: "404", KP: "408",
  KR: "410", KW: "414", KG: "417", LA: "418", LV: "428",
  LB: "422", LS: "426", LR: "430", LY: "434", LT: "440",
  LU: "442", MG: "450", MW: "454", MY: "458", ML: "466",
  MR: "478", MX: "484", MD: "498", MN: "496", ME: "499",
  MA: "504", MZ: "508", MM: "104", NA: "516", NP: "524",
  NL: "528", NC: "540", NZ: "554", NI: "558", NE: "562",
  NG: "566", NO: "578", OM: "512", PK: "586", PS: "275",
  PA: "591", PG: "598", PY: "600", PE: "604", PH: "608",
  PL: "616", PT: "620", PR: "630", QA: "634", RO: "642",
  RU: "643", RW: "646", SA: "682", SN: "686", RS: "688",
  SL: "694", SK: "703", SI: "705", SB: "090", SO: "706",
  ZA: "710", SS: "728", ES: "724", LK: "144", SD: "729",
  SR: "740", SE: "752", CH: "756", SY: "760", TW: "158",
  TJ: "762", TZ: "834", TH: "764", TL: "626", TG: "768",
  TT: "780", TN: "788", TR: "792", TM: "795", UG: "800",
  UA: "804", AE: "784", GB: "826", US: "840", UY: "858",
  UZ: "860", VU: "548", VE: "862", VN: "704", EH: "732",
  YE: "887", ZM: "894", ZW: "716", MK: "807",
};

// Reverse: numeric -> alpha-2 (for tooltip display)
export const NUMERIC_TO_ALPHA2: Record<string, string> = {};
for (const [a2, num] of Object.entries(ALPHA2_TO_NUMERIC)) {
  NUMERIC_TO_ALPHA2[num] = a2;
}

// Map user-friendly color scale names to d3-scale-chromatic interpolators
export const COLOR_SCALES: Record<string, string> = {
  blue: "blues",
  green: "greens",
  red: "reds",
  heat: "ylOrRd",
  purple: "purples",
  orange: "oranges",
};

interface GeoData {
  title: string;
  data: Record<string, number>;
  options?: {
    projection?: string;
    colorScale?: string;
    showLegend?: boolean;
    missingColor?: string;
  };
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderGeoChart(container: HTMLElement, payload: GeoData): void {
  const { title, data, options = {} } = payload;
  const projection = options.projection ?? "naturalEarth1";
  const colorScaleKey = options.colorScale ?? "blue";
  const showLegend = options.showLegend !== false;
  const missingColor = options.missingColor ?? "rgba(128, 140, 160, 0.15)";

  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmerClass = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const countryCount = Object.keys(data).length;

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title${shimmerClass}">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">${countryCount} countries</div>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas")!;

  // Convert TopoJSON -> GeoJSON features
  const countries = (feature(worldAtlas as any, (worldAtlas as any).objects.countries) as any).features as any[];

  // Build numeric ID -> value map from alpha-2 input
  const valueMap = new Map<string, number>();
  for (const [code, value] of Object.entries(data)) {
    const numericId = ALPHA2_TO_NUMERIC[code.toUpperCase()];
    if (numericId) {
      valueMap.set(numericId, value);
    }
  }

  // Resolve color interpolator
  const interpolate = COLOR_SCALES[colorScaleKey] ?? COLOR_SCALES.blue;

  const chartInstance = new Chart(canvas, {
    type: "choropleth" as any,
    data: {
      labels: countries.map((c: any) => c.properties?.name ?? "Unknown"),
      datasets: [{
        outline: countries,
        data: countries.map((c: any) => ({
          feature: c,
          value: valueMap.get(String(c.id)) ?? null,
        })),
        outlineBorderColor: getCSSVar("--text-muted") || "#666",
        outlineBorderWidth: 0.5,
        borderColor: getCSSVar("--text-muted") || "#666",
        borderWidth: 0.3,
      }] as any,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event: any, elements: any[]) => {
        if (elements.length === 0) return;
        const idx = elements[0].index;
        const feat = countries[idx];
        const name = feat.properties?.name ?? "Unknown";
        const numId = String(feat.id);
        const alpha2 = NUMERIC_TO_ALPHA2[numId] ?? numId;
        const val = valueMap.get(numId);
        if (val != null) {
          sendClickMessage(`${name} (${alpha2}): ${val.toLocaleString()} in "${title}"`);
        } else {
          sendClickMessage(`${name} (${alpha2}): no data in "${title}"`);
        }
      },
      scales: {
        projection: {
          axis: "x" as const,
          projection,
        },
        color: {
          axis: "x" as const,
          interpolate,
          display: showLegend,
          missing: missingColor,
          legend: {
            position: "bottom-right" as const,
            align: "right" as const,
            length: 150,
            width: 10,
            indicatorWidth: 8,
          },
        },
      } as any,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            label: (ctx: any) => {
              const feat = countries[ctx.dataIndex];
              const name = feat?.properties?.name ?? "Unknown";
              const val = ctx.raw?.value;
              if (val == null) return ` ${name}: No data`;
              return ` ${name}: ${val.toLocaleString()}`;
            },
          },
        },
      },
    } as any,
  });

  deferResize(chartInstance);
  addExportButton(container, chartInstance, title);
  addRefreshButton(container);

  // Zoom/pan for geo maps
  const body = container.querySelector<HTMLElement>(".chart-card__body");
  if (body) addCanvasZoom(body, canvas, chartInstance);
}

registerChart("geo", "render_geo_chart", renderGeoChart);

// --- Bubble Map ---

interface BubbleMapPoint {
  label: string;
  latitude: number;
  longitude: number;
  value: number;
}

interface BubbleMapData {
  title: string;
  data: BubbleMapPoint[];
  options?: {
    projection?: string;
    sizeRange?: [number, number];
    bubbleColor?: string;
    showOutline?: boolean;
  };
  theme?: string;
  palette?: string;
  typography?: string;
  effects?: string;
}

export function renderBubbleMap(container: HTMLElement, payload: BubbleMapData): void {
  const { title, data, options = {} } = payload;
  const projection = options.projection ?? "naturalEarth1";
  const sizeRange = options.sizeRange ?? [3, 25];
  const showOutline = options.showOutline !== false;

  const theme = resolveTheme(payload.theme, {
    palette: payload.palette,
    typography: payload.typography,
    effects: payload.effects,
  });
  if (theme) applyTheme(container, theme);

  const shimmerClass = theme?.effects.shimmerTitle ? " shimmer-text" : "";
  const bubbleColor = options.bubbleColor ?? (getCSSVar("--accent") || "rgba(59, 130, 246, 0.7)");

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title${shimmerClass}">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">${data.length} locations</div>
          </div>
        </div>
        <div class="chart-card__body">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = container.querySelector<HTMLCanvasElement>("#chart-canvas")!;
  const countries = (feature(worldAtlas as any, (worldAtlas as any).objects.countries) as any).features as any[];

  const chartInstance = new Chart(canvas, {
    type: "bubbleMap" as any,
    data: {
      labels: data.map((d) => d.label),
      datasets: [{
        outline: countries,
        showOutline,
        outlineBorderColor: getCSSVar("--text-muted") || "#666",
        outlineBorderWidth: 0.5,
        backgroundColor: bubbleColor,
        data: data.map((d) => ({
          longitude: d.longitude,
          latitude: d.latitude,
          value: d.value,
        })),
      }] as any,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event: any, elements: any[]) => {
        if (elements.length === 0) return;
        const idx = elements[0].index;
        const pt = data[idx];
        if (pt) {
          sendClickMessage(`${pt.label}: ${pt.value.toLocaleString()} in "${title}"`);
        }
      },
      scales: {
        projection: {
          axis: "x" as const,
          projection,
        },
        size: {
          axis: "x" as const,
          display: false,
          range: sizeRange,
        },
      } as any,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            label: (ctx: any) => {
              const pt = data[ctx.dataIndex];
              if (!pt) return "";
              return ` ${pt.label}: ${pt.value.toLocaleString()}`;
            },
          },
        },
      },
    } as any,
  });

  deferResize(chartInstance);
  addExportButton(container, chartInstance, title);
  addRefreshButton(container);

  const body = container.querySelector<HTMLElement>(".chart-card__body");
  if (body) {
    const baseRange = [...sizeRange] as [number, number];
    addCanvasZoom(body, canvas, chartInstance, (s) => {
      (chartInstance.options as any).scales.size.range = [baseRange[0] / s, baseRange[1] / s];
    });
  }
}

registerChart("bubble_map", "render_bubble_map", renderBubbleMap);
