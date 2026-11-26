import { beforeEach, describe, expect, it } from 'vitest';
import {
  countVisit,
  detectIosSafari,
  installMethod,
  readState,
  shouldOffer,
  snoozedState,
  SNOOZE_DAYS,
  STORAGE_KEY,
  type InstallEnvironment,
  type InstallState,
} from '../installPrompt';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0';
const IPADOS_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 26);

const phone: InstallEnvironment = { iosDevice: null, standalone: false, touch: true };
const iphone: InstallEnvironment = { iosDevice: 'iphone', standalone: false, touch: true };
const returning: InstallState = { visits: 2 };

describe('detectIosSafari', () => {
  it('recognises iPhone Safari', () => {
    expect(detectIosSafari(IPHONE_SAFARI, 5)).toBe('iphone');
  });

  it('treats a touch-screen "Mac" as an iPad', () => {
    expect(detectIosSafari(IPADOS_SAFARI, 5)).toBe('ipad');
    expect(detectIosSafari(IPADOS_SAFARI, 0)).toBeNull();
  });

  it('skips other iOS browsers and in-app browsers, whose menus differ', () => {
    expect(detectIosSafari(IPHONE_CHROME, 5)).toBeNull();
    expect(detectIosSafari(IPHONE_INSTAGRAM, 5)).toBeNull();
  });

  it('skips Android', () => {
    expect(detectIosSafari(ANDROID_CHROME, 5)).toBeNull();
  });
});

describe('installMethod', () => {
  it('uses Safari steps on Apple devices and the browser prompt elsewhere', () => {
    expect(installMethod(iphone, false)).toBe('ios');
    expect(installMethod(phone, true)).toBe('prompt');
    expect(installMethod(phone, false)).toBeNull();
  });
});

describe('shouldOffer', () => {
  it('waits for a second visit', () => {
    expect(shouldOffer({ visits: 1 }, iphone, 'ios', NOW)).toBe(false);
    expect(shouldOffer(returning, iphone, 'ios', NOW)).toBe(true);
  });

  it('never shows on desktop', () => {
    expect(shouldOffer(returning, { ...phone, touch: false }, 'prompt', NOW)).toBe(false);
  });

  it('never shows once running from the home screen or installed', () => {
    expect(shouldOffer(returning, { ...iphone, standalone: true }, 'ios', NOW)).toBe(false);
    expect(shouldOffer({ ...returning, installed: true }, phone, 'prompt', NOW)).toBe(false);
  });

  it('never shows where the site cannot be installed', () => {
    expect(shouldOffer(returning, phone, null, NOW)).toBe(false);
  });

  it('stays hidden for 30 days after "Not now", then returns', () => {
    const snoozed = snoozedState(returning, NOW);
    expect(snoozed.snoozedUntil).toBe(NOW + SNOOZE_DAYS * DAY);
    expect(shouldOffer(snoozed, iphone, 'ios', NOW + 29 * DAY)).toBe(false);
    expect(shouldOffer(snoozed, iphone, 'ios', NOW + 31 * DAY)).toBe(true);
  });

  it('stays hidden for good once closed', () => {
    expect(shouldOffer({ ...returning, dismissed: true }, iphone, 'ios', NOW + 365 * DAY)).toBe(false);
  });
});

describe('countVisit', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('counts each session once', () => {
    countVisit();
    countVisit();
    expect(readState().visits).toBe(1);
    sessionStorage.clear(); // a new session
    countVisit();
    expect(readState().visits).toBe(2);
  });

  it('keeps earlier choices', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ visits: 3, dismissed: true }));
    countVisit();
    expect(readState()).toEqual({ visits: 4, dismissed: true });
  });

  it('survives unreadable storage', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(readState()).toEqual({ visits: 0 });
  });
});
