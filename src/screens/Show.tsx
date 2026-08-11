import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getShow, getShowEpisodes } from '../api/catalog';
import { Artwork } from '../components/Artwork';
import { EpisodeRow } from '../components/Rows';
import { t } from '../strings';

/**
 * Video podcasts are browsable here and that is fine: playback goes to a
 * speaker, which has no screen, so only the audio track is ever heard.
 */
export function Show() {
  const { id = '' } = useParams();

  const show = useQuery({ queryKey: ['show', id], queryFn: () => getShow(id) });
  const episodes = useQuery({
    queryKey: ['show', id, 'episodes'],
    queryFn: () => getShowEpisodes(id),
  });

  if (show.isLoading) return <div className="spinner">{t.app.loading}</div>;
  if (!show.data) return null;

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
      {episodes.isLoading && <div className="spinner">{t.app.loading}</div>}
      <div className="rows">
        {episodes.data?.items.filter(Boolean).map((episode) => (
          <EpisodeRow key={episode.id} episode={episode} showUri={show.data.uri} />
        ))}
      </div>
    </div>
  );
}
