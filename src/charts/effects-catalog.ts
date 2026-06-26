import { EFFECT_PRESETS } from "../themes.js";
import type { EffectPreset } from "../themes.js";
import { registerChart, escapeHtml, sendClickMessage, addHtmlExportButton } from "./shared.js";

// Effects catalog. Self-contained static catalog of every effect preset, with
// every treatment rendered in-tile - no asterisks, no "see this in a real
// dashboard" hand-waving. Each effect has a scoped CSS rule under .ec-card.fx-*
// in styles.css (count-up is the one exception that needs a JS rAF loop since
// pure CSS counter() animation has uneven browser support).

function renderEffectsCatalog(container: HTMLElement, _payload: any): void {
  const entries = Object.entries(EFFECT_PRESETS);
  const cards = entries.map(([key, preset]) => buildEffectCard(key, preset)).join("");

  container.innerHTML = `
    <div class="effects-catalog chart-card">
      <div class="effects-catalog__header chart-card__header">
        <h1 class="effects-catalog__title chart-card__title">Effects Catalog</h1>
        <span class="effects-catalog__subtitle">${entries.length} effects - click any card to use it</span>
      </div>
      <div class="effects-catalog__grid">${cards}</div>
    </div>
  `;

  addHtmlExportButton(container, "effects-catalog");

  // Click handler - delegate from grid (same pattern as theme catalog)
  const grid = container.querySelector(".effects-catalog__grid");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>("[data-effect]");
      if (!card) return;
      const name = card.dataset.effect!;
      sendClickMessage(`Use effect: "${name}"`);
    });
  }

  startCountUps(container);
}

