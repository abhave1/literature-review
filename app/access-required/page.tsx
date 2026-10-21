import { redirect } from 'next/navigation';

// Kept so old links land on the user's workspace instead of a dead end.
export default function AccessRequiredPage() {
  redirect('/bots');
}
