import { useSyncExternalStore } from 'react';

/** Below this width the section links become a bottom tab bar. Keep in step with $breakpoint-tabs. */
export const TAB_BAR_QUERY = '(max-width: 860px)';

/** Whether a CSS media query matches, updating as the window changes. False where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
