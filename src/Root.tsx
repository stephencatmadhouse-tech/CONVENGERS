/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ROOT — one application, one sign-in, role-based routing:
 *   guest     → sign-in landing page
 *   pending   → awaiting-approval screen
 *   external  → Executive & Client Portal (reads only the published `portal` collection)
 *   internal  → Project Management System (Command Center); internal users can
 *               preview the client portal at #/portal
 *
 * Routing decides which interface is rendered. The security boundary is
 * server-side: firestore.rules / storage.rules only let external roles read
 * the `portal` collection, so internal data cannot be reached by URL edits or
 * direct API calls.
 */

import React, { useEffect, useState } from 'react';
import App from './App.tsx';
import { authService } from './firebase/authService.ts';
import { audienceOf, ROLE_LABEL } from './auth/roles.ts';
import { User } from './types/index.ts';
import { AuthModal } from './components/Modals.tsx';
import { PortalApp } from './portal/PortalApp.tsx';
import { LOGO_SVG } from './constants/assets.ts';
import './portal/portal.css';

function useHash() {
  const [hash, setHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''));
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function Root() {
  const [user, setUser] = useState<User>(() => authService.getCurrentUser());
  const [ready, setReady] = useState<boolean>(() => authService.isReady());
  const hash = useHash();

  useEffect(() => {
    const unsub = authService.onUserChange((u) => {
      setUser(u);
      setReady(authService.isReady());
    });
    // If Firebase cannot be reached, stop waiting and show the sign-in page.
    const t = setTimeout(() => setReady(true), 8000);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  const audience = audienceOf(user);

  // Keep URLs consistent with the interface the user is allowed to use
  useEffect(() => {
    if (!ready) return;
    if (audience === 'external' && !hash.startsWith('#/portal')) {
      window.location.replace('#/portal/overview');
    }
  }, [ready, audience, hash]);

  if (!ready) {
    return (
      <div className="pt-center">
        <img src={LOGO_SVG} alt="Convengers" className="pt-landing-logo" />
        <div className="pt-spinner" aria-label="Loading" />
        <div className="pt-muted">Checking your access…</div>
      </div>
    );
  }

  if (audience === 'guest') return <Landing user={user} />;
  if (audience === 'pending') return <Pending user={user} />;
  if (audience === 'external') return <PortalApp user={user} mode="external" />;
  // Internal users: full system, plus an internal preview of the client portal
  if (hash.startsWith('#/portal')) return <PortalApp user={user} mode="preview" />;
  return <App />;
}

const Landing: React.FC<{ user: User }> = ({ user }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-landing">
      <div className="pt-landing-card">
        <img src={LOGO_SVG} alt="Convengers emblem" className="pt-landing-logo" />
        <div className="pt-kicker">Convengers Bahay Build</div>
        <h1 className="pt-landing-title">Project Management &amp; Reporting</h1>
        <p className="pt-muted">
          Sign in with your authorized account. Project team members are taken to the Project Management System; project owners, executives and client
          representatives are taken to the Executive &amp; Client Portal.
        </p>
        <button type="button" className="pt-btn primary" onClick={() => setOpen(true)}>
          Sign in
        </button>
        <p className="pt-small">
          New accounts are created as <b>pending</b> and must be approved by the System Administrator, who assigns the internal or external role.
        </p>
      </div>
      {open && <AuthDialog user={user} onClose={() => setOpen(false)} />}
    </div>
  );
};

const Pending: React.FC<{ user: User }> = ({ user }) => (
  <div className="pt-landing">
    <div className="pt-landing-card">
      <img src={LOGO_SVG} alt="Convengers emblem" className="pt-landing-logo" />
      <div className="pt-kicker">Convengers Bahay Build</div>
      <h1 className="pt-landing-title">{user.status === 'revoked' ? 'Access revoked' : 'Awaiting approval'}</h1>
      <p className="pt-muted">
        Signed in as <b>{user.email || user.name}</b>.{' '}
        {user.status === 'revoked'
          ? 'Your access has been revoked. Contact the System Administrator if you believe this is a mistake.'
          : 'Your account is waiting for the System Administrator to approve it and assign your role. This page updates automatically once approved.'}
      </p>
      <button type="button" className="pt-btn" onClick={() => authService.signOut()}>
        Sign out
      </button>
    </div>
  </div>
);

export const AuthDialog: React.FC<{ user: User; onClose: () => void }> = ({ user, onClose }) => (
  <AuthModal
    currentUser={user}
    onClose={onClose}
    onLogin={async (email, pass) => {
      await authService.signIn(email, pass);
    }}
    onRegister={async (name, email, pass) => {
      await authService.register(name, email, pass);
    }}
    onGoogleLogin={async () => {
      await authService.signInWithGoogle();
    }}
    onLogout={async () => {
      await authService.signOut();
    }}
  />
);

export { ROLE_LABEL };
