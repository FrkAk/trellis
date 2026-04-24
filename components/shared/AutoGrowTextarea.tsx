'use client';

import { useEffect, useRef } from 'react';
import type { InputEvent as ReactInputEvent, TextareaHTMLAttributes } from 'react';

type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Textarea that auto-resizes to fit its content. Works with controlled (`value`) and uncontrolled (`defaultValue`) usage.
 * @param props - Standard textarea HTML attributes.
 * @returns A textarea element sized to its content.
 */
export function AutoGrowTextarea({ onInput, ...rest }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, []);

  const handleInput = (e: ReactInputEvent<HTMLTextAreaElement>) => {
    resize();
    onInput?.(e);
  };

  return <textarea ref={ref} onInput={handleInput} {...rest} />;
}

export default AutoGrowTextarea;
