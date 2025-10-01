import { headers } from 'next/headers';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'default-no-store';

export default function Page() {
  // Force dynamic at runtime; Next cannot prerender this page.
  headers();
  return <LoginForm />;
}