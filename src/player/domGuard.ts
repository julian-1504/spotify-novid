/**
 * The no-video check that runs in the browser instead of at build time.
 *
 * `npm run check:novideo` scans src/ and dist/, which covers everything the app
 * ships. It cannot cover the Web Playback SDK: that is fetched from
 * sdk.scdn.co at runtime and injects its own cross-origin iframe, so it appears
 * in neither directory. The static check would keep printing ✓ while a frame
 * this project never compiled sat in the page — and Spotify can change what is
 * inside it without anyone here rebuilding anything.
 *
 * So the guarantee gets a second half, enforced live: nothing may put a video
 * element in our document, and the only iframe allowed is the SDK's.
 *
 * The limit, which cannot be engineered away and should not be papered over:
 * same-origin policy means the *inside* of Spotify's frame is not inspectable.
 * This guarantees our document, not theirs. What makes that tolerable is that a
 * speaker has no screen — the third layer in the README, and the only one that
 * holds no matter what any script does.
 *
 * Calibrated against `npm run spike:player`, which observed exactly one frame
 * (https://sdk.scdn.co/embedded/index.html, allow="encrypted-media; autoplay")
 * and zero video elements.
 */

import { SDK_ORIGIN } from '../config';

export interface Violation {
  what: 'video-element' | 'foreign-iframe';
  detail: string;
}

/**
 * Exact origin match, never a substring test: `startsWith` would accept
 * `https://sdk.scdn.co.attacker.example`, and `includes` would accept anything
 * with the string buried in a path or query.
 */
function isSdkFrame(src: string): boolean {
  if (!src) return false;
  try {
    return new URL(src, window.location.href).origin === SDK_ORIGIN;
  } catch {
    return false;
  }
}

/** The violation in this element or its descendants, or null if it is clean. */
export function inspect(node: Node): Violation | null {
  if (!(node instanceof Element)) return null;

  const tag = node.tagName.toLowerCase();

  if (tag === 'video') {
    return { what: 'video-element', detail: node.outerHTML.slice(0, 120) };
  }
  if (tag === 'iframe') {
    // Inline content is never legitimate here and can render immediately, so it
    // is judged before the src is considered at all.
    if (node.hasAttribute('srcdoc')) {
      return { what: 'foreign-iframe', detail: 'srcdoc' };
    }

    const src = node.getAttribute('src');

    // A frame with no source yet is pending, not foreign. Scripts commonly
    // insert the element first and assign src a tick later — the SDK may well
    // do exactly that, and condemning it on insertion would tear playback down
    // the first time a kid picks this phone. It cannot display anything until
    // it has a source, and the observer re-checks it the moment one is set.
    if (src === null || src === '' || src === 'about:blank') return null;

    if (!isSdkFrame(src)) {
      return { what: 'foreign-iframe', detail: src };
    }
  }

  // An inserted subtree arrives as one mutation record, so the offending
  // element can be buried anywhere inside it.
  const nested = node.querySelector('video, iframe');
  if (nested) return inspect(nested);

  return null;
}

/** Scans a document that may already contain something, before observing it. */
export function inspectExisting(root: ParentNode): Violation | null {
  for (const el of root.querySelectorAll('video, iframe')) {
    const found = inspect(el);
    if (found) return found;
  }
  return null;
}

/**
 * Watches for the rest of the session. Returns a stop function.
 *
 * `onViolation` is expected to be loud — tearing playback down and telling the
 * user — rather than a console warning. This firing means the app's central
 * promise is no longer being kept, which is not something to log and continue
 * through.
 */
export function watchDocument(
  onViolation: (violation: Violation) => void,
  root: HTMLElement = document.documentElement,
): () => void {
  const existing = inspectExisting(root);
  if (existing) onViolation(existing);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        const found = inspect(added);
        if (found) {
          onViolation(found);
          return;
        }
      }
      // A frame that was clean when inserted and had its src swapped afterwards
      // would otherwise never be re-examined.
      if (record.type === 'attributes' && record.target instanceof Element) {
        const found = inspect(record.target);
        if (found) {
          onViolation(found);
          return;
        }
      }
    }
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcdoc'],
  });

  return () => observer.disconnect();
}
