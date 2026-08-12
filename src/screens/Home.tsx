import { RecentlyPlayed } from '../components/RecentlyPlayed';
import { YourStuff } from '../components/YourStuff';
import { t } from '../strings';

/**
 * Where the app opens.
 *
 * It used to open on an empty search box, which meant every session began by
 * typing — the wrong ask of a kid who mostly wants yesterday's podcast again.
 * So the covers that were actually played come first, and everything saved
 * follows underneath, both under the one heading they already answer to.
 */
export function Home() {
  return (
    <div className="content">
      <h1>{t.library.title}</h1>
      <RecentlyPlayed />
      <YourStuff />
    </div>
  );
}
