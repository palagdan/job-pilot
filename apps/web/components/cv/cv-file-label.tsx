import type { ReactNode } from 'react';
import styles from './cv-file-label.module.css';

/** File row head (Figma: "PDF" tile + file name + meta line + badges). */
export function CvFileLabel({ name, meta, badges }: { name: string; meta?: ReactNode; badges?: ReactNode }) {
  return (
    <div className={styles.label}>
      <span className={styles.tile} aria-hidden="true">
        PDF
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
      {badges && <span className={styles.badges}>{badges}</span>}
    </div>
  );
}
