import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import styles from './table.module.css';

/** Card-style table (Figma Pipeline "Table"): surface header 12/500 muted, rows 13 with line separators. */
export const Table = ({ className, ...rest }: HTMLAttributes<HTMLTableElement>) => (
  <div className={styles.card}>
    <table className={[styles.table, className].filter(Boolean).join(' ')} {...rest} />
  </div>
);
export const THead = (props: HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} />;
export const TBody = (props: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />;
export const Tr = (props: HTMLAttributes<HTMLTableRowElement>) => <tr className={styles.row} {...props} />;
export const Th = ({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th scope="col" className={[styles.th, className].filter(Boolean).join(' ')} {...rest} />
);
export const Td = ({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={[styles.td, className].filter(Boolean).join(' ')} {...rest} />
);
