import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HELP_TOPICS, HELP_TOPIC_IDS, findTopic } from './topics';

describe('help topics', () => {
  it('has a topic for every declared id, and no extras', () => {
    expect(HELP_TOPICS.map((topic) => topic.id).sort()).toEqual(
      [...HELP_TOPIC_IDS].sort(),
    );
  });

  it('has unique ids', () => {
    const ids = HELP_TOPICS.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every topic a title, an intro and at least two steps', () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.intro.length).toBeGreaterThan(0);
      // One step is a sentence, not a procedure — if a topic has only one, it
      // probably belongs in the intro instead.
      expect(topic.steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('resolves known ids and rejects unknown ones', () => {
    expect(findTopic('keine-box')?.icon).toBe('speaker-off');
    expect(findTopic('gibt-es-nicht')).toBeUndefined();
    expect(findTopic(null)).toBeUndefined();
  });
});

/**
 * The error states link to help with `?thema=<id>`. If a topic is ever renamed,
 * those links would silently land on the help page with nothing expanded — a kid
 * following a "Was kann ich tun?" button would get a wall of text instead of the
 * answer. This walks the source for such links and checks each id exists.
 */
describe('help deep links', () => {
  const srcDir = join(import.meta.dirname, '..');

  function* sourceFiles(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) yield* sourceFiles(path);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts'))
        yield path;
    }
  }

  it('only links to topics that exist', () => {
    const linked: { file: string; id: string }[] = [];

    for (const file of sourceFiles(srcDir)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/[?&]thema=([a-z0-9-]+)/g)) {
        linked.push({ file, id: match[1] });
      }
    }

    // Guard against the check silently passing because the link format changed.
    expect(linked.length).toBeGreaterThan(0);

    for (const { file, id } of linked) {
      expect(findTopic(id), `${file} links to unknown topic "${id}"`).toBeDefined();
    }
  });
});
