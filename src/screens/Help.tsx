import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HELP_TOPICS, type HelpTopicId } from '../help/topics';
import { StatusPanel } from '../components/StatusPanel';
import { Icon } from '../components/Icon';
import { t } from '../strings';

/**
 * Help screen: what is broken right now (StatusPanel), then what to do about it.
 *
 * Topics are collapsed by default so the page is scannable rather than a wall of
 * text. Arriving via `?thema=<id>` — which is how the error states link here —
 * opens that topic and scrolls to it, so a kid lands on the answer rather than
 * on a list they have to search.
 */
export function Help() {
  const [params] = useSearchParams();
  const deepLinked = params.get('thema');
  const [open, setOpen] = useState<HelpTopicId | null>(
    () => (deepLinked as HelpTopicId | null) ?? null,
  );
  const openRef = useRef<HTMLDivElement | null>(null);

  // Follow a deep link that arrives while the screen is already mounted.
  useEffect(() => {
    if (deepLinked) setOpen(deepLinked as HelpTopicId);
  }, [deepLinked]);

  useEffect(() => {
    if (deepLinked && openRef.current) {
      openRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [deepLinked]);

  return (
    <div className="content">
      <h1>{t.help.title}</h1>
      <p className="muted">{t.help.intro}</p>

      <StatusPanel />

      <div className="topics">
        {HELP_TOPICS.map((topic) => {
          const isOpen = open === topic.id;
          return (
            <div
              className="topic"
              key={topic.id}
              ref={isOpen && deepLinked === topic.id ? openRef : undefined}
            >
              <button
                className="topic-head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : topic.id)}
              >
                <span className="topic-icon">
                  <Icon name={topic.icon} size={24} />
                </span>
                <span className="topic-title">{topic.title}</span>
                <span className="topic-chevron">
                  <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={20} />
                </span>
              </button>

              {isOpen && (
                <div className="topic-body">
                  <p>{topic.intro}</p>
                  <p className="muted">{t.help.stepsTitle}</p>
                  <ol>
                    {topic.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {topic.askParent && (
                    <p className="ask-parent">
                      <Icon name="person" size={20} />
                      {t.help.askParent}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
