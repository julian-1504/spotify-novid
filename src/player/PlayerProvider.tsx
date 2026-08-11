import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PLAYBACK_POLL_MS } from '../config';
import * as player from '../api/player';
import { partitionDevices, type PartitionedDevices } from '../devices/allowlist';
import type { Device, PlaybackState } from '../api/types';

const SELECTED_DEVICE_KEY = 'novid.device';

/** Stable identity so an empty device list doesn't invalidate memos each render. */
const NO_DEVICES: PartitionedDevices = { allowed: [], hidden: [] };

interface PlayerValue {
  state: PlaybackState | undefined;
  devices: Device[];
  /** Devices Spotify reported but this app will not play to, with reasons. */
  hiddenDevices: PartitionedDevices['hidden'];
  /** The speaker commands are sent to, if it is still available. */
  selectedDevice: Device | undefined;
  selectDevice: (device: Device) => Promise<void>;
  devicesLoading: boolean;
  refresh: () => void;
  /** Runs a transport command then re-reads state so the UI catches up. */
  command: (fn: (deviceId: string | undefined) => Promise<unknown>) => Promise<void>;
}

const PlayerContext = createContext<PlayerValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_DEVICE_KEY),
  );

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

  const selectedDevice = useMemo(
    () =>
      devices.find((d) => d.id === selectedId) ??
      // Fall back to whatever Spotify says is active, but only if we are
      // allowed to talk to it.
      devices.find((d) => d.is_active),
    [devices, selectedId],
  );

  // If the remembered speaker is switched off, forget it rather than sending
  // commands into the void.
  useEffect(() => {
    if (selectedId && !devicesQuery.isLoading && devices.length > 0) {
      if (!devices.some((d) => d.id === selectedId)) {
        localStorage.removeItem(SELECTED_DEVICE_KEY);
        setSelectedId(null);
      }
    }
  }, [devices, selectedId, devicesQuery.isLoading]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['playback'] });
    void queryClient.invalidateQueries({ queryKey: ['devices'] });
  }, [queryClient]);

  const selectDevice = useCallback(
    async (device: Device) => {
      if (!device.id) return;
      localStorage.setItem(SELECTED_DEVICE_KEY, device.id);
      setSelectedId(device.id);
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
