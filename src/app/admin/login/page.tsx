import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'default-no-store';

export default function Page() {
  return <LoginForm />;
}