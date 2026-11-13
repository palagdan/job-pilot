import type { OnboardingStep, Theme } from '@job-pilot/shared/enums';

export type User = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  timezone: string;
  theme: Theme;
  pausedAt: Date | null;
  onboardingStep: OnboardingStep;
  onboardingCompletedAt: Date | null;
};

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  /** Moves the onboarding step forward to `step`; never backwards. */
  advanceOnboarding(id: string, step: OnboardingStep): Promise<void>;
  /** Sets `onboardingCompletedAt` if not set yet. */
  completeOnboarding(id: string, at: Date): Promise<void>;
  setTheme(id: string, theme: Theme): Promise<void>;
}
