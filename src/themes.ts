// ========================================================================
//  MCP Dashboard - Composable Theme Engine
//  Theme = ColorPalette + TypographySet + EffectPreset
// ========================================================================

export interface ColorPalette {
  bgBase: string;
  bgCard: string;
  bgCard2: string;
  bgHeader: string;
  border: string;
  borderMd: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
  positive: string;
  positiveBg: string;
  negative: string;
  negativeBg: string;
  neutral: string;
  neutralBg: string;
  c1: string;
  c2: string;
  c3: string;
  c4: string;
  c5: string;
  c6: string;
  c7: string;
  shadowCard: string;
  shadowHover: string;
  gradientStart: string;
  gradientEnd: string;
  glowColor: string;
  bgGradientMid: string;
  cardGlassBg: string;
}

export interface TypographySet {
  fontHeading: string;
  fontBody: string;
  fontMono: string;
  googleFontsUrl: string | null;
}

export interface EffectPreset {
  shimmerTitle: boolean;
  glowBorders: boolean;
  hoverLift: boolean | "subtle";
  scanlines: boolean;
  neonGlow: boolean;
  statusPulse: boolean;
  countUpNumbers: boolean;
  particles: boolean;
  glassCards: boolean;
}

export interface ThemePreset {
  name: string;
  palette: ColorPalette;
  typography: TypographySet;
  effects: EffectPreset;
}

// ── Color Palettes ──────────────────────────────────────────────────────

