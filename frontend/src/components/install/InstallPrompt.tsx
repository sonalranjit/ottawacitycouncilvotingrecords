import { useCallback, useEffect, useId, useRef, useState, type Ref } from 'react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import type { InstallMethod } from '../../utils/installPrompt';
import styles from './InstallPrompt.module.scss';

const ICON_SRC = './apple-touch-icon.png';
const APP_NAME = 'Ottawa Votes';

interface IconProps {
  d: string;
  className?: string;
  strokeWidth?: number;
}

function Icon({ d, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  close: 'M6 6l12 12 M18 6L6 18',
  addSquare: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 8v8 M8 12h8',
  pageMenu: 'M4 7h16 M4 12h16 M4 17h11',
  share: 'M12 3v12 M8 7l4-4 4 4 M7 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1',
  chevronDown: 'M6 9l6 6 6-6',
  arrowDown: 'M12 4v15 M6 13l6 6 6-6',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  fullScreen: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  homeGrid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
};

interface CardProps {
  onOpen: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
  openButtonRef?: Ref<HTMLButtonElement>;
}

/** The offer, shown at the top of the Motions feed. */
export function InstallCard({ onOpen, onSnooze, onDismiss, openButtonRef }: CardProps) {
  const titleId = useId();
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardTop}>
        <img className={styles.cardIcon} src={ICON_SRC} alt="" width={56} height={56} />
        <div className={styles.cardText}>
          <h2 id={titleId} className={styles.cardTitle}>
            Put {APP_NAME} on your home screen
          </h2>
          <p className={styles.cardBody}>Opens full screen in one tap, just like your other apps.</p>
        </div>
        <button type="button" className={styles.cardClose} aria-label="Dismiss" onClick={onDismiss}>
          <Icon d={ICONS.close} className={styles.closeIcon} />
        </button>
      </div>
      <div className={styles.cardActions}>
        <button type="button" className={styles.secondaryButton} onClick={onSnooze}>
          Not now
        </button>
        <button ref={openButtonRef} type="button" className={styles.primaryButton} onClick={onOpen}>
          <Icon d={ICONS.addSquare} className={styles.buttonIcon} strokeWidth={2.2} />
          <span className={styles.buttonLabel}>Add to Home Screen</span>
        </button>
      </div>
    </section>
  );
}

interface SheetProps {
  method: InstallMethod;
  /** Show the arrow toward Safari's bottom toolbar (iPhone only; iPad's toolbar is at the top) */
  pointToToolbar: boolean;
  onClose: () => void;
  onInstall: () => void;
  onSnooze: () => void;
}

