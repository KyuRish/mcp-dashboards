import { escapeHtml, sendClickMessage } from "./shared.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type GemType =
  | "diamond" | "ruby" | "sapphire" | "emerald"
  | "golden_pearl" | "white_pearl" | "black_pearl" | "crystal";

interface GemConfig {
  /** Identity glow color (gem's signature) - blended with theme glow via CSS */
  glowColor: string;
  /** Whether the gem surface is light or dark - drives text color for contrast */
  bg: "light" | "dark";
  question: string;
}

export interface GemPayload {
  gemType?: GemType;
  value?: string | number;
  unit?: string;
  label?: string;
  title?: string;
}

// ── Gem Configs ────────────────────────────────────────────────────────────
// Only gem-identity colors here. Text/label/shadow all come from theme CSS vars.

const CONFIGS: Record<GemType, GemConfig> = {
  diamond:       { glowColor: "rgba(200, 220, 255, 0.5)", bg: "light", question: "What's the crown number?" },
  ruby:          { glowColor: "rgba(220, 20, 60, 0.5)",   bg: "dark",  question: "What's burning hot?" },
  sapphire:      { glowColor: "rgba(30, 80, 200, 0.5)",   bg: "dark",  question: "How solid is the foundation?" },
  emerald:       { glowColor: "rgba(0, 180, 80, 0.45)",   bg: "dark",  question: "How much growth?" },
  golden_pearl:  { glowColor: "rgba(212, 175, 55, 0.3)",  bg: "light", question: "What's the treasure worth?" },
  white_pearl:   { glowColor: "rgba(255, 255, 255, 0.15)",bg: "light", question: "What's the clean total?" },
  black_pearl:   { glowColor: "rgba(64, 136, 104, 0.2)",  bg: "dark",  question: "What's the rare find?" },
  crystal:       { glowColor: "rgba(192, 216, 240, 0.2)", bg: "dark",  question: "What does the future hold?" },
};

// ── Geometry Helpers ───────────────────────────────────────────────────────

let _uid = 0;
function gid(): string { return `gem-${++_uid}`; }

function exy(cx: number, cy: number, rx: number, ry: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [+(cx + rx * Math.cos(r)).toFixed(1), +(cy + ry * Math.sin(r)).toFixed(1)];
}