export const PALETTES: Record<string, ColorPalette> = {
  boardroom: {
    bgBase: "#1A1A2E",
    bgCard: "#222240",
    bgCard2: "#2A2A4A",
    bgHeader: "#1A1A2E",
    border: "rgba(212,175,55,0.12)",
    borderMd: "rgba(212,175,55,0.22)",
    textPrimary: "#F0EDE6",
    textSecondary: "#A8A4B8",
    textMuted: "#6B6680",
    accent: "#D4AF37",
    accentMuted: "#3D3520",
    positive: "#22C55E",
    positiveBg: "#0A2A18",
    negative: "#EF4444",
    negativeBg: "#2D0A0A",
    neutral: "#F59E0B",
    neutralBg: "#2D1B00",
    c1: "#D4AF37", c2: "#22C55E", c3: "#3B82F6",
    c4: "#A78BFA", c5: "#F43F5E", c6: "#06B6D4", c7: "#F59E0B",
    shadowCard: "0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)",
    shadowHover: "0 4px 20px rgba(212,175,55,0.15)",
    gradientStart: "#D4AF37",
    gradientEnd: "#B8860B",
    glowColor: "rgba(212,175,55,0.4)",
    bgGradientMid: "#1F1A0E",
    cardGlassBg: "rgba(34,34,64,0.88)",
  },

  corporate: {
    bgBase: "#F5F7FA",
    bgCard: "#FFFFFF",
    bgCard2: "#F8FAFC",
    bgHeader: "#FFFFFF",
    border: "rgba(0,0,0,0.08)",
    borderMd: "rgba(0,0,0,0.14)",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#94A3B8",
    accent: "#2563EB",
    accentMuted: "#EFF6FF",
    positive: "#16A34A",
    positiveBg: "#F0FDF4",
    negative: "#DC2626",
    negativeBg: "#FEF2F2",
    neutral: "#D97706",
    neutralBg: "#FFFBEB",
    c1: "#2563EB", c2: "#16A34A", c3: "#D97706",
    c4: "#7C3AED", c5: "#DC2626", c6: "#0891B2", c7: "#65A30D",
    shadowCard: "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)",
    shadowHover: "0 4px 16px rgba(0,0,0,0.10)",
    gradientStart: "#2563EB",
    gradientEnd: "#1D4ED8",
    glowColor: "rgba(37,99,235,0.3)",
    bgGradientMid: "#EFF4FF",
    cardGlassBg: "#FFFFFF",
  },

  "sales-floor": {
    bgBase: "#0A0F1C",
    bgCard: "#111827",
    bgCard2: "#1A2035",
    bgHeader: "#0D1321",
    border: "rgba(16,185,129,0.12)",
    borderMd: "rgba(16,185,129,0.22)",
    textPrimary: "#F0FDF4",
    textSecondary: "#86EFAC",
    textMuted: "#4B7A5F",
    accent: "#10B981",
    accentMuted: "#064E3B",
    positive: "#22C55E",
    positiveBg: "#052E16",
    negative: "#EF4444",
    negativeBg: "#2D0A0A",
    neutral: "#FBBF24",
    neutralBg: "#2D1B00",
    c1: "#10B981", c2: "#22C55E", c3: "#34D399",
    c4: "#FBBF24", c5: "#EF4444", c6: "#06B6D4", c7: "#A78BFA",
    shadowCard: "0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)",
    shadowHover: "0 4px 20px rgba(16,185,129,0.2)",
    gradientStart: "#10B981",
    gradientEnd: "#059669",
    glowColor: "rgba(16,185,129,0.4)",
    bgGradientMid: "#0A150D",
    cardGlassBg: "rgba(17,24,39,0.88)",
  },

  "golden-treasury": {
    bgBase: "#0A0A0F",
    bgCard: "#12121A",
    bgCard2: "#1A1A25",
    bgHeader: "#0A0A0F",
    border: "rgba(218,185,107,0.10)",
    borderMd: "rgba(218,185,107,0.18)",
    textPrimary: "#FAF3E0",
    textSecondary: "#C4B896",
    textMuted: "#6B6350",
    accent: "#DAB96B",
    accentMuted: "#2A2518",
    positive: "#22C55E",
    positiveBg: "#0A2A18",
    negative: "#EF4444",
    negativeBg: "#2D0A0A",
    neutral: "#F59E0B",
    neutralBg: "#2D1B00",
    c1: "#DAB96B", c2: "#2E9E7A", c3: "#5B7FBA",
    c4: "#A06BA8", c5: "#C75858", c6: "#4AADAD", c7: "#C89B2A",
    shadowCard: "0 2px 8px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.4)",
    shadowHover: "0 4px 24px rgba(218,185,107,0.15)",
    gradientStart: "#DAB96B",
    gradientEnd: "#C9A84C",
    glowColor: "rgba(218,185,107,0.35)",
    bgGradientMid: "#15100A",
    cardGlassBg: "rgba(18,18,26,0.88)",
  },

  clinical: {
    bgBase: "#FAFBFC",
    bgCard: "#FFFFFF",
    bgCard2: "#F6F8FA",
    bgHeader: "#FFFFFF",
    border: "rgba(0,0,0,0.10)",
    borderMd: "rgba(0,0,0,0.18)",
    textPrimary: "#1A1A2E",
    textSecondary: "#3D4F5F",
    textMuted: "#7A8C9E",
    accent: "#0D9488",
    accentMuted: "#CCFBF1",
    positive: "#059669",
    positiveBg: "#ECFDF5",
    negative: "#B91C1C",
    negativeBg: "#FEE2E2",
    neutral: "#B45309",
    neutralBg: "#FEF3C7",
    c1: "#0D9488", c2: "#059669", c3: "#0284C7",
    c4: "#6D28D9", c5: "#B91C1C", c6: "#0891B2", c7: "#65A30D",
    shadowCard: "0 1px 2px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)",
    shadowHover: "0 2px 12px rgba(0,0,0,0.08)",
    gradientStart: "#0D9488",
    gradientEnd: "#0F766E",
    glowColor: "rgba(13,148,136,0.3)",
    bgGradientMid: "#F0FAFB",
    cardGlassBg: "#FFFFFF",
  },

  startup: {
    bgBase: "#09090B",
    bgCard: "#18181B",
    bgCard2: "#1F1F25",
    bgHeader: "#0F0F12",
    border: "rgba(139,92,246,0.12)",
    borderMd: "rgba(139,92,246,0.22)",
    textPrimary: "#FAFAFA",
    textSecondary: "#A1A1AA",
    textMuted: "#52525B",
    accent: "#8B5CF6",
    accentMuted: "#2E1065",
    positive: "#22C55E",
    positiveBg: "#052E16",
    negative: "#EF4444",
    negativeBg: "#2D0A0A",
    neutral: "#F59E0B",
    neutralBg: "#2D1B00",
    c1: "#8B5CF6", c2: "#06B6D4", c3: "#22C55E",
    c4: "#F59E0B", c5: "#EF4444", c6: "#EC4899", c7: "#3B82F6",
    shadowCard: "0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)",
    shadowHover: "0 4px 20px rgba(139,92,246,0.2)",
    gradientStart: "#8B5CF6",
    gradientEnd: "#06B6D4",
    glowColor: "rgba(139,92,246,0.4)",
    bgGradientMid: "#0D0915",
    cardGlassBg: "rgba(24,24,27,0.88)",
  },

  "ops-control": {
    bgBase: "#111318",
    bgCard: "#1A1D24",
    bgCard2: "#22262E",
    bgHeader: "#14171D",
    border: "rgba(251,146,60,0.10)",
    borderMd: "rgba(251,146,60,0.18)",
    textPrimary: "#E2E8F0",
    textSecondary: "#94A3B8",
    textMuted: "#4B5563",
    accent: "#FB923C",
    accentMuted: "#431407",
    positive: "#22C55E",
    positiveBg: "#052E16",
    negative: "#EF4444",
    negativeBg: "#2D0A0A",
    neutral: "#FBBF24",
    neutralBg: "#2D1B00",
    c1: "#FB923C", c2: "#22C55E", c3: "#EF4444",
    c4: "#3B82F6", c5: "#FBBF24", c6: "#A78BFA", c7: "#06B6D4",
    shadowCard: "0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)",
    shadowHover: "0 4px 16px rgba(251,146,60,0.15)",
    gradientStart: "#FB923C",
    gradientEnd: "#EA580C",
    glowColor: "rgba(251,146,60,0.4)",
    bgGradientMid: "#16120A",
    cardGlassBg: "rgba(26,29,36,0.88)",
  },

  "tokyo-midnight": {
    bgBase: "#05050A",
    bgCard: "#0D0D18",
    bgCard2: "#141422",
    bgHeader: "#080810",
    border: "rgba(236,72,153,0.10)",
    borderMd: "rgba(236,72,153,0.20)",
    textPrimary: "#F0F0FF",
    textSecondary: "#A0A0D0",
    textMuted: "#505070",
    accent: "#EC4899",
    accentMuted: "#4A0E2E",
    positive: "#22D3EE",
    positiveBg: "#042F2E",
    negative: "#F43F5E",
    negativeBg: "#2D0A14",
    neutral: "#FBBF24",
    neutralBg: "#2D1B00",
    c1: "#EC4899", c2: "#22D3EE", c3: "#A78BFA",
    c4: "#FBBF24", c5: "#F43F5E", c6: "#34D399", c7: "#818CF8",
    shadowCard: "0 2px 8px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.4)",
    shadowHover: "0 4px 24px rgba(236,72,153,0.2)",
    gradientStart: "#EC4899",
    gradientEnd: "#22D3EE",
    glowColor: "rgba(236,72,153,0.4)",
    bgGradientMid: "#0D050A",
    cardGlassBg: "rgba(13,13,24,0.88)",
  },

  "zen-garden": {
    bgBase: "#F7F3ED",
    bgCard: "#FFFDF8",
    bgCard2: "#F3EFE6",
    bgHeader: "#FFFDF8",
    border: "rgba(0,0,0,0.06)",
    borderMd: "rgba(0,0,0,0.12)",
    textPrimary: "#2C2C2C",
    textSecondary: "#5C5C5C",
    textMuted: "#9C9C8C",
    accent: "#4A6741",
    accentMuted: "#E0E8DC",
    positive: "#3D7A42",
    positiveBg: "#EAF4EA",
    negative: "#8C2D2D",
    negativeBg: "#F5EDED",
    neutral: "#7A5E1A",
    neutralBg: "#F5F0E5",
    c1: "#4A6741", c2: "#7A9E77", c3: "#8B6914",
    c4: "#6B5B7B", c5: "#A04040", c6: "#3D7A7A", c7: "#9E8450",
    shadowCard: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.05)",
    shadowHover: "0 4px 16px rgba(74,103,65,0.18)",
    gradientStart: "#4A6741",
    gradientEnd: "#6B8C63",
    glowColor: "rgba(74,103,65,0.45)",
    bgGradientMid: "#F0EDE5",
    cardGlassBg: "#FFFDF8",
  },

  consultant: {
    bgBase: "#FFFFFF",
    bgCard: "#FFFFFF",
    bgCard2: "#FAFAFA",
    bgHeader: "#FFFFFF",
    border: "rgba(0,0,0,0.10)",
    borderMd: "rgba(0,0,0,0.16)",
    textPrimary: "#1B2A4A",
    textSecondary: "#4A5568",
    textMuted: "#A0AEC0",
    accent: "#1B2A4A",
    accentMuted: "#EDF2F7",
    positive: "#276749",
    positiveBg: "#F0FFF4",
    negative: "#9B2C2C",
    negativeBg: "#FFF5F5",
    neutral: "#975A16",
    neutralBg: "#FFFFF0",
    c1: "#1B2A4A", c2: "#276749", c3: "#975A16",
    c4: "#553C9A", c5: "#9B2C2C", c6: "#2B6CB0", c7: "#2D3748",
    shadowCard: "0 1px 2px rgba(0,0,0,0.05), 0 2px 6px rgba(0,0,0,0.04)",
    shadowHover: "0 2px 10px rgba(0,0,0,0.10)",
    gradientStart: "#1B2A4A",
    gradientEnd: "#2D3748",
    glowColor: "rgba(27,42,74,0.35)",
    bgGradientMid: "#F5F7FB",
    cardGlassBg: "#FFFFFF",
  },

  // ── Black/AI Family ───────────────────────────────────────────────────

  "black-tron": {
    bgBase: "#000000",
    bgCard: "#080C10",
    bgCard2: "#0D1520",
    bgHeader: "#000000",
    border: "rgba(0,240,255,0.10)",
    borderMd: "rgba(0,240,255,0.22)",
    textPrimary: "#E0FFFE",
    textSecondary: "#7EC8D0",
    textMuted: "#2A4A50",
    accent: "#00F0FF",
    accentMuted: "#001E22",
    positive: "#00F0FF",
    positiveBg: "#001A1C",
    negative: "#FF3B5C",
    negativeBg: "#1A0008",
    neutral: "#FFD700",
    neutralBg: "#1A1400",
    c1: "#00F0FF", c2: "#00BFFF", c3: "#7DF9FF",
    c4: "#0080FF", c5: "#FF3B5C", c6: "#C0F0FF", c7: "#00FFB3",
    shadowCard: "0 1px 4px rgba(0,0,0,0.8), 0 4px 20px rgba(0,240,255,0.06)",
    shadowHover: "0 0 32px rgba(0,240,255,0.25), 0 4px 20px rgba(0,0,0,0.6)",
    gradientStart: "#00F0FF",
    gradientEnd: "#0040FF",
    glowColor: "rgba(0,240,255,0.50)",
    bgGradientMid: "#000D10",
    cardGlassBg: "rgba(0,240,255,0.04)",
  },

  "black-elegance": {
    bgBase: "#000000",
    bgCard: "#0A0A0A",
    bgCard2: "#141414",
    bgHeader: "#050505",
    border: "rgba(255,255,255,0.08)",
    borderMd: "rgba(255,255,255,0.14)",
    textPrimary: "#F5F5F7",
    textSecondary: "#A1A1A6",
    textMuted: "#424245",
    accent: "#F5D78E",
    accentMuted: "#1E1A10",
    positive: "#32D74B",
    positiveBg: "#0A1A0D",
    negative: "#FF453A",
    negativeBg: "#1A0A08",
    neutral: "#FFD60A",
    neutralBg: "#1A1600",
    c1: "#F5D78E", c2: "#32D74B", c3: "#0A84FF",
    c4: "#BF5AF2", c5: "#FF453A", c6: "#64D2FF", c7: "#FF9F0A",
    shadowCard: "0 1px 3px rgba(0,0,0,0.9), 0 4px 16px rgba(0,0,0,0.7)",
    shadowHover: "0 4px 24px rgba(245,215,142,0.12), 0 2px 8px rgba(0,0,0,0.8)",
    gradientStart: "#F5D78E",
    gradientEnd: "#C8960A",
    glowColor: "rgba(245,215,142,0.30)",
    bgGradientMid: "#070600",
    cardGlassBg: "rgba(255,255,255,0.03)",
  },

  "black-matrix": {
    bgBase: "#000000",
    bgCard: "#050A05",
    bgCard2: "#0A110A",
    bgHeader: "#000000",
    border: "rgba(0,255,65,0.10)",
    borderMd: "rgba(0,255,65,0.20)",
    textPrimary: "#C8FFC8",
    textSecondary: "#4FC84F",
    textMuted: "#1A3A1A",
    accent: "#00FF41",
    accentMuted: "#001A00",
    positive: "#00FF41",
    positiveBg: "#001500",
    negative: "#FF2222",
    negativeBg: "#1A0000",
    neutral: "#AAFF00",
    neutralBg: "#0D1400",
    c1: "#00FF41", c2: "#00CC33", c3: "#66FF66",
    c4: "#00FFAA", c5: "#FF2222", c6: "#AAFF00", c7: "#33CC99",
    shadowCard: "0 1px 4px rgba(0,0,0,0.9), 0 4px 20px rgba(0,255,65,0.05)",
    shadowHover: "0 0 28px rgba(0,255,65,0.30), 0 4px 16px rgba(0,0,0,0.7)",
    gradientStart: "#00FF41",
    gradientEnd: "#007A20",
    glowColor: "rgba(0,255,65,0.55)",
    bgGradientMid: "#000804",
    cardGlassBg: "rgba(0,255,65,0.03)",
  },

  // ── Forest Green Family ───────────────────────────────────────────────

  "forest-amber": {
    bgBase: "#0A1A0F",
    bgCard: "#111F14",
    bgCard2: "#19291C",
    bgHeader: "#0C1C11",
    border: "rgba(255,180,50,0.10)",
    borderMd: "rgba(255,180,50,0.20)",
    textPrimary: "#F0EDD8",
    textSecondary: "#A8C096",
    textMuted: "#4A6050",
    accent: "#FFB432",
    accentMuted: "#261A00",
    positive: "#00B386",
    positiveBg: "#062A1C",
    negative: "#E05030",
    negativeBg: "#2A0E08",
    neutral: "#FFB432",
    neutralBg: "#1E1400",
    c1: "#FFB432", c2: "#00B386", c3: "#E07820",
    c4: "#78B860", c5: "#E05030", c6: "#40C0A0", c7: "#D4903A",
    shadowCard: "0 1px 4px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.4)",
    shadowHover: "0 4px 24px rgba(255,180,50,0.18), 0 2px 8px rgba(0,0,0,0.5)",
    gradientStart: "#FFB432",
    gradientEnd: "#00B386",
    glowColor: "rgba(255,180,50,0.40)",
    bgGradientMid: "#0C1A0A",
    cardGlassBg: "rgba(17,31,20,0.88)",
  },

  "forest-earth": {
    bgBase: "#0D140C",
    bgCard: "#131A10",
    bgCard2: "#1A2418",
    bgHeader: "#0F1610",
    border: "rgba(180,110,70,0.12)",
    borderMd: "rgba(180,110,70,0.22)",
    textPrimary: "#E8DDD0",
    textSecondary: "#9A8870",
    textMuted: "#4A4035",
    accent: "#C07848",
    accentMuted: "#201008",
    positive: "#00B386",
    positiveBg: "#062216",
    negative: "#C85030",
    negativeBg: "#260A08",
    neutral: "#D4A060",
    neutralBg: "#201408",
    c1: "#C07848", c2: "#00B386", c3: "#8B6050",
    c4: "#6A9060", c5: "#C85030", c6: "#60A090", c7: "#A08060",
    shadowCard: "0 1px 4px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.4)",
    shadowHover: "0 4px 24px rgba(192,120,72,0.16), 0 2px 8px rgba(0,0,0,0.5)",
    gradientStart: "#C07848",
    gradientEnd: "#00B386",
    glowColor: "rgba(192,120,72,0.38)",
    bgGradientMid: "#101408",
    cardGlassBg: "rgba(19,26,16,0.88)",
  },

  // ── Blue Sky Family ───────────────────────────────────────────────────

  "sky-light": {
    bgBase: "#EBF4FF",
    bgCard: "#FFFFFF",
    bgCard2: "#F5F9FF",
    bgHeader: "#FFFFFF",
    border: "rgba(59,130,246,0.12)",
    borderMd: "rgba(59,130,246,0.20)",
    textPrimary: "#0C1E3C",
    textSecondary: "#3A5A8C",
    textMuted: "#8AAAC8",
    accent: "#1D6FE8",
    accentMuted: "#DBEAFE",
    positive: "#0D9C5A",
    positiveBg: "#ECFDF5",
    negative: "#DC2626",
    negativeBg: "#FEF2F2",
    neutral: "#D97706",
    neutralBg: "#FFFBEB",
    c1: "#1D6FE8", c2: "#0D9C5A", c3: "#8B5CF6",
    c4: "#0891B2", c5: "#DC2626", c6: "#06B6D4", c7: "#F59E0B",
    shadowCard: "0 1px 3px rgba(30,80,160,0.08), 0 4px 16px rgba(30,80,160,0.06)",
    shadowHover: "0 4px 20px rgba(29,111,232,0.16), 0 2px 8px rgba(30,80,160,0.08)",
    gradientStart: "#1D6FE8",
    gradientEnd: "#0EA5E9",
    glowColor: "rgba(29,111,232,0.25)",
    bgGradientMid: "#D8EEFF",
    cardGlassBg: "#FFFFFF",
  },

  "sky-ocean": {
    bgBase: "#040D1A",
    bgCard: "#081428",
    bgCard2: "#0D1E38",
    bgHeader: "#060F1F",
    border: "rgba(30,144,255,0.10)",
    borderMd: "rgba(30,144,255,0.20)",
    textPrimary: "#D8EEFF",
    textSecondary: "#6090C0",
    textMuted: "#2A4060",
    accent: "#1E90FF",
    accentMuted: "#041028",
    positive: "#00D4AA",
    positiveBg: "#002A22",
    negative: "#FF4060",
    negativeBg: "#1A0010",
    neutral: "#FFB830",
    neutralBg: "#1A1000",
    c1: "#1E90FF", c2: "#00D4AA", c3: "#60A8FF",
    c4: "#A070FF", c5: "#FF4060", c6: "#00CCEE", c7: "#80C8FF",
    shadowCard: "0 2px 8px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.5)",
    shadowHover: "0 4px 28px rgba(30,144,255,0.22), 0 2px 10px rgba(0,0,0,0.6)",
    gradientStart: "#1E90FF",
    gradientEnd: "#0040B0",
    glowColor: "rgba(30,144,255,0.45)",
    bgGradientMid: "#060F20",
    cardGlassBg: "rgba(8,20,40,0.88)",
  },

  "sky-twilight": {
    bgBase: "#080818",
    bgCard: "#100E20",
    bgCard2: "#18162C",
    bgHeader: "#0A0818",
    border: "rgba(255,120,80,0.10)",
    borderMd: "rgba(255,120,80,0.20)",
    textPrimary: "#F0E8FF",
    textSecondary: "#9080B8",
    textMuted: "#3A2E58",
    accent: "#FF7850",
    accentMuted: "#280E08",
    positive: "#40D080",
    positiveBg: "#0A201A",
    negative: "#FF4466",
    negativeBg: "#1A0A10",
    neutral: "#FFCC44",
    neutralBg: "#1A1608",
    c1: "#FF7850", c2: "#FF5090", c3: "#8860FF",
    c4: "#40D080", c5: "#FF4466", c6: "#60A0FF", c7: "#FFA030",
    shadowCard: "0 2px 8px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.5)",
    shadowHover: "0 4px 28px rgba(255,120,80,0.20), 0 2px 10px rgba(0,0,0,0.6)",
    gradientStart: "#FF7850",
    gradientEnd: "#FF3080",
    glowColor: "rgba(255,120,80,0.40)",
    bgGradientMid: "#0C0A1C",
    cardGlassBg: "rgba(16,14,32,0.88)",
  },

  // ── Gray/ML Family ────────────────────────────────────────────────────

  "gray-hf": {
    bgBase: "#F5F5F5",
    bgCard: "#FFFFFF",
    bgCard2: "#FAFAFA",
    bgHeader: "#FFFFFF",
    border: "rgba(0,0,0,0.08)",
    borderMd: "rgba(0,0,0,0.14)",
    textPrimary: "#1A1A1A",
    textSecondary: "#525252",
    textMuted: "#A3A3A3",
    accent: "#FFD21E",
    accentMuted: "#FEF9C3",
    positive: "#16A34A",
    positiveBg: "#F0FDF4",
    negative: "#DC2626",
    negativeBg: "#FEF2F2",
    neutral: "#D97706",
    neutralBg: "#FFFBEB",
    c1: "#FFD21E", c2: "#16A34A", c3: "#2563EB",
    c4: "#9333EA", c5: "#DC2626", c6: "#0891B2", c7: "#EA580C",
    shadowCard: "0 1px 2px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.05)",
    shadowHover: "0 4px 16px rgba(0,0,0,0.10), 0 2px 8px rgba(255,210,30,0.15)",
    gradientStart: "#FFD21E",
    gradientEnd: "#F59E0B",
    glowColor: "rgba(255,210,30,0.35)",
    bgGradientMid: "#F0F0F0",
    cardGlassBg: "#FFFFFF",
  },

  "gray-copilot": {
    bgBase: "#0D1117",
    bgCard: "#161B22",
    bgCard2: "#1C2128",
    bgHeader: "#010409",
    border: "rgba(48,54,61,0.90)",
    borderMd: "rgba(110,118,129,0.40)",
    textPrimary: "#E6EDF3",
    textSecondary: "#8B949E",
    textMuted: "#484F58",
    accent: "#39D3C3",
    accentMuted: "#0A1F1E",
    positive: "#3FB950",
    positiveBg: "#0D2415",
    negative: "#F85149",
    negativeBg: "#1C0E0D",
    neutral: "#D29922",
    neutralBg: "#1A1600",
    c1: "#39D3C3", c2: "#3FB950", c3: "#58A6FF",
    c4: "#BC8CFF", c5: "#F85149", c6: "#79C0FF", c7: "#FFA657",
    shadowCard: "0 1px 3px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4)",
    shadowHover: "0 4px 20px rgba(57,211,195,0.16), 0 2px 8px rgba(0,0,0,0.5)",
    gradientStart: "#39D3C3",
    gradientEnd: "#0EA5E9",
    glowColor: "rgba(57,211,195,0.35)",
    bgGradientMid: "#0A0E14",
    cardGlassBg: "rgba(22,27,34,0.88)",
  },
};

