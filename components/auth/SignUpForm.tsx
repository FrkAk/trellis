'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signUp } from '@/lib/auth-client';
import { AuthInput } from './AuthInput';
import { AuthSubmit } from './AuthSubmit';

/**
 * Email/password sign-up form.
 *
 * On success the user lands on `/`, which `requireMembership` redirects
 * to `/onboarding/team` because a new account starts with zero teams.
 * No special-casing is needed here.
 *
 * @returns Vertical form: name + email + password + submit.
 */
export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Create the account via Better Auth. Errors render inline in the
   * danger-tinted strip; on success the App Router picks up the new
   * session and the membership gate takes over.
   *
   * @param event - The form submit event.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await signUp.email({ name, email, password });

    if (authError) {
      setError(authError.message ?? 'Sign up failed');
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-2.5" onSubmit={handleSubmit} noValidate>
      <AuthInput
        label="Name"
        type="text"
        autoComplete="name"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Your name"
      />
      <AuthInput
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@company.com"
      />
      <AuthInput
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        hint="At least 8 characters."
        placeholder="••••••••"
      />

      {error ? (
        <p
          role="alert"
          className="rounded-md border px-3 py-2 text-[12px] text-danger"
          style={{
            background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            borderColor:
              'color-mix(in srgb, var(--color-danger) 24%, transparent)',
          }}
        >
          {error}
        </p>
      ) : null}

      <AuthSubmit isLoading={loading}>Create account</AuthSubmit>
    </form>
  );
}
