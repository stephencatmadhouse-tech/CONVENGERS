/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { CollectionStore, StoreState } from './collectionStore.ts';

/** Subscribe a component to a collection store (pass `enabled=false` to skip, e.g. for unauthorized roles). */
export function useStore<T extends { id: string }>(store: CollectionStore<T>, enabled = true): StoreState<T> {
  const [state, setState] = useState<StoreState<T>>(() => (enabled ? store.getState() : { items: [], shared: false, loaded: true }));
  useEffect(() => {
    if (!enabled) {
      setState({ items: [], shared: false, loaded: true });
      return;
    }
    return store.subscribe(setState);
  }, [store, enabled]);
  return state;
}
