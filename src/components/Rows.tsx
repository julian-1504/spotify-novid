import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Artwork, formatDate, formatDuration } from './Artwork';
import { PlayingBars, type IconName } from './Icon';
import { usePlayer } from '../player/PlayerProvider';
import { fetchPlaylistItemCount, playlistItemCount } from '../api/catalog';
import { play, playEpisode } from '../api/player';
import { t } from '../strings';
import type { Album, Artist, Episode, Playlist, Show, Track } from '../api/types';

export function Tile({
  to,
  images,
  title,
  subtitle,
  fallback,
}: {
  to: string;
  images?: Album['images'];
  title: string;
  subtitle?: string;
  fallback?: IconName;
}) {
  return (
    <Link className="tile" to={to}>
      <Artwork images={images} alt="" fallback={fallback} />
      <div className="title">{title}</div>
      {subtitle && <div className="sub">{subtitle}</div>}
    </Link>
  );
}

export function AlbumTile({ album }: { album: Album }) {
  return (
    <Tile
      to={`/album/${album.id}`}
      images={album.images}
      title={album.name}
      subtitle={album.artists.map((a) => a.name).join(', ')}
      fallback="album"
    />
  );
}

export function ArtistTile({ artist }: { artist: Artist }) {
  return (
    <Tile
      to={`/artist/${artist.id}`}
      images={artist.images}
      title={artist.name}
      fallback="artist"
    />
  );
}

/**
 * Playlist summaries from `/me/playlists` and from search carry no count of
 * their own, so the tile fetches one. It is a single small request per playlist
 * the query layer then caches, and only for the summaries that arrived without
 * a count — a playlist whose count is already known costs nothing extra.
 *
 * Until an answer is in, the tile says nothing about its length rather than
 * guessing at zero.
 */
export function PlaylistTile({ playlist }: { playlist: Playlist }) {
  const stated = playlistItemCount(playlist);
  const lookedUp = useQuery({
    queryKey: ['playlist', playlist.id, 'count'],
    queryFn: () => fetchPlaylistItemCount(playlist.id),
    enabled: stated === undefined,
  });
  const count = stated ?? lookedUp.data;

  return (
    <Tile
      to={`/playlist/${playlist.id}`}
      images={playlist.images}
      title={playlist.name}
      subtitle={count === undefined ? undefined : t.detail.songs(count)}
      fallback="playlist"
    />
  );
}

export function ShowTile({ show }: { show: Show }) {
  return (
    <Tile
      to={`/show/${show.id}`}
      images={show.images}
      title={show.name}
      subtitle={show.publisher}
      fallback="podcast"
    />
  );
}

/** A tappable song row. Tapping plays it in the context it belongs to. */
export function TrackRow({
  track,
  index,
  contextUri,
  showArtwork = false,
}: {
  track: Track;
  index?: number;
  contextUri?: string;
  showArtwork?: boolean;
}) {
  const { state, command, selectedDevice } = usePlayer();
  const isCurrent = state?.item?.id === track.id;
  const playable = track.is_playable !== false && Boolean(selectedDevice);

  /*
   * Three ways to start a song, in order of how much is known about it.
   *
   * A position in its context is best — it is what keeps the rest of the album
   * or playlist playing after it. A song from the queue of a playlist this app
   * may not read has no position to give, so it names itself instead and the
   * playlist goes on from there just the same. A song with no context at all —
   * a search result — is played on its own, which is all it can be.
   */
  const onPlay = () =>
    void command((deviceId) => {
      if (contextUri && index !== undefined)
        return play({ deviceId, contextUri, offsetPosition: index });
      if (contextUri) return play({ deviceId, contextUri, offsetUri: track.uri });
      return play({ deviceId, uris: [track.uri] });
    });

  return (
    <button
      className={`row ${isCurrent ? 'playing' : ''}`}
      onClick={onPlay}
      disabled={!playable}
    >
      {showArtwork ? (
        <Artwork images={track.album?.images} alt="" fallback="note" />
      ) : (
        <span className="placeholder index" aria-hidden="true">
          {isCurrent ? <PlayingBars /> : (index ?? 0) + 1}
        </span>
      )}
      <span className="body">
        <span className="name">
          {track.name}
          {track.explicit && <span className="badge">E</span>}
        </span>
        <span className="meta">
          {track.artists.map((a) => a.name).join(', ')} ·{' '}
          {formatDuration(track.duration_ms)}
        </span>
      </span>
    </button>
  );
}

/**
 * A podcast episode row. Episodes need their own play path because the API
 * rejects episode URIs as a playback *context*.
 */
export function EpisodeRow({
  episode,
  showUri,
}: {
  episode: Episode;
  showUri?: string;
}) {
  const { state, command, selectedDevice } = usePlayer();
  const isCurrent = state?.item?.id === episode.id;
  const resume = episode.resume_point;
  const resumeMs =
    resume && !resume.fully_played && resume.resume_position_ms > 0
      ? resume.resume_position_ms
      : undefined;

  const onPlay = () =>
    void command((deviceId) =>
      playEpisode(episode.uri, showUri, deviceId, resumeMs),
    );

  return (
    <button
      className={`row ${isCurrent ? 'playing' : ''}`}
      onClick={onPlay}
      disabled={episode.is_playable === false || !selectedDevice}
    >
      <Artwork images={episode.images} alt="" fallback="podcast" />
      <span className="body">
        <span className="name">{episode.name}</span>
        <span className="meta">
          {formatDate(episode.release_date)} ·{' '}
          {formatDuration(episode.duration_ms)}
          {resume?.fully_played && ` · ${t.episode.played}`}
          {resumeMs && ` · ${t.episode.resumeAt(formatDuration(resumeMs))}`}
        </span>
      </span>
    </button>
  );
}