function pts(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

/** Pick facet color based on angle to light source (225 = top-left) */
function fColor(deg: number, palette: string[]): string {
  const diff = Math.abs(((deg - 225 + 540) % 360) - 180);
  const idx = Math.min(palette.length - 1, Math.floor((diff / 180) * palette.length));
  return palette[idx];
}

// ── DIAMOND (Round Brilliant Cut) ─────────────────────────────────────────

function diamondSVG(id: string): string {
  const cx = 60, cy = 60, R = 54;
  const rMid = R * 0.68, rTab = R * 0.40;
  const pal = ["#f8fcff","#e8f4ff","#d8ecff","#c8e0f8","#b0d0f0","#98c0e8","#80a8d8","#6890c8","#5880b8","#5078b0"];

  // 4 concentric rings of 8 points each, offset
  const G: [number,number][] = [];  // girdle main (0,45,90...)
  const H: [number,number][] = [];  // girdle secondary (22.5,67.5...)
  const M: [number,number][] = [];  // mid ring
  const T: [number,number][] = [];  // table ring

  for (let i = 0; i < 8; i++) {
    G.push(exy(cx, cy, R, R, i * 45));
    H.push(exy(cx, cy, R, R, i * 45 + 22.5));
    M.push(exy(cx, cy, rMid, rMid, i * 45 + 22.5));
    T.push(exy(cx, cy, rTab, rTab, i * 45));
  }

  let s = `<defs><radialGradient id="${id}-t" cx="40%" cy="35%">
    <stop offset="0%" stop-color="#f8fcff" stop-opacity="0.7"/>
    <stop offset="100%" stop-color="#d0e8f8" stop-opacity="0.3"/>
  </radialGradient></defs>`;

  // Girdle
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#708090" stroke="#506070" stroke-width="0.8"/>`;

  // Upper girdle (16 triangles)
  for (let i = 0; i < 8; i++) {
    const n = (i + 1) % 8;
    s += `<polygon points="${pts([G[i], H[i], M[i]])}" fill="${fColor(i*45+11, pal)}" stroke="${pal[9]}" stroke-width="0.3"/>`;
    s += `<polygon points="${pts([H[i], G[n], M[i]])}" fill="${fColor(i*45+34, pal)}" stroke="${pal[9]}" stroke-width="0.3"/>`;
  }

  // Kite facets (16 triangles mid to table)
  for (let i = 0; i < 8; i++) {
    const n = (i + 1) % 8;
    s += `<polygon points="${pts([M[i], T[i], T[n]])}" fill="${fColor(i*45+22, pal.slice(0,7))}" stroke="${pal[9]}" stroke-width="0.3"/>`;
    s += `<polygon points="${pts([M[i], M[n], T[n]])}" fill="${fColor((i+1)*45, pal.slice(0,7))}" stroke="${pal[9]}" stroke-width="0.3"/>`;
  }

  // Table
  s += `<ellipse cx="${cx}" cy="${cy}" rx="24" ry="20" fill="url(#${id}-t)"/>`;

  // Fire
  s += `<circle cx="${cx+10}" cy="${cy-8}" r="3.5" fill="#ffe8e8" opacity="0.35"/>`;
  s += `<circle cx="${cx-14}" cy="${cy+5}" r="2.5" fill="#e8f0ff" opacity="0.3"/>`;

  // Sparkles
  s += sparkle(cx - 22, cy - 22, 3.5, 1.5);
  s += sparkle(cx - 16, cy - 16, 2, 1.8);

  return s;
}

// ── OVAL BRILLIANT (Ruby / Sapphire) ──────────────────────────────────────

function ovalSVG(
  id: string, pal: string[],
  girdleFill: string, girdleStroke: string,
  tableFill: string, innerGlow: string, bowtie: string,
): string {
  const cx = 65, cy = 50, rx = 60, ry = 45;
  const mRx = rx * 0.65, mRy = ry * 0.65;
  const tRx = rx * 0.38, tRy = ry * 0.33;

  const G: [number,number][] = [], H: [number,number][] = [];
  const M: [number,number][] = [], T: [number,number][] = [];

  for (let i = 0; i < 8; i++) {
    G.push(exy(cx, cy, rx, ry, i * 45));
    H.push(exy(cx, cy, rx, ry, i * 45 + 22.5));
    M.push(exy(cx, cy, mRx, mRy, i * 45 + 22.5));
    T.push(exy(cx, cy, tRx, tRy, i * 45));
  }

  let s = "";

  // Girdle
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${girdleFill}" stroke="${girdleStroke}" stroke-width="0.8"/>`;

  // Upper girdle
  for (let i = 0; i < 8; i++) {
    const n = (i + 1) % 8;
    s += `<polygon points="${pts([G[i], H[i], M[i]])}" fill="${fColor(i*45+11, pal)}" stroke="${girdleStroke}" stroke-width="0.3"/>`;
    s += `<polygon points="${pts([H[i], G[n], M[i]])}" fill="${fColor(i*45+34, pal)}" stroke="${girdleStroke}" stroke-width="0.3"/>`;
  }

  // Kite + star
  for (let i = 0; i < 8; i++) {
    const n = (i + 1) % 8;
    s += `<polygon points="${pts([M[i], T[i], T[n]])}" fill="${fColor(i*45+22, pal.slice(0,7))}" stroke="${girdleStroke}" stroke-width="0.3"/>`;
    s += `<polygon points="${pts([M[i], M[n], T[n]])}" fill="${fColor((i+1)*45, pal.slice(0,7))}" stroke="${girdleStroke}" stroke-width="0.3"/>`;
  }

  // Table
  s += `<ellipse cx="${cx}" cy="${cy}" rx="24" ry="15" fill="${tableFill}"/>`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="20" ry="12" fill="${innerGlow}" opacity="0.5"/>`;
  // Bow-tie
  s += `<ellipse cx="${cx}" cy="${cy}" rx="18" ry="5" fill="${bowtie}" opacity="0.25"/>`;

  // Sparkles
  s += sparkle(cx - 20, cy - 16, 3, 1.4);
  s += sparkle(cx - 14, cy - 11, 1.8, 1.7);

  return s;
}

function rubySVG(id: string): string {
  return ovalSVG(id,
    ["#ff8595","#ff7585","#ff6878","#ee5565","#dd4555","#cc3545","#aa2535","#882028","#701820","#280508"],
    "#4a0a15", "#2a0508", "#ff7888", "#ff8898", "#aa3040",
  );
}

function sapphireSVG(id: string): string {
  return ovalSVG(id,
    ["#80a0f0","#7090e8","#6888e0","#5878d0","#5070c8","#4868c0","#3858a8","#284088","#183078","#050818"],
    "#0a1540", "#050820", "#6088d8", "#7098e8", "#2040a0",
  );
}

// ── EMERALD (Step Cut) ────────────────────────────────────────────────────

function emeraldSVG(_id: string): string {
  let s = "";

  // Octagonal outline
  s += `<polygon points="18,8 102,8 112,18 112,82 102,92 18,92 8,82 8,18" fill="#041808" stroke="#021004" stroke-width="1"/>`;

  // Corner bevels (light direction: top-left bright, bottom-right dark)
  s += `<polygon points="8,18 18,8 28,18" fill="#30a050"/>`;
  s += `<polygon points="102,8 112,18 102,18" fill="#28a048"/>`;
  s += `<polygon points="112,82 102,92 102,82" fill="#082810"/>`;
  s += `<polygon points="18,92 8,82 18,82" fill="#104015"/>`;

  // Step ring 1 (outer)
  s += `<polygon points="28,18 92,18 92,24 28,24" fill="#40c868"/>`;
  s += `<polygon points="102,18 102,82 96,76 96,24" fill="#188035"/>`;
  s += `<polygon points="92,82 28,82 28,76 92,76" fill="#0a3012"/>`;
  s += `<polygon points="18,82 18,18 24,24 24,76" fill="#25904a"/>`;

  // Step ring 2 (inner)
  s += `<polygon points="34,28 86,28 86,34 34,34" fill="#55e080"/>`;
  s += `<polygon points="92,24 92,76 86,68 86,32" fill="#28a048"/>`;
  s += `<polygon points="86,72 34,72 34,68 86,68" fill="#104015"/>`;
  s += `<polygon points="28,76 28,24 34,32 34,68" fill="#38b860"/>`;

  // Table
  s += `<polygon points="34,32 86,32 90,38 90,62 86,68 34,68 30,62 30,38" fill="#48d070"/>`;
  s += `<rect x="38" y="36" width="44" height="28" rx="2" fill="#58e080" opacity="0.4"/>`;

  // Corner flash
  s += `<polygon points="10,20 20,10 26,16 16,26" fill="#80ffa0" opacity="0.55"/>`;

  // Sparkle
  s += sparkle(22, 14, 2.5, 1.3);

  return s;
}

// ── PEARLS (Spherical, gradient-based) ────────────────────────────────────

function pearlSVG(id: string, stops: string, hlFill: string, hlOpacity: number, overtone?: string): string {
  const cx = 55, cy = 55, r = 52;

  let s = `<defs><radialGradient id="${id}-g" cx="30%" cy="25%" r="70%">${stops}</radialGradient>`;
  if (overtone) s += `<radialGradient id="${id}-o" cx="40%" cy="45%" r="55%">${overtone}</radialGradient>`;
  s += `</defs>`;

  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-g)"/>`;
  if (overtone) s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-o)"/>`;

  // Highlight ellipse
  s += `<ellipse cx="${cx-23}" cy="${cy-23}" rx="18" ry="11" fill="${hlFill}" opacity="${hlOpacity}" transform="rotate(-28 ${cx-23} ${cy-23})"/>`;

  return s;
}

