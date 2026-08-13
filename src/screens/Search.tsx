import { useEffect, useState } from 'react';
import { searchPage, type SearchType } from '../api/catalog';
import type { Album, Artist, Playlist, Show, Track } from '../api/types';
import { EndOfList } from '../components/EndOfList';
import {
  AlbumTile,
  ArtistTile,
  PlaylistTile,
  ShowTile,
  TrackRow,
} from '../components/Rows';
import { Icon } from '../components/Icon';
import { usePagedList } from '../hooks/usePagedList';
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

  /**
   * Paged, because search answers ten at a time since February 2026 — and a
   * Hörspiel series has far more than ten albums, so a list that stopped at the
   * first page stopped in the middle of what was being looked for.
   *
   * The type is part of the key, so switching tabs starts its own list rather
   * than continuing the previous one.
   */
  const results = usePagedList(
    ['search', query, type],
    (offset) => searchPage(query, type, offset),
    { enabled: query.length > 0 },
  );

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

      {results.error && (
        <div className="error">{toFriendlyError(results.error).message}</div>
      )}

      {!query && (
        <div className="empty">
          <div className="big">
            <Icon name="search" size={44} />
          </div>
          <p>{t.search.hint}</p>
        </div>
      )}

      {query && results.isLoading && (
        <div className="spinner">{t.search.searching}</div>
      )}

      <div className={type === 'track' ? 'rows' : 'grid'}>
        {results.entries
          // Spotify sometimes returns null holes in playlist search.
          .filter(({ item }) => Boolean(item))
          .map(({ item, index }) => (
            <SearchResult key={`${item.id}-${index}`} type={type} item={item} />
          ))}
      </div>

      {results.isFetchingNextPage && (
        <div className="spinner">{t.app.loading}</div>
      )}
      <EndOfList
        onReach={results.fetchNextPage}
        active={results.hasNextPage && !results.isFetchingNextPage}
      />

      {query && !results.isLoading && results.entries.length === 0 && (
        <div className="empty">
          <div className="big">
            <Icon name="search-off" size={44} />
          </div>
          <p>{t.search.nothingFound(query)}</p>
        </div>
      )}
    </div>
  );
}

/**
 * One hit, rendered as whatever the tab asked for.
 *
 * The casts are the one place this is needed and they are safe by construction:
 * the tab decides which type is searched *and* which bucket is read, so an
 * entry can only be the shape its tab asked for. TypeScript cannot tie those
 * two facts together through the paged list, so it is said here once rather
 * than at five call sites.
 */
function SearchResult({
  type,
  item,
}: {
  type: SearchType;
  item: Track | Album | Artist | Playlist | Show;
}) {
  switch (type) {
    case 'track':
      return <TrackRow track={item as Track} showArtwork />;
    case 'album':
      return <AlbumTile album={item as Album} />;
    case 'artist':
      return <ArtistTile artist={item as Artist} />;
    case 'playlist':
      return <PlaylistTile playlist={item as Playlist} />;
    case 'show':
      return <ShowTile show={item as Show} />;
  }
}
