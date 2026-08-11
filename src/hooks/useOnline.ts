import { useEffect, useState } from 'react';

/**
 * Whether the browser thinks it has a network connection.
 *
 * `navigator.onLine` is a coarse signal — it only knows about the local link,
 * not whether Spotify is reachable — but for "is the Wi-Fi off?", which is the
 * question a kid needs answered, it is exactly right.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
