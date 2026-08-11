import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { search, type SearchType } from '../api/catalog';
import {
  AlbumTile,
  ArtistTile,
  PlaylistTile,
  ShowTile,
  TrackRow,
} from '../components/Rows';
import { Icon } from '../components/Icon';
import { toFriendlyError } from '../errors';
import { t } from '../strings';

const TABS: { id: SearchType; label: string }[] = [
  { id: 'track', label: t.search.tabs.track },
  { id: 'album', label: t.search.tabs.album },
  { id: 'artist', label: t.search.tabs.artist },
  { id: 'playlist', label: t.search.tabs.playlist },
  { id: 'show', label: t.search.tabs.show },
];

export function Search() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SearchType>('track');

  // Debounce so every keystroke doesn't burn a request against the rate limit.
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(id);
  }, [input]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['search', query, type],
    queryFn: () => search(query, [type]),
    enabled: query.length > 0,
  });

  return (
    <div className="content">
      <div className="search-bar">
        <input
          type="search"
          value={input}
          placeholder={t.search.placeholder}
          aria-label={t.search.label}
          autoComplete="off"
          onChange={(e) => setInput(e.target.value)}
        />
      </div>

      <div className="chips">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`chip ${type === tab.id ? 'on' : ''}`}
            onClick={() => setType(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="error">{toFriendlyError(error).message}</div>
      )}

      {!query && (
        <div className="empty">
          <div className="big">
            <Icon name="search" size={44} />
          </div>
          <p>{t.search.hint}</p>
        </div>
      )}

      {query && isFetching && !data && (
        <div className="spinner">{t.search.searching}</div>
      )}

      {data && (
        <>
          {type === 'track' && (
            <div className="rows">
              {data.tracks?.items.map((track) => (
                <TrackRow key={track.id} track={track} showArtwork />
              ))}
            </div>
          )}

          {type !== 'track' && (
            <div className="grid">
              {data.albums?.items.map((a) => (
                <AlbumTile key={a.id} album={a} />
              ))}
              {data.artists?.items.map((a) => (
                <ArtistTile key={a.id} artist={a} />
              ))}
              {data.playlists?.items
                // Spotify sometimes returns null holes in playlist search.
                .filter(Boolean)
                .map((p) => (
                  <PlaylistTile key={p.id} playlist={p} />
                ))}
              {data.shows?.items.map((s) => (
                <ShowTile key={s.id} show={s} />
              ))}
            </div>
          )}

          {isEmpty(data, type) && (
            <div className="empty">
              <div className="big">
                <Icon name="search-off" size={44} />
              </div>
              <p>{t.search.nothingFound(query)}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function isEmpty(
  data: Awaited<ReturnType<typeof search>>,
  type: SearchType,
): boolean {
  const bucket = {
    track: data.tracks,
    album: data.albums,
    artist: data.artists,
    playlist: data.playlists,
    show: data.shows,
  }[type];
  return (bucket?.items.length ?? 0) === 0;
}
