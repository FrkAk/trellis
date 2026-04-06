'use client';

import { useRouter } from 'next/navigation';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';

/**
 * Invisible client component that refreshes server component data on tab focus.
 * @returns null — renders nothing.
 */
export function AutoRefresh() {
  const router = useRouter();
  useRefreshOnFocus(() => router.refresh());
  return null;
}
