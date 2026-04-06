'use client';

import { MotionConfig } from 'motion/react';

/**
 * Wraps children with MotionConfig to respect OS reduced-motion preference.
 * @param props - Children to wrap.
 * @returns MotionConfig provider element.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
