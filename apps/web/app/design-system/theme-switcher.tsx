'use client';

import { type Theme, themes } from '@job-pilot/shared/enums';
import { useTheme } from '../../lib/theme/theme-provider.tsx';
import styles from './design-system.module.css';

const labels: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** Temporary switcher for this page. The real control is the Theme select in Settings (M3). */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <fieldset className={styles.segmented}>
      <legend className={styles.srOnly}>Theme</legend>
      {themes.map((t) => (
        <label key={t} className={styles.segment} data-selected={t === theme || undefined}>
          <input type="radio" name="theme" value={t} checked={t === theme} onChange={() => setTheme(t)} />
          {labels[t]}
        </label>
      ))}
    </fieldset>
  );
}
