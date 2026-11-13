import type { Metadata } from 'next';
import styles from './design-system.module.css';
import { ComponentsGallery } from './components-gallery.tsx';
import { ThemeSwitcher } from './theme-switcher.tsx';

export const metadata: Metadata = { title: 'Design tokens — JobPilot' };

const colors = [
  ['bg', 'Cards, panels, inputs'],
  ['surface', 'Page background, chips'],
  ['soft', 'Selected nav, selected chip'],
  ['line', 'Borders, dividers'],
  ['ink', 'Primary text'],
  ['muted', 'Secondary text'],
  ['primary', 'Links, focus, selected text'],
  ['on-primary', 'Text on primary/accent'],
  ['accent', 'Fit score, success'],
  ['cta', 'Primary button'],
  ['on-cta', 'Text on primary button'],
  ['danger', 'Errors, destructive'],
  ['danger-soft', 'Error backgrounds'],
  ['warning', 'Warnings'],
  ['warning-soft', 'Warning backgrounds'],
] as const;

const typeScale = [
  ['title', 'Today', 'Space Grotesk Bold 24, -2%'],
  ['heading', 'Schedule and notifications', 'Space Grotesk Medium 16'],
  ['card-title', 'Head of Performance Marketing', 'Space Grotesk Medium 15'],
  ['nav', 'Profile and targets', 'Inter Medium 14'],
  ['body', 'Matches your paid acquisition and team lead experience.', 'Inter Regular 13'],
  ['small', 'Company A - Prague - LinkedIn', 'Inter Regular/Semibold 12'],
  ['caption', 'TRY', 'Inter Semibold 11'],
] as const;

const radii = ['xs', 'sm', 'md', 'lg', 'xl', 'pill'] as const;

/** Development reference for the design tokens (not linked from the app). */
export default function DesignSystemPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Design tokens</h1>
          <p className={styles.muted}>Brand v2 "JobPilot Blue" — values from Figma variables. Switch the theme to compare.</p>
        </div>
        <ThemeSwitcher />
      </header>

      <section className={styles.section}>
        <h2>Color</h2>
        <div className={styles.swatches}>
          {colors.map(([name, use]) => (
            <div key={name} className={styles.swatch}>
              <div className={styles.chipColor} style={{ background: `var(--color-${name})` }} />
              <code>--color-{name}</code>
              <span className={styles.muted}>{use}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Typography</h2>
        <div className={styles.stack}>
          {typeScale.map(([token, sample, spec]) => (
            <div key={token} className={styles.typeRow}>
              <span className={styles[`type-${token}`]}>{sample}</span>
              <code className={styles.muted}>
                --text-{token} · {spec}
              </code>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Radius</h2>
        <div className={styles.row}>
          {radii.map((r) => (
            <div key={r} className={styles.radius} style={{ borderRadius: `var(--radius-${r})` }}>
              <code>{r}</code>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Components</h2>
        <ComponentsGallery />
      </section>
    </main>
  );
}
