/**
 * „Was als Nächstes kommt" — the songs of a playlist this app may not read.
 *
 * Spotify refuses the contents of a playlist the account does not own, and
 * refuses them every way they can be asked for (see api/catalog.ts). What it
 * does answer is the queue: once the playlist is playing, it will name the next
 * twenty things one after another. So this is the list on the wrong side of the
 * play button, and a kid gets it by pressing „Abspielen" first.
 *
 * It follows that the list is short, that it moves as the music does, and that
 * it is gone the moment something else plays. All three are the endpoint's
 * doing, not a decision — the alternative was a playlist screen with nothing on
 * it at all.
 */

import { useQuery } from '@tanstack/react-query';
import { getQueue } from '../api/player';
import { PLAYBACK_POLL_MS } from '../config';
import { upcomingIn } from '../player/queue';
import { usePlayer } from '../player/PlayerProvider';
import { EpisodeRow, TrackRow } from './Rows';
import { t } from '../strings';

export function Upcoming({ contextUri }: { contextUri: string }) {
  const { state } = usePlayer();

  // Asked for only while this playlist is the thing playing. There is one queue
  // per account, so polling it from a screen that is not playing would spend
  // requests on somebody else's answer.
  const playingThis = state?.context?.uri === contextUri;
  const queue = useQuery({
    queryKey: ['queue'],
    queryFn: getQueue,
    enabled: playingThis,
    refetchInterval: PLAYBACK_POLL_MS,
    refetchIntervalInBackground: false,
  });

  const upcoming = upcomingIn(contextUri, state, queue.data);

  if (!playingThis)
    return <p className="muted end-note">{t.detail.queueHint}</p>;

  if (upcoming.length === 0) return null;

  return (
    <>
      <h2>{t.detail.upNext}</h2>
      <div className="rows">
        {upcoming.map((entry, i) =>
          entry.type === 'episode' ? (
            <EpisodeRow key={`${entry.id}-${i}`} episode={entry} />
          ) : (
            /*
             * No `index`: a queue says what comes next, never where in the
             * playlist it sits, and a position guessed from this list would
             * start the wrong song. TrackRow plays it by URI inside the same
             * playlist instead, so the rest goes on playing from there.
             */
            <TrackRow
              key={`${entry.id}-${i}`}
              track={entry}
              contextUri={contextUri}
              showArtwork
            />
          ),
        )}
      </div>
    </>
  );
}
