import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getArtist, getArtistAlbums } from '../api/catalog';
import { Artwork } from '../components/Artwork';
import { EndOfList } from '../components/EndOfList';
import { AlbumTile } from '../components/Rows';
import { usePagedList } from '../hooks/usePagedList';
import { t } from '../strings';

/**
 * No top-tracks section: `GET /artists/{id}/top-tracks` was one of the
 * endpoints removed from Development Mode in February 2026.
 */
export function Artist() {
  const { id = '' } = useParams();

  const artist = useQuery({
    queryKey: ['artist', id],
    queryFn: () => getArtist(id),
  });
  // A Hörspiel series is one artist with hundreds of albums, so this one is
  // paged too: the first fifty are not the series, they are the start of it.
  const albums = usePagedList(['artist', id, 'albums'], (offset) =>
    getArtistAlbums(id, offset),
  );

  if (artist.isLoading) return <div className="spinner">{t.app.loading}</div>;
  if (!artist.data) return null;

  return (
    <div className="content">
      <div className="detail-head">
        <Artwork images={artist.data.images} alt="" fallback="artist" />
        <div>
          <h1>{artist.data.name}</h1>
          <p className="muted">{artist.data.genres?.slice(0, 3).join(', ')}</p>
        </div>
      </div>

      <h2>{t.detail.albums}</h2>
      {albums.isLoading && <div className="spinner">{t.app.loading}</div>}
      <div className="grid">
        {albums.entries.map(({ item, index }) => (
          <AlbumTile key={`${item.id}-${index}`} album={item} />
        ))}
      </div>

      {albums.isFetchingNextPage && (
        <div className="spinner">{t.app.loading}</div>
      )}
      <EndOfList
        onReach={albums.fetchNextPage}
        active={albums.hasNextPage && !albums.isFetchingNextPage}
      />
    </div>
  );
}
