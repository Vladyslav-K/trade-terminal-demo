import { useCallback, useSyncExternalStore } from 'react';

import { hotStore } from '../feed/hot-store.ts';
import type { HotListener, HotTopic } from '../feed/hot-store.ts';

// Re-renders the component on every change of the topic; meant for topics
// that change rarely, frequent ones are better read from a subscription.
export function useHotVersion(topic: HotTopic): number {
  const subscribe = useCallback(
    (listener: HotListener) => hotStore.subscribeTopic(topic, listener),
    [topic],
  );
  const getSnapshot = useCallback(
    () => hotStore.getTopicVersion(topic),
    [topic],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
