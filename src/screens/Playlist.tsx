import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  getPlaylist,
  getPlaylistItems,
  playlistItemCount,
} from '../api/catalog';
import { Artwork } from '../components/Artwork';
import { Icon } from '../components/Icon';
import { EpisodeRow, TrackRow } from '../components/Rows';
import { usePlayer } from '../player/PlayerProvider';
import { play } from '../api/player';
import { t } from '../strings';

export function Playlist() {
  const { id = '' } = useParams();
  const { command, selectedDevice } = usePlayer();

  const playlist = useQuery({
    queryKey: ['playlist', id],
    queryFn: () => getPlaylist(id),
  });
  // Note the endpoint: /items, not the removed /tracks.
  const items = useQuery({
    queryKey: ['playlist', id, 'items'],
    queryFn: () => getPlaylistItems(id),
  });

  if (playlist.isLoading) return <div className="spinner">{t.app.loading}</div>;
  if (!playlist.data) return null;

  // The page of items is the one count that is always right here, so it wins
  // over anything the playlist object did or did not say about its own length.
  const count = items.data?.total ?? playlistItemCount(playlist.data);

  return (
    <div className="content">
      <div className="detail-head">
        <Artwork images={playlist.data.images} alt="" fallback="playlist" />
        <div>
          <h1>{playlist.data.name}</h1>
          <p className="muted">
            {playlist.data.owner?.display_name ?? ''}
            <br />
            {count === undefined ? '' : t.detail.songs(count)}
          </p>
          <button
            className="btn with-icon"
            disabled={!selectedDevice}
            onClick={() =>
              void command((deviceId) =>
                play({ deviceId, contextUri: playlist.data.uri }),
              )
            }
          >
            <Icon name="play" size={18} />
            {t.detail.play}
          </button>
        </div>
      </div>

      <div className="rows">
        {items.data?.items.map((item, i) => {
          const entry = item.track;
          if (!entry) return null;
          return entry.type === 'episode' ? (
            <EpisodeRow key={`${entry.id}-${i}`} episode={entry} />
          ) : (
            <TrackRow
              key={`${entry.id}-${i}`}
              track={entry}
              index={i}
              contextUri={playlist.data.uri}
              showArtwork
            />
          );
        })}
      </div>
    </div>
  );
}
