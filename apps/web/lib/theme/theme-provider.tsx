'use client';

import type { Theme } from '@job-pilot/shared/enums';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { themeAttribute, themeCookieName } from './theme.ts';

type ThemeContextValue = {
  theme: Theme;
  /** Applies at once without reload (spec "Theme"), and remembers it in the cookie. */
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const oneYear = 60 * 60 * 24 * 365;

const applyTheme = (theme: Theme) => {
  const attribute = themeAttribute(theme);
  if (attribute) document.documentElement.dataset.theme = attribute;
  else delete document.documentElement.dataset.theme;
  // First-party preference cookie, read by the server layout to render the right theme.
  document.cookie = `${themeCookieName}=${theme}; path=/; max-age=${oneYear}; samesite=lax`;
};

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: ReactNode }) {
  const [theme, setThemeState] = useState(initialTheme);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
  };

  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}

export const useTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
};
