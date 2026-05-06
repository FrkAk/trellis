import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthBrand } from '@/components/auth/AuthBrand';
import { AuthHero } from '@/components/auth/AuthHero';
import { SocialButtons } from '@/components/auth/SocialButtons';
import { SignUpForm } from '@/components/auth/SignUpForm';

/**
 * Sign-up page — mirrors the sign-in two-column shell with the
 * registration form. Same disabled-with-tooltip social buttons (no
 * backend providers wired) and the same static hero on the right.
 *
 * Post-create the user lands on `/`; `requireMembership` then forwards
 * to `/onboarding/team` because a fresh account has zero memberships.
 *
 * @returns Server-rendered auth shell composing the sign-up form.
 */
export default function SignUpPage() {
  return (
    <AuthShell
      form={
        <>
          <AuthBrand />
          <h1
            className="text-[26px] font-semibold text-text-primary"
            style={{ letterSpacing: '-0.01em', lineHeight: 1.15 }}
          >
            Create an account.
          </h1>
          <p
            className="mb-7 mt-2.5 text-[13.5px] text-text-muted"
            style={{ lineHeight: 1.55 }}
          >
            Your project graph and decision history live here. Connect
            agents through MCP from your CLI once you&rsquo;re in.
          </p>

          <SocialButtons />
          <SignUpForm />

          <p className="mt-3.5 text-center text-[12px] text-text-muted">
            Already have an account?{' '}
            <Link
              href="/sign-in"
              className="hover:underline"
              style={{ color: 'var(--color-accent-light)' }}
            >
              Sign in
            </Link>
          </p>
        </>
      }
      hero={<AuthHero />}
    />
  );
}
