import {
  THEME_PRESETS,
  PALETTE_TO_CSS,
  loadThemeFonts,
} from "../themes.js";
import type { ColorPalette, ThemePreset } from "../themes.js";
import { registerChart, escapeHtml, sendClickMessage, addHtmlExportButton } from "./shared.js";

function renderThemeCatalog(container: HTMLElement, _payload: any): void {
  const entries = Object.entries(THEME_PRESETS);

  // Load all distinct font sets
  const seenFonts = new Set<string>();
  for (const [, theme] of entries) {
    const key = theme.typography.fontHeading + theme.typography.fontBody;
    if (!seenFonts.has(key)) {
      seenFonts.add(key);
      loadThemeFonts(theme.typography);
    }
  }

  const cards = entries.map(([key, theme]) => buildThemeCard(key, theme)).join("");

  container.innerHTML = `
    <div class="theme-catalog chart-card">
      <div class="theme-catalog__header chart-card__header">
        <h1 class="theme-catalog__title chart-card__title">Theme Catalog</h1>
        <span class="theme-catalog__subtitle">${entries.length} themes - click any card to use it</span>
      </div>
      <div class="theme-catalog__grid">${cards}</div>
    </div>
  `;

  addHtmlExportButton(container, "theme-catalog");

  // Click handler - delegate from grid
  const grid = container.querySelector(".theme-catalog__grid");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>("[data-theme]");
      if (!card) return;
      const name = card.dataset.theme!;
      sendClickMessage(`Use theme: "${name}"`);
    });
  }
}

function buildThemeCard(key: string, theme: ThemePreset): string {
  // Build inline CSS variable string for scoping
  const vars: string[] = [];
  for (const [prop, cssVar] of Object.entries(PALETTE_TO_CSS)) {
    const value = theme.palette[prop as keyof ColorPalette];
    if (value) vars.push(`${cssVar}:${value}`);
  }
  vars.push(`--font-heading:${theme.typography.fontHeading}`);
  vars.push(`--font-body:${theme.typography.fontBody}`);

  // Effect classes scoped to this card
  const fx: string[] = [];
  if (theme.effects.glowBorders) fx.push("fx-glow");
  if (theme.effects.neonGlow) fx.push("fx-neon");
  if (theme.effects.glassCards) fx.push("fx-glass");

  // Palette swatches
  const swatchColors = ["--accent", "--positive", "--negative", "--c1", "--c2", "--c3", "--c4", "--c5", "--c6", "--c7"];
  const swatches = swatchColors
    .map((c) => `<span class="tc-swatch" style="background:var(${c})"></span>`)
    .join("");

  // CSS-only mini bar chart using palette colors
  const barHeights = [40, 70, 55, 85];
  const barColors = ["--c1", "--c2", "--c3", "--c4"];
  const bars = barHeights
    .map((h, i) => `<span class="tc-bar" style="height:${h}%;background:var(${barColors[i]})"></span>`)
    .join("");

  // Typography + effects labels
  const typoName = theme.typography.fontHeading.split(",")[0].replace(/['"]/g, "");
  const effectName = theme.effects.shimmerTitle ? "shimmer"
    : theme.effects.neonGlow ? "neon"
    : theme.effects.glowBorders ? "glow"
    : theme.effects.glassCards ? "glass"
    : theme.effects.hoverLift ? "lift"
    : "none";

  return `
    <div class="tc-card ${fx.join(" ")}" data-theme="${escapeHtml(key)}" style="${vars.join(";")}">
      <div class="tc-card__bg">
        <div class="tc-card__name">${escapeHtml(key)}</div>
        <div class="tc-card__meta">${escapeHtml(typoName)} / ${effectName}</div>
        <div class="tc-card__bars">${bars}</div>
        <div class="tc-card__swatches">${swatches}</div>
      </div>
    </div>
  `;
}

registerChart("theme_catalog", "render_theme_catalog", renderThemeCatalog);
