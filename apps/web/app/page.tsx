import { redirect } from 'next/navigation';

/** The app starts on Today (proxy sends signed-out users to /login; the app layout handles onboarding). */
export default function Home() {
  redirect('/today');
}
