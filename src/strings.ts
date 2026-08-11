/**
 * Every user-facing string, in German.
 *
 * Deliberately a plain object rather than an i18n framework: there is exactly
 * one target language, so react-i18next would be overhead. Keeping the text in
 * one file means wording stays consistent, a parent can reword anything for
 * their own kids in a single place, and stray English is easy to spot.
 *
 * Written for roughly 10–13 year olds: short sentences, plain words, and a
 * speaker is a "Box" because that is what kids actually call it.
 *
 * Code comments and identifiers stay English — only what a kid reads is German.
 */

export const t = {
  app: {
    name: 'Musik & Podcasts',
    loading: 'Lädt …',
  },

  nav: {
    search: 'Suchen',
    library: 'Deine Sachen',
    help: 'Hilfe',
  },

  login: {
    titleFresh: 'Musik & Podcasts',
    titleExpired: 'Frag bitte einen Erwachsenen',
    introFresh: 'Melde dich mit Spotify an, um Musik auf der Box zu hören.',
    introExpired:
      'Spotify möchte, dass sich die App neu anmeldet. Das kann nur ein Erwachsener machen, weil dafür das Spotify-Passwort nötig ist.',
    buttonFresh: 'Mit Spotify anmelden',
    buttonExpired: 'Neu anmelden',
    signingIn: 'Anmeldung läuft …',
    cancelled: 'Die Anmeldung wurde abgebrochen.',
    incomplete: 'Die Anmeldung hat nicht geklappt. Bitte noch einmal versuchen.',
    unverified:
      'Die Anmeldung konnte nicht geprüft werden. Bitte noch einmal versuchen.',
    retry: 'Nochmal versuchen',
    notConfiguredTitle: 'Noch nicht eingerichtet.',
  },

  search: {
    placeholder: 'Was möchtest du hören?',
    label: 'Suchen',
    hint: 'Suche nach einem Lied, Album, Künstler oder Podcast.',
    searching: 'Sucht …',
    nothingFound: (query: string) => `Nichts gefunden für „${query}“.`,
    tabs: {
      track: 'Lieder',
      album: 'Alben',
      artist: 'Künstler',
      playlist: 'Playlists',
      show: 'Podcasts',
    },
  },

  library: {
    title: 'Deine Sachen',
    empty: 'Hier ist noch nichts. Suche etwas, das du magst.',
    playlists: 'Playlists',
    albums: 'Alben',
    shows: 'Podcasts',
  },

  detail: {
    play: 'Abspielen',
    albums: 'Alben',
    episodes: 'Folgen',
    songs: (n: number) => (n === 1 ? '1 Lied' : `${n} Lieder`),
    episodeCount: (n: number) => (n === 1 ? '1 Folge' : `${n} Folgen`),
  },

  episode: {
    played: 'schon gehört',
    resumeAt: (time: string) => `weiter bei ${time}`,
  },

  player: {
    nothingPlaying: 'Es läuft gerade nichts',
    pickSpeaker: 'Wähle unten eine Box aus',
    noSpeakerFound: 'Keine Box gefunden',
    tapToPick: 'Tippe hier, um eine Box zu wählen',
    play: 'Abspielen',
    pause: 'Pause',
    next: 'Weiter',
    previous: 'Zurück',
    position: 'Position',
    volume: 'Lautstärke',
  },

  devices: {
    title: 'Box auswählen',
    subtitle: 'Es können nur Boxen benutzt werden, keine Fernseher.',
    searching: 'Sucht nach Boxen …',
    playingHere: 'Läuft hier',
    restricted: 'lässt sich nicht steuern',
    close: 'Schließen',
    noneFoundTitle: 'Keine Box gefunden.',
    noneFoundBody: 'Ist die Box eingeschaltet? Bist du im WLAN zu Hause?',
    noneUsableTitle: 'Keine Box zum Abspielen da.',
    noneUsableBody: 'Das hier wurde gefunden, geht aber nicht:',
    helpLink: 'Was kann ich tun?',
    // Reasons a device is hidden, shown after the device name.
    reasonBlocked: 'kann Videos zeigen',
    reasonNoId: 'lässt sich nicht fernsteuern',
    reasonNotPinned: 'steht nicht auf der Liste der erlaubten Boxen',
    reasonTypeNotAllowed: 'ist keine bekannte Box',
  },

  help: {
    title: 'Hilfe',
    intro: 'Etwas geht nicht? Hier steht, was du selbst machen kannst.',
    statusTitle: 'Wie sieht es gerade aus?',
    statusInternet: 'Internet',
    statusInternetOk: 'da',
    statusInternetBad: 'kein Internet',
    statusSignedIn: 'Angemeldet',
    statusSignedInOk: 'ja',
    statusSignedInBad: 'nein',
    statusSpeaker: 'Box',
    statusSpeakerNone: 'keine gefunden',
    statusSpeakerHidden: 'gefunden, aber nicht benutzbar',
    statusSpeakerNotPicked: 'noch keine ausgewählt',
    searchAgain: 'Nochmal suchen',
    searchingAgain: 'Sucht …',
    askParent: 'Das kann nur ein Erwachsener machen.',
    stepsTitle: 'So gehst du vor:',
  },

  errors: {
    generic: 'Etwas hat nicht geklappt. Versuche es nochmal.',
    offline: 'Du bist gerade nicht im Internet.',
    noDevice: 'Es ist keine Box ausgewählt.',
    restricted: 'Das geht bei dieser Box gerade nicht.',
    premium: 'Dafür wird Spotify Premium gebraucht.',
    helpLink: 'Hilfe dazu',
  },
} as const;
