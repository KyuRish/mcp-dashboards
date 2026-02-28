import { renderPieChart } from "./pie.js";
import { renderBarChart } from "./bar.js";
import { renderLineChart } from "./line.js";
import { renderTable } from "./table.js";
import { escapeHtml, registerChart } from "./shared.js";

export interface AutoChartData {
  title: string;
  data: any;
  options?: {
    preferredType?: "pie" | "bar" | "line" | "table";
  };
}

interface ArrayAnalysis {
  stringKeys: string[];
  numberKeys: string[];
  dateKeys: string[];
}

// -- Helpers --

export function isDateLike(str: string): boolean {
  if (typeof str !== "string") return false;
  // ISO 8601: 2024-01-15 or 2024-01-15T00:00:00Z
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/.test(str)) return true;
  // MM/DD/YYYY or DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(str)) return true;
  // Month name: Jan 2024, January 2024, Jan-24
  if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s-]\d{2,4}$/i.test(str)) return true;
  // Q1 2024, Q2-2024
  if (/^Q[1-4][\s-]\d{4}$/.test(str)) return true;
  // Year only: 2020, 2021 ... (4-digit number in range)
  if (/^\d{4}$/.test(str)) {
    const n = parseInt(str, 10);
    if (n >= 1900 && n <= 2100) return true;
  }
  // Week: 2024-W01
  if (/^\d{4}-W\d{2}$/.test(str)) return true;
  return false;
}

export function isNumeric(val: any): boolean {
  if (typeof val === "number") return isFinite(val);
  if (typeof val === "string" && val.trim() !== "") {
    return isFinite(Number(val.trim()));
  }
  return false;
}

export function analyzeArray(arr: any[]): ArrayAnalysis {
  if (!Array.isArray(arr) || arr.length === 0) {
    return { stringKeys: [], numberKeys: [], dateKeys: [] };
  }

  // Collect keys from the first item (assume homogeneous array)
  const sample = arr[0];
  if (typeof sample !== "object" || sample === null || Array.isArray(sample)) {
    return { stringKeys: [], numberKeys: [], dateKeys: [] };
  }

  const keys = Object.keys(sample);
  const stringKeys: string[] = [];
  const numberKeys: string[] = [];
  const dateKeys: string[] = [];

  for (const key of keys) {
    // Check across all rows to determine dominant type
    let numCount = 0;
    let dateCount = 0;
    let strCount = 0;

    for (const row of arr) {
      const val = row[key];
      if (isNumeric(val)) {
        numCount++;
      } else if (typeof val === "string") {
        if (isDateLike(val)) {
          dateCount++;
        } else {
          strCount++;
        }
      }
    }

    const total = arr.length;
    if (dateCount / total >= 0.6) {
      dateKeys.push(key);
    } else if (numCount / total >= 0.6) {
      numberKeys.push(key);
    } else if (strCount + dateCount > 0) {
      stringKeys.push(key);
    }
  }

  return { stringKeys, numberKeys, dateKeys };
}

// -- Flattening --

function flattenObject(obj: Record<string, any>, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(result, flattenObject(v, key));
    } else {
      result[key] = v;
    }
  }
  return result;
}

function tryFlatten(data: any): any {
  if (Array.isArray(data)) {
    return data.map((item) =>
      typeof item === "object" && item !== null && !Array.isArray(item)
        ? flattenObject(item)
        : item
    );
  }
  if (typeof data === "object" && data !== null) {
    return flattenObject(data);
  }
  return data;
}

// -- Detection --

type ChartType = "pie" | "bar" | "line" | "table" | "raw";

