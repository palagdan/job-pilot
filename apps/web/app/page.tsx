import { redirect } from 'next/navigation';

/** The app starts on Today. (Signed-out users see the sign-in state there until the M1 login page and guards.) */
export default function Home() {
  redirect('/today');
}
