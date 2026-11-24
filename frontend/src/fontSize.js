// App-wide text size. Tailwind sizes are in rem, so changing the root font size scales the whole app.
const KEY = 'app_font_level';
export const FONT_LEVELS = [
  { label: 'عادي', size: '100%' },
  { label: 'كبير', size: '112.5%' },
  { label: 'كبير جدًا', size: '125%' },
  { label: 'ضخم', size: '137.5%' },
];

export function getFontLevel() {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isInteger(n) && n >= 0 && n < FONT_LEVELS.length ? n : 0;
  } catch { return 0; }
}

export function setFontLevel(level) {
  const n = Math.min(FONT_LEVELS.length - 1, Math.max(0, level));
  try { localStorage.setItem(KEY, String(n)); } catch { /* private mode: the size just isn't remembered */ }
  document.documentElement.style.fontSize = FONT_LEVELS[n].size;
  return n;
}

export const applyFontLevel = () => setFontLevel(getFontLevel());
