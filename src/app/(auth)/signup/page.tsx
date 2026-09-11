import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';

export const metadata: Metadata = {
  title: 'Create an account',
  description:
    'Create a free LinkMarket account to save websites, build shortlists and order guest posts and niche edits.',
  alternates: { canonical: '/signup' },
  robots: { index: false, follow: true },
};

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
