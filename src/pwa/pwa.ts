/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Installable web app (PWA) support: service-worker registration, update
 * notice and the "Add to Home Screen" prompt. This is a web app that can be
 * installed from compatible browsers — it is not a native iOS / Android app.
 */

import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
let updateReady: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function initPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
  // Register only in production builds (the dev server serves modules that must not be cached)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          const watch = (w: ServiceWorker | null) => {
            if (!w) return;
            w.addEventListener('statechange', () => {
              if (w.state === 'installed' && navigator.serviceWorker.controller) {
                updateReady = w;
                emit();
              }
            });
          };
          if (reg.waiting && navigator.serviceWorker.controller) {
            updateReady = reg.waiting;
            emit();
          }
          reg.addEventListener('updatefound', () => watch(reg.installing));
        })
        .catch(() => undefined);
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    });
  }
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  deferred = null;
  emit();
  return choice.outcome === 'accepted';
}

export function applyUpdate() {
  updateReady?.postMessage('skip-waiting');
}

export interface InstallState {
  canPrompt: boolean;
  installed: boolean;
  iosHint: boolean; // iOS Safari: install via Share → Add to Home Screen
  updateReady: boolean;
}

export function useInstallState(): InstallState {
  const read = (): InstallState => ({
    canPrompt: !!deferred,
    installed: isStandalone(),
    iosHint: isIos() && !isStandalone(),
    updateReady: !!updateReady,
  });
  const [st, setSt] = useState(read);
  useEffect(() => {
    const l = () => setSt(read());
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return st;
}

/** Media query hook for the dedicated phone layouts. */
export function useMediaQuery(q: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [q]);
  return m;
}

/** Phone layout breakpoint shared by the client portal and the internal command center. */
export const PHONE_QUERY = '(max-width: 760px)';
export const useIsPhone = () => useMediaQuery(PHONE_QUERY);
