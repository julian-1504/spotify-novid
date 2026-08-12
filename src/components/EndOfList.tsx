import { useEffect, useRef } from 'react';

/**
 * The end of a long list, watched so that reaching it loads more.
 *
 * A „Mehr laden" button would be less code, but it puts the rest of a playlist
 * behind something a kid has to notice and then tap another five times to
 * reach song 300. Scrolling is the gesture they already make, so that is the
 * one that has to work.
 *
 * The margin means the next page is usually already in by the time the list
 * runs out, so the scroll never visibly stops.
 *
 * `onReach` must keep a stable identity across renders — react-query's
 * `fetchNextPage` does — or the observer is torn down and rebuilt every time
 * the screen renders.
 */
export function EndOfList({
  onReach,
  active,
}: {
  onReach: () => void;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    // Inactive while a page is already on its way, so one long scroll asks for
    // the next page once rather than once per frame.
    if (!active || !el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReach();
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, onReach]);

  return <div ref={ref} className="list-end" aria-hidden="true" />;
}