// ── Typography Sets ─────────────────────────────────────────────────────

export const TYPOGRAPHY_SETS: Record<string, TypographySet> = {
  professional: {
    fontHeading: "'Inter', system-ui, -apple-system, sans-serif",
    fontBody: "'Inter', system-ui, -apple-system, sans-serif",
    fontMono: "'JetBrains Mono', 'Fira Code', monospace",
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
  },
  luxury: {
    fontHeading: "'Playfair Display', 'Georgia', serif",
    fontBody: "'Cormorant Garamond', 'Georgia', serif",
    fontMono: "'JetBrains Mono', monospace",
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Cormorant+Garamond:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap",
  },
  cyberpunk: {
    fontHeading: "'Orbitron', 'Rajdhani', sans-serif",
    fontBody: "'Rajdhani', 'Space Grotesk', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700&family=Rajdhani:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap",
  },
  editorial: {
    fontHeading: "'Cormorant Garamond', 'Georgia', serif",
    fontBody: "'Noto Serif', 'Georgia', serif",
    fontMono: "'JetBrains Mono', monospace",
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Noto+Serif:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap",
  },
  mono: {
    fontHeading: "'JetBrains Mono', 'Fira Code', monospace",
    fontBody: "'IBM Plex Sans', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', 'Fira Code', monospace",
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
  },
  bold: {
    fontHeading: "'Manrope', 'Space Grotesk', sans-serif",
    fontBody: "'Manrope', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400&display=swap",
  },
  system: {
    fontHeading: "system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    fontBody: "system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    fontMono: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
    googleFontsUrl: null,
  },
  techno: {
    fontHeading: "'Space Grotesk', 'Inter', sans-serif",
    fontBody: "'Space Grotesk', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap",
  },
};

