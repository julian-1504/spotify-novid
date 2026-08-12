import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer } from '../player/PlayerProvider';
import { useAuth } from '../auth/AuthProvider';
import * as player from '../api/player';
import { explainRejection } from '../devices/allowlist';
import { Icon, type IconName } from './Icon';
import { t } from '../strings';
import type { Device } from '../api/types';

const ICONS: Record<string, IconName> = {
  speaker: 'speaker',
  castaudio: 'speaker',
  avr: 'radio',
};

function deviceIcon(type: string): IconName {
  return ICONS[type.toLowerCase()] ?? 'speaker';
}

/**
 * The list here is already filtered by the build-time allowlist in
 * PlayerProvider, so anything with a screen simply never appears as an option.
 */
export function DevicePicker({ onClose }: { onClose: () => void }) {
  const {
    devices,
    hiddenDevices,
    selectedDevice,
    selectDevice,
    devicesLoading,
    command,
    selectSelf,
    selfSelected,
    selfBooting,
    selfError,
  } = usePlayer();
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);

  const choose = async (device: Device) => {
    setBusy(true);
    try {
      await selectDevice(device);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Not routed through `choose`: the SDK has to be started, and `activate()`
   * must run inside this very tap or iOS will play silently forever. The sheet
   * also stays open on failure so the kid can read why.
   */
  const chooseSelf = async () => {
    setBusy(true);
    try {
      // Only close on success — on failure the sheet has to stay open, because
      // it is where the reason is shown.
      if (await selectSelf()) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t.devices.title}
      >
        <h2>{t.devices.title}</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          {t.devices.subtitle}
        </p>

        {devicesLoading && <div className="spinner">{t.devices.searching}</div>}

        {!devicesLoading && devices.length === 0 && hiddenDevices.length === 0 && (
          <div className="empty">
            <div className="big">
              <Icon name="speaker-off" size={44} />
            </div>
            <p>
              <strong>{t.devices.noneFoundTitle}</strong>
            </p>
            <p>{t.devices.noneFoundBody}</p>
            {/* Straight to the matching topic rather than a generic help page. */}
            <Link className="btn" to="/hilfe?thema=keine-box" onClick={onClose}>
              {t.devices.helpLink}
            </Link>
          </div>
        )}

        {/*
          Spotify did report devices, but every one of them has a screen. This
          is a completely different problem from "nothing is switched on", so it
          gets its own message — otherwise a parent has no way to tell why the
          list looks empty.
        */}
        {!devicesLoading && devices.length === 0 && hiddenDevices.length > 0 && (
          <div className="empty">
            <div className="big">
              <Icon name="tv" size={44} />
            </div>
            <p>
              <strong>{t.devices.noneUsableTitle}</strong>
            </p>
            <p>{t.devices.noneUsableBody}</p>
            <ul style={{ textAlign: 'left', display: 'inline-block' }}>
              {hiddenDevices.map(({ device, reason }) => (
                <li key={device.id ?? device.name}>
                  {device.name}{' '}
                  <span className="muted">({explainRejection(reason)})</span>
                </li>
              ))}
            </ul>
            <Link className="btn" to="/hilfe?thema=keine-box" onClick={onClose}>
              {t.devices.helpLink}
            </Link>
          </div>
        )}

        {/*
          First, and always present: a box may refuse a podcast, but this phone
          never does. From here the sound reaches the box over Bluetooth, which
          is what the hint under the name is about.
        */}
        <div className="rows">
          <button
            className={`device ${selfSelected ? 'on' : ''}`}
            onClick={() => void chooseSelf()}
            disabled={busy}
          >
            <Icon name="phone" size={26} />
            <span className="body">
              <span className="name">{t.player.thisPhone}</span>
              {/*
                The meta renders inline with the name, so it carries its own
                leading separator — same as the device rows below.
              */}
              <span className="meta">
                {selfBooting
                  ? ` - ${t.player.startingPhone}`
                  : selfSelected
                    ? ` - ${t.devices.playingHere} · ${t.player.phoneBluetoothHint}`
                    : ` - ${t.player.thisPhoneHint}`}
              </span>
            </span>
          </button>
        </div>

        {selfError && (
          <div role="alert">
            <p className="muted" style={{ fontSize: 13 }}>
              {selfError.message}{' '}
              <Link to={`/hilfe?thema=${selfError.topic}`} onClick={onClose}>
                {t.devices.helpLink}
              </Link>
            </p>
            {/*
              Offered only where it can actually work — never for a non-Premium
              account, where it would walk a kid through the password dance and
              land them back on this same message.

              Deliberately an offer and not a forced logout: the grant is
              usually alive and merely missing the newer `streaming` scope, so
              tearing the session down here would take away the boxes that were
              working a second ago. src/api/client.ts owns that decision and
              makes it on its own when a grant is genuinely dead.
            */}
            {selfError.offerReauth && (
              <button
                className="btn with-icon"
                style={{ width: '100%' }}
                onClick={() => void signIn()}
              >
                <Icon name="spotify" size={20} />
                {t.login.buttonExpired}
              </button>
            )}
          </div>
        )}

        <div className="rows">
          {devices.map((device) => (
            <button
              key={device.id}
              className={`device ${device.id === selectedDevice?.id ? 'on' : ''}`}
              onClick={() => void choose(device)}
              disabled={busy || device.is_restricted}
            >
              <Icon name={deviceIcon(device.type)} size={26} />
              <span className="body">
                <span className="name">{device.name}</span>
                <span className="meta">
                  {device.id === selectedDevice?.id
                    ? ` - ${t.devices.playingHere}`
                    : ''}
                  {device.is_restricted && ` · ${t.devices.restricted}`}
                </span>
              </span>
            </button>
          ))}
        </div>

        {selectedDevice?.supports_volume && (
          <div className="volume">
            <Icon name="volume-low" size={20} />
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={selectedDevice.volume_percent ?? 50}
              aria-label={t.player.volume}
              onChange={(e) =>
                void command((id) => player.setVolume(Number(e.target.value), id))
              }
            />
            <Icon name="volume-high" size={20} />
          </div>
        )}

        <button
          className="btn secondary"
          style={{ width: '100%', marginTop: 12 }}
          onClick={onClose}
        >
          {t.devices.close}
        </button>
      </div>
    </div>
  );
}
