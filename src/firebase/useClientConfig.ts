/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client experience configuration (construction journey + project profile),
 * stored in `clientConfig/journey` and `clientConfig/profile`.
 */

import { useMemo } from 'react';
import { clientConfigStore } from './opsStores.ts';
import { useStore } from './useStore.ts';
import { defaultJourney, type JourneyConfig, type ProjectProfile } from '../domain/journey.ts';

export function useClientConfig() {
  const st = useStore(clientConfigStore);
  return useMemo(() => {
    const journey = (st.items.find((d) => d.id === 'journey') as JourneyConfig | undefined) || defaultJourney();
    const profile = (st.items.find((d) => d.id === 'profile') as ProjectProfile | undefined) || ({ id: 'profile' } as ProjectProfile);
    const configured = st.items.some((d) => d.id === 'journey');
    return { journey, profile, configured, shared: st.shared, loaded: st.loaded, error: st.error };
  }, [st]);
}
