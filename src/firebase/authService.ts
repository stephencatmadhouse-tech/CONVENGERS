/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './config.ts';
import { User, UserRole, UserStatus } from '../types/index.ts';

const ADMIN_EMAIL = 'stephencat.madhouse@gmail.com';

export function getViewerUser(): User {
  return {
    id: 'viewer_guest',
    name: 'Presentation Viewer',
    email: '',
    role: 'viewer',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
}

export class FirebaseAuthService {
  private currentUser: User = getViewerUser();
  private userListeners = new Set<(user: User) => void>();
  private unsubscribeUserDoc: (() => void) | null = null;
  private pendingDisplayName: string | null = null;
  private ensureUserDocPromises = new Map<string, Promise<User>>();
  private ready = false;

  constructor() {
    this.initAuth();
  }

  private async syncUserFromFirebase(fbUser: { uid: string; email: string | null; displayName: string | null }, preferredName?: string): Promise<User> {
    const uid = fbUser.uid;
    const inflight = this.ensureUserDocPromises.get(uid);
    if (inflight) {
      return inflight;
    }

    const run: Promise<User> = (async (): Promise<User> => {
      const userRef = doc(db, 'users', uid);
      const emailLower = (fbUser.email || '').toLowerCase();
      const isBootstrapAdmin = emailLower === ADMIN_EMAIL.toLowerCase();
      const resolvedName = preferredName || this.pendingDisplayName || fbUser.displayName;

      try {
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          const newRole: UserRole = isBootstrapAdmin ? 'admin' : 'pending';
          const newStatus: UserStatus = isBootstrapAdmin ? 'active' : 'pending';
          const newUser: User = {
            id: uid,
            name: resolvedName || (isBootstrapAdmin ? 'Stephen (Madhouse Lead)' : fbUser.email?.split('@')[0] || 'Team Member'),
            email: fbUser.email || '',
            role: newRole,
            status: newStatus,
            createdAt: new Date().toISOString(),
          };

          try {
            await setDoc(userRef, {
              uid,
              name: newUser.name,
              email: newUser.email,
              role: newUser.role,
              status: newUser.status,
              createdAt: newUser.createdAt,
              updatedAt: new Date().toISOString(),
            });
          } catch (writeErr) {
            console.warn('Initial user profile write notice:', writeErr);
          }
          return newUser;
        }

        const data = snap.data();
        const role: UserRole = isBootstrapAdmin ? 'admin' : (data.role || 'pending');
        const status: UserStatus = isBootstrapAdmin ? 'active' : (data.status || 'pending');
        return {
          id: uid,
          name: data.name || resolvedName || fbUser.email?.split('@')[0] || 'Team Member',
          email: fbUser.email || data.email || '',
          role,
          status,
          createdAt: data.createdAt || new Date().toISOString(),
        };
      } catch (err) {
        console.warn('Error reading user profile from Firestore:', err);
        const fallbackRole: UserRole = isBootstrapAdmin ? 'admin' : 'pending';
        const fallbackStatus: UserStatus = isBootstrapAdmin ? 'active' : 'pending';
        return {
          id: uid,
          name: resolvedName || fbUser.email || 'Team Member',
          email: fbUser.email || '',
          role: fallbackRole,
          status: fallbackStatus,
          createdAt: new Date().toISOString(),
        };
      }
    })();

    this.ensureUserDocPromises.set(uid, run);
    try {
      return await run;
    } finally {
      this.ensureUserDocPromises.delete(uid);
    }
  }

  private initAuth() {
    onAuthStateChanged(auth, async (fbUser) => {
      if (this.unsubscribeUserDoc) {
        this.unsubscribeUserDoc();
        this.unsubscribeUserDoc = null;
      }

      if (!fbUser) {
        this.currentUser = getViewerUser();
        this.ready = true;
        this.notify(this.currentUser);
        return;
      }

      const uid = fbUser.uid;
      const userRef = doc(db, 'users', uid);

      this.currentUser = await this.syncUserFromFirebase(fbUser);
      this.ready = true;
      this.notify(this.currentUser);

      // Real-time listener: immediately update UI without reload if role or status changes
      this.unsubscribeUserDoc = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          const fresh = docSnap.data();
          const emailLower = (fbUser.email || '').toLowerCase();
          const isBootstrapAdmin = emailLower === ADMIN_EMAIL.toLowerCase();
          const role: UserRole = isBootstrapAdmin ? 'admin' : (fresh.role || 'pending');
          const status: UserStatus = isBootstrapAdmin ? 'active' : (fresh.status || 'pending');

          this.currentUser = {
            id: fbUser.uid,
            name: fresh.name || fbUser.displayName || 'Team Member',
            email: fbUser.email || fresh.email || '',
            role,
            status,
            createdAt: fresh.createdAt || new Date().toISOString(),
          };
          this.notify(this.currentUser);
        }
      }, (error) => {
        console.warn(`User profile snapshot notice for users/${uid}:`, error?.message || error);
      });
    });
  }

  /** True once Firebase has reported the initial sign-in state. */
  public isReady(): boolean {
    return this.ready;
  }

  public getCurrentUser(): User {
    return this.currentUser;
  }

  public onUserChange(fn: (user: User) => void): () => void {
    this.userListeners.add(fn);
    fn(this.currentUser);
    return () => this.userListeners.delete(fn);
  }

  private notify(user: User) {
    this.userListeners.forEach((fn) => fn(user));
  }

  public async signIn(email: string, pass: string): Promise<User> {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      this.currentUser = await this.syncUserFromFirebase(cred.user);
      this.notify(this.currentUser);
      return this.currentUser;
    } catch (err: any) {
      console.error('Sign-in error:', err);
      let message = 'Sign in failed. Please check your credentials.';
      if (err.code === 'auth/operation-not-allowed') {
        message = 'Email/Password sign-in is not enabled yet in Firebase Authentication. Enable the Email/Password provider in Firebase Console (Authentication -> Sign-in method) or use "Continue with Google" below.';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        message = 'Invalid email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later.';
      } else if (err.message) {
        message = err.message;
      }
      throw new Error(message);
    }
  }

  public async signInWithGoogle(): Promise<User> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      this.currentUser = await this.syncUserFromFirebase(cred.user);
      this.notify(this.currentUser);
      return this.currentUser;
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      let message = 'Google sign-in failed. Please try again.';
      if (err.code === 'auth/popup-closed-by-user') {
        message = 'Google sign-in popup was closed before finishing.';
      } else if (err.code === 'auth/popup-blocked') {
        message = 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
      } else if (err.code === 'auth/unauthorized-domain') {
        message = 'This domain is not authorized for Google Sign-In in Firebase Console (Authentication -> Settings -> Authorized domains).';
      } else if (err.code === 'auth/operation-not-allowed') {
        message = 'Google Sign-In is disabled in Firebase Console (Authentication -> Sign-in method).';
      } else if (err.message) {
        message = err.message;
      }
      throw new Error(message);
    }
  }

  public async register(name: string, email: string, pass: string): Promise<User> {
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    this.pendingDisplayName = trimmedName || null;

    try {
      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, pass);
      if (trimmedName) {
        await updateProfile(cred.user, { displayName: trimmedName }).catch(() => {});
      }

      this.currentUser = await this.syncUserFromFirebase(cred.user, trimmedName || undefined);
      this.notify(this.currentUser);
      return this.currentUser;
    } catch (err: any) {
      console.error('Registration error:', err);
      let message = 'Registration failed. Please try again.';
      if (err.code === 'auth/operation-not-allowed') {
        message = 'Email/Password registration is not enabled yet in Firebase Console. Enable Email/Password under Authentication -> Sign-in method, or sign in immediately with "Continue with Google" below.';
      } else if (err.code === 'auth/email-already-in-use') {
        message = 'This email is already registered. Please sign in instead.';
      } else if (err.code === 'auth/weak-password') {
        message = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please provide a valid email address.';
      } else if (err.message) {
        message = err.message;
      }
      throw new Error(message);
    } finally {
      this.pendingDisplayName = null;
    }
  }

  public async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } finally {
      this.currentUser = getViewerUser();
      this.notify(this.currentUser);
    }
  }

  // --- ADMIN USER MANAGEMENT METHODS ---
  public async getAllUsers(): Promise<User[]> {
    if (this.currentUser.role !== 'admin') {
      throw new Error('Access denied. Only administrators can view the team roster.');
    }

    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: User[] = [];
      snap.forEach((d) => {
        const u = d.data();
        const isBootstrap = (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
        list.push({
          id: d.id,
          name: u.name || 'Team Member',
          email: u.email || '',
          role: isBootstrap ? 'admin' : (u.role || 'pending'),
          status: isBootstrap ? 'active' : (u.status || 'pending'),
          createdAt: u.createdAt || '',
        });
      });
      return list;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, 'users');
      return [];
    }
  }

  public async updateUserRole(targetUid: string, newRole: UserRole, newStatus?: UserStatus): Promise<void> {
    if (this.currentUser.role !== 'admin') {
      throw new Error('Access denied. Administrator privileges required.');
    }
    if (targetUid === this.currentUser.id) {
      throw new Error('A user cannot change their own role.');
    }

    try {
      const userRef = doc(db, 'users', targetUid);
      const updates: Record<string, any> = {
        role: newRole,
        updatedAt: new Date().toISOString(),
      };
      if (newStatus) {
        updates.status = newStatus;
      } else if (newRole === 'pending') {
        updates.status = 'pending';
      } else if (newRole === 'viewer') {
        updates.status = 'active';
      } else {
        updates.status = 'active';
      }

      await updateDoc(userRef, updates);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
    }
  }

  public async revokeUserAccess(targetUid: string): Promise<void> {
    if (this.currentUser.role !== 'admin') {
      throw new Error('Access denied. Administrator privileges required.');
    }
    if (targetUid === this.currentUser.id) {
      throw new Error('You cannot revoke your own administrator access.');
    }

    try {
      const userRef = doc(db, 'users', targetUid);
      await updateDoc(userRef, {
        role: 'viewer',
        status: 'revoked',
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
    }
  }
}

export const authService = new FirebaseAuthService();