function goldenPearlSVG(id: string): string {
  return pearlSVG(id,
    `<stop offset="0%" stop-color="#fffef5"/><stop offset="20%" stop-color="#f5e6a0"/><stop offset="45%" stop-color="#d4af37"/><stop offset="70%" stop-color="#b8860b"/><stop offset="100%" stop-color="#5c4a0a"/>`,
    "rgba(255,255,248,0.85)", 0.85,
  );
}

function whitePearlSVG(id: string): string {
  return pearlSVG(id,
    `<stop offset="0%" stop-color="#ffffff"/><stop offset="25%" stop-color="#f8f6f2"/><stop offset="50%" stop-color="#e8e4dc"/><stop offset="75%" stop-color="#d0cac0"/><stop offset="100%" stop-color="#a8a298"/>`,
    "rgba(255,255,255,0.8)", 0.8,
  );
}

function blackPearlSVG(id: string): string {
  return pearlSVG(id,
    `<stop offset="0%" stop-color="#606060"/><stop offset="25%" stop-color="#404040"/><stop offset="50%" stop-color="#282828"/><stop offset="100%" stop-color="#080808"/>`,
    "rgba(255,255,255,0.38)", 0.38,
    `<stop offset="0%" stop-color="#308868" stop-opacity="0.3"/><stop offset="40%" stop-color="#406080" stop-opacity="0.2"/><stop offset="100%" stop-color="transparent" stop-opacity="0"/>`,
  );
}