function detect(data: any): ChartType {
  // Array of plain numbers
  if (Array.isArray(data) && data.length > 0 && data.every((v) => isNumeric(v))) {
    return "bar";
  }

  // Object with string keys and number values
  if (
    !Array.isArray(data) &&
    typeof data === "object" &&
    data !== null
  ) {
    const vals = Object.values(data);
    if (vals.length > 0 && vals.every((v) => isNumeric(v))) {
      return "pie";
    }
    // Nested - try to flatten and re-detect
    const flattened = tryFlatten(data);
    const flatVals = Object.values(flattened as object);
    if (flatVals.every((v) => isNumeric(v))) return "pie";
    return "raw";
  }

  // Array of objects
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];

    // Items are plain numbers (already handled above, but guard)
    if (typeof first !== "object" || first === null) {
      return "bar";
    }

    const { stringKeys, numberKeys, dateKeys } = analyzeArray(data);
    const totalKeys = stringKeys.length + numberKeys.length + dateKeys.length;

    // Date key(s) present - line chart
    if (dateKeys.length >= 1 && numberKeys.length >= 1) {
      return "line";
    }

    // Exactly one string key + one number key - pie
    if (stringKeys.length === 1 && numberKeys.length === 1 && totalKeys === 2) {
      return "pie";
    }

    // One string key + multiple number keys - grouped bar
    if (stringKeys.length === 1 && numberKeys.length > 1) {
      return "bar";
    }

    // Multiple string keys or 3+ mixed keys - table
    if (totalKeys >= 3) {
      return "table";
    }

    // Two string keys with one being date-like in values - fall to line
    // Otherwise fall back to table for mixed data
    return "table";
  }

  return "raw";
}

// -- Transformers --

function toPieData(title: string, data: any): Parameters<typeof renderPieChart>[1] {
  // Object {key: value}
  if (!Array.isArray(data) && typeof data === "object" && data !== null) {
    const flat = tryFlatten(data) as Record<string, any>;
    const entries = Object.entries(flat).filter(([, v]) => isNumeric(v));
    return {
      title,
      data: entries.map(([k, v]) => ({ label: k, value: Number(v) })),
      options: { donut: false, showLegend: true },
    };
  }

  // Array of numbers - shouldn't reach here normally but guard
  if (Array.isArray(data) && data.every((v) => isNumeric(v))) {
    return {
      title,
      data: data.map((v, i) => ({ label: String(i), value: Number(v) })),
      options: { donut: false, showLegend: true },
    };
  }

  // Array of objects
  const { stringKeys, numberKeys } = analyzeArray(data);
  const labelKey = stringKeys[0] ?? Object.keys(data[0])[0];
  const valueKey = numberKeys[0] ?? Object.keys(data[0]).find((k) => k !== labelKey) ?? "";

  return {
    title,
    data: data.map((row: any) => ({
      label: String(row[labelKey] ?? ""),
      value: Number(row[valueKey] ?? 0),
    })),
    options: { donut: false, showLegend: true },
  };
}

function toBarData(title: string, data: any): Parameters<typeof renderBarChart>[1] {
  // Array of plain numbers
  if (Array.isArray(data) && data.every((v) => isNumeric(v))) {
    return {
      title,
      labels: data.map((_, i) => String(i + 1)),
      datasets: [{ label: title, data: data.map(Number) }],
      options: {},
    };
  }

  // Object {key: value}
  if (!Array.isArray(data) && typeof data === "object" && data !== null) {
    const flat = tryFlatten(data) as Record<string, any>;
    const entries = Object.entries(flat).filter(([, v]) => isNumeric(v));
    return {
      title,
      labels: entries.map(([k]) => k),
      datasets: [{ label: title, data: entries.map(([, v]) => Number(v)) }],
      options: {},
    };
  }

  // Array of objects - one string category key + multiple number series
  const { stringKeys, numberKeys, dateKeys } = analyzeArray(data);
  const categoryKey = stringKeys[0] ?? dateKeys[0] ?? Object.keys(data[0])[0];
  const seriesKeys = numberKeys.length > 0 ? numberKeys : Object.keys(data[0]).filter((k) => k !== categoryKey && isNumeric(data[0][k]));

  return {
    title,
    labels: data.map((row: any) => String(row[categoryKey] ?? "")),
    datasets: seriesKeys.map((key) => ({
      label: key,
      data: data.map((row: any) => Number(row[key] ?? 0)),
    })),
    options: {},
  };
}

