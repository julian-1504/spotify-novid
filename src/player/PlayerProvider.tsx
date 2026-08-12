import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PLAYBACK_POLL_MS } from '../config';
import * as player from '../api/player';
import { partitionDevices, type PartitionedDevices } from '../devices/allowlist';
import {
  isSelfSentinel,
  parseRemembered,
  SELF_DEVICE_SENTINEL,
  serialiseRemembered,
  trackAbsence,
  type RememberedDevice,
} from '../devices/sticky';
import * as webPlayback from './webPlayback';
import { watchDocument, type Violation } from './domGuard';
import { bindHandlers, publishMetadata } from './mediaSession';
import { describeFailure, type SelfFailure } from './selfFailure';
import { t } from '../strings';
import type { Device, PlaybackState } from '../api/types';

const SELECTED_DEVICE_KEY = 'novid.device';

/** Stable identity so an empty device list doesn't invalidate memos each render. */
const NO_DEVICES: PartitionedDevices = { allowed: [], hidden: [] };

const readRemembered = (): RememberedDevice | null =>
  parseRemembered(localStorage.getItem(SELECTED_DEVICE_KEY));

interface PlayerValue {
  state: PlaybackState | undefined;
  devices: Device[];
  /** Devices Spotify reported but this app will not play to, with reasons. */
  hiddenDevices: PartitionedDevices['hidden'];
  /** The speaker commands are sent to, if it is still available. */
  selectedDevice: Device | undefined;
  /**
   * The chosen speaker's name while Spotify is not reporting it — the box is
   * switched off, or has briefly dropped off Connect. Distinct from "no speaker
   * chosen", which is what an empty selection means.
   */
  unavailableDeviceName: string | null;
  selectDevice: (device: Device) => Promise<void>;
  devicesLoading: boolean;
  refresh: () => void;
  /** Runs a transport command then re-reads state so the UI catches up. */
  command: (fn: (deviceId: string | undefined) => Promise<unknown>) => Promise<void>;

  /** Makes this phone a playback device and selects it. False if it failed. */
  selectSelf: () => Promise<boolean>;
  /** True while this phone is the chosen target. */
  selfSelected: boolean;
  selfBooting: boolean;
  /**
   * Why making this phone a player failed, and what can be done about it.
   * Carries the kind rather than a bare sentence so the UI can tell the one
   * failure a fresh sign-in fixes from the ones it does not.
   */
  selfError: SelfFailure | null;
  /**
   * Set when the runtime no-video guard tripped. Non-recoverable on purpose:
   * the app's central promise is no longer being kept.
   */
  guardViolation: Violation | null;
}

