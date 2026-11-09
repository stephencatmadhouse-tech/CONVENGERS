/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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

  constructor() {
    this.initAuth();
  }

  private initAuth() {
    onAuthStateChanged(auth, async (fbUser) => {
      if (this.unsubscribeUserDoc) {
        this.unsubscribeUserDoc();
        this.unsubscribeUserDoc = null;
      }

      if (!fbUser) {
        this.currentUser = getViewerUser();
        this.notify(this.currentUser);
        return;
      }

      const uid = fbUser.uid;
      const userRef = doc(db, 'users', uid);

      try {
        const snap = await getDoc(userRef);
        const emailLower = (fbUser.email || '').toLowerCase();
        const isBootstrapAdmin = emailLower === ADMIN_EMAIL.toLowerCase();

        if (!snap.exists()) {
          // Document does not exist yet (e.g. created outside or first sign in)
          const newRole: UserRole = isBootstrapAdmin ? 'admin' : 'pending';
          const newStatus: UserStatus = isBootstrapAdmin ? 'active' : 'pending';
          const newUser: User = {
            id: uid,
            name: fbUser.displayName || (isBootstrapAdmin ? 'Stephen (Madhouse Lead)' : fbUser.email?.split('@')[0] || 'Team Member'),
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
          this.currentUser = newUser;
        } else {
          const data = snap.data();
          const role: UserRole = isBootstrapAdmin ? 'admin' : (data.role || 'pending');
          const status: UserStatus = isBootstrapAdmin ? 'active' : (data.status || 'pending');

          this.currentUser = {
            id: uid,
            name: data.name || fbUser.displayName || fbUser.email?.split('@')[0] || 'Team Member',
            email: fbUser.email || data.email || '',
            role,
            status,
            createdAt: data.createdAt || new Date().toISOString(),
          };
        }
      } catch (err) {
        console.warn('Error reading user profile from Firestore:', err);
        // Fallback to minimal state
        const isBootstrapAdmin = (fbUser.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
        this.currentUser = {
          id: fbUser.uid,
          name: fbUser.displayName || fbUser.email || 'Team Member',
          email: fbUser.email || '',
          role: isBootstrapAdmin ? 'admin' : 'pending',
          status: isBootstrapAdmin ? 'active' : 'pending',
          createdAt: new Date().toISOString(),
        };
      }

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
        handleFirestoreError(error, OperationType.GET, `users/${uid}`);
      });
    });
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
      const emailLower = (cred.user.email || '').toLowerCase();
      const isBootstrapAdmin = emailLower === ADMIN_EMAIL.toLowerCase();

      const userRef = doc(db, 'users', cred.user.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        const data = snap.data();
        this.currentUser = {
          id: cred.user.uid,
          name: data.name || cred.user.displayName || 'Team Member',
          email: cred.user.email || '',
          role: isBootstrapAdmin ? 'admin' : (data.role || 'pending'),
          status: isBootstrapAdmin ? 'active' : (data.status || 'pending'),
          createdAt: data.createdAt || new Date().toISOString(),
        };
      } else {
        const newUser: User = {
          id: cred.user.uid,
          name: cred.user.displayName || (isBootstrapAdmin ? 'Stephen (Madhouse Lead)' : cred.user.email?.split('@')[0] || 'Team Member'),
          email: cred.user.email || '',
          role: isBootstrapAdmin ? 'admin' : 'pending',
          status: isBootstrapAdmin ? 'active' : 'pending',
          createdAt: new Date().toISOString(),
        };
        await setDoc(userRef, {
          uid: cred.user.uid,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          status: newUser.status,
          createdAt: newUser.createdAt,
          updatedAt: new Date().toISOString(),
        });
        this.currentUser = newUser;
      }

      this.notify(this.currentUser);
      return this.currentUser;
    } catch (err: any) {
      console.error('Sign-in error:', err);
      let message = 'Sign in failed. Please check your credentials.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        message = 'Invalid email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later.';
      } else if (err.message) {
        message = err.message;
      }
      throw new Error(message);
    }
  }

  public async register(name: string, email: string, pass: string): Promise<User> {
    try {
      const trimmedEmail = email.trim();
      const trimmedName = name.trim();
      const isBootstrapAdmin = trimmedEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();

      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, pass);
      if (trimmedName) {
        await updateProfile(cred.user, { displayName: trimmedName });
      }

      // First admin: stephencat.madhouse@gmail.com gets 'admin'. Every other new registration gets 'pending'.
      const role: UserRole = isBootstrapAdmin ? 'admin' : 'pending';
      const status: UserStatus = isBootstrapAdmin ? 'active' : 'pending';

      const userDoc: User = {
        id: cred.user.uid,
        name: trimmedName || (isBootstrapAdmin ? 'Stephen (Madhouse Lead)' : 'New Team Member'),
        email: trimmedEmail,
        role,
        status,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name: userDoc.name,
        email: userDoc.email,
        role: userDoc.role,
        status: userDoc.status,
        createdAt: userDoc.createdAt,
        updatedAt: new Date().toISOString(),
      });

      this.currentUser = userDoc;
      this.notify(this.currentUser);
      return userDoc;
    } catch (err: any) {
      console.error('Registration error:', err);
      let message = 'Registration failed. Please try again.';
      if (err.code === 'auth/email-already-in-use') {
        message = 'This email is already registered. Please sign in instead.';
      } else if (err.code === 'auth/weak-password') {
        message = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please provide a valid email address.';
      } else if (err.message) {
        message = err.message;
      }
      throw new Error(message);
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
        list.push({
          id: d.id,
          name: u.name || 'Team Member',
          email: u.email || '',
          role: u.role || 'pending',
          status: u.status || 'pending',
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