function toLineData(title: string, data: any): Parameters<typeof renderLineChart>[1] {
  // Object {key: value} - treat keys as x-axis labels
  if (!Array.isArray(data) && typeof data === "object" && data !== null) {
    const flat = tryFlatten(data) as Record<string, any>;
    const entries = Object.entries(flat).filter(([, v]) => isNumeric(v));
    return {
      title,
      labels: entries.map(([k]) => k),
      datasets: [{ label: title, data: entries.map(([, v]) => Number(v)) }],
      options: {},
    };
  }

  const { dateKeys, numberKeys, stringKeys } = analyzeArray(data);
  const xKey = dateKeys[0] ?? stringKeys[0] ?? Object.keys(data[0])[0];
  const seriesKeys = numberKeys.length > 0
    ? numberKeys
    : Object.keys(data[0]).filter((k) => k !== xKey && isNumeric(data[0][k]));

  return {
    title,
    labels: data.map((row: any) => String(row[xKey] ?? "")),
    datasets: seriesKeys.map((key) => ({
      label: key,
      data: data.map((row: any) => Number(row[key] ?? 0)),
    })),
    options: {},
  };
}

function toTableData(title: string, data: any): Parameters<typeof renderTable>[1] {
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
    const columns = Object.keys(data[0]);
    return { title, columns, rows: data };
  }

  // Object - convert to two-column table
  if (!Array.isArray(data) && typeof data === "object" && data !== null) {
    const flat = tryFlatten(data) as Record<string, any>;
    return {
      title,
      columns: ["Key", "Value"],
      rows: Object.entries(flat).map(([k, v]) => ({ Key: k, Value: String(v) })),
    };
  }

  return { title, columns: ["Value"], rows: (data as any[]).map((v) => ({ Value: String(v) })) };
}

// -- Raw fallback --

function renderRaw(container: HTMLElement, title: string, data: any): void {
  const json = JSON.stringify(data, null, 2);
  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle">Raw JSON - could not determine chart type</div>
          </div>
        </div>
        <div class="chart-card__body" style="overflow:auto;padding:16px">
          <pre style="margin:0;font-size:12px;color:var(--text-secondary,#94A3B8);white-space:pre-wrap;word-break:break-all">${escapeHtml(json)}</pre>
        </div>
      </div>
    </div>
  `;
}

// -- Main export --

function hasNestedObjects(data: any): boolean {
  if (Array.isArray(data)) {
    // Check if any item in the array has nested object values
    const sample = data.find((item) => typeof item === "object" && item !== null && !Array.isArray(item));
    if (!sample) return false;
    return Object.values(sample).some((v) => typeof v === "object" && v !== null && !Array.isArray(v));
  }
  if (typeof data === "object" && data !== null) {
    return Object.values(data).some((v) => typeof v === "object" && v !== null && !Array.isArray(v));
  }
  return false;
}

export function renderAutoChart(container: HTMLElement, payload: AutoChartData): void {
  const { title, options } = payload;
  let { data } = payload;
  const preferred = options?.preferredType;

  // Always flatten nested objects/arrays before analysis
  // This handles cases like {name: {common: "Vietnam"}} -> {"name.common": "Vietnam"}
  let resolvedData = data;
  if (hasNestedObjects(data)) {
    resolvedData = tryFlatten(data);
    // For non-arrays: if flattened result still has nested objects, convert to row array
    if (!Array.isArray(resolvedData) && typeof resolvedData === "object" && resolvedData !== null) {
      const flatVals = Object.values(resolvedData as object);
      if (flatVals.some((v) => typeof v === "object" && v !== null)) {
        resolvedData = Object.entries(resolvedData as object).map(([k, v]) => ({
          key: k,
          value: typeof v === "object" ? JSON.stringify(v) : v,
        }));
      }
    }
  }

  const chartType: ChartType = preferred ?? detect(resolvedData);

  try {
    switch (chartType) {
      case "pie":
        renderPieChart(container, toPieData(title, resolvedData));
        break;
      case "bar":
        renderBarChart(container, toBarData(title, resolvedData));
        break;
      case "line":
        renderLineChart(container, toLineData(title, resolvedData));
        break;
      case "table":
        renderTable(container, toTableData(title, resolvedData));
        break;
      default:
        renderRaw(container, title, data);
    }
  } catch {
    renderRaw(container, title, data);
  }
}

registerChart("auto", "render_from_json", renderAutoChart);
