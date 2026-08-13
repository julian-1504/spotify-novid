import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getShow, getShowEpisodes } from '../api/catalog';
import { Artwork } from '../components/Artwork';
import { EndOfList } from '../components/EndOfList';
import { ListStatus } from '../components/ListStatus';
import { EpisodeRow } from '../components/Rows';
import { usePagedList } from '../hooks/usePagedList';
import { t } from '../strings';

/**
 * Video podcasts are browsable here and that is fine: playback goes to a
 * speaker, which has no screen, so only the audio track is ever heard.
 */
export function Show() {
  const { id = '' } = useParams();

  const show = useQuery({ queryKey: ['show', id], queryFn: () => getShow(id) });
  // Long-running shows are where the 50-per-page ceiling bites hardest: the
  // first page is the newest episodes, and everything older simply was not
  // there before.
  const episodes = usePagedList(['show', id, 'episodes'], (offset) =>
    getShowEpisodes(id, offset),
  );

  if (show.isLoading) return <div className="spinner">{t.app.loading}</div>;
  if (!show.data) return null;

  const rows = episodes.entries.filter(({ item }) => Boolean(item));

  return (
    <div className="content">
      <div className="detail-head">
        <Artwork images={show.data.images} alt="" fallback="podcast" />
        <div>
          <h1>{show.data.name}</h1>
          <p className="muted">
            {show.data.publisher}
            <br />
            {t.detail.episodeCount(show.data.total_episodes)}
          </p>
        </div>
      </div>

      <h2>{t.detail.episodes}</h2>
      <div className="rows">
        {rows.map(({ item, index }) => (
          <EpisodeRow
            key={`${item.id}-${index}`}
            episode={item}
            showUri={show.data.uri}
          />
        ))}
      </div>
      {/* Counting the rows that survived the filter, not the entries that
          arrived: a page of nothing but withdrawn episodes draws nothing, and
          calling that a full list would be the same lie as calling it empty. */}
      <ListStatus
        list={episodes}
        count={rows.length}
        icon="podcast"
        empty={t.detail.emptyShow}
      />

      {episodes.isFetchingNextPage && (
        <div className="spinner">{t.app.loading}</div>
      )}
      <EndOfList
        onReach={episodes.fetchNextPage}
        active={episodes.hasNextPage && !episodes.isFetchingNextPage}
      />
    </div>
  );
}
