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
 *
 * Twenty at a time is also why the two buttons exist. The window is relative to
 * what is playing, so jumping to the last song on screen brings the next twenty
 * with it, and a kid can walk a long playlist a screenful at a time.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getQueue, play } from '../api/player';
import { PLAYBACK_POLL_MS } from '../config';
import { skipTarget, upcomingIn } from '../player/queue';
import { usePlayer } from '../player/PlayerProvider';
import { EpisodeRow, TrackRow } from './Rows';
import { t } from '../strings';

export function Upcoming({ contextUri }: { contextUri: string }) {
  const { state, command, selectedDevice } = usePlayer();
  const queryClient = useQueryClient();

  /*
   * Where each jump came from, so „zurück" has somewhere to go. The queue only
   * ever says what comes *next*, so the way back is not something to ask
   * Spotify for — it is something to remember. Going forward pushes the song
   * that was playing; going back starts it again, which puts the same twenty on
   * screen as before, because the window follows whatever is playing.
   *
   * Kept for as long as the screen is open, and deliberately not cleared when
   * playback wanders off this playlist: that is exactly the moment going back
   * is worth most, since it starts the playlist again where the kid left it.
   */
  const [cameFrom, setCameFrom] = useState<string[]>([]);

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
  const skipTo = skipTarget(upcoming);

  /** Start a song inside this playlist, then show the twenty that follow it. */
  const jumpTo = async (uri: string) => {
    await command((deviceId) => play({ deviceId, contextUri, offsetUri: uri }));
    // The poll would get there within three seconds; a list that redraws while
    // a kid is still looking at the button they pressed is the wrong feedback.
    await queryClient.invalidateQueries({ queryKey: ['queue'] });
  };

  const goForward = () => {
    if (!skipTo) return;
    // Only a track can be jumped back to, which is the same rule skipTarget
    // applies going the other way.
    const here = state?.item;
    if (here?.type === 'track') setCameFrom((trail) => [...trail, here.uri]);
    void jumpTo(skipTo.uri);
  };

  const goBack = () => {
    const previous = cameFrom.at(-1);
    if (!previous) return;
    setCameFrom((trail) => trail.slice(0, -1));
    void jumpTo(previous);
  };

  const back = cameFrom.length > 0 && (
    <button className="more" disabled={!selectedDevice} onClick={goBack}>
      ‹ {t.detail.backUpcoming}
    </button>
  );

  /*
   * Nothing from this playlist is playing. That is the ordinary first visit —
   * and also what a kid sees if playback drifted off the end into Spotify's own
   * autoplay, which is why „vorherige" is drawn here too rather than only over
   * a list. It is the one control that gets them back.
   */
  if (!playingThis)
    return (
      <>
        <p className="muted end-note">{t.detail.queueHint}</p>
        {back && <div className="list-nav">{back}</div>}
      </>
    );

  if (upcoming.length === 0) return null;

  return (
    <>
      <h2>{t.detail.upNext}</h2>
      <div className="list-nav">
        {back}
        {skipTo && (
          <button
            className="more next"
            disabled={!selectedDevice}
            onClick={goForward}
          >
            {t.detail.skipUpcoming} ›
          </button>
        )}
      </div>
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