// ── Effect Presets ───────────────────────────────────────────────────────

export const EFFECT_PRESETS: Record<string, EffectPreset> = {
  none: {
    shimmerTitle: false,
    glowBorders: false,
    hoverLift: false,
    scanlines: false,
    neonGlow: false,
    statusPulse: false,
    countUpNumbers: false,
    particles: false,
    glassCards: false,
  },
  subtle: {
    shimmerTitle: false,
    glowBorders: false,
    hoverLift: "subtle",
    scanlines: false,
    neonGlow: false,
    statusPulse: false,
    countUpNumbers: false,
    particles: false,
    glassCards: false,
  },
  shimmer: {
    shimmerTitle: true,
    glowBorders: true,
    hoverLift: true,
    scanlines: false,
    neonGlow: false,
    statusPulse: false,
    countUpNumbers: false,
    particles: false,
    glassCards: true,
  },
  neon: {
    shimmerTitle: false,
    glowBorders: true,
    hoverLift: true,
    scanlines: true,
    neonGlow: true,
    statusPulse: true,
    countUpNumbers: false,
    particles: true,
    glassCards: true,
  },
  energetic: {
    shimmerTitle: false,
    glowBorders: true,
    hoverLift: true,
    scanlines: false,
    neonGlow: false,
    statusPulse: true,
    countUpNumbers: true,
    particles: true,
    glassCards: false,
  },
};

