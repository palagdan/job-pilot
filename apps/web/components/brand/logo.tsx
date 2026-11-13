import styles from './logo.module.css';

/**
 * Compass logo (Brand v2, Figma "Logo option / 02 Compass").
 * The mark SVGs from Figma are drawn as a CSS mask so they take `--color-on-primary`
 * (white in light theme, ink in dark — as in the Figma theme panels).
 */
const sizes = {
  /** Sidebar: 24px icon, 15px mark, 16px wordmark. */
  sm: { icon: 24, mark: 15, markFile: 'mark-15', radius: 6, text: 16, gap: 8 },
  /** Theme panels / login: 36px icon, 22px mark, 24px wordmark. */
  md: { icon: 36, mark: 22, markFile: 'mark-22', radius: 9, text: 24, gap: 10 },
  /** Hero: 52px icon, 32px mark, 36px wordmark. */
  lg: { icon: 52, mark: 32, markFile: 'mark-32', radius: 14, text: 36, gap: 14 },
} as const;

export type LogoSize = keyof typeof sizes;

export function AppIcon({ size = 'sm' }: { size?: LogoSize }) {
  const s = sizes[size];
  return (
    <span
      className={styles.icon}
      style={{ width: s.icon, height: s.icon, borderRadius: s.radius }}
      aria-hidden="true"
    >
      <span
        className={styles.mark}
        style={{ width: s.mark, height: s.mark, maskImage: `url(/brand/${s.markFile}.svg)` }}
      />
    </span>
  );
}

export function Logo({ size = 'sm' }: { size?: LogoSize }) {
  const s = sizes[size];
  return (
    <span className={styles.lockup} style={{ gap: s.gap }}>
      <AppIcon size={size} />
      <span className={styles.wordmark} style={{ fontSize: s.text }}>
        Job<span className={styles.pilot}>Pilot</span>
      </span>
    </span>
  );
}
