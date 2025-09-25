import { headers } from 'next/headers';
import LoginForm from '../login/LoginForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'default-no-store';

export default function Page() {
  headers();
  return <LoginForm />;
}