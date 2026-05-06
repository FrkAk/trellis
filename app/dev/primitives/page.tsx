import { notFound } from 'next/navigation';
import { PrimitivesShowcase } from './PrimitivesShowcase';

export const dynamic = 'force-dynamic';

/**
 * Dev-only primitive showcase. Returns 404 outside of `next dev`.
 * @returns A long page rendering every shared primitive in every state.
 */
export default function PrimitivesPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <PrimitivesShowcase />;
}
