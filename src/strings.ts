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
    // „Start", not „Home": every other label here is German, and one English
    // word in the bar is the one a kid would stumble over. „Startseite" does
    // not fit under an icon across four tabs.
    home: 'Start',
    search: 'Suchen',
    help: 'Hilfe',
    account: 'Konto',
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

  /**
   * The account switcher. Several people can be signed in at once and tapping a
   * name swaps the whole app over, so the wording is about *who is listening*
   * rather than about logins — that is the way a kid thinks about it.
   *
   * Removing is the one destructive action here and it is the only one that
   * asks first: it is what could leave somebody needing a password they do not
   * have.
   */
  account: {
    title: 'Wer hört gerade?',
    intro: 'Tippe auf einen Namen, um zu wechseln.',
    active: 'gerade dran',
    unnamed: 'Spotify-Konto',
    needsReauth: 'muss neu angemeldet werden',
    reauth: 'Neu anmelden',
    add: 'Konto hinzufügen',
    addHint:
      'Dafür braucht ihr das Spotify-Passwort vom neuen Konto. Das macht am besten ein Erwachsener.',
    remove: 'Konto entfernen',
    removeTitle: (name: string) => `„${name}“ wirklich entfernen?`,
    removeIntro:
      'Dieses Konto verschwindet dann aus der Liste. Zum Zurückholen ist wieder das Spotify-Passwort nötig.',
    removeConfirm: 'Ja, entfernen',
    cancel: 'Nein, zurück',
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

  home: {
    recent: 'Zuletzt gehört',
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
    // The chosen box has gone quiet on Spotify. Naming it beats a generic
    // "keine Box": the kid knows which one to go and switch on.
    deviceOff: (name: string) => `${name} ist gerade aus`,
    play: 'Abspielen',
    pause: 'Pause',
    next: 'Weiter',
    previous: 'Zurück',
    position: 'Position',
    volume: 'Lautstärke',

    // This phone as the player. Podcasts do not play on every box, but they
    // always play here — and from here they reach the box over Bluetooth.
    thisPhone: 'Dieses Handy',
    thisPhoneHint: 'Podcasts gehen hier immer',
    startingPhone: 'Handy wird vorbereitet …',
    // Shown in the now-playing bar while the phone is the target, because the
    // sound comes out of the phone unless it is paired with a box.
    phoneBluetoothHint: 'Über Bluetooth mit der Box verbinden',
    /*
     * Which of these is shown, and whether „Neu anmelden" is offered with it,
     * is decided in player/selfFailure.ts — this is only the wording.
     */
    selfErrors: {
      // Deliberately not "die Anmeldung ist abgelaufen": usually it has not.
      // The app is asking for a permission it was never granted, and saying
      // otherwise sends a grown-up looking for a problem that is not there.
      auth: 'Dafür muss sich die App neu bei Spotify anmelden. Das kann nur ein Erwachsener, weil dafür das Spotify-Passwort nötig ist.',
      premium: 'Dieses Konto ist kein Premium-Konto. Frag bitte einen Erwachsenen.',
      offline: 'Das hat nicht geklappt. Bist du im WLAN?',
      unsupported: 'Dieses Handy kann leider nicht selbst abspielen.',
    },
  },

  /**
   * Shown when the runtime no-video guard trips. Deliberately a full stop
   * rather than a warning: the promise the app is built on is no longer being
   * kept, so it stops instead of carrying on quietly.
   */
  guard: {
    title: 'Die App wurde angehalten',
    body: 'Auf dieser Seite ist etwas aufgetaucht, das hier nicht hingehört. Zur Sicherheit wurde die Wiedergabe gestoppt.',
    askParent: 'Bitte zeig das einem Erwachsenen.',
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
    // Same wording as the now-playing bar uses, on purpose: one state, one
    // sentence, wherever a kid happens to be looking.
    statusSpeakerOff: (name: string) => `${name} ist gerade aus`,
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
