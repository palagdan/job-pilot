import type { ReactNode } from 'react';

/**
 * Shared props of the profile / targets / schedule forms. The same controls are used in onboarding steps 2–4 and on
 * "Profile and targets" (spec §1); only what happens after saving and the footer differ.
 */
export type SaveFormProps<T> = {
  /** Runs after a successful save, while the submit button still shows the loading state. */
  onSaved?: (saved: T) => void | Promise<void>;
  submitLabel?: string;
  loadingLabel?: string;
  /** Left side of the actions row (e.g. onboarding "Back"). */
  footer?: ReactNode;
};
