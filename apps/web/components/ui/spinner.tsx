import styles from './spinner.module.css';

/** Inline spinner in the current text color. Decorative: pair it with visible or sr-only text. */
export function Spinner({ size = 14 }: { size?: number }) {
  return <span className={styles.spinner} style={{ width: size, height: size }} aria-hidden="true" />;
}