// rAF loop that animates each .ec-card.fx-countup .ec-card__count from 0 to
// its data-target value over 3s, then holds for 1s, then loops. Self-contained
// per call - cards never accumulate listeners because each render replaces
// container.innerHTML, which detaches any prior rAF callbacks via the GC path
// (we check element.isConnected each frame and bail when the card is gone).
function startCountUps(container: HTMLElement): void {
  const els = Array.from(container.querySelectorAll<HTMLElement>(".ec-card.fx-countup .ec-card__count"));
  if (els.length === 0) return;
  const start = performance.now();
  function tick(now: number): void {
    let anyConnected = false;
    for (const el of els) {
      if (!el.isConnected) continue;
      anyConnected = true;
      const target = Number(el.dataset.target ?? "47") || 47;
      const elapsed = (now - start) % 4000;
      const t = Math.min(1, elapsed / 3000);
      el.textContent = String(Math.floor(target * t));
    }
    if (anyConnected) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function buildEffectCard(key: string, preset: EffectPreset): string {
  // Reuse the production fx-* class names - scoped via .ec-card prefix in CSS
  // so they only style catalog tiles, not production charts.
  const fx: string[] = [];
  if (preset.shimmerTitle) fx.push("fx-shimmer");
  if (preset.glowBorders) fx.push("fx-glow");
  if (preset.neonGlow) fx.push("fx-neon");
  if (preset.glassCards) fx.push("fx-glass");
  if (preset.hoverLift) fx.push("fx-lift");
  if (preset.scanlines) fx.push("fx-scanlines");
  if (preset.statusPulse) fx.push("fx-pulse");
  if (preset.countUpNumbers) fx.push("fx-countup");
  if (preset.particles) fx.push("fx-particles");

  const features: string[] = [];
  if (preset.shimmerTitle) features.push("title shimmer");
  if (preset.glowBorders) features.push("glow borders");
  if (preset.neonGlow) features.push("neon glow");
  if (preset.glassCards) features.push("glass cards");
  if (preset.hoverLift) features.push("hover lift");
  if (preset.scanlines) features.push("scanlines");
  if (preset.statusPulse) features.push("status pulse");
  if (preset.countUpNumbers) features.push("count-up numbers");
  if (preset.particles) features.push("particles");
  if (features.length === 0) features.push("no animation");

  const featuresHtml = features
    .map((f) => `<span class="ec-card__feature">${escapeHtml(f)}</span>`)
    .join("");

  // Conditional sub-elements - only rendered when the preset opts into them.
  // Keeps the DOM minimal for "none" / "subtle" tiles.
  const pulseHtml = preset.statusPulse
    ? `<span class="ec-card__pulse" aria-hidden="true"></span>`
    : "";
  const countHtml = preset.countUpNumbers
    ? `<span class="ec-card__count" data-target="47">0</span>`
    : "";
  const particlesHtml = preset.particles
    ? `<span class="ec-card__particles" aria-hidden="true"><span class="ec-particle"></span><span class="ec-particle"></span><span class="ec-particle"></span><span class="ec-particle"></span><span class="ec-particle"></span></span>`
    : "";
  // Halo: inline SVG with a solid rect + feGaussianBlur filter. html2canvas-pro
  // serializes inline SVG to a data: URI and lets the browser rasterize it
  // (src/dom/replaced-elements/svg-element-container.ts), so SVG features
  // (feGaussianBlur, radialGradient) render natively without touching the
  // library's broken CSS box-shadow/gradient paths. The rect is the visible
  // card shape, the blur fades its edges outward, creating a uniform halo
  // hugging the card perimeter - the SVG equivalent of a single-layer
  // box-shadow. IMPORTANT: SVG IDs MUST be unique per card (html2canvas
  // issue #1380); stop colors/opacity MUST be inline attributes (external
  // CSS doesn't survive serialization). Color picked from the preset:
  // neon -> cyan, glow-only -> indigo.
  const haloColor = preset.neonGlow ? "#22d3ee" : "#818cf8";
  const haloHtml = (preset.glowBorders || preset.neonGlow)
    ? `<svg class="ec-card__halo" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="overflow:visible">
         <defs>
           <filter id="haloFilter-${escapeHtml(key)}" x="-50%" y="-50%" width="200%" height="200%">
             <feGaussianBlur stdDeviation="5"/>
           </filter>
         </defs>
         <rect x="8" y="8" width="84" height="84" rx="4" ry="4" fill="${haloColor}" filter="url(#haloFilter-${escapeHtml(key)})" opacity="0.7"/>
       </svg>`
    : "";

  // Glass sheen: top-anchored radial highlight that fades to transparent at the
  // edges (all outermost stops at stop-opacity="0"). In live, backdrop-filter
  // does the real glass work and this SVG is hidden (opacity:0 in CSS). In
  // export, where backdrop-filter doesn't render, the export override forces
  // this SVG visible AND drops the colored bg gradient that was creating the
  // visible rectangular outline. Result: glass cards in download have a subtle
  // sheen that reads as "glass" without any bg-color contrast at the edges.
  const glassHtml = preset.glassCards
    ? `<svg class="ec-card__glass" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
         <defs>
           <radialGradient id="glassHi-${escapeHtml(key)}" cx="50%" cy="0%" r="85%" fx="50%" fy="0%">
             <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.28"/>
             <stop offset="45%"  stop-color="#ffffff" stop-opacity="0.08"/>
             <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
           </radialGradient>
           <radialGradient id="glassBody-${escapeHtml(key)}" cx="50%" cy="50%" r="75%">
             <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.06"/>
             <stop offset="70%"  stop-color="#ffffff" stop-opacity="0.02"/>
             <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
           </radialGradient>
         </defs>
         <rect width="100" height="100" fill="url(#glassBody-${escapeHtml(key)})"/>
         <rect width="100" height="100" fill="url(#glassHi-${escapeHtml(key)})"/>
       </svg>`
    : "";

  return `
    <div class="ec-card ${fx.join(" ")}" data-effect="${escapeHtml(key)}">
      ${haloHtml}
      <div class="ec-card__bg">
        ${glassHtml}
        <div class="ec-card__head">
          <div class="ec-card__name">${escapeHtml(key)}</div>
          ${pulseHtml}
        </div>
        ${countHtml}
        <div class="ec-card__features">${featuresHtml}</div>
        ${particlesHtml}
      </div>
    </div>
  `;
}

registerChart("effects_catalog", "render_effects_catalog", renderEffectsCatalog);