// ── Named Theme Presets ─────────────────────────────────────────────────

export const THEME_PRESETS: Record<string, ThemePreset> = {
  boardroom: {
    name: "boardroom",
    palette: PALETTES.boardroom,
    typography: TYPOGRAPHY_SETS.professional,
    effects: EFFECT_PRESETS.subtle,
  },
  corporate: {
    name: "corporate",
    palette: PALETTES.corporate,
    typography: TYPOGRAPHY_SETS.system,
    effects: EFFECT_PRESETS.none,
  },
  "sales-floor": {
    name: "sales-floor",
    palette: PALETTES["sales-floor"],
    typography: TYPOGRAPHY_SETS.bold,
    effects: EFFECT_PRESETS.energetic,
  },
  "golden-treasury": {
    name: "golden-treasury",
    palette: PALETTES["golden-treasury"],
    typography: TYPOGRAPHY_SETS.luxury,
    effects: EFFECT_PRESETS.shimmer,
  },
  clinical: {
    name: "clinical",
    palette: PALETTES.clinical,
    typography: TYPOGRAPHY_SETS.system,
    effects: EFFECT_PRESETS.none,
  },
  startup: {
    name: "startup",
    palette: PALETTES.startup,
    typography: TYPOGRAPHY_SETS.techno,
    effects: EFFECT_PRESETS.energetic,
  },
  "ops-control": {
    name: "ops-control",
    palette: PALETTES["ops-control"],
    typography: TYPOGRAPHY_SETS.mono,
    effects: EFFECT_PRESETS.energetic,
  },
  "tokyo-midnight": {
    name: "tokyo-midnight",
    palette: PALETTES["tokyo-midnight"],
    typography: TYPOGRAPHY_SETS.cyberpunk,
    effects: EFFECT_PRESETS.neon,
  },
  "zen-garden": {
    name: "zen-garden",
    palette: PALETTES["zen-garden"],
    typography: TYPOGRAPHY_SETS.editorial,
    effects: EFFECT_PRESETS.shimmer,
  },
  consultant: {
    name: "consultant",
    palette: PALETTES.consultant,
    typography: TYPOGRAPHY_SETS.system,
    effects: EFFECT_PRESETS.none,
  },

  // ── Black/AI Family ─────────────────────────────────────────────────
  "black-tron": {
    name: "black-tron",
    palette: PALETTES["black-tron"],
    typography: TYPOGRAPHY_SETS.mono,
    effects: EFFECT_PRESETS.neon,
  },
  "black-elegance": {
    name: "black-elegance",
    palette: PALETTES["black-elegance"],
    typography: TYPOGRAPHY_SETS.professional,
    effects: EFFECT_PRESETS.subtle,
  },
  "black-matrix": {
    name: "black-matrix",
    palette: PALETTES["black-matrix"],
    typography: TYPOGRAPHY_SETS.mono,
    effects: EFFECT_PRESETS.neon,
  },

  // ── Forest Green Family ─────────────────────────────────────────────
  "forest-amber": {
    name: "forest-amber",
    palette: PALETTES["forest-amber"],
    typography: TYPOGRAPHY_SETS.professional,
    effects: EFFECT_PRESETS.shimmer,
  },
  "forest-earth": {
    name: "forest-earth",
    palette: PALETTES["forest-earth"],
    typography: TYPOGRAPHY_SETS.editorial,
    effects: EFFECT_PRESETS.subtle,
  },

  // ── Blue Sky Family ─────────────────────────────────────────────────
  "sky-light": {
    name: "sky-light",
    palette: PALETTES["sky-light"],
    typography: TYPOGRAPHY_SETS.bold,
    effects: EFFECT_PRESETS.none,
  },
  "sky-ocean": {
    name: "sky-ocean",
    palette: PALETTES["sky-ocean"],
    typography: TYPOGRAPHY_SETS.techno,
    effects: EFFECT_PRESETS.energetic,
  },
  "sky-twilight": {
    name: "sky-twilight",
    palette: PALETTES["sky-twilight"],
    typography: TYPOGRAPHY_SETS.cyberpunk,
    effects: EFFECT_PRESETS.neon,
  },

  // ── Gray/ML Family ──────────────────────────────────────────────────
  "gray-hf": {
    name: "gray-hf",
    palette: PALETTES["gray-hf"],
    typography: TYPOGRAPHY_SETS.system,
    effects: EFFECT_PRESETS.none,
  },
  "gray-copilot": {
    name: "gray-copilot",
    palette: PALETTES["gray-copilot"],
    typography: TYPOGRAPHY_SETS.mono,
    effects: EFFECT_PRESETS.energetic,
  },
};

