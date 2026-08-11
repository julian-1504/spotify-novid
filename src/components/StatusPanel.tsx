import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { usePlayer } from '../player/PlayerProvider';
import { useOnline } from '../hooks/useOnline';
import { Icon } from './Icon';
import { t } from '../strings';

/**
 * A live tick/cross readout of the three things that actually break.
 *
 * The point is to turn "es geht nicht" into "da steht, keine Box" — a kid can
 * read the fault off the screen and either fix it or report something specific.
 * Everything here reuses state the app already has; no extra API calls.
 */
export function StatusPanel() {
  const online = useOnline();
  const { status } = useAuth();
  const { devices, hiddenDevices, selectedDevice, refresh } = usePlayer();
  const [refreshing, setRefreshing] = useState(false);

  const speaker = describeSpeaker({
    hasSelected: Boolean(selectedDevice),
    selectedName: selectedDevice?.name,
    deviceCount: devices.length,
    hiddenCount: hiddenDevices.length,
  });

  const onRefresh = () => {
    setRefreshing(true);
    refresh();
    // Purely so the button visibly does something; the queries refetch fast.
    setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <section className="status">
      <h2>{t.help.statusTitle}</h2>

      <StatusRow
        label={t.help.statusInternet}
        ok={online}
        value={online ? t.help.statusInternetOk : t.help.statusInternetBad}
      />
      <StatusRow
        label={t.help.statusSignedIn}
        ok={status === 'signed-in'}
        value={
          status === 'signed-in'
            ? t.help.statusSignedInOk
            : t.help.statusSignedInBad
        }
      />
      <StatusRow label={t.help.statusSpeaker} ok={speaker.ok} value={speaker.value} />

      <button className="btn secondary" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? t.help.searchingAgain : t.help.searchAgain}
      </button>
    </section>
  );
}

function StatusRow({
  label,
  ok,
  value,
}: {
  label: string;
  ok: boolean;
  value: string;
}) {
  return (
    <div className="status-row">
      <span className={`status-icon ${ok ? 'ok' : 'bad'}`}>
        <Icon name={ok ? 'check' : 'close'} size={20} />
      </span>
      <span className="status-label">{label}</span>
      <span className={`status-value ${ok ? '' : 'bad'}`}>{value}</span>
    </div>
  );
}

/**
 * "No speaker" has three distinct causes and a kid needs to tell them apart:
 * nothing found at all, something found but unusable (a TV), or a usable
 * speaker that simply has not been picked yet.
 */
function describeSpeaker({
  hasSelected,
  selectedName,
  deviceCount,
  hiddenCount,
}: {
  hasSelected: boolean;
  selectedName?: string;
  deviceCount: number;
  hiddenCount: number;
}): { ok: boolean; value: string } {
  if (hasSelected && selectedName) return { ok: true, value: selectedName };
  if (deviceCount > 0) return { ok: false, value: t.help.statusSpeakerNotPicked };
  if (hiddenCount > 0) return { ok: false, value: t.help.statusSpeakerHidden };
  return { ok: false, value: t.help.statusSpeakerNone };
}
