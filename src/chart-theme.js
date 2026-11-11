// uPlot draws to canvas, so it needs literal colour values, not CSS
// variables - this reads the current theme's tokens once at chart-creation
// time so the chart matches light/dark mode without duplicating the palette.
export function chartTheme() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name) => styles.getPropertyValue(name).trim();
  return {
    accent: read('--color-accent'),
    ink: read('--color-ink'),
    inkMuted: read('--color-ink-muted'),
    border: read('--color-border'),
    fontSans: read('--font-sans'),
    series: [read('--color-series-1'), read('--color-series-2'), read('--color-series-3'), read('--color-series-4')],
  };
}
