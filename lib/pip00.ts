export const PIP00_AGENT_KIND = 30360;

export const DEFAULT_RELAYS = ["wss://nos.lol", "wss://relay.damus.io"] as const;

export type NostrTag = string[];

export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: NostrTag[];
  content: string;
  sig: string;
};

export type UnsignedNostrEvent = Omit<NostrEvent, "id" | "sig">;

export type AgentDefinitionContent = {
  version: string;
  name: string;
  about: string;
  capabilities: {
    swap_types: string[];
    fiat_currencies: string[];
    payment_channels: string[];
    settlement_networks: string[];
    regions: string[];
    limits: {
      min: string;
      max: string;
    };
  };
  pricing_policy: string;
  escrow: {
    descriptor: string;
    notes: string;
  };
  updated_at: string;
};

export type AgentDefinition = {
  event: NostrEvent;
  identifier: string;
  relays: string[];
  currencies: string[];
  escrowAddress: string;
  content: AgentDefinitionContent | null;
  malformedContent: boolean;
};

export function buildAgentEvent({
  pubkey,
  identifier,
  name,
  about,
  swapTypes,
  fiatCurrencies,
  paymentChannels,
  settlementNetworks,
  regions,
  minLimit,
  maxLimit,
  pricingPolicy,
  escrowAddress,
  escrowNotes,
  relays,
}: {
  pubkey: string;
  identifier: string;
  name: string;
  about: string;
  swapTypes: string[];
  fiatCurrencies: string[];
  paymentChannels: string[];
  settlementNetworks: string[];
  regions: string[];
  minLimit: string;
  maxLimit: string;
  pricingPolicy: string;
  escrowAddress: string;
  escrowNotes: string;
  relays: string[];
}): UnsignedNostrEvent {
  const now = new Date();
  const descriptor = escrowAddress.trim() || `30361:${pubkey}:escrow`;
  const content: AgentDefinitionContent = {
    version: "PIP-00-draft",
    name: name.trim(),
    about: about.trim(),
    capabilities: {
      swap_types: swapTypes,
      fiat_currencies: fiatCurrencies,
      payment_channels: paymentChannels,
      settlement_networks: settlementNetworks,
      regions,
      limits: {
        min: minLimit.trim(),
        max: maxLimit.trim(),
      },
    },
    pricing_policy: pricingPolicy.trim(),
    escrow: {
      descriptor,
      notes: escrowNotes.trim(),
    },
    updated_at: now.toISOString(),
  };

  return {
    pubkey,
    created_at: Math.floor(now.getTime() / 1000),
    kind: PIP00_AGENT_KIND,
    tags: [
      ["d", identifier.trim() || "agent"],
      ["t", "agent"],
      ...relays.map((relay) => ["relay", relay]),
      ["a", descriptor],
      ...fiatCurrencies.map((currency) => ["f", currency]),
      ["client", "pontmore-pip00-poc"],
    ],
    content: JSON.stringify(content),
  };
}

export function parseAgentEvent(event: NostrEvent): AgentDefinition {
  const identifier = findTagValue(event.tags, "d") || "agent";
  const relays = event.tags
    .filter((tag) => tag[0] === "relay" && tag[1])
    .map((tag) => tag[1]);
  const currencies = event.tags
    .filter((tag) => tag[0] === "f" && tag[1])
    .map((tag) => tag[1]);
  const escrowAddress = findTagValue(event.tags, "a") || "";

  try {
    return {
      event,
      identifier,
      relays,
      currencies,
      escrowAddress,
      content: JSON.parse(event.content) as AgentDefinitionContent,
      malformedContent: false,
    };
  } catch {
    return {
      event,
      identifier,
      relays,
      currencies,
      escrowAddress,
      content: null,
      malformedContent: true,
    };
  }
}

export function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function findTagValue(tags: NostrTag[], name: string): string | undefined {
  return tags.find((tag) => tag[0] === name)?.[1];
}
