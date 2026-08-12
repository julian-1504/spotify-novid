import { useQuery } from '@tanstack/react-query';
import { getMyAlbums, getMyPlaylists, getMyShows } from '../api/catalog';
import { AlbumTile, PlaylistTile, ShowTile } from './Rows';
import { Icon } from './Icon';
import { t } from '../strings';

/**
 * Everything the kid has saved, in three shelves.
 *
 * Was its own screen until „Zuletzt gehört" moved in above it; a component
 * rather than a screen now, because saved things and recently played things
 * belong on one page — what you kept and what you actually listen to are the
 * same question asked twice.
 */
export function YourStuff() {
  const playlists = useQuery({
    queryKey: ['me', 'playlists'],
    queryFn: () => getMyPlaylists(),
  });
  const albums = useQuery({
    queryKey: ['me', 'albums'],
    queryFn: () => getMyAlbums(),
  });
  const shows = useQuery({
    queryKey: ['me', 'shows'],
    queryFn: () => getMyShows(),
  });

  const loading =
    playlists.isLoading || albums.isLoading || shows.isLoading;
  const empty =
    !loading &&
    !playlists.data?.items.length &&
    !albums.data?.items.length &&
    !shows.data?.items.length;

  return (
    <>
      {loading && <div className="spinner">{t.app.loading}</div>}

      {empty && (
        <div className="empty">
          <div className="big">
            <Icon name="library" size={44} />
          </div>
          <p>{t.library.empty}</p>
        </div>
      )}

      {!!playlists.data?.items.length && (
        <>
          <h2>{t.library.playlists}</h2>
          <div className="grid">
            {playlists.data.items.filter(Boolean).map((p) => (
              <PlaylistTile key={p.id} playlist={p} />
            ))}
          </div>
        </>
      )}

      {!!albums.data?.items.length && (
        <>
          <h2>{t.library.albums}</h2>
          <div className="grid">
            {albums.data.items.map(({ album }) => (
              <AlbumTile key={album.id} album={album} />
            ))}
          </div>
        </>
      )}

      {!!shows.data?.items.length && (
        <>
          <h2>{t.library.shows}</h2>
          <div className="grid">
            {shows.data.items.map(({ show }) => (
              <ShowTile key={show.id} show={show} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