/** The how-to: Safari's steps on Apple devices, a one-tap install elsewhere. */
export function InstallSheet({ method, pointToToolbar, onClose, onInstall, onSnooze }: SheetProps) {
  const headingId = useId();
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={`${styles.sheet} ${method === 'prompt' ? styles.sheetPrompt : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <div className={styles.handle} aria-hidden="true" />
        {method === 'ios' ? (
          <>
            <div className={styles.sheetHeader}>
              <img className={styles.sheetIcon} src={ICON_SRC} alt="" width={52} height={52} />
              <div className={styles.sheetTitles}>
                <h2 id={headingId} className={styles.sheetTitle}>
                  Install {APP_NAME}
                </h2>
                <span className={styles.sheetSubtitle}>A few taps in Safari</span>
              </div>
              <button
                ref={focusRef}
                type="button"
                className={styles.sheetClose}
                aria-label="Close"
                onClick={onClose}
              >
                <Icon d={ICONS.close} className={styles.closeIconSmall} strokeWidth={2.2} />
              </button>
            </div>
            <IosSteps />
            {pointToToolbar && (
              <div className={styles.startHere} aria-hidden="true">
                <Icon d={ICONS.arrowDown} className={styles.startHereIcon} strokeWidth={2.4} />
                <span>Start here</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.promptHeader}>
              <img className={styles.promptIcon} src={ICON_SRC} alt="" width={72} height={72} />
              <div className={styles.sheetTitles}>
                <h2 id={headingId} className={styles.promptTitle}>
                  Install {APP_NAME}
                </h2>
                <span className={styles.sheetSubtitle}>howtheyvoted.ca</span>
              </div>
            </div>
            <ul className={styles.benefits}>
              <Benefit icon={ICONS.fullScreen} title="Opens full screen" note="No address bar, just the votes" />
              <Benefit
                icon={ICONS.homeGrid}
                title="One tap from your home screen"
                note="Straight to the latest meeting"
              />
              <Benefit icon={ICONS.bolt} title="No app store needed" note="Remove it any time, like any app" />
            </ul>
            <div className={styles.promptActions}>
              <button ref={focusRef} type="button" className={styles.installButton} onClick={onInstall}>
                <Icon d={ICONS.download} className={styles.buttonIconLarge} strokeWidth={2.2} />
                Install
              </button>
              <button type="button" className={styles.notNowButton} onClick={onSnooze}>
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Benefit({ icon, title, note }: { icon: string; title: string; note: string }) {
  return (
    <li className={styles.benefit}>
      <span className={styles.benefitIcon} aria-hidden="true">
        <Icon d={icon} className={styles.benefitSvg} strokeWidth={1.9} />
      </span>
      <span className={styles.benefitText}>
        <span className={styles.benefitTitle}>{title}</span>
        <span className={styles.benefitNote}>{note}</span>
      </span>
    </li>
  );
}

function IosSteps() {
  return (
    <ol className={styles.steps}>
      <li className={styles.step}>
        <span className={styles.stepNumber} aria-hidden="true">
          1
        </span>
        <div className={styles.stepBody}>
          <p className={styles.stepTextInline}>
            Tap{' '}
            <span className={styles.keycap}>
              <svg
                className={styles.keycapIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                role="img"
                aria-label="the page menu button"
                focusable="false"
              >
                <path d={ICONS.pageMenu} />
              </svg>
            </span>{' '}
            left of the web address, then{' '}
            <span className={styles.keycapLabelled}>
              <Icon d={ICONS.share} className={styles.shareIcon} />
              Share
            </span>
          </p>
          <p className={styles.stepNote}>On older iOS, Share sits right in the toolbar.</p>
        </div>
      </li>

      <li className={styles.step}>
        <span className={styles.stepNumber} aria-hidden="true">
          2
        </span>
        <div className={styles.stepBody}>
          <p className={styles.stepText}>
            Tap <strong>View More</strong>, then <strong>Add to Home Screen</strong>.
          </p>
          <div className={styles.menuDemo} aria-hidden="true">
            <div className={styles.menuRow}>
              <span className={styles.menuBadge}>a</span>
              <span className={styles.menuLabel}>View More</span>
              <Icon d={ICONS.chevronDown} className={styles.menuIcon} />
            </div>
            <div className={styles.menuRow}>
              <span className={styles.menuBadge}>b</span>
              <span className={styles.menuLabel}>Add to Home Screen</span>
              <Icon d={ICONS.addSquare} className={styles.menuIcon} strokeWidth={1.8} />
            </div>
          </div>
        </div>
      </li>

      <li className={styles.step}>
        <span className={styles.stepNumber} aria-hidden="true">
          3
        </span>
        <div className={styles.stepBody}>
          <p className={styles.stepText}>
            Leave <strong>Open as Web App</strong> on, then tap <strong>Add</strong>.
          </p>
          <div className={styles.addDemo} aria-hidden="true">
            <div className={styles.addDemoBar}>
              <span className={styles.iosLink}>Cancel</span>
              <span className={styles.addDemoTitle}>Add to Home Screen</span>
              <span className={styles.addDemoAdd}>Add</span>
            </div>
            <div className={styles.addDemoRow}>
              <span>Open as Web App</span>
              <span className={styles.toggle}>
                <span className={styles.toggleKnob} />
              </span>
            </div>
          </div>
        </div>
      </li>
    </ol>
  );
}

/** The card plus its sheet. Renders nothing when the offer shouldn't show. */
export default function InstallPrompt() {
  const { visible, method, iosDevice, snooze, dismiss, install } = useInstallPrompt();
  const [sheetOpen, setSheetOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    openButtonRef.current?.focus();
  }, []);

  if (!visible || !method) return null;

  return (
    <>
      <InstallCard
        openButtonRef={openButtonRef}
        onOpen={() => setSheetOpen(true)}
        onSnooze={snooze}
        onDismiss={dismiss}
      />
      {sheetOpen && (
        <InstallSheet
          method={method}
          pointToToolbar={iosDevice === 'iphone'}
          onClose={closeSheet}
          onInstall={() => {
            setSheetOpen(false);
            void install();
          }}
          onSnooze={() => {
            setSheetOpen(false);
            snooze();
          }}
        />
      )}
    </>
  );
}
