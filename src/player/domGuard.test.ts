// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inspect, inspectExisting, watchDocument } from './domGuard';
import { SDK_ORIGIN } from '../config';

/**
 * This guard is the only thing standing between the app and a video surface it
 * did not compile, because the Web Playback SDK arrives from sdk.scdn.co at
 * runtime and `npm run check:novideo` scans only src/ and dist/. If these tests
 * are wrong, the app's central promise is unenforced and still reports ✓.
 */

function el(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild!;
}

describe('inspect', () => {
  it('catches a video element', () => {
    expect(inspect(el('<video src="x.mp4"></video>'))?.what).toBe('video-element');
  });

  it('allows the SDK frame, which is the one the SDK really creates', () => {
    // Exactly what `npm run spike:player` observed in the page.
    const frame = el(
      `<iframe src="${SDK_ORIGIN}/embedded/index.html" allow="encrypted-media; autoplay"></iframe>`,
    );
    expect(inspect(frame)).toBeNull();
  });

  it('catches an iframe from anywhere else', () => {
    expect(inspect(el('<iframe src="https://example.com/x"></iframe>'))?.what).toBe(
      'foreign-iframe',
    );
  });

  /**
   * Scripts routinely insert the element first and assign src a tick later. If
   * that counted as a violation, the guard would tear playback down the first
   * time a kid picked this phone — the feature would break on its own defence.
   */
  it('treats a frame with no source yet as pending, not foreign', () => {
    expect(inspect(el('<iframe></iframe>'))).toBeNull();
    expect(inspect(el('<iframe src=""></iframe>'))).toBeNull();
    expect(inspect(el('<iframe src="about:blank"></iframe>'))).toBeNull();
  });

  it('catches inline frame content, which needs no src at all', () => {
    expect(
      inspect(el('<iframe srcdoc="<p>anything</p>"></iframe>'))?.what,
    ).toBe('foreign-iframe');
  });

  // The reason the check parses the URL instead of using startsWith/includes.
  it('matches the SDK origin exactly, not as a prefix or a substring', () => {
    for (const src of [
      'https://sdk.scdn.co.attacker.example/x',
      'https://attacker.example/?u=https://sdk.scdn.co',
      'https://attacker.example/https://sdk.scdn.co/embedded/index.html',
      'http://sdk.scdn.co/embedded/index.html',
    ]) {
      expect(inspect(el(`<iframe src="${src}"></iframe>`))?.what).toBe(
        'foreign-iframe',
      );
    }
  });

  it('finds a violation buried inside an inserted subtree', () => {
    // Subtrees arrive as a single mutation record, so a shallow check would
    // miss everything below the top node.
    const tree = el('<div><section><p></p><video></video></section></div>');
    expect(inspect(tree)?.what).toBe('video-element');
  });

  it('passes ordinary markup', () => {
    expect(inspect(el('<div><p>Musik</p><audio></audio></div>'))).toBeNull();
  });

  // <audio> is the whole point of the app and must never be mistaken for a
  // video surface — it cannot render a picture.
  it('never flags an audio element', () => {
    expect(inspect(el('<audio src="x.mp3" controls></audio>'))).toBeNull();
  });
});

describe('inspectExisting', () => {
  it('finds something that was already in the page before watching began', () => {
    const root = el('<div><iframe src="https://ads.example/x"></iframe></div>');
    expect(inspectExisting(root)?.what).toBe('foreign-iframe');
  });

  it('passes a clean page', () => {
    expect(inspectExisting(el('<div><p>nichts</p></div>'))).toBeNull();
  });
});

describe('watchDocument', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root') as HTMLElement;
  });

  it('fires when a video element appears later', async () => {
    const onViolation = vi.fn();
    const stop = watchDocument(onViolation, root);

    root.appendChild(document.createElement('video'));
    await vi.waitFor(() => expect(onViolation).toHaveBeenCalledOnce());
    expect(onViolation.mock.calls[0][0].what).toBe('video-element');

    stop();
  });

  it('stays quiet while only the SDK frame appears', async () => {
    const onViolation = vi.fn();
    const stop = watchDocument(onViolation, root);

    const frame = document.createElement('iframe');
    frame.src = `${SDK_ORIGIN}/embedded/index.html`;
    root.appendChild(frame);

    await new Promise((r) => setTimeout(r, 20));
    expect(onViolation).not.toHaveBeenCalled();

    stop();
  });

  // A frame inserted clean and re-pointed afterwards would slip past a
  // childList-only observer.
  it('fires when an allowed frame is later re-pointed elsewhere', async () => {
    const onViolation = vi.fn();
    const frame = document.createElement('iframe');
    frame.src = `${SDK_ORIGIN}/embedded/index.html`;
    root.appendChild(frame);

    const stop = watchDocument(onViolation, root);
    expect(onViolation).not.toHaveBeenCalled();

    frame.src = 'https://elsewhere.example/x';
    await vi.waitFor(() => expect(onViolation).toHaveBeenCalledOnce());
    expect(onViolation.mock.calls[0][0].what).toBe('foreign-iframe');

    stop();
  });

  // The realistic SDK sequence: insert the frame, then point it somewhere.
  it('lets a pending frame through and judges it once it gets a source', async () => {
    const onViolation = vi.fn();
    const stop = watchDocument(onViolation, root);

    const frame = document.createElement('iframe');
    root.appendChild(frame);
    await new Promise((r) => setTimeout(r, 20));
    expect(onViolation).not.toHaveBeenCalled();

    frame.src = `${SDK_ORIGIN}/embedded/index.html`;
    await new Promise((r) => setTimeout(r, 20));
    expect(onViolation).not.toHaveBeenCalled();

    stop();
  });

  it('catches a pending frame that is then pointed somewhere foreign', async () => {
    const onViolation = vi.fn();
    const stop = watchDocument(onViolation, root);

    const frame = document.createElement('iframe');
    root.appendChild(frame);
    frame.src = 'https://ads.example/x';

    await vi.waitFor(() => expect(onViolation).toHaveBeenCalled());
    expect(onViolation.mock.calls[0][0].what).toBe('foreign-iframe');

    stop();
  });

  it('reports what was already there when watching starts', () => {
    root.appendChild(document.createElement('video'));
    const onViolation = vi.fn();
    const stop = watchDocument(onViolation, root);

    expect(onViolation).toHaveBeenCalledOnce();
    stop();
  });

  it('goes quiet once stopped', async () => {
    const onViolation = vi.fn();
    const stop = watchDocument(onViolation, root);
    stop();

    root.appendChild(document.createElement('video'));
    await new Promise((r) => setTimeout(r, 20));
    expect(onViolation).not.toHaveBeenCalled();
  });
});
