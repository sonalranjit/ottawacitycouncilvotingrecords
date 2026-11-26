/**
 * When to offer "Add to Home Screen", and the browser's install prompt.
 *
 * The rules: touch devices only; never once the site runs from the home screen
 * or after it was installed; not on the first visit; "Not now" hides the offer
 * for SNOOZE_DAYS; closing it hides it for good. All of it lives in
 * localStorage, so nothing leaves the device.
 */

/** Chromium's install event (Chrome, Edge, Samsung Internet). Not in the DOM typings. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallState {
  /** Sessions seen on this device, counting the current one */
  visits: number;
  /** Epoch ms before which the offer stays hidden ("Not now") */
  snoozedUntil?: number;
  /** Closed with the X: never offer again */
  dismissed?: boolean;
  /** Installed, as far as this browser can tell */
  installed?: boolean;
}

/** How the site can be installed here: Safari's manual steps, or the browser's own prompt. */
export type InstallMethod = 'ios' | 'prompt';

export interface InstallEnvironment {
  /** iPhone/iPad Safari, which has no install event and needs the manual steps */
  iosDevice: 'iphone' | 'ipad' | null;
  /** Running from the home screen already */
  standalone: boolean;
  /** Touch is the main input: phones and tablets */
  touch: boolean;
}

export const STORAGE_KEY = 'installPrompt';
export const SESSION_KEY = 'installPrompt.visitCounted';
export const MIN_VISITS = 2;
export const SNOOZE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function readState(): InstallState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<InstallState>) : {};
    return { ...parsed, visits: typeof parsed.visits === 'number' ? parsed.visits : 0 };
  } catch {
    return { visits: 0 };
  }
}

export function writeState(state: InstallState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode): the offer just won't remember
  }
}

/** Counts this session as a visit, once per tab session. */
export function countVisit(): void {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    return;
  }
  const state = readState();
  writeState({ ...state, visits: state.visits + 1 });
}

export function snoozedState(state: InstallState, now: number): InstallState {
  return { ...state, snoozedUntil: now + SNOOZE_DAYS * DAY_MS };
}

/**
 * Which Apple device this is, when it is Safari on one. Other iOS browsers and
 * in-app browsers (Chrome, Firefox, Google, Facebook, Instagram) have different
 * menus, so the Safari steps would mislead there. iPadOS Safari reports itself
 * as a Mac, so a Mac with a touch screen is an iPad.
 */
export function detectIosSafari(userAgent: string, maxTouchPoints: number): 'iphone' | 'ipad' | null {
  if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(userAgent)) return null;
  if (!/Safari\//.test(userAgent)) return null;
  if (/iPhone|iPod/.test(userAgent)) return 'iphone';
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ipad';
  return null;
}

export function detectEnvironment(): InstallEnvironment {
  if (typeof window === 'undefined') return { iosDevice: null, standalone: false, touch: false };
  const matches = (q: string) => (window.matchMedia ? window.matchMedia(q).matches : false);
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    iosDevice: detectIosSafari(nav.userAgent, nav.maxTouchPoints ?? 0),
    standalone: matches('(display-mode: standalone)') || nav.standalone === true,
    touch: matches('(pointer: coarse)'),
  };
}

/** How to install here, or null when this browser can't be walked through it. */
export function installMethod(env: InstallEnvironment, hasPrompt: boolean): InstallMethod | null {
  if (env.iosDevice) return 'ios';
  if (hasPrompt) return 'prompt';
  return null;
}

export function shouldOffer(
  state: InstallState,
  env: InstallEnvironment,
  method: InstallMethod | null,
  now: number,
): boolean {
  if (!method || env.standalone || state.installed || state.dismissed) return false;
  // iPads report a coarse pointer; Safari on an iPhone always does
  if (!env.touch && !env.iosDevice) return false;
  if (state.visits < MIN_VISITS) return false;
  return !(state.snoozedUntil && now < state.snoozedUntil);
}

// The install event can fire before React renders, so it is captured here at
// startup and kept until the page uses it.

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeInstallPrompt(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/** The browser allows prompt() once per event. */
export function clearDeferredPrompt(): void {
  deferredPrompt = null;
  emit();
}

export function markInstalled(): void {
  writeState({ ...readState(), installed: true });
  deferredPrompt = null;
  emit();
}

let started = false;

/** Call once at startup, before rendering. */
export function initInstallPrompt(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  countVisit();
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the browser's own mini-infobar away; the Motions page offers it instead
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', markInstalled);
}
