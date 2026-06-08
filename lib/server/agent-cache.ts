import type { NostrFilter } from "../nostr-relays";
import { PIP00_AGENT_KIND } from "../pip00";
import { createAddressableEventCache, type RefreshSnapshot } from "./addressable-cache";

const agentCache = createAddressableEventCache({
  kinds: [PIP00_AGENT_KIND],
  "#t": ["agent"],
  limit: 100,
});

export type { RefreshSnapshot };

export function getAgentSnapshot(relays: string[]): RefreshSnapshot {
  return agentCache.getSnapshot(relays);
}

export function refreshAgents(relays: string[], filter?: NostrFilter): Promise<RefreshSnapshot> {
  return agentCache.refresh(relays, filter);
}
