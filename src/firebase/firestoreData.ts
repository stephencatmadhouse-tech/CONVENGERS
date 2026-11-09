/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './config.ts';
import {
  Milestone,
  ScopeItem,
  ConcretePour,
  Episode,
  Character,
  Activity,
  ActivityOverride,
  SystemSettings,
  FullDashboardData,
  User,
} from '../types/index.ts';
import {
  INITIAL_SETTINGS,
  INITIAL_MILESTONES,
  INITIAL_SCOPES,
  INITIAL_CONCRETE_POURS,
  INITIAL_EPISODES,
  INITIAL_CHARACTERS,
} from '../db/seedData.ts';

export class FirestoreDataService {
  private isInitialized = false;

  public async seedInitialDataIfEmpty(currentUser: User): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      const snap = await getDocs(collection(db, 'milestones'));
      if (snap.empty) {
        // Only manager or admin can seed
        if (currentUser.role === 'admin' || currentUser.role === 'manager') {
          console.log('Seeding initial baseline data to Firestore...');
          const promises = [
            ...INITIAL_MILESTONES.map((m) => setDoc(doc(db, 'milestones', m.id), m)),
            ...INITIAL_SCOPES.map((s) => setDoc(doc(db, 'scopes', s.id), s)),
            ...INITIAL_CONCRETE_POURS.map((p) => setDoc(doc(db, 'pours', p.id), p)),
            ...INITIAL_EPISODES.map((e) => setDoc(doc(db, 'episodes', e.id), e)),
            ...INITIAL_CHARACTERS.map((c) => setDoc(doc(db, 'characters', c.id), c)),
            setDoc(doc(db, 'settings', 'system'), INITIAL_SETTINGS),
          ];
          await Promise.allSettled(promises);
        }
      }
    } catch (err) {
      console.warn('Firestore initial check notice:', err);
    }
  }

  // --- Real-time Listeners ---
  public subscribeAll(onData: (data: Partial<FullDashboardData>) => void): () => void {
    const unsubs: Array<() => void> = [];

    // Milestones
    unsubs.push(
      onSnapshot(collection(db, 'milestones'), (snap) => {
        if (!snap.empty) {
          const list: Milestone[] = [];
          snap.forEach((d) => list.push(d.data() as Milestone));
          list.sort((a, b) => a.index - b.index);
          onData({ milestones: list });
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'milestones');
      })
    );

    // Scopes
    unsubs.push(
      onSnapshot(collection(db, 'scopes'), (snap) => {
        if (!snap.empty) {
          const list: ScopeItem[] = [];
          snap.forEach((d) => list.push(d.data() as ScopeItem));
          list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          onData({ scopes: list });
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'scopes');
      })
    );

    // Pours
    unsubs.push(
      onSnapshot(collection(db, 'pours'), (snap) => {
        if (!snap.empty) {
          const list: ConcretePour[] = [];
          snap.forEach((d) => list.push(d.data() as ConcretePour));
          onData({ pours: list });
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'pours');
      })
    );

    // Episodes
    unsubs.push(
      onSnapshot(collection(db, 'episodes'), (snap) => {
        if (!snap.empty) {
          const list: Episode[] = [];
          snap.forEach((d) => list.push(d.data() as Episode));
          list.sort((a, b) => a.number - b.number);
          onData({ episodes: list });
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'episodes');
      })
    );

    // Activities
    unsubs.push(
      onSnapshot(collection(db, 'activities'), (snap) => {
        const list: Activity[] = [];
        snap.forEach((d) => list.push(d.data() as Activity));
        onData({ activities: list });
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'activities');
      })
    );

    // Overrides
    unsubs.push(
      onSnapshot(collection(db, 'overrides'), (snap) => {
        const map: Record<string, ActivityOverride> = {};
        snap.forEach((d) => {
          map[d.id] = d.data() as ActivityOverride;
        });
        onData({ overrides: map });
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'overrides');
      })
    );

    // Settings
    unsubs.push(
      onSnapshot(doc(db, 'settings', 'system'), (snap) => {
        if (snap.exists()) {
          onData({ settings: snap.data() as SystemSettings });
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'settings/system');
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }

  // --- MUTATION METHODS ENFORCED BY FIRESTORE SECURITY RULES ---
  public async updateMilestone(id: string, updates: Partial<Milestone>, userName: string): Promise<void> {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await updateDoc(doc(db, 'milestones', id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `milestones/${id}`);
    }
  }

  public async updateScope(id: string, updates: Partial<ScopeItem>, userName: string): Promise<void> {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await updateDoc(doc(db, 'scopes', id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `scopes/${id}`);
    }
  }

  public async updatePour(id: string, updates: Partial<ConcretePour>, userName: string): Promise<void> {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await updateDoc(doc(db, 'pours', id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `pours/${id}`);
    }
  }

  public async addPour(pour: ConcretePour, userName: string): Promise<void> {
    const payload = {
      ...pour,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await setDoc(doc(db, 'pours', pour.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `pours/${pour.id}`);
    }
  }

  public async deletePour(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'pours', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `pours/${id}`);
    }
  }

  public async updateEpisode(id: string, updates: Partial<Episode>, userName: string): Promise<void> {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await updateDoc(doc(db, 'episodes', id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `episodes/${id}`);
    }
  }

  public async addEpisode(episode: Episode, userName: string): Promise<void> {
    const payload = {
      ...episode,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await setDoc(doc(db, 'episodes', episode.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `episodes/${episode.id}`);
    }
  }

  public async deleteEpisode(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'episodes', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `episodes/${id}`);
    }
  }

  public async setOverride(key: string, override: Partial<ActivityOverride>, userName: string): Promise<void> {
    const payload = {
      ...override,
      key,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await setDoc(doc(db, 'overrides', key), payload, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `overrides/${key}`);
    }
  }

  public async updateSettings(settings: Partial<SystemSettings>): Promise<void> {
    const payload = {
      ...settings,
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'settings', 'system'), payload, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings/system');
    }
  }

  public async addScope(scope: ScopeItem, userName: string): Promise<void> {
    const payload = {
      ...scope,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await setDoc(doc(db, 'scopes', scope.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `scopes/${scope.id}`);
    }
  }

  public async deleteScope(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'scopes', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `scopes/${id}`);
    }
  }

  public async addActivity(activity: Activity, userName: string): Promise<void> {
    const payload = {
      ...activity,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await setDoc(doc(db, 'activities', activity.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `activities/${activity.id}`);
    }
  }

  public async updateActivity(id: string, updates: Partial<Activity>, userName: string): Promise<void> {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await updateDoc(doc(db, 'activities', id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `activities/${id}`);
    }
  }

  public async deleteActivity(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'activities', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `activities/${id}`);
    }
  }

  public async addCharacter(char: Character): Promise<void> {
    try {
      await setDoc(doc(db, 'characters', char.id), char);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `characters/${char.id}`);
    }
  }

  public async updateCharacter(id: string, name: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'characters', id), { name, updatedAt: new Date().toISOString() });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `characters/${id}`);
    }
  }

  public async deleteCharacter(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'characters', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `characters/${id}`);
    }
  }
}

export const firestoreData = new FirestoreDataService();
