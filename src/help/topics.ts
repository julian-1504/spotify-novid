/**
 * Help content as data.
 *
 * Kept separate from the screen that renders it so the wording can be edited
 * without touching JSX, and so tests can assert things about it (unique ids, no
 * dead deep links).
 *
 * Written for ~10–13 year olds: each step is one action, in order, in the words
 * a kid would use. Where a fix genuinely needs a grown-up, the topic says so
 * instead of sending them in circles.
 */

import type { IconName } from '../components/Icon';

export const HELP_TOPIC_IDS = [
  'keine-box',
  'kein-ton',
  'handy-abspielen',
  'bluetooth',
  'anmelden',
  'kein-internet',
  'suche-leer',
  'musik-stoppt',
  'keine-videos',
  'app-klemmt',
] as const;

export type HelpTopicId = (typeof HELP_TOPIC_IDS)[number];

export interface HelpTopic {
  id: HelpTopicId;
  icon: IconName;
  title: string;
  /** One short sentence on what is going on, before the steps. */
  intro: string;
  steps: string[];
  /** Shows the "ask a grown-up" note at the end of the steps. */
  askParent?: boolean;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'keine-box',
    icon: 'speaker-off',
    title: 'Es wird keine Box gefunden',
    intro:
      'Die App kann nur Boxen benutzen, die gerade an sind und im gleichen WLAN hängen.',
    steps: [
      'Schau nach, ob die Box eingeschaltet ist.',
      'Prüfe, ob dein Handy im WLAN zu Hause ist und nicht über Mobilfunk.',
      'Warte kurz und tippe oben auf „Nochmal suchen“.',
      'Steht immer noch nichts da? Dann muss ein Erwachsener helfen.',
    ],
    // The real fix is registering the speaker from the official Spotify app —
    // the app we are keeping kids away from. So the trail stops here on purpose.
    askParent: true,
  },
  {
    id: 'kein-ton',
    icon: 'volume-low',
    title: 'Es kommt kein Ton',
    intro: 'Meistens ist keine Box ausgewählt oder sie ist ganz leise gestellt.',
    steps: [
      'Tippe unten auf die Zeile mit dem Lautsprecher und wähle deine Box aus.',
      'Schiebe den Lautstärke-Regler nach rechts.',
      'Prüfe auch den Lautstärke-Knopf an der Box selbst.',
      'Hört gerade jemand anders auf derselben Box? Dann wartet ihr euch gegenseitig aus.',
      // Podcasts are the odd one out: Spotify counts them as "mixed media", so
      // some boxes take the command, report that they are playing and stay
      // silent anyway. Nothing is broken and there is nothing to restart.
      //
      // This used to end at "try another box", which for a kid whose room has
      // an Echo meant "no podcasts at all". Playing on the phone works on every
      // box, because the box is then only a Bluetooth speaker and Spotify never
      // sees it. Music is still the giveaway, because music plays everywhere.
      'Ein Podcast bleibt still, obwohl oben ein Titel steht? Podcasts gehen leider nicht auf jeder Box.',
      'Zum Testen kannst du ein Lied anmachen: Läuft das Lied, ist die Box in Ordnung.',
      'Wähle unten bei der Box „Dieses Handy“ aus. Damit läuft der Podcast immer.',
    ],
  },
  {
    id: 'handy-abspielen',
    icon: 'phone',
    title: 'Auf dem Handy abspielen',
    intro:
      'Dein Handy kann selbst die „Box“ sein. Das ist der sichere Weg für Podcasts, denn die gehen nicht auf jeder Box.',
    steps: [
      'Tippe unten auf die Zeile mit dem Lautsprecher.',
      'Wähle ganz oben „Dieses Handy“ aus.',
      'Jetzt kommt der Ton aus dem Handy. Damit ihn alle im Zimmer hören, verbinde das Handy per Bluetooth mit der Box.',
      'Der Ton geht weiter, wenn du das Handy sperrst. Zum Pausieren tippst du auf dem Sperrbildschirm.',
    ],
  },
  {
    id: 'bluetooth',
    icon: 'speaker',
    title: 'Handy und Box per Bluetooth verbinden',
    intro:
      'Wenn „Dieses Handy“ abspielt, kommt der Ton erst mal nur aus dem Handy. Über Bluetooth hört ihr ihn auf der Box.',
    steps: [
      'Schalte die Box ein.',
      'Öffne am Handy die Einstellungen und dort Bluetooth.',
      'Suche in der Liste den Namen deiner Box und tippe ihn an.',
      'Das musst du nur einmal machen. Danach verbindet sich das Handy von allein, sobald die Box an ist.',
    ],
    // Putting a box into pairing mode differs per box and sometimes needs a
    // button held down for several seconds — worth an adult the first time.
    askParent: true,
  },
  {
    id: 'anmelden',
    icon: 'key',
    title: 'Da steht „Frag bitte einen Erwachsenen“',
    intro:
      'Spotify meldet die App etwa alle sechs Monate ab. Das ist normal und nicht kaputt.',
    steps: [
      'Hol einen Erwachsenen dazu.',
      'Er oder sie tippt auf „Neu anmelden“ und gibt das Spotify-Passwort ein.',
      'Danach geht alles wieder wie vorher.',
    ],
    askParent: true,
  },
  {
    id: 'kein-internet',
    icon: 'wifi',
    title: 'Nichts lädt',
    intro: 'Ohne Internet kann die App keine Musik finden.',
    steps: [
      'Schau oben in der Hilfe nach, ob bei „Internet“ ein rotes Kreuz steht.',
      'Schalte WLAN aus und wieder an.',
      'Gehe näher an den Router.',
    ],
  },
  {
    id: 'suche-leer',
    icon: 'search',
    title: 'Die Suche findet nichts',
    intro: 'Die Suche zeigt immer nur eine Sorte auf einmal.',
    steps: [
      'Schau, ob oben der richtige Knopf grün ist: Lieder, Alben, Künstler, Playlists oder Podcasts.',
      'Prüfe, ob du dich vertippt hast.',
      'Versuche weniger Wörter, zum Beispiel nur den Namen der Band.',
    ],
  },
  {
    id: 'musik-stoppt',
    icon: 'pause',
    title: 'Die Musik stoppt oder springt weiter',
    intro:
      'Alle in der Familie benutzen dieselbe Box. Wer zuletzt auf Play tippt, gewinnt.',
    steps: [
      'Frag kurz nach, ob jemand anders gerade Musik anmacht.',
      'Sucht euch verschiedene Boxen aus, dann stört ihr euch nicht.',
      'Tippe wieder auf den grünen Play-Knopf, um weiterzuhören.',
    ],
  },
  {
    id: 'keine-videos',
    icon: 'headphones',
    title: 'Warum sehe ich keine Videos?',
    intro:
      'Das ist Absicht. Diese App ist nur zum Hören gemacht — sie ist nicht kaputt.',
    steps: [
      'Podcasts, die es auch als Video gibt, laufen hier nur als Ton.',
      'Die Musik läuft über die Box, und eine Box hat keinen Bildschirm.',
      'Du musst also nichts reparieren. So soll es sein.',
    ],
  },
  {
    id: 'app-klemmt',
    icon: 'refresh',
    title: 'Die App hängt',
    intro: 'Manchmal hilft einfach ein Neustart.',
    steps: [
      'Wische auf der Seite von oben nach unten, um neu zu laden.',
      'Hilft das nicht, schließe die App ganz und öffne sie neu.',
      'Danach musst du dich nicht neu anmelden.',
    ],
  },
];

export function findTopic(id: string | null): HelpTopic | undefined {
  return HELP_TOPICS.find((topic) => topic.id === id);
}
