import { useEffect } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { Artwork } from './components/Artwork';
import { setAuthExpiredHandler } from './api/client';
import { PlayerProvider, usePlayer } from './player/PlayerProvider';
import { NowPlayingBar } from './components/NowPlayingBar';
import { Icon } from './components/Icon';
import { Album } from './screens/Album';
import { Artist } from './screens/Artist';
import { Callback } from './screens/Callback';
import { Help } from './screens/Help';
import { Library } from './screens/Library';
import { Login } from './screens/Login';
import { Account } from './screens/Account';
import { Playlist } from './screens/Playlist';
import { Search } from './screens/Search';
import { Show } from './screens/Show';
import { t } from './strings';

/**
 * The visible half of the runtime no-video guard.
 *
 * It covers everything rather than showing a dismissible banner, and there is
 * no way past it: this only appears when something the app never compiled has
 * put a video surface or a foreign frame in the page, which is precisely the
 * situation where carrying on quietly is the wrong answer. Playback is already
 * stopped by the time this renders.
 */
function GuardGate() {
  const { guardViolation } = usePlayer();
  if (!guardViolation) return null;

  return (
    <div className="guard-gate" role="alertdialog" aria-label={t.guard.title}>
      <Icon name="alert" size={44} />
      <h1>{t.guard.title}</h1>
      <p>{t.guard.body}</p>
      <p>
        <strong>{t.guard.askParent}</strong>
      </p>
      {/* For the grown-up who gets called over, not for the kid. */}
      <code>
        {guardViolation.what}: {guardViolation.detail}
      </code>
    </div>
  );
}

export function App() {
  const { status, markExpired, activeAccount } = useAuth();

  // Let the API client tear down the session when a grant turns out to be dead.
  useEffect(() => setAuthExpiredHandler(markExpired), [markExpired]);

  // The OAuth redirect lands here before any session exists, so this route has
  // to be reachable regardless of auth status.
  if (window.location.pathname === '/callback') {
    return (
      <div className="app">
        <main className="scroll">
          <Routes>
            <Route path="/callback" element={<Callback />} />
          </Routes>
        </main>
      </div>
    );
  }

  if (status === 'checking')
    return <div className="spinner">{t.app.loading}</div>;
  if (status !== 'signed-in') {
    return (
      <div className="app">
        <main className="scroll">
          <Login />
        </main>
      </div>
    );
  }

  return (
    <PlayerProvider>
      <GuardGate />
      <div className="app">
        <main className="scroll">
          <Routes>
            <Route path="/" element={<Search />} />
            <Route path="/library" element={<Library />} />
            <Route path="/album/:id" element={<Album />} />
            <Route path="/artist/:id" element={<Artist />} />
            <Route path="/playlist/:id" element={<Playlist />} />
            <Route path="/show/:id" element={<Show />} />
            <Route path="/hilfe" element={<Help />} />
            <Route path="/konto" element={<Account />} />
            <Route path="*" element={<Search />} />
          </Routes>
        </main>

        <NowPlayingBar />

        <nav className="nav">
          <NavLink to="/" end>
            <Icon name="search" size={25} />
            {t.nav.search}
          </NavLink>
          <NavLink to="/library">
            <Icon name="library" size={25} />
            {t.nav.library}
          </NavLink>
          <NavLink to="/hilfe">
            <Icon name="help" size={25} />
            {t.nav.help}
          </NavLink>
          <NavLink to="/konto">
            {/* The active account's avatar, so who is listening is readable
                from the nav bar without opening anything. */}
            <Artwork
              images={activeAccount?.images}
              alt=""
              fallback="person"
              className="nav-avatar"
            />
            {t.nav.account}
          </NavLink>
        </nav>
      </div>
    </PlayerProvider>
  );
}
