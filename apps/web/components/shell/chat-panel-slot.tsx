import type { ReactNode } from 'react';
import styles from './app-shell.module.css';

/**
 * Right column (Figma "Chat panel", 320 px). The chat itself is Daniil's M5 item: render it as `children`.
 * Until then it shows the panel header and the first-open empty state (spec §9).
 */
export function ChatPanelSlot({ children }: { children?: ReactNode }) {
  return (
    <aside className={styles.chat} aria-label="Chat">
      <header className={styles.chatHeader}>
        <h2>Chat</h2>
        <p>Ask questions or ask to change a text or CV</p>
      </header>
      {children ?? (
        <div className={styles.chatEmpty}>
          <p className={styles.chatEmptyTitle}>Ask or tell the agent anything</p>
          <p>Change preferences, edit drafts, ask why something was picked.</p>
        </div>
      )}
    </aside>
  );
}
