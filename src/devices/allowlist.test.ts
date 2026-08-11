import { describe, expect, it } from 'vitest';
import {
  explainRejection,
  isAllowedDevice,
  partitionDevices,
  rejectionReason,
} from './allowlist';
import { t } from '../strings';
import type { Device } from '../api/types';

function device(overrides: Partial<Device> = {}): Device {
  return {
    id: 'dev-1',
    is_active: false,
    is_restricted: false,
    is_private_session: false,
    name: 'Kitchen',
    type: 'speaker',
    volume_percent: 50,
    supports_volume: true,
    ...overrides,
  };
}

describe('device allowlist', () => {
  it('allows plain audio speakers', () => {
    expect(isAllowedDevice(device({ type: 'speaker' }))).toBe(true);
    expect(isAllowedDevice(device({ type: 'castaudio' }))).toBe(true);
    expect(isAllowedDevice(device({ type: 'avr' }))).toBe(true);
  });

  it('rejects every device type that can render video', () => {
    for (const type of ['tv', 'castvideo', 'stb', 'game_console']) {
      expect(rejectionReason(device({ type }))).toBe('blocked-type');
    }
  });

  it('rejects phones and computers, which have screens', () => {
    expect(isAllowedDevice(device({ type: 'smartphone' }))).toBe(false);
    expect(isAllowedDevice(device({ type: 'computer' }))).toBe(false);
  });

  // The important one: Spotify documents only three type strings, so unknown
  // values are expected in the wild and must not slip through.
  it('fails closed on unrecognised device types', () => {
    expect(rejectionReason(device({ type: 'holodeck' }))).toBe(
      'type-not-allowed',
    );
    expect(rejectionReason(device({ type: '' }))).toBe('type-not-allowed');
  });

  it('is case-insensitive about type strings', () => {
    expect(isAllowedDevice(device({ type: 'Speaker' }))).toBe(true);
    expect(rejectionReason(device({ type: 'TV' }))).toBe('blocked-type');
  });

  // Observed from a real Chromecast Audio: Spotify returns "CastAudio", not the
  // lowercase form its docs imply. Without the case folding this device — the
  // whole point of the app — would be silently hidden.
  it('allows the exact casing a real Chromecast Audio reports', () => {
    expect(isAllowedDevice(device({ type: 'CastAudio' }))).toBe(true);
  });

  it('rejects devices with no id, which cannot be targeted', () => {
    expect(rejectionReason(device({ id: null }))).toBe('no-id');
  });
});

describe('partitionDevices', () => {
  it('separates usable speakers from rejected devices', () => {
    const { allowed, hidden } = partitionDevices([
      device({ id: 'a', name: 'Kitchen', type: 'speaker' }),
      device({ id: 'b', name: 'Living room TV', type: 'tv' }),
      device({ id: 'c', name: "Dad's phone", type: 'smartphone' }),
    ]);

    expect(allowed.map((d) => d.name)).toEqual(['Kitchen']);
    expect(hidden.map((h) => [h.device.name, h.reason])).toEqual([
      ['Living room TV', 'blocked-type'],
      ["Dad's phone", 'blocked-type'],
    ]);
  });

  // The distinction the UI depends on: an empty allowed list means something
  // very different depending on whether anything was reported at all.
  it('reports both lists empty when Spotify sees no devices', () => {
    expect(partitionDevices([])).toEqual({ allowed: [], hidden: [] });
  });
});

describe('explainRejection', () => {
  it('explains every reason in German a kid can read', () => {
    expect(explainRejection('blocked-type')).toBe(t.devices.reasonBlocked);
    expect(explainRejection('no-id')).toBe(t.devices.reasonNoId);
    expect(explainRejection('not-pinned')).toBe(t.devices.reasonNotPinned);
    expect(explainRejection('type-not-allowed')).toBe(
      t.devices.reasonTypeNotAllowed,
    );
  });
});
