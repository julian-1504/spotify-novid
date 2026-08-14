import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePlayer } from './PlayerProvider';
import * as player from '../api/player';
import {
  decide,
  parseSleep,
  remainingMs,
  serialiseSleep,
  startSleep,
  type SleepMinutes,
  type SleepTimer,
} from './sleepTimer';

const SLEEP_KEY = 'novid.sleep';

const readStored = (): SleepTimer | null =>
  parseSleep(localStorage.getItem(SLEEP_KEY), Date.now());

interface SleepValue {
  /** The running timer, or null when none is set. */
  timer: SleepTimer | null;
  /** Ms left, or null when no timer is set. */
  remaining: number | null;
  setTimer: (minutes: SleepMinutes) => void;
  clear: () => void;
}

const SleepContext = createContext<SleepValue | null>(null);

/**
 * The sleep timer's React half.
 *
 * A provider of its own rather than more fields on PlayerProvider, mounted
 * inside it: all it needs from the player is `command`, and the two have
 * nothing else to say to each other. It sits above the routes so the countdown
 * keeps running while a kid browses.
 *
 * The one thing this cannot promise: the music plays on the box, so the pause
 * has to be sent from a page that is still running. A hidden tab's interval is
 * throttled to roughly one tick a minute and a locked phone can freeze it
 * outright. Hence the absolute deadline in sleepTimer.ts — a skipped tick
 * cannot stretch the timer — and the visibilitychange check below, which pauses
 * the moment the app is looked at again. In the foreground, or with this phone
 * as the player (an audible tab is not frozen), it is exact.
 */
export function SleepProvider({ children }: { children: ReactNode }) {
  const { command } = usePlayer();

  const [timer, setTimerState] = useState<SleepTimer | null>(readStored);
  const [remaining, setRemaining] = useState<number | null>(() =>
    timer ? remainingMs(timer, Date.now()) : null,
  );

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(SLEEP_KEY);
    } catch {
      // Full or private-mode storage. Forgetting the timer in memory is the
      // part that matters; a stale stored value is aged out on the next read.
    }
    setTimerState(null);
    setRemaining(null);
  }, []);

  const setTimer = useCallback((minutes: SleepMinutes) => {
    const next = startSleep(minutes, Date.now());
    try {
      localStorage.setItem(SLEEP_KEY, serialiseSleep(next));
    } catch {
      // The timer still runs for this session; it just will not survive a
      // reload. Better than refusing to set one at all.
    }
    setTimerState(next);
    setRemaining(remainingMs(next, Date.now()));
  }, []);

  useEffect(() => {
    if (!timer) return;

    const check = () => {
      const now = Date.now();
      switch (decide(timer, now)) {
        case 'run':
          setRemaining(remainingMs(timer, now));
          break;
        case 'expire':
          clear();
          // The catch is load-bearing, not defensive: pausing something that is
          // already paused answers 403, which api/client.ts throws, and an
          // unhandled rejection here would fire every time a timer runs out on
          // music that had already stopped.
          void command(player.pause).catch(() => {});
          break;
        case 'forget':
          clear();
          break;
      }
    };

    // At once, not only on the next tick: a timer restored from storage may
    // already be past its end, and this is where that is noticed.
    check();
    const id = setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [timer, command, clear]);

  const value = useMemo<SleepValue>(
    () => ({ timer, remaining, setTimer, clear }),
    [timer, remaining, setTimer, clear],
  );

  return <SleepContext.Provider value={value}>{children}</SleepContext.Provider>;
}

export function useSleepTimer(): SleepValue {
  const ctx = useContext(SleepContext);
  if (!ctx) throw new Error('useSleepTimer must be used inside <SleepProvider>');
  return ctx;
}
