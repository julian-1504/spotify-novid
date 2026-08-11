import { Icon, type IconName } from './Icon';
import type { Image } from '../api/types';

/**
 * Cover art. Deliberately an <img> and nothing else — this app has no video
 * surface anywhere in it.
 */
export function Artwork({
  images,
  alt,
  fallback = 'note',
  className,
}: {
  images?: Image[];
  alt: string;
  fallback?: IconName;
  className?: string;
}) {
  // Spotify returns images largest-first.
  const src = images?.at(-1)?.url ?? images?.[0]?.url;

  if (!src) {
    return (
      <div className={`placeholder ${className ?? ''}`} aria-hidden="true">
        <Icon name={fallback} />
      </div>
    );
  }
  return <img className={className} src={src} alt={alt} loading="lazy" />;
}

/** German date format: Spotify returns ISO, kids read DD.MM.YYYY. */
export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  // Spotify's release_date can be just a year, or a year-month.
  if (!month) return year;
  if (!day) return `${month}.${year}`;
  return `${day}.${month}.${year}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '--:--';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
