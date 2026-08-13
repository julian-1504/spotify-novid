import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAlbum, getAlbumTracks } from '../api/catalog';
import { Artwork } from '../components/Artwork';
import { EndOfList } from '../components/EndOfList';
import { Icon } from '../components/Icon';
import { TrackRow } from '../components/Rows';
import { usePagedList } from '../hooks/usePagedList';
import { usePlayer } from '../player/PlayerProvider';
import { play } from '../api/player';
import { toFriendlyError } from '../errors';
import { t } from '../strings';

export function Album() {
  const { id = '' } = useParams();
  const { command, selectedDevice } = usePlayer();

  const album = useQuery({ queryKey: ['album', id], queryFn: () => getAlbum(id) });
  // Paged, because a Hörspiel is one album with a track per chapter and runs
  // well past the fifty a single page holds.
  const tracks = usePagedList(['album', id, 'tracks'], (offset) =>
    getAlbumTracks(id, offset),
  );

  if (album.isLoading) return <div className="spinner">{t.app.loading}</div>;
  if (album.error)
    return (
      <div className="content">
        <div className="error">{toFriendlyError(album.error).message}</div>
      </div>
    );
  if (!album.data) return null;

  return (
    <div className="content">
      <div className="detail-head">
        <Artwork images={album.data.images} alt="" fallback="album" />
        <div>
          <h1>{album.data.name}</h1>
          <p className="muted">
            {album.data.artists.map((a) => a.name).join(', ')}
            <br />
            {album.data.release_date?.slice(0, 4)} ·{' '}
            {t.detail.songs(album.data.total_tracks)}
          </p>
          <button
            className="btn with-icon"
            disabled={!selectedDevice}
            onClick={() =>
              void command((deviceId) =>
                play({ deviceId, contextUri: album.data.uri }),
              )
            }
          >
            <Icon name="play" size={18} />
            {t.detail.play}
          </button>
        </div>
      </div>

      <div className="rows">
        {tracks.entries.map(({ item, index }) => (
          // `index` is the position in the whole album rather than in the page
          // it arrived on — it is what tells Spotify which track to start at,
          // so track 51 has to say 50.
          <TrackRow
            key={`${item.id}-${index}`}
            track={item}
            index={index}
            contextUri={album.data.uri}
          />
        ))}
      </div>

      {tracks.isFetchingNextPage && (
        <div className="spinner">{t.app.loading}</div>
      )}
      <EndOfList
        onReach={tracks.fetchNextPage}
        active={tracks.hasNextPage && !tracks.isFetchingNextPage}
      />
    </div>
  );
}
