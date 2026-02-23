import { escapeHtml } from "./shared.js";

export interface TableData {
  title: string;
  columns: string[];
  rows: Array<Record<string, string | number>>;
  options?: {
    sortable?: boolean;
    striped?: boolean;
  };
}

const STYLE_ID = "mcp-table-styles";

function injectStyles(container: HTMLElement): void {
  if (container.querySelector(`#${STYLE_ID}`)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .tbl-wrap {
      flex: 1;
      min-height: 0;
      overflow: auto;
      border-radius: 8px;
      border: 1px solid var(--border);
      scrollbar-width: thin;
      scrollbar-color: var(--border-md) transparent;
    }
    .tbl-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
    .tbl-wrap::-webkit-scrollbar-track { background: transparent; }
    .tbl-wrap::-webkit-scrollbar-thumb {
      background: var(--border-md);
      border-radius: 4px;
    }

    .tbl {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .tbl thead {
      position: sticky;
      top: 0;
      z-index: 2;
    }

    .tbl thead tr {
      background: var(--bg-card-2);
      border-bottom: 1px solid var(--border-md);
    }

    .tbl th {
      padding: 9px 12px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-secondary);
      white-space: nowrap;
      user-select: none;
      border-right: 1px solid var(--border);
    }
    .tbl th:last-child { border-right: none; }

    .tbl th.tbl-sortable {
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .tbl th.tbl-sortable:hover {
      background: var(--accent-muted);
      color: var(--accent);
    }
    .tbl th.tbl-sorted {
      color: var(--accent);
      background: var(--accent-muted);
    }

    .tbl-sort-icon {
      display: inline-block;
      margin-left: 4px;
      font-size: 9px;
      opacity: 0.5;
      vertical-align: middle;
      transition: opacity 0.15s ease;
    }
    .tbl th.tbl-sorted .tbl-sort-icon { opacity: 1; }

    .tbl td {
      padding: 8px 12px;
      color: var(--text-primary);
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    .tbl td:last-child { border-right: none; }
    .tbl tbody tr:last-child td { border-bottom: none; }

    .tbl td.tbl-num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-family: "SF Mono", "Fira Code", "Cascadia Mono", ui-monospace, monospace;
      font-size: 11.5px;
      color: var(--text-primary);
    }
    .tbl td.tbl-str { text-align: left; }

    .tbl tbody tr {
      transition: background 0.12s ease;
    }
    .tbl tbody tr:hover td {
      background: var(--accent-muted) !important;
    }

    .tbl--striped tbody tr:nth-child(even) td {
      background: var(--bg-card-2);
    }

    .tbl-meta {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 1px;
    }

    .tbl-empty {
      padding: 32px;
      text-align: center;
      color: var(--text-muted);
      font-size: 12px;
    }
  `;
  container.appendChild(style);
}

function isNumeric(value: string | number): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "string" && value.trim() === "") return false;
  return !isNaN(Number(value));
}

function detectNumericColumns(
  columns: string[],
  rows: Array<Record<string, string | number>>
): Set<string> {
  const numeric = new Set<string>();
  if (rows.length === 0) return numeric;

  for (const col of columns) {
    const allNumeric = rows.every((row) => {
      const v = row[col];
      return v === undefined || v === null || isNumeric(v);
    });
    if (allNumeric) numeric.add(col);
  }
  return numeric;
}

function formatCell(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

export function renderTable(container: HTMLElement, payload: TableData): void {
  const { title, columns, rows, options = {} } = payload;
  const sortable = options.sortable !== false; // default true
  const striped = options.striped === true;

  injectStyles(container);

  const rowCount = rows.length;
  const colCount = columns.length;
  const subtitle =
    `${rowCount} row${rowCount !== 1 ? "s" : ""} \u00b7 ${colCount} column${colCount !== 1 ? "s" : ""}`;

  const numericCols = detectNumericColumns(columns, rows);

  // Build header cells
  const headerCells = columns
    .map((col, i) => {
      const align = numericCols.has(col) ? "right" : "left";
      const sortClass = sortable ? " tbl-sortable" : "";
      const icon = sortable
        ? `<span class="tbl-sort-icon" data-icon="${i}">&#x25B4;&#x25BE;</span>`
        : "";
      return `<th class="tbl-th${sortClass}" data-col="${i}" style="text-align:${align}" title="${escapeHtml(col)}">${escapeHtml(col)}${icon}</th>`;
    })
    .join("");

  // Build body rows
  let bodyHtml = "";
  if (rows.length === 0) {
    bodyHtml = `<tr><td class="tbl-empty" colspan="${columns.length}">No data</td></tr>`;
  } else {
    for (const row of rows) {
      const cells = columns
        .map((col) => {
          const val = row[col];
          const cellClass = numericCols.has(col) ? "tbl-num" : "tbl-str";
          const display = escapeHtml(formatCell(val));
          return `<td class="${cellClass}">${display}</td>`;
        })
        .join("");
      bodyHtml += `<tr>${cells}</tr>`;
    }
  }

  const stripedClass = striped ? " tbl--striped" : "";

  container.innerHTML = `
    <div class="chart-view">
      <div class="card chart-card">
        <div class="chart-card__header">
          <div>
            <div class="chart-card__title">${escapeHtml(title)}</div>
            <div class="chart-card__subtitle tbl-meta">${subtitle}</div>
          </div>
        </div>
        <div class="chart-card__body" style="display:flex;flex-direction:column;">
          <div class="tbl-wrap">
            <table class="tbl${stripedClass}">
              <thead>
                <tr>${headerCells}</tr>
              </thead>
              <tbody id="tbl-body">
                ${bodyHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  // Re-inject the style tag (innerHTML wipe removed it)
  injectStyles(container);

  if (!sortable || rows.length === 0) return;

  // Sorting state
  let sortCol: number | null = null;
  let sortAsc = true;

  // Working copy of rows - indices into original rows array
  let sortedIndices: number[] = rows.map((_, i) => i);

  const tbody = container.querySelector<HTMLElement>("#tbl-body")!;
  const headers = container.querySelectorAll<HTMLElement>(".tbl-th.tbl-sortable");

  function rebuildBody(): void {
    const colName = sortCol !== null ? columns[sortCol] : null;
    const isNum = colName !== null && numericCols.has(colName);

    const sorted = [...sortedIndices].sort((a, b) => {
      if (colName === null) return 0;
      const av = rows[a][colName];
      const bv = rows[b][colName];

      let cmp = 0;
      if (isNum) {
        const an = av === undefined || av === "" ? -Infinity : Number(av);
        const bn = bv === undefined || bv === "" ? -Infinity : Number(bv);
        cmp = an - bn;
      } else {
        const as = av === undefined ? "" : String(av);
        const bs = bv === undefined ? "" : String(bv);
        cmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: "base" });
      }
      return sortAsc ? cmp : -cmp;
    });
    sortedIndices = sorted;

    let html = "";
    for (const idx of sortedIndices) {
      const row = rows[idx];
      const cells = columns
        .map((col) => {
          const val = row[col];
          const cellClass = numericCols.has(col) ? "tbl-num" : "tbl-str";
          const display = escapeHtml(formatCell(val));
          return `<td class="${cellClass}">${display}</td>`;
        })
        .join("");
      html += `<tr>${cells}</tr>`;
    }
    tbody.innerHTML = html;
  }

  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const colIdx = parseInt(th.dataset.col ?? "0", 10);

      if (sortCol === colIdx) {
        sortAsc = !sortAsc;
      } else {
        sortCol = colIdx;
        sortAsc = true;
      }

      // Update header visuals
      headers.forEach((h) => {
        h.classList.remove("tbl-sorted");
        const icon = h.querySelector<HTMLElement>(".tbl-sort-icon");
        if (icon) icon.innerHTML = "&#x25B4;&#x25BE;";
      });
      th.classList.add("tbl-sorted");
      const activeIcon = th.querySelector<HTMLElement>(".tbl-sort-icon");
      if (activeIcon) {
        activeIcon.innerHTML = sortAsc ? "&#x25B4;" : "&#x25BE;";
      }

      rebuildBody();
    });
  });
}
