import { ClipboardCheck, FileText, type LucideIcon, Settings, Sun, Target, Workflow } from 'lucide-react';

/**
 * Sidebar navigation (todo: Today, Review, Pipeline, CVs, Profile and targets; Settings as in Figma).
 * Figma also shows "LinkedIn texts" — not in v1 (profile audit is cut).
 */
export const navItems: readonly { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/today', label: 'Today', icon: Sun },
  { href: '/review', label: 'Review', icon: ClipboardCheck },
  { href: '/pipeline', label: 'Pipeline', icon: Workflow },
  { href: '/cvs', label: 'CVs', icon: FileText },
  { href: '/profile', label: 'Profile and targets', icon: Target },
  { href: '/settings', label: 'Settings', icon: Settings },
];
