import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  SEARCH_TYPES,
  searchAll,
  searchBucket,
  searchPage,
  type SearchType,
} from '../api/catalog';
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

/** One type, or all of them at once. */
type Filter = SearchType | 'all';

/**
 * How much of each type „Alles" shows. A taste, not a list: the whole point of
 * the shelves is that five types fit on one screen, and „mehr" is right there
 * for the type that turned out to be the right one.
 */
const SECTION_PREVIEW = 4;

/** Songs read as a list; everything else is recognised by its artwork. */
const layoutFor = (type: SearchType) => (type === 'track' ? 'rows' : 'grid');

const CHIPS: { id: Filter; label: string }[] = [
  { id: 'all', label: t.search.tabs.all },
  ...SEARCH_TYPES.map((id) => ({ id, label: t.search.tabs[id] })),
];

const isSearchType = (value: string | null): value is SearchType =>
  SEARCH_TYPES.includes(value as SearchType);

export function Search() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  /**
   * The filter lives in the URL, the typed text does not.
   *
   * In the URL, because „mehr ›" is a navigation: it pushes an entry, so the
   * back button — the hardware one, on the phones this runs on — returns to
   * „Alles" instead of leaving the search screen altogether. The text stays in
   * component state because putting it in the URL would mint a history entry
   * per keystroke; the screen is not remounted by these pushes, so it survives
   * them anyway.
   */
  const [params, setParams] = useSearchParams();
  const asked = params.get('typ');
  const filter: Filter = isSearchType(asked) ? asked : 'all';
  const setFilter = (next: Filter) =>
    setParams(next === 'all' ? {} : { typ: next });

  // Debounce so every keystroke doesn't burn a request against the rate limit.
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(id);
  }, [input]);

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
        {CHIPS.map((chip) => (
          <button
            key={chip.id}
            className={`chip ${filter === chip.id ? 'on' : ''}`}
            onClick={() => setFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {!query && (
        <div className="empty">
          <div className="big">
            <Icon name="search" size={44} />
          </div>
          <p>{t.search.hint}</p>
        </div>
      )}

      {query &&
        (filter === 'all' ? (
          <AllResults query={query} onPick={setFilter} />
        ) : (
          <TypedResults query={query} type={filter} />
        ))}
    </div>
  );
}

/**
 * Every type at once, a shelf each — what „Alles" shows.
 *
 * One request rather than five, because `/search` takes the whole list of
 * types. It does not page: ten of each is already more than the shelves show,
 * and a kid who wants the rest of one type has a „mehr ›" to tap.
 */
function AllResults({
  query,
  onPick,
}: {
  query: string;
  onPick: (type: SearchType) => void;
}) {
  const results = useQuery({
    queryKey: ['search', query, 'all'],
    queryFn: () => searchAll(query),
  });
  const data = results.data;

  if (results.error)
    return <div className="error">{toFriendlyError(results.error).message}</div>;
  if (!data) return <div className="spinner">{t.search.searching}</div>;

  const sections = SEARCH_TYPES.map((type) => ({
    type,
    // Spotify sometimes returns null holes in playlist search. Dropped before
    // the slice, so a hole never costs the shelf one of its four places.
    page: searchBucket(data, type),
  }))
    .map(({ type, page }) => ({
      type,
      total: page.total,
      items: page.items.filter(Boolean).slice(0, SECTION_PREVIEW),
    }))
    .filter(({ items }) => items.length > 0);

  if (sections.length === 0) return <NothingFound query={query} />;

  return (
    <>
      {sections.map(({ type, total, items }) => (
        <section key={type}>
          <div className="section-head">
            <h2>{t.search.tabs[type]}</h2>
            {total > SECTION_PREVIEW && (
              <button
                className="more"
                aria-label={t.search.moreOf(t.search.tabs[type])}
                onClick={() => onPick(type)}
              >
                {t.search.more} ›
              </button>
            )}
          </div>
          <div className={layoutFor(type)}>
            {items.map((item) => (
              <SearchResult key={item.id} type={type} item={item} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** One type, all of it — what a chip other than „Alles" shows. */
function TypedResults({ query, type }: { query: string; type: SearchType }) {
  /**
   * Paged, because search answers ten at a time since February 2026 — and a
   * Hörspiel series has far more than ten albums, so a list that stopped at the
   * first page stopped in the middle of what was being looked for.
   *
   * The type is part of the key, so switching chips starts its own list rather
   * than continuing the previous one.
   */
  const results = usePagedList(['search', query, type], (offset) =>
    searchPage(query, type, offset),
  );

  return (
    <>
      {results.error && (
        <div className="error">{toFriendlyError(results.error).message}</div>
      )}

      {results.isLoading && <div className="spinner">{t.search.searching}</div>}

      <div className={layoutFor(type)}>
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

      {!results.isLoading && results.entries.length === 0 && (
        <NothingFound query={query} />
      )}
    </>
  );
}

function NothingFound({ query }: { query: string }) {
  return (
    <div className="empty">
      <div className="big">
        <Icon name="search-off" size={44} />
      </div>
      <p>{t.search.nothingFound(query)}</p>
    </div>
  );
}

/**
 * One hit, rendered as whatever its type asks for.
 *
 * The casts are the one place this is needed and they are safe by construction:
 * the type decides which bucket is read *and* which renderer is used, so an
 * item can only be the shape its own type asked for. TypeScript cannot tie
 * those two facts together through the paged list, so it is said here once
 * rather than at five call sites.
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
