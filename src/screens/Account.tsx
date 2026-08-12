import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Artwork } from '../components/Artwork';
import { Icon } from '../components/Icon';
import { t } from '../strings';
import type { Account as AccountRow } from '../auth/accounts';

/**
 * The account switcher.
 *
 * Several people can be signed in at once — each account keeps its own refresh
 * token — so switching is a local pointer move: no redirect, no password, no
 * network beyond reloading the new account's library. That is why tapping a row
 * just switches, with no "are you sure": it is instant and immediately undone by
 * tapping back.
 *
 * Adding and removing are the two that cost something. Adding goes out to
 * Spotify and needs the new account's password anyway; removing asks first.
 */
export function Account() {
  const { accounts, activeAccount, switchAccount, removeAccount, addAccount } =
    useAuth();
  const [confirming, setConfirming] = useState<AccountRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    try {
      await addAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (confirming) {
    return (
      <div className="content">
        <div className="empty">
          <div className="big">
            <Icon name="logout" size={56} />
          </div>
          <h1>{t.account.removeTitle(displayName(confirming))}</h1>
          <p>{t.account.removeIntro}</p>
          <div className="actions">
            <button
              className="btn danger"
              onClick={() => {
                removeAccount(confirming.id);
                setConfirming(null);
              }}
            >
              {t.account.removeConfirm}
            </button>
            <button className="btn secondary" onClick={() => setConfirming(null)}>
              {t.account.cancel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <h1>{t.account.title}</h1>
      <p className="muted">{t.account.intro}</p>

      {error && <div className="error">{error}</div>}

      <div className="accounts">
        {accounts.map((account) => {
          const isActive = account.id === activeAccount?.id;
          return (
            <div
              className={`account ${isActive ? 'active' : ''} ${
                account.needsReauth ? 'stale' : ''
              }`}
              key={account.id}
            >
              <button
                className="account-pick"
                aria-current={isActive}
                onClick={() => switchAccount(account.id)}
              >
                <Artwork
                  images={account.images}
                  alt=""
                  fallback="person"
                  className="avatar"
                />
                <span className="account-name">{displayName(account)}</span>
                <span className="account-state">
                  {account.needsReauth
                    ? t.account.needsReauth
                    : isActive
                      ? t.account.active
                      : ''}
                </span>
                {isActive && !account.needsReauth && (
                  <span className="account-tick">
                    <Icon name="check" size={20} />
                  </span>
                )}
              </button>

              {account.needsReauth && (
                <button className="btn secondary" onClick={() => void add()}>
                  {t.account.reauth}
                </button>
              )}

              <button
                className="account-remove"
                aria-label={t.account.remove}
                onClick={() => setConfirming(account)}
              >
                <Icon name="close" size={20} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="actions">
        <button className="btn with-icon" onClick={() => void add()}>
          <Icon name="plus" size={20} />
          {t.account.add}
        </button>
      </div>
      <p className="muted small">{t.account.addHint}</p>
    </div>
  );
}

/** Migrated rows and offline sign-ins have no name until `/me` backfills one. */
const displayName = (account: AccountRow): string =>
  account.name || t.account.unnamed;
