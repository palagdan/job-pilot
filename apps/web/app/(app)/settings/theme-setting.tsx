'use client';

import { type Theme, themes } from '@job-pilot/shared/enums';
import { Select } from '../../../components/ui/select.tsx';
import { useTheme } from '../../../lib/theme/theme-provider.tsx';
import styles from './settings.module.css';

const labels: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** Spec "Theme": System (default) / Light / Dark, applies at once without reload. Saved per user in M3. */
export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  return (
    <section className={styles.card}>
      <h2>Appearance</h2>
      <div className={styles.field}>
        <Select
          label="Theme"
          options={themes.map((t) => ({ value: t, label: labels[t] }))}
          value={theme}
          onValueChange={(v) => setTheme(v as Theme)}
        />
      </div>
    </section>
  );
}
