import { useEffect, useState } from 'react';
import { usePlayer } from '../player/PlayerProvider';
import * as player from '../api/player';
import { Artwork, formatDuration } from './Artwork';
import { DevicePicker } from './DevicePicker';
import { NowPlayingSheet } from './NowPlayingSheet';
import { Icon } from './Icon';
import { t } from '../strings';
import type { Episode, Track } from '../api/types';

/** Exported because the sheet shows the same line under the same title. */
export function subtitleFor(item: Track | Episode | null | undefined): string {
  if (!item) return '';
  if (item.type === 'episode') return item.show?.name ?? 'Podcast';
  return item.artists?.map((a) => a.name).join(', ') ?? '';
}

export function NowPlayingBar() {
  const {
    state,
    selectedDevice,
    unavailableDeviceName,
    devices,
    command,
    selfSelected,
  } = usePlayer();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);

  const item = state?.item;
  const duration = item?.duration_ms ?? 0;
  const isPlaying = state?.is_playing ?? false;

  // Tick the progress bar between polls so it doesn't visibly jump every 3s.
  const [localProgress, setLocalProgress] = useState(0);
  useEffect(() => {
    setLocalProgress(state?.progress_ms ?? 0);
  }, [state?.progress_ms]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setLocalProgress((p) => Math.min(p + 1000, duration));
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying, duration]);

  const noSpeaker = !selectedDevice;
  const progress = scrub ?? localProgress;

  return (
    <>
      <div className="nowplaying">
        <button
          className={`np-device ${noSpeaker ? 'warn' : ''}`}
          onClick={() => setPickerOpen(true)}
        >
          <span className="np-device-label">
            <Icon
              name={
                selfSelected
                  ? 'phone'
                  : noSpeaker && (devices.length === 0 || unavailableDeviceName)
                    ? 'speaker-off'
                    : 'speaker'
              }
              size={18}
            />
            {/*
              Four different situations, and a kid needs to tell them apart:
              it is playing on this phone, the chosen box is switched off, no
              box has been chosen yet, or none was found at all.
            */}
            {selfSelected
              ? t.player.thisPhone
              : selectedDevice
                ? selectedDevice.name
                : unavailableDeviceName
                  ? t.player.deviceOff(unavailableDeviceName)
                  : devices.length > 0
                    ? t.player.tapToPick
                    : t.player.noSpeakerFound}
          </span>
          <Icon name="chevron-down" size={18} />
        </button>

        <div className="np-main">
          {/*
            The cover and the title are the way to where this came from, so they
            are one button and the transport controls stay outside it — reaching
            for „Weiter" must never land on a sheet. Disabled while nothing is
            playing: a sheet that only repeats „Es läuft gerade nichts" is worse
            than a tap that does nothing at all.
          */}
          <button
            className="np-open"
            disabled={!item}
            aria-haspopup="dialog"
            aria-label={t.player.openDetails}
            onClick={() => setSheetOpen(true)}
          >
            <Artwork
              images={
                item?.type === 'episode' ? item.images : item?.album?.images
              }
              alt=""
            />
            <span className="np-text">
              <span className="np-title">
                {item?.name ?? t.player.nothingPlaying}
              </span>
              <span className="np-sub">
                {/*
                  While the phone is the player the sound comes out of the
                  phone, not the box. Saying so beats a kid concluding the box
                  is broken — the pairing is a one-off they may never have been
                  told about.
                */}
                {selfSelected && !item
                  ? t.player.phoneBluetoothHint
                  : subtitleFor(item) || (noSpeaker ? t.player.pickSpeaker : '')}
              </span>
            </span>
            {item && <Icon name="chevron-right" size={14} />}
          </button>

          <div className="np-buttons">
            <button
              aria-label={t.player.previous}
              disabled={noSpeaker}
              onClick={() => void command(player.previous)}
            >
              <Icon name="previous" size={26} />
            </button>
            <button
              className="np-play"
              aria-label={isPlaying ? t.player.pause : t.player.play}
              disabled={noSpeaker}
              onClick={() =>
                void command(isPlaying ? player.pause : player.resume)
              }
            >
              <Icon name={isPlaying ? 'pause' : 'play'} size={22} />
            </button>
            <button
              aria-label={t.player.next}
              disabled={noSpeaker}
              onClick={() => void command(player.next)}
            >
              <Icon name="next" size={26} />
            </button>
          </div>
        </div>

        {item && duration > 0 && (
          <div className="np-progress">
            <span>{formatDuration(progress)}</span>
            <input
              type="range"
              min={0}
              max={duration}
              value={progress}
              aria-label={t.player.position}
              onChange={(e) => setScrub(Number(e.target.value))}
              onPointerUp={() => {
                if (scrub !== null) {
                  const target = scrub;
                  setScrub(null);
                  void command((id) => player.seek(target, id));
                }
              }}
            />
            <span>{formatDuration(duration)}</span>
          </div>
        )}
      </div>

      {pickerOpen && <DevicePicker onClose={() => setPickerOpen(false)} />}
      {sheetOpen && <NowPlayingSheet onClose={() => setSheetOpen(false)} />}
    </>
  );
}
