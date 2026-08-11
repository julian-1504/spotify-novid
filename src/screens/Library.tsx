import { useQuery } from '@tanstack/react-query';
import { getMyAlbums, getMyPlaylists, getMyShows } from '../api/catalog';
import { AlbumTile, PlaylistTile, ShowTile } from '../components/Rows';
import { Icon } from '../components/Icon';
import { t } from '../strings';

export function Library() {
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
    <div className="content">
      <h1>{t.library.title}</h1>

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
    </div>
  );
}
