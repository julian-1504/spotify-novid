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
  parseRemembered,
  serialiseRemembered,
  trackAbsence,
  type RememberedDevice,
} from '../devices/sticky';
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
}

const PlayerContext = createContext<PlayerValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [remembered, setRemembered] = useState<RememberedDevice | null>(
    readRemembered,
  );
  // Consecutive device polls that did not contain the remembered speaker.
  const missStreak = useRef(0);

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: player.getDevices,
    // Speakers come and go as they are switched on and off.
    refetchInterval: 10_000,
    // Partition rather than filter: the UI needs to tell "nothing is switched
    // on" apart from "something is there but it has a screen".
    select: partitionDevices,
  });

  const stateQuery = useQuery({
    queryKey: ['playback'],
    queryFn: player.getPlaybackState,
    refetchInterval: PLAYBACK_POLL_MS,
    // Polling while the app is backgrounded would burn rate limit for nothing.
    refetchIntervalInBackground: false,
  });

  const partitioned = devicesQuery.data ?? NO_DEVICES;
  const devices = partitioned.allowed;

  const selectedDevice = useMemo(() => {
    if (remembered) {
      // An explicit choice is never second-guessed. If the box is not in the
      // list right now it is unavailable, not replaced — silently retargeting
      // to another speaker is how audio ends up in the wrong room.
      return devices.find((d) => d.id === remembered.id);
    }
    // Nothing chosen yet, so follow whatever Spotify says is active — but only
    // if we are allowed to talk to it.
    return devices.find((d) => d.is_active);
  }, [devices, remembered]);

  const unavailableDeviceName =
    remembered && !selectedDevice ? (remembered.name || null) : null;

  // Forget the remembered speaker only once it has been genuinely absent for a
  // while. A single missing poll is normal for a speaker that has gone idle.
  useEffect(() => {
    if (!remembered || devicesQuery.isLoading || !devicesQuery.isSuccess) return;

    const present = devices.some((d) => d.id === remembered.id);
    const { streak, forget } = trackAbsence(missStreak.current, present);
    missStreak.current = streak;

    if (forget) {
      localStorage.removeItem(SELECTED_DEVICE_KEY);
      setRemembered(null);
    }
  }, [
    devices,
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
      const choice = { id: device.id, name: device.name };
      localStorage.setItem(SELECTED_DEVICE_KEY, serialiseRemembered(choice));
      missStreak.current = 0;
      setRemembered(choice);
      await player.transferPlayback(device.id, false);
      refresh();
    },
    [refresh],
  );

  const command = useCallback(
    async (fn: (deviceId: string | undefined) => Promise<unknown>) => {
      await fn(selectedDevice?.id ?? undefined);
      // Spotify needs a moment before /me/player reflects the change.
      setTimeout(refresh, 350);
    },
    [selectedDevice, refresh],
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