// ── Theme Resolution ────────────────────────────────────────────────────

export function resolveTheme(
  name?: string,
  overrides?: { palette?: string; typography?: string; effects?: string },
): ThemePreset | null {
  if (!name && !overrides?.palette && !overrides?.typography && !overrides?.effects) {
    return null;
  }

  const base = name ? THEME_PRESETS[name] : null;

  const palette = overrides?.palette
    ? PALETTES[overrides.palette]
    : base?.palette ?? null;
  const typography = overrides?.typography
    ? TYPOGRAPHY_SETS[overrides.typography]
    : base?.typography ?? null;
  const effects = overrides?.effects
    ? EFFECT_PRESETS[overrides.effects]
    : base?.effects ?? null;

  if (!palette) return null;

  return {
    name: name ?? "custom",
    palette,
    typography: typography ?? TYPOGRAPHY_SETS.system,
    effects: effects ?? EFFECT_PRESETS.none,
  };
}

// ── Theme Application ───────────────────────────────────────────────────

export const PALETTE_TO_CSS: Record<keyof ColorPalette, string> = {
  bgBase: "--bg-base",
  bgCard: "--bg-card",
  bgCard2: "--bg-card-2",
  bgHeader: "--bg-header",
  border: "--border",
  borderMd: "--border-md",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textMuted: "--text-muted",
  accent: "--accent",
  accentMuted: "--accent-muted",
  positive: "--positive",
  positiveBg: "--positive-bg",
  negative: "--negative",
  negativeBg: "--negative-bg",
  neutral: "--neutral",
  neutralBg: "--neutral-bg",
  c1: "--c1", c2: "--c2", c3: "--c3", c4: "--c4",
  c5: "--c5", c6: "--c6", c7: "--c7",
  shadowCard: "--shadow-card",
  shadowHover: "--shadow-hover",
  gradientStart: "--gradient-start",
  gradientEnd: "--gradient-end",
  glowColor: "--glow-color",
  bgGradientMid: "--bg-gradient-mid",
  cardGlassBg: "--card-glass-bg",
};

