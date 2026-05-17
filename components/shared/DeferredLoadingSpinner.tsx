"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

/**
 * `LoadingSpinner` that does not mount until `delay` ms have elapsed since
 * its first render. When it does appear, it fades in via the
 * `loading-fade-in` keyframe so the transition is not abrupt.
 *
 * Eliminates the "flash of spinner" on fast loads — if the parent unmounts
 * the spinner before the timer fires (typical when data arrives within
 * 100-200ms), nothing is ever painted to the DOM. Slow loads still get a
 * real loading indicator with a smooth entrance.
 *
 * @param props - `delay` (ms before mount, default 250), `label`/`className`
 *   forwarded to the underlying spinner.
 * @returns The wrapped spinner once the threshold is crossed, otherwise nothing.
 */
export function DeferredLoadingSpinner({
  delay = 250,
  label = "Loading",
  className = "",
}: {
  delay?: number;
  label?: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!show) return null;
  return (
    <LoadingSpinner label={label} className={`loading-fade-in ${className}`} />
  );
}
