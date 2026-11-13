import { type Theme, themes } from '@job-pilot/shared/enums';

/**
 * Theme preference: "system" follows the OS, "light"/"dark" force it.
 * The choice lives in a cookie so the server renders the right `data-theme` on the first paint (no flash),
 * and per user in the database (`user.theme`, saved from Settings) so it follows the user across devices.
 */
export const themeCookieName = 'jp-theme';

export const parseTheme = (value: string | undefined | null): Theme =>
  themes.includes(value as Theme) ? (value as Theme) : 'system';

/** Value for <html data-theme>; undefined for "system" (CSS media query decides). */
export const themeAttribute = (theme: Theme): 'light' | 'dark' | undefined =>
  theme === 'system' ? undefined : theme;