export function applyTheme(element: HTMLElement, theme: ThemePreset): void {
  // Set palette CSS variables on both documentElement and the target element.
  // documentElement ensures getCSSVar() reads correct values everywhere;
  // element ensures CSS inheritance for children.
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(PALETTE_TO_CSS)) {
    const value = theme.palette[key as keyof ColorPalette];
    if (value) {
      root.style.setProperty(cssVar, value);
      if (element !== root) element.style.setProperty(cssVar, value);
    }
  }

  // Set typography CSS variables
  const typoVars: Record<string, string> = {
    "--font-heading": theme.typography.fontHeading,
    "--font-body": theme.typography.fontBody,
    "--font-mono": theme.typography.fontMono,
  };
  for (const [cssVar, value] of Object.entries(typoVars)) {
    root.style.setProperty(cssVar, value);
    if (element !== root) element.style.setProperty(cssVar, value);
  }

  // Apply effect classes
  if (theme.effects.shimmerTitle) element.classList.add("fx-shimmer");
  if (theme.effects.glowBorders) element.classList.add("fx-glow");
  if (theme.effects.hoverLift) element.classList.add("fx-lift");
  if (theme.effects.scanlines) element.classList.add("fx-scanlines");
  if (theme.effects.neonGlow) element.classList.add("fx-neon");
  if (theme.effects.statusPulse) element.classList.add("fx-pulse");
  if (theme.effects.countUpNumbers) element.classList.add("fx-countup");
  if (theme.effects.particles) element.classList.add("fx-particles");
  if (theme.effects.glassCards) element.classList.add("fx-glass");

  // Load fonts
  loadThemeFonts(theme.typography);
}

// ── Font Loading ────────────────────────────────────────────────────────

const _loadedFonts = new Set<string>();

export function loadThemeFonts(typography: TypographySet): void {
  if (!typography.googleFontsUrl) return;
  if (_loadedFonts.has(typography.googleFontsUrl)) return;
  _loadedFonts.add(typography.googleFontsUrl);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = typography.googleFontsUrl;
  document.head.appendChild(link);
}