const PlayerContext = createContext<PlayerValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [remembered, setRemembered] = useState<RememberedDevice | null>(
    readRemembered,
  );
  // Consecutive device polls that did not contain the remembered speaker.
  const missStreak = useRef(0);

  // The live SDK device id, once this phone has registered itself as a player.
  const [selfId, setSelfId] = useState<string | null>(null);
  const [selfBooting, setSelfBooting] = useState(false);
  const [selfError, setSelfError] = useState<SelfFailure | null>(null);
  const [guardViolation, setGuardViolation] = useState<Violation | null>(null);

  /**
   * The no-video guarantee's runtime half. The static check cannot see the Web
   * Playback SDK — it is fetched from sdk.scdn.co and injects a cross-origin
   * frame — so this watches the live document instead. Installed for the whole
   * session, not just while the SDK is up, so anything that ever appears is
   * caught.
   */
  useEffect(() => {
    return watchDocument((violation) => {
      setGuardViolation(violation);
      // Stop the music as well as saying so: continuing to play through a
      // surface we no longer vouch for is the one thing not to do.
      webPlayback.teardown();
      setSelfId(null);
    });
  }, []);

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: player.getDevices,
    // Speakers come and go as they are switched on and off.
    refetchInterval: 10_000,
    // Partition rather than filter: the UI needs to tell "nothing is switched
    // on" apart from "something is there but it has a screen".
    // `selfId` is passed so this phone survives the blocklist that its reported
    // type ('Computer') would otherwise fail. Memoised on selfId so the
    // partition is not recomputed on every render.
    select: useCallback(
      (list: Device[]) => partitionDevices(list, selfId),
      [selfId],
    ),
  });

  const stateQuery = useQuery({
    queryKey: ['playback'],
    queryFn: player.getPlaybackState,
    refetchInterval: PLAYBACK_POLL_MS,
    // Polling while the app is backgrounded would burn rate limit for nothing.
    refetchIntervalInBackground: false,
  });

  const partitioned = devicesQuery.data ?? NO_DEVICES;
  /** The boxes, which is what every consumer of this means. Never the phone. */
  const devices = partitioned.allowed;

  /**
   * Boxes plus this phone — what a stored choice is resolved against. Only the
   * two places below use it: the phone is selectable, so it has to be findable,
   * but it must not swell the box count or show up as a row of its own.
   */
  const resolvable = useMemo(
    () => (partitioned.self ? [...devices, partitioned.self] : devices),
    [devices, partitioned.self],
  );

  /**
   * What the remembered choice points at right now. The self sentinel is stored
   * instead of a live SDK device id, because the SDK issues a new one every
   * session — so it has to be resolved against whatever the SDK is using today.
   */
  const rememberedId = useMemo(() => {
    if (!remembered) return null;
    return isSelfSentinel(remembered.id) ? selfId : remembered.id;
  }, [remembered, selfId]);

  const selectedDevice = useMemo(() => {
    if (remembered) {
      // An explicit choice is never second-guessed. If the box is not in the
      // list right now it is unavailable, not replaced — silently retargeting
      // to another speaker is how audio ends up in the wrong room.
      return rememberedId ? resolvable.find((d) => d.id === rememberedId) : undefined;
    }
    // Nothing chosen yet, so follow whatever Spotify says is active — but only
    // if we are allowed to talk to it.
    return resolvable.find((d) => d.is_active);
  }, [resolvable, remembered, rememberedId]);

  /**
   * The kid chose this phone. Deliberately based on the stored choice rather
   * than on finding the device in the list: the list is polled every 10s, so
   * after a reload there is a window where the SDK has registered but the
   * cached list has not caught up. Deriving this from the list made the bar
   * announce „Dieses Handy ist gerade aus" for several seconds after every
   * launch.
   */
  const selfSelected = !!remembered && isSelfSentinel(remembered.id);

  /** Where transport commands go, before the device list has caught up. */
  const targetDeviceId = selectedDevice?.id ?? (selfSelected ? selfId : null);

  // A phone is never "switched off" the way a box is, so it never gets that
  // label — at worst its SDK is still starting.
  const unavailableDeviceName =
    remembered && !selectedDevice && !selfSelected
      ? (remembered.name || null)
      : null;

  // Forget the remembered speaker only once it has been genuinely absent for a
  // while. A single missing poll is normal for a speaker that has gone idle.
  useEffect(() => {
    if (!remembered || devicesQuery.isLoading || !devicesQuery.isSuccess) return;
    // This phone is never "absent" — at worst the SDK has not booted yet this
    // session. Ageing the sentinel out would drop the choice about thirty
    // seconds into every launch, which is what the sentinel exists to prevent.
    if (isSelfSentinel(remembered.id)) return;

    const present = resolvable.some((d) => d.id === remembered.id);
    const { streak, forget } = trackAbsence(missStreak.current, present);
    missStreak.current = streak;

    if (forget) {
      localStorage.removeItem(SELECTED_DEVICE_KEY);
      setRemembered(null);
    }
  }, [
    resolvable,
    remembered,
    devicesQuery.isLoading,
    devicesQuery.isSuccess,
    devicesQuery.dataUpdatedAt,
  ]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['playback'] });
    void queryClient.invalidateQueries({ queryKey: ['devices'] });
  }, [queryClient]);

  const selectDevice = useCallback(
    async (device: Device) => {
      if (!device.id) return;
      // Store this phone as the sentinel, never as the id the SDK minted for
      // this session — that id is gone by the next launch.
      const storedId = device.id === selfId ? SELF_DEVICE_SENTINEL : device.id;
      const choice = { id: storedId, name: device.name };
      localStorage.setItem(SELECTED_DEVICE_KEY, serialiseRemembered(choice));
      missStreak.current = 0;
      setRemembered(choice);
      await player.transferPlayback(device.id, false);
      refresh();
    },
    [refresh, selfId],
  );

  /**
   * Makes this phone a playback device and points at it.
   *
   * Must be called straight from the tap: `activate()` unlocks audio output,
   * and iOS ignores playback that was not started by a real user gesture no
   * matter how many commands succeed afterwards.
   */
  const selectSelf = useCallback(async (): Promise<boolean> => {
    setSelfError(null);
    setSelfBooting(true);
    try {
      const id = await webPlayback.boot((err) => setSelfError(describeFailure(err.kind)));
      await webPlayback.activate();
      setSelfId(id);

      const choice = { id: SELF_DEVICE_SENTINEL, name: t.player.thisPhone };
      localStorage.setItem(SELECTED_DEVICE_KEY, serialiseRemembered(choice));
      missStreak.current = 0;
      setRemembered(choice);

      await player.transferPlayback(id, false);
      refresh();
      return true;
    } catch (err) {
      const kind = err instanceof webPlayback.WebPlaybackError ? err.kind : 'unsupported';
      setSelfError(describeFailure(kind));
      return false;
    } finally {
      setSelfBooting(false);
    }
  }, [refresh]);

  /**
   * Bring the SDK back up when a previous session left this phone selected.
   * Without this the stored sentinel would resolve to nothing and the bar would
   * report no box until the kid picked it again by hand.
   */
  useEffect(() => {
    if (!remembered || !isSelfSentinel(remembered.id) || selfId || selfBooting) return;
    // No `activate()` here: there has been no tap, so iOS would refuse anyway.
    // The device is registered; the first play tap unlocks the audio.
    void webPlayback
      .boot((err) => setSelfError(describeFailure(err.kind)))
      .then((id) => {
        setSelfId(id);
        // Refetch at once: the cached device list predates this registration,
        // and waiting for the 10s poll leaves the phone looking unavailable.
        refresh();
      })
      .catch(() => {
        // Silent: the kid did not ask for this right now, and the picker still
        // offers the phone if they want it.
      });
  }, [remembered, selfId, selfBooting, refresh]);

  const command = useCallback(
    async (fn: (deviceId: string | undefined) => Promise<unknown>) => {
      await fn(targetDeviceId ?? undefined);
      // Spotify needs a moment before /me/player reflects the change.
      setTimeout(refresh, 350);
    },
    [targetDeviceId, refresh],
  );

  // Lock-screen controls. The SDK does not set these itself (confirmed by the
  // spike), and with the phone in a pocket driving a Bluetooth box they are the
  // only transport a kid can reach.
  useEffect(() => {
    publishMetadata(stateQuery.data);
  }, [stateQuery.data]);

  useEffect(
    () =>
      bindHandlers({
        play: () => void command(player.resume),
        pause: () => void command(player.pause),
        next: () => void command(player.next),
        previous: () => void command(player.previous),
        seek: (ms) => void command((id) => player.seek(ms, id)),
      }),
    [command],
  );

  const value = useMemo<PlayerValue>(
    () => ({
      state: stateQuery.data,
      devices,
      hiddenDevices: partitioned.hidden,
      selectedDevice,
      unavailableDeviceName,
      selectDevice,
      devicesLoading: devicesQuery.isLoading,
      refresh,
      command,
      selectSelf,
      selfSelected,
      selfBooting,
      selfError,
      guardViolation,
    }),
    [
      stateQuery.data,
      devices,
      partitioned.hidden,
      selectedDevice,
      unavailableDeviceName,
      selectDevice,
      devicesQuery.isLoading,
      refresh,
      command,
      selectSelf,
      selfSelected,
      selfBooting,
      selfError,
      guardViolation,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
