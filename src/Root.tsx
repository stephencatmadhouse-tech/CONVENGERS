/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ROOT — one application, two interfaces:
 *
 *   DEFAULT VIEW (everyone, no sign-in) → CLIENT-FACING PORTAL
 *     The official Executive & Client Reporting Portal opens first for every
 *     visitor. It reads only published, approved records from `portal`.
 *
 *   SMALL HEADER BUTTON → INTERNAL LOGIN
 *     Authenticates with Firebase Auth and reads the user's role.
 *
 *   AFTER AUTHENTICATION → CONVENGERS OVERALL MASTER PROJECT TRACKER
 *     Internal roles are taken to their dashboard (#/<module>). External
 *     roles (Project Owner, Executive, Client, Stakeholder) stay on the portal;
 *     the Owner and Executives additionally see approved documents.
 *
 * Routing only decides which interface is rendered. The security boundary is
 * server-side: firestore.rules / storage.rules decide what each role (or an
 * anonymous visitor) can read, so internal data cannot be reached by editing
 * the URL or calling the database directly.
 */

import React, { useEffect, useRef, useState } from 'react';
import App from './App.tsx';
import { authService } from './firebase/authService.ts';
import { audienceOf, canOpenModule, landingModule, ROLE_LABEL } from './auth/roles.ts';
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

/** Empty hash and #/portal/... belong to the client-facing portal; everything else is internal. */
export function isPortalHash(hash: string): boolean {
  const h = hash.replace(/^#\/?/, '');
  return h === '' || h === 'portal' || h.startsWith('portal/');
}
const sectionOf = (hash: string) => hash.replace(/^#\/?/, '').split('/')[0];
const PORTAL_HOME = '#/portal/overview';

export default function Root() {
  const [user, setUser] = useState<User>(() => authService.getCurrentUser());
  const [ready, setReady] = useState<boolean>(() => authService.isReady());
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginNote, setLoginNote] = useState<string | undefined>();
  /** Where to go after a successful login ('' = the role's landing module). */
  const intent = useRef<string | null>(null);
  const hash = useHash();
  const audience = audienceOf(user);
  const prevAudience = useRef(audience);

  useEffect(() => {
    const unsub = authService.onUserChange((u) => {
      setUser(u);
      setReady(authService.isReady());
    });
    // If Firebase cannot be reached, stop waiting (the public portal still renders).
    const t = setTimeout(() => setReady(true), 8000);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  // After sign-in / sign-out: send the user to the right interface
  useEffect(() => {
    const prev = prevAudience.current;
    prevAudience.current = audience;
    if (!ready) return;
    if (audience === 'internal' && intent.current !== null) {
      const wanted = intent.current;
      intent.current = null;
      setLoginOpen(false);
      setLoginNote(undefined);
      const target = wanted && canOpenModule(user.role, wanted) ? wanted : landingModule(user.role);
      window.location.hash = `#/${target}`;
      return;
    }
    if (audience === 'external' && intent.current !== null) {
      intent.current = null;
      setLoginOpen(false);
      setLoginNote(undefined);
      if (!isPortalHash(window.location.hash)) window.location.replace(PORTAL_HOME);
      return;
    }
    // Signed out from inside the internal system → back to the public portal
    if (audience === 'guest' && prev !== 'guest' && !isPortalHash(window.location.hash)) {
      window.location.replace(PORTAL_HOME);
    }
  }, [audience, ready, user.role]);

  // Internal URL opened without an internal account → public portal (+ login for guests)
  useEffect(() => {
    if (!ready || isPortalHash(hash)) return;
    if (audience === 'guest') {
      intent.current = sectionOf(hash);
      setLoginNote('Sign in with an authorized account to open the Master Project Tracker.');
      setLoginOpen(true);
      window.location.replace(PORTAL_HOME);
    } else if (audience === 'external') {
      window.location.replace(PORTAL_HOME);
    }
  }, [ready, audience, hash]);

  const openLogin = () => {
    intent.current = '';
    setLoginNote(undefined);
    setLoginOpen(true);
  };

  const internalView = !isPortalHash(hash);
  if (internalView && audience === 'internal') return <App />;
  if (internalView && audience === 'pending' && ready) return <Pending user={user} />;
  if (internalView && !ready) {
    return (
      <div className="pt-center">
        <img src={LOGO_SVG} alt="Convengers" className="pt-landing-logo" />
        <div className="pt-spinner" aria-label="Loading" />
        <div className="pt-muted">Checking your access…</div>
      </div>
    );
  }

  return (
    <>
      <PortalApp user={user} authReady={ready} onLogin={openLogin} />
      {loginOpen && (
        <AuthDialog
          user={user}
          note={loginNote}
          onClose={() => {
            // The dialog also closes itself after a successful sign-in, so the
            // redirect target is kept until the new session is applied.
            setLoginOpen(false);
            setLoginNote(undefined);
          }}
        />
      )}
    </>
  );
}

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

export const AuthDialog: React.FC<{ user: User; onClose: () => void; note?: string }> = ({ user, onClose, note }) => (
  <AuthModal
    currentUser={user}
    note={note}
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
