export const colorTokens = {
  bg: {
    canvas: '#070B14',
    panel: '#0F1728',
    panelAlt: '#131D33',
    elevated: '#1A2742',
  },
  text: {
    primary: '#F5F7FB',
    secondary: '#A9B6CC',
    muted: '#6F819B',
    inverse: '#08111F',
  },
  border: {
    subtle: 'rgba(125, 154, 197, 0.18)',
    strong: 'rgba(125, 154, 197, 0.36)',
    accent: 'rgba(93, 239, 207, 0.42)',
  },
  accent: {
    cyan: '#5DEFCF',
    blue: '#5B8CFF',
    violet: '#9D7CFF',
    amber: '#FFB454',
    rose: '#FF7A90',
  },
  state: {
    success: '#3DDC97',
    warning: '#FFB454',
    danger: '#FF6B81',
    info: '#5B8CFF',
  },
} as const;

export const typographyTokens = {
  fontFamily: {
    sans: "'Inter', 'Pretendard', 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  fontSize: {
    hero: '3.5rem',
    h1: '2.25rem',
    h2: '1.5rem',
    h3: '1.125rem',
    body: '0.95rem',
    caption: '0.8rem',
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    compact: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

export const spacingTokens = {
  px: '1px',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
} as const;

export const radiusTokens = {
  sm: '0.5rem',
  md: '0.875rem',
  lg: '1.25rem',
  xl: '1.75rem',
  pill: '9999px',
} as const;

export const shadowTokens = {
  panel: '0 16px 40px rgba(4, 10, 24, 0.42)',
  glow: '0 0 0 1px rgba(93, 239, 207, 0.18), 0 0 32px rgba(93, 239, 207, 0.08)',
  focus: '0 0 0 3px rgba(91, 140, 255, 0.35)',
} as const;

export const layoutTokens = {
  maxWidth: '1440px',
  sidebarWidth: '280px',
  contentGutter: spacingTokens[6],
  panelPadding: spacingTokens[6],
  panelGap: spacingTokens[5],
  topBarHeight: '72px',
} as const;

export const motionTokens = {
  duration: {
    fast: '120ms',
    normal: '180ms',
    slow: '280ms',
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    emphasize: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
} as const;

export const chartTokens = {
  thermal: colorTokens.accent.cyan,
  resistance: colorTokens.accent.amber,
  density: colorTokens.accent.violet,
  simulation: colorTokens.accent.blue,
  risk: colorTokens.accent.rose,
} as const;

export const kiceticDesignTokens = {
  color: colorTokens,
  typography: typographyTokens,
  spacing: spacingTokens,
  radius: radiusTokens,
  shadow: shadowTokens,
  layout: layoutTokens,
  motion: motionTokens,
  chart: chartTokens,
} as const;

export type KiceticDesignTokens = typeof kiceticDesignTokens;
