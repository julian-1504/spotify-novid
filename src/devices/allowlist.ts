/**
 * Deciding which Spotify Connect devices may be played to.
 *
 * This is the mechanism that keeps video off the screen. The app itself renders
 * no video, but "play to any device on the network" would happily target a TV
 * or a video Chromecast, which *can* show a video podcast. So targets are
 * restricted to devices that have no screen.
 *
 * The filter is allowlist-first and deliberately fails closed: a device type
 * that nobody anticipated is hidden rather than offered.
 */

import {
  ALLOWED_DEVICE_IDS,
  ALLOWED_DEVICE_TYPES,
  BLOCKED_DEVICE_TYPES,
  SDK_DEVICE_TYPE,
} from '../config';
import { t } from '../strings';
import type { Device } from '../api/types';

export type RejectionReason =
  | 'no-id'
  | 'blocked-type'
  | 'not-pinned'
  | 'type-not-allowed';

/**
 * Why a device is unavailable, or null if it is allowed.
 *
 * `selfDeviceId` is this phone, when it has registered itself as a playback
 * device through the Web Playback SDK. It has to be admitted by id: the SDK
 * reports `type: "Computer"` (confirmed by `npm run spike:player`), and
 * widening the type allowlist to let it through would re-admit every desktop
 * running Spotify — including one plugged into a TV. The id is minted fresh by
 * the SDK each session, so nothing else can present it.
 */
export function rejectionReason(
  device: Device,
  selfDeviceId?: string | null,
): RejectionReason | null {
  // A device with no id cannot be targeted by the API at all.
  if (!device.id) return 'no-id';

  const type = device.type?.toLowerCase() ?? '';

  // This phone, registered by the SDK. Matching the id alone is not enough: if
  // that id were ever wrong, an id-only exception would admit whatever device
  // happened to carry it — a TV included. Requiring the SDK's own type as well
  // means the worst a wrong id can do is admit another computer, which is the
  // failure the blocklist below already exists to prevent.
  if (selfDeviceId && device.id === selfDeviceId && type === SDK_DEVICE_TYPE) {
    return null;
  }

  // Blocklist wins over everything, including an explicit id pin. These are the
  // types that can render video.
  if (BLOCKED_DEVICE_TYPES.includes(type)) return 'blocked-type';

  if (ALLOWED_DEVICE_IDS.length > 0) {
    return ALLOWED_DEVICE_IDS.includes(device.id) ? null : 'not-pinned';
  }

  return ALLOWED_DEVICE_TYPES.includes(type) ? null : 'type-not-allowed';
}

export function isAllowedDevice(device: Device, selfDeviceId?: string | null): boolean {
  return rejectionReason(device, selfDeviceId) === null;
}

export function filterAllowedDevices(
  devices: Device[],
  selfDeviceId?: string | null,
): Device[] {
  return devices.filter((d) => isAllowedDevice(d, selfDeviceId));
}

/** Why a device is unusable, in words a kid can read. */
export function explainRejection(reason: RejectionReason): string {
  switch (reason) {
    case 'blocked-type':
      return t.devices.reasonBlocked;
    case 'no-id':
      return t.devices.reasonNoId;
    case 'not-pinned':
      return t.devices.reasonNotPinned;
    case 'type-not-allowed':
      return t.devices.reasonTypeNotAllowed;
  }
}

export interface PartitionedDevices {
  allowed: Device[];
  /** Devices Spotify reported that this app refuses to play to, and why. */
  hidden: { device: Device; reason: RejectionReason }[];
}

/**
 * Splits the raw device list. Keeping the rejects (rather than discarding them)
 * is what lets the UI distinguish "no speaker is switched on" from "a device is
 * there but it has a screen" — two problems with completely different fixes.
 */
export function partitionDevices(
  devices: Device[],
  selfDeviceId?: string | null,
): PartitionedDevices {
  const allowed: Device[] = [];
  const hidden: { device: Device; reason: RejectionReason }[] = [];

  for (const device of devices) {
    const reason = rejectionReason(device, selfDeviceId);
    if (reason === null) allowed.push(device);
    else hidden.push({ device, reason });
  }
  return { allowed, hidden };
}