// ── CRYSTAL BALL ──────────────────────────────────────────────────────────

function crystalSVG(id: string): string {
  const cx = 55, cy = 55, r = 52;

  let s = `<defs><radialGradient id="${id}-e" cx="50%" cy="50%" r="50%">
    <stop offset="75%" stop-color="transparent"/>
    <stop offset="92%" stop-color="#ffffff" stop-opacity="0.22"/>
    <stop offset="100%" stop-color="#ffffff" stop-opacity="0.08"/>
  </radialGradient></defs>`;

  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-e)"/>`;

  // Crescent highlights
  s += `<path d="M 15 25 Q 30 15, 50 20 Q 38 38, 20 32 Z" fill="rgba(255,255,255,0.65)"/>`;
  s += `<path d="M 24 26 Q 36 20, 44 25 Q 34 34, 26 30 Z" fill="rgba(255,255,255,0.85)"/>`;

  return s;
}

// ── Sparkle helper ────────────────────────────────────────────────────────

function sparkle(x: number, y: number, r: number, dur: number): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="0.8"><animate attributeName="opacity" values="0.2;1;0.2" dur="${dur}s" repeatCount="indefinite"/></circle>`;
}

// ── Main Renderer ─────────────────────────────────────────────────────────

export function renderGem(body: HTMLElement, p: GemPayload): void {
  const gemType: GemType = (p.gemType as GemType) || "diamond";
  const config = CONFIGS[gemType] || CONFIGS.diamond;
  const val = String(p.value ?? "");
  const id = gid();

  // SVG dimensions and content per gem type
  let vw: number, vh: number, svg: string;
  const isOval = gemType === "ruby" || gemType === "sapphire";
  const isPearl = ["golden_pearl", "white_pearl", "black_pearl", "crystal"].includes(gemType);

  switch (gemType) {
    case "diamond":       vw = 120; vh = 120; svg = diamondSVG(id); break;
    case "ruby":          vw = 130; vh = 100; svg = rubySVG(id); break;
    case "sapphire":      vw = 130; vh = 100; svg = sapphireSVG(id); break;
    case "emerald":       vw = 120; vh = 100; svg = emeraldSVG(id); break;
    case "golden_pearl":  vw = 110; vh = 110; svg = goldenPearlSVG(id); break;
    case "white_pearl":   vw = 110; vh = 110; svg = whitePearlSVG(id); break;
    case "black_pearl":   vw = 110; vh = 110; svg = blackPearlSVG(id); break;
    case "crystal":       vw = 110; vh = 110; svg = crystalSVG(id); break;
    default:              vw = 120; vh = 120; svg = diamondSVG(id); break;
  }

  body.innerHTML = `
    <div class="hero-gem hero-gem--${gemType}" data-gem-bg="${config.bg}" style="--gem-glow:${config.glowColor};--gem-vw:${vw};--gem-vh:${vh}">
      <div class="hero-gem__wrap">
        <svg class="hero-gem__svg" viewBox="0 0 ${vw} ${vh}">
          ${svg}
        </svg>
        <div class="hero-gem__text">
          <span class="hero-gem__value">${escapeHtml(val)}</span>
          ${p.unit ? `<span class="hero-gem__unit">${escapeHtml(p.unit)}</span>` : ""}
        </div>
      </div>
      ${p.label ? `<div class="hero-gem__label">${escapeHtml(p.label)}</div>` : ""}
    </div>
  `;

  body.style.cursor = "pointer";
  body.addEventListener("click", () => {
    sendClickMessage(`[Gem:${gemType}] "${p.title}" - ${val}${p.unit ? " " + p.unit : ""}`);
  });
}
