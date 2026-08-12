import { useEffect } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { Artwork } from './components/Artwork';
import { setAuthExpiredHandler } from './api/client';
import { PlayerProvider } from './player/PlayerProvider';
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
