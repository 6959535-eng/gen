/** Темна тема за замовчуванням: висока контрастність, великі зони натискання (рукавиці). */
export const colors = {
  bg: '#0e1014',
  surface: '#181b22',
  surface2: '#222630',
  border: '#2e3340',
  text: '#f3f5f9',
  muted: '#9aa3b2',
  accent: '#f5a524',
  accentText: '#1a1300',
  ok: '#22c55e',
  okDark: '#0f3d22',
  danger: '#ef4444',
  dangerDark: '#4a1616',
  warn: '#f59e0b',
  warnDark: '#47320a',
  info: '#60a5fa',
  infoDark: '#132a47',
} as const;

export const size = {
  /** Мінімальна висота кнопки — під палець у рукавиці */
  touch: 64,
  touchLarge: 80,
  radius: 14,
  gap: 12,
  pad: 16,
  font: 18,
  fontLarge: 22,
  fontHuge: 40,
} as const;
