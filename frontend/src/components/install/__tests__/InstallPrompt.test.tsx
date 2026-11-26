import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InstallPrompt from '../InstallPrompt';
import {
  clearDeferredPrompt,
  getDeferredPrompt,
  initInstallPrompt,
  readState,
  STORAGE_KEY,
  type BeforeInstallPromptEvent,
} from '../../../utils/installPrompt';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36';

function setDevice(userAgent: string, { touch = true, standalone = false } = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: (query.includes('pointer: coarse') && touch) || (query.includes('standalone') && standalone),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function setVisits(visits: number, extra: object = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ visits, ...extra }));
}

/** Fires Chromium's install event and returns its mocks. */
function fireInstallEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
}

beforeEach(() => {
  localStorage.clear();
  // Counted already, so initInstallPrompt doesn't add a visit
  sessionStorage.setItem('installPrompt.visitCounted', '1');
  initInstallPrompt();
});

afterEach(() => {
  clearDeferredPrompt();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('InstallPrompt on iPhone Safari', () => {
  beforeEach(() => setDevice(IPHONE_SAFARI));

  it('stays hidden on the first visit', () => {
    setVisits(1);
    render(<InstallPrompt />);
    expect(screen.queryByText(/on your home screen/i)).not.toBeInTheDocument();
  });

  it('stays hidden when already opened from the home screen', () => {
    setDevice(IPHONE_SAFARI, { standalone: true });
    setVisits(5);
    render(<InstallPrompt />);
    expect(screen.queryByText(/on your home screen/i)).not.toBeInTheDocument();
  });

  it('opens Safari steps from the card and returns focus on Escape', async () => {
    setVisits(2);
    render(<InstallPrompt />);
    const open = screen.getByRole('button', { name: 'Add to Home Screen' });
    await userEvent.click(open);

    const sheet = screen.getByRole('dialog', { name: 'Install Ottawa Votes' });
    expect(sheet).toHaveTextContent('left of the web address, then');
    expect(sheet).toHaveTextContent('Tap View More, then Add to Home Screen.');
    expect(sheet).toHaveTextContent('Start here');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it('"Not now" hides the card for 30 days', async () => {
    setVisits(2);
    render(<InstallPrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(/on your home screen/i)).not.toBeInTheDocument();
    const { snoozedUntil } = readState();
    expect(snoozedUntil! - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it('the X hides the card for good', async () => {
    setVisits(2);
    render(<InstallPrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/on your home screen/i)).not.toBeInTheDocument();
    expect(readState().dismissed).toBe(true);
  });
});

describe('InstallPrompt with the browser install prompt', () => {
  beforeEach(() => setDevice(ANDROID_CHROME));

  it('shows nothing until the browser says the site can be installed', () => {
    setVisits(2);
    render(<InstallPrompt />);
    expect(screen.queryByText(/on your home screen/i)).not.toBeInTheDocument();
    fireInstallEvent('accepted');
    expect(screen.getByText(/on your home screen/i)).toBeInTheDocument();
  });

  it('never shows on desktop', () => {
    setDevice(ANDROID_CHROME, { touch: false });
    setVisits(2);
    render(<InstallPrompt />);
    fireInstallEvent('accepted');
    expect(screen.queryByText(/on your home screen/i)).not.toBeInTheDocument();
  });

  it('installs from the sheet and then stays hidden', async () => {
    setVisits(2);
    render(<InstallPrompt />);
    const { event, prompt } = fireInstallEvent('accepted');
    expect(event.defaultPrevented).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Add to Home Screen' }));
    const install = screen.getByRole('button', { name: 'Install' });
    expect(install).toHaveFocus();
    await userEvent.click(install);

    expect(prompt).toHaveBeenCalledOnce();
    expect(readState().installed).toBe(true);
    expect(getDeferredPrompt()).toBeNull();
    expect(screen.queryByText(/on your home screen/i)).not.toBeInTheDocument();
  });

  it('snoozes when the browser dialog is turned down', async () => {
    setVisits(2);
    render(<InstallPrompt />);
    fireInstallEvent('dismissed');
    await userEvent.click(screen.getByRole('button', { name: 'Add to Home Screen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(readState().installed).toBeUndefined();
    expect(readState().snoozedUntil).toBeGreaterThan(Date.now());
  });
});
