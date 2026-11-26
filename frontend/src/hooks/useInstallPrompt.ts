import { useCallback, useState, useSyncExternalStore } from 'react';
import {
  clearDeferredPrompt,
  detectEnvironment,
  getDeferredPrompt,
  installMethod,
  markInstalled,
  readState,
  shouldOffer,
  snoozedState,
  subscribeInstallPrompt,
  writeState,
  type InstallEnvironment,
  type InstallMethod,
  type InstallState,
} from '../utils/installPrompt';

export interface InstallPrompt {
  /** Whether to show the offer now */
  visible: boolean;
  method: InstallMethod | null;
  iosDevice: InstallEnvironment['iosDevice'];
  /** "Not now": hide for a while */
  snooze: () => void;
  /** The X: never again */
  dismiss: () => void;
  /** Opens the browser's own install dialog (method 'prompt' only) */
  install: () => Promise<void>;
}

export function useInstallPrompt(): InstallPrompt {
  const deferred = useSyncExternalStore(subscribeInstallPrompt, getDeferredPrompt, () => null);
  const [env] = useState(detectEnvironment);
  const [state, setState] = useState<InstallState>(readState);
  // Snoozing is judged against the time the page opened, so the card doesn't vanish mid-visit
  const [openedAt] = useState(() => Date.now());

  const update = useCallback((next: (s: InstallState) => InstallState) => {
    setState((s) => {
      const updated = next(s);
      writeState(updated);
      return updated;
    });
  }, []);

  const method = installMethod(env, deferred !== null);

  const snooze = useCallback(() => update((s) => snoozedState(s, Date.now())), [update]);
  const dismiss = useCallback(() => update((s) => ({ ...s, dismissed: true })), [update]);

  const install = useCallback(async () => {
    const event = getDeferredPrompt();
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    clearDeferredPrompt();
    if (outcome === 'accepted') {
      markInstalled();
      setState(readState());
    } else {
      update((s) => snoozedState(s, Date.now()));
    }
  }, [update]);

  return {
    visible: shouldOffer(state, env, method, openedAt),
    method,
    iosDevice: env.iosDevice,
    snooze,
    dismiss,
    install,
  };
}
