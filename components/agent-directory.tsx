"use client";

import {
  Alert,
  AppBar,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  type SelectChangeEvent,
  Drawer,
} from "@mui/material";
import DataObjectIcon from "@mui/icons-material/DataObject";
import MenuIcon from "@mui/icons-material/Menu";
import { finalizeEvent, generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { useEffect, useMemo, useState } from "react";
import {
  buildAgentEvent,
  DEFAULT_RELAYS,
  PIP00_AGENT_KIND,
  parseAgentEvent,
  parseList,
  type AgentDefinition,
  type NostrEvent,
} from "../lib/pip00";
import {
  buildEscrowEvent,
  EscrowType,
  PIP01_ESCROW_KIND,
  parseEscrowEvent,
  type EscrowDescriptor,
} from "../lib/pip01";

const SECRET_KEY_STORAGE = "pontmore-pip00-poc-secret-key";
const ESCROW_SECRET_KEY_STORAGE = "pontmore-pip00-poc-escrow-secret-key";
const RELAYS_STORAGE = "pontmore-pip00-poc-relays";

type PublishState = "idle" | "publishing" | "published" | "failed";
type DirectoryState = "idle" | "loading" | "loaded" | "failed";
type ActiveTab = "discover" | "publish" | "escrow-discover" | "escrow-publish" | "settings";
type ApiRelayResult = {
  relay: string;
  ok: boolean;
  message: string;
};
type DirectorySnapshot = {
  events: NostrEvent[];
  results: ApiRelayResult[];
  lastRefreshAt: string | null;
  refreshing: boolean;
};

enum SwapDirection {
  FiatToBtc = "fiat-to-btc",
  BtcToFiat = "btc-to-fiat",
}

enum FiatCurrency {
  Kes = "KES",
  Usd = "USD",
  Ngn = "NGN",
  Ghs = "GHS",
  Tzs = "TZS",
  Ugx = "UGX",
  Zar = "ZAR",
  Eur = "EUR",
  Gbp = "GBP",
}

enum PaymentChannel {
  Mpesa = "mpesa",
  BankTransfer = "bank-transfer",
  Cash = "cash",
  MobileMoney = "mobile-money",
  Card = "card",
  Stablecoin = "stablecoin",
}

enum Network {
  Bitcoin = "bitcoin",
  Lightning = "lightning",
}

enum InvoiceAsset {
  Btc = "BTC",
}

enum InvoiceCurrency {
  Sats = "sats",
  Msats = "msats",
}

enum RequiredConfirmation {
  InvoiceHeld = "invoice_held",
  InvoicePaid = "invoice_paid",
}

enum ReleaseTrigger {
  CounterpartyFiatPaymentConfirmed = "counterparty_fiat_payment_confirmed",
}

enum RefundTrigger {
  TimeoutOrDisputeRefundDecision = "timeout_or_dispute_refund_decision",
}

enum DisputePolicy {
  OperatorResolved = "operator_resolved",
}

const SWAP_DIRECTION_OPTIONS = enumOptions(SwapDirection);
const FIAT_CURRENCY_OPTIONS = enumValues(FiatCurrency);
const PAYMENT_CHANNEL_OPTIONS = enumValues(PaymentChannel);
const SETTLEMENT_NETWORK_OPTIONS = enumValues(Network);
const ESCROW_TYPE_OPTIONS = enumOptions(EscrowType);
const NETWORK_OPTIONS = enumValues(Network);
const INVOICE_ASSET_OPTIONS = enumValues(InvoiceAsset);
const INVOICE_CURRENCY_OPTIONS = enumValues(InvoiceCurrency);
const REQUIRED_CONFIRMATION_OPTIONS = enumOptions(RequiredConfirmation);
const RELEASE_TRIGGER_OPTIONS = enumOptions(ReleaseTrigger);
const REFUND_TRIGGER_OPTIONS = enumOptions(RefundTrigger);
const DISPUTE_POLICY_OPTIONS = enumOptions(DisputePolicy);
const DRAWER_WIDTH = 272;
const AGENT_D_TAG = "agent";
const ESCROW_D_TAG = "escrow";
const NAV_ITEMS: { value: ActiveTab; label: string }[] = [
  { value: "discover", label: "Agent Discovery" },
  { value: "publish", label: "Agent Publishing" },
  { value: "escrow-discover", label: "Escrow Discovery" },
  { value: "escrow-publish", label: "Escrow Publishing" },
  { value: "settings", label: "Settings" },
];
const PIP_LINKS: Partial<Record<ActiveTab, { href: string; label: string }>> = {
  discover: {
    href: "https://github.com/pontmore/protocol/blob/main/PIP-00-agent-definition.md",
    label: "View PIP-00",
  },
  publish: {
    href: "https://github.com/pontmore/protocol/blob/main/PIP-00-agent-definition.md",
    label: "View PIP-00",
  },
  "escrow-discover": {
    href: "https://github.com/pontmore/protocol/blob/main/PIP-01-escrow-descriptor.md",
    label: "View PIP-01",
  },
  "escrow-publish": {
    href: "https://github.com/pontmore/protocol/blob/main/PIP-01-escrow-descriptor.md",
    label: "View PIP-01",
  },
};

export function AgentDirectory() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("discover");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [relays, setRelays] = useState<string[]>([...DEFAULT_RELAYS]);
  const [relayInput, setRelayInput] = useState([...DEFAULT_RELAYS].join("\n"));
  const [settingsState, setSettingsState] = useState<"idle" | "saved" | "failed">("idle");
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);
  const [escrowSecretKey, setEscrowSecretKey] = useState<Uint8Array | null>(null);
  const [name, setName] = useState("Pontmore Demo Agent");
  const [about, setAbout] = useState("A PIP-00 proof-of-concept agent profile.");
  const [swapTypes, setSwapTypes] = useState<string[]>([SwapDirection.FiatToBtc, SwapDirection.BtcToFiat]);
  const [fiatCurrencies, setFiatCurrencies] = useState<string[]>([FiatCurrency.Kes, FiatCurrency.Usd]);
  const [paymentChannels, setPaymentChannels] = useState<string[]>([PaymentChannel.Mpesa, PaymentChannel.BankTransfer]);
  const [settlementNetworks, setSettlementNetworks] = useState<string[]>([Network.Bitcoin, Network.Lightning]);
  const [regions, setRegions] = useState("KE");
  const [minLimit, setMinLimit] = useState("1000 KES");
  const [maxLimit, setMaxLimit] = useState("500000 KES");
  const [pricingPolicy, setPricingPolicy] = useState("quote-based spread published by operator");
  const [escrowAddress, setEscrowAddress] = useState("");
  const [escrowNotes, setEscrowNotes] = useState("Default escrow descriptor can be published with PIP-01.");
  const [publishState, setPublishState] = useState<PublishState>("idle");
  const [publishLog, setPublishLog] = useState<string[]>([]);
  const [directoryState, setDirectoryState] = useState<DirectoryState>("idle");
  const [directoryLog, setDirectoryLog] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [coordinate, setCoordinate] = useState("");
  const [agentLookupFilter, setAgentLookupFilter] = useState("");
  const [escrowDirectoryState, setEscrowDirectoryState] = useState<DirectoryState>("idle");
  const [escrowDirectoryLog, setEscrowDirectoryLog] = useState<string[]>([]);
  const [escrows, setEscrows] = useState<EscrowDescriptor[]>([]);
  const [escrowCoordinateInput, setEscrowCoordinateInput] = useState("");
  const [escrowLookupFilter, setEscrowLookupFilter] = useState("");
  const [escrowPublishState, setEscrowPublishState] = useState<PublishState>("idle");
  const [escrowPublishLog, setEscrowPublishLog] = useState<string[]>([]);
  const [escrowType, setEscrowType] = useState<string>(EscrowType.LightningHoldInvoice);
  const [escrowNetworks, setEscrowNetworks] = useState<string[]>([Network.Lightning]);
  const [requiredConfirmation, setRequiredConfirmation] = useState<string>(RequiredConfirmation.InvoiceHeld);
  const [disputePolicy, setDisputePolicy] = useState<string>(DisputePolicy.OperatorResolved);
  const [referenceFormat, setReferenceFormat] = useState("bolt11 invoice hash or swap escrow reference");
  const [invoiceNetwork, setInvoiceNetwork] = useState<string>(Network.Lightning);
  const [invoiceAsset, setInvoiceAsset] = useState<string>(InvoiceAsset.Btc);
  const [invoiceCurrency, setInvoiceCurrency] = useState<string>(InvoiceCurrency.Sats);
  const [invoiceAmountRule, setInvoiceAmountRule] = useState("derived from swap request");
  const [holdExpiryRule, setHoldExpiryRule] = useState("expires after unresolved timeout");
  const [settleAuthority, setSettleAuthority] = useState("escrow operator");
  const [cancelAuthority, setCancelAuthority] = useState("escrow operator");
  const [custodyAuthority, setCustodyAuthority] = useState("escrow_operator");
  const [releaseAuthority, setReleaseAuthority] = useState("escrow_operator");
  const [refundAuthority, setRefundAuthority] = useState("escrow_operator");
  const [invoiceExpiryRule, setInvoiceExpiryRule] = useState("expires_if_unpaid_before_funding_timeout");
  const [releaseTrigger, setReleaseTrigger] = useState<string>(ReleaseTrigger.CounterpartyFiatPaymentConfirmed);
  const [refundTrigger, setRefundTrigger] = useState<string>(RefundTrigger.TimeoutOrDisputeRefundDecision);
  const [preimageVisibility, setPreimageVisibility] = useState("operator-local");
  const [payoutNetwork, setPayoutNetwork] = useState<string>(Network.Lightning);
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [swapDirectionFilter, setSwapDirectionFilter] = useState("");
  const [paymentChannelFilter, setPaymentChannelFilter] = useState("");
  const [escrowFilter, setEscrowFilter] = useState("");
  const [escrowTypeFilter, setEscrowTypeFilter] = useState("");
  const [escrowNetworkFilter, setEscrowNetworkFilter] = useState("");
  const [escrowReferenceFormatFilter, setEscrowReferenceFormatFilter] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(SECRET_KEY_STORAGE);
    if (stored) {
      setSecretKey(hexToBytes(stored));
      return;
    }

    const generated = generateSecretKey();
    window.localStorage.setItem(SECRET_KEY_STORAGE, bytesToHex(generated));
    setSecretKey(generated);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(ESCROW_SECRET_KEY_STORAGE);
    if (stored) {
      setEscrowSecretKey(hexToBytes(stored));
      return;
    }

    if (secretKey) {
      setEscrowSecretKey(secretKey);
    }
  }, [secretKey]);

  useEffect(() => {
    const stored = window.localStorage.getItem(RELAYS_STORAGE);
    if (!stored) {
      return;
    }

    const parsed = parseRelayInput(stored);
    if (parsed.length === 0) {
      return;
    }

    setRelays(parsed);
    setRelayInput(parsed.join("\n"));
  }, []);

  useEffect(() => {
    void loadCachedAgents(true);
    void loadCachedEscrows(true);
  }, [relays]);

  useEffect(() => {
    if (escrowType !== EscrowType.LightningHoldInvoice) {
      return;
    }

    setEscrowNetworks([Network.Lightning]);
    setInvoiceNetwork(Network.Lightning);
    setPayoutNetwork(Network.Lightning);
  }, [escrowType]);

  const pubkey = useMemo(() => (secretKey ? getPublicKey(secretKey) : ""), [secretKey]);
  const npub = useMemo(() => (pubkey ? nip19.npubEncode(pubkey) : ""), [pubkey]);
  const nsec = useMemo(() => (secretKey ? nip19.nsecEncode(secretKey) : ""), [secretKey]);
  const escrowPubkey = useMemo(() => (escrowSecretKey ? getPublicKey(escrowSecretKey) : ""), [escrowSecretKey]);
  const escrowNpub = useMemo(() => (escrowPubkey ? nip19.npubEncode(escrowPubkey) : ""), [escrowPubkey]);
  const escrowNsec = useMemo(() => (escrowSecretKey ? nip19.nsecEncode(escrowSecretKey) : ""), [escrowSecretKey]);
  const effectiveEscrowAddress = escrowAddress.trim() || (pubkey ? `30361:${pubkey}:escrow` : "");
  const escrowAddressOptions = useMemo(() => {
    const discovered = escrows.map((escrow) => ({
      label: `${escrow.content?.escrow_type || escrow.escrowType || "Escrow"} (${escrow.identifier})`,
      value: escrowCoordinate(escrow),
    }));
    const fallback = effectiveEscrowAddress
      ? [{ label: `Default (${effectiveEscrowAddress})`, value: effectiveEscrowAddress }]
      : [];

    return uniqueByValue([...discovered, ...fallback]);
  }, [effectiveEscrowAddress, escrows]);
  const filterOptions = useMemo(() => buildFilterOptions(agents), [agents]);
  const escrowFilterOptions = useMemo(() => buildEscrowFilterOptions(escrows), [escrows]);
  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => (
        matchesLookup(agent.event.kind, agent.event.pubkey, agent.identifier, agentLookupFilter) &&
        matchesFilter(agentCurrencies(agent), currencyFilter) &&
        matchesFilter(agent.content?.capabilities?.swap_types, swapDirectionFilter) &&
        matchesFilter(agent.content?.capabilities?.payment_channels, paymentChannelFilter) &&
        matchesFilter([selectedEscrow(agent)], escrowFilter)
      )),
    [agentLookupFilter, agents, currencyFilter, escrowFilter, paymentChannelFilter, swapDirectionFilter],
  );
  const filteredEscrows = useMemo(
    () =>
      escrows.filter((escrow) => (
        matchesLookup(escrow.event.kind, escrow.event.pubkey, escrow.identifier, escrowLookupFilter) &&
        matchesFilter([escrow.content?.escrow_type || escrow.escrowType], escrowTypeFilter) &&
        matchesFilter(escrow.content?.networks || escrow.networks, escrowNetworkFilter) &&
        matchesFilter([escrow.content?.reference_format || ""], escrowReferenceFormatFilter)
      )),
    [escrowLookupFilter, escrowNetworkFilter, escrowReferenceFormatFilter, escrowTypeFilter, escrows],
  );
  const activeFilterCount = [agentLookupFilter, currencyFilter, swapDirectionFilter, paymentChannelFilter, escrowFilter].filter(Boolean).length;
  const activeEscrowFilterCount = [escrowLookupFilter, escrowTypeFilter, escrowNetworkFilter, escrowReferenceFormatFilter].filter(Boolean).length;
  const isLightningHoldEscrow = escrowType === EscrowType.LightningHoldInvoice;
  const isCustodialEscrow = escrowType === EscrowType.CustodialEscrow;
  const escrowNetworkOptions = isLightningHoldEscrow ? [Network.Lightning] : NETWORK_OPTIONS;
  const pageTitle = NAV_ITEMS.find((item) => item.value === activeTab)?.label ?? "Pontmore Protocol Next POC";
  const pagePipLink = PIP_LINKS[activeTab];
  const pageDescription = activeTab === "discover"
    ? `${filteredAgents.length} of ${agents.length} PIP-00 agent definition event(s) shown from configured relays.`
    : activeTab === "publish"
      ? "Create and publish a PIP-00 agent definition using the local agent identity."
      : activeTab === "escrow-discover"
        ? `${filteredEscrows.length} of ${escrows.length} PIP-01 escrow descriptor event(s) shown from configured relays.`
        : activeTab === "escrow-publish"
          ? "Create and publish a PIP-01 escrow descriptor using the escrow identity."
          : "Configure default relays used for publishing and discovery.";

  async function publishAgent() {
    if (!secretKey || !pubkey) {
      return;
    }

    setPublishState("publishing");
    setPublishLog([]);

    const unsignedEvent = buildAgentEvent({
      pubkey,
      identifier: AGENT_D_TAG,
      name,
      about,
      swapTypes,
      fiatCurrencies,
      paymentChannels,
      settlementNetworks,
      regions: parseList(regions),
      minLimit,
      maxLimit,
      pricingPolicy,
      escrowAddress: effectiveEscrowAddress,
      escrowNotes,
      relays,
    });
    const event = finalizeEvent(unsignedEvent, secretKey) as NostrEvent;

    try {
      const response = await fetch("/api/agents/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relays, event }),
      });
      const payload = await response.json();
      const results = Array.isArray(payload.results) ? payload.results as ApiRelayResult[] : [];
      setPublishLog(results.map((result) => `${result.relay}: ${result.ok ? "OK" : "failed"} - ${result.message}`));
      setPublishState(results.some((result) => result.ok) ? "published" : "failed");
    } catch {
      setPublishLog(["Server-side publish failed."]);
      setPublishState("failed");
    }
  }

  async function loadCachedAgents(background = false) {
    if (!background) {
      setDirectoryState("loading");
      setDirectoryLog([]);
    }

    try {
      const response = await fetch(`/api/agents?${relaySearchParams(relays)}`, { cache: "no-store" });
      const snapshot = await response.json() as DirectorySnapshot;
      applyAgentSnapshot(snapshot);
      setDirectoryState("loaded");

      if (snapshot.refreshing) {
        window.setTimeout(() => {
          void loadCachedAgents(true);
        }, 1600);
      }
    } catch {
      setDirectoryLog(["Unable to load server-side agent cache."]);
      setDirectoryState("failed");
    }
  }

  async function refreshDirectory() {
    setDirectoryState("loading");
    setDirectoryLog([]);

    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relays }),
    });
    const result = await response.json() as DirectorySnapshot;

    applyAgentSnapshot(result);
    setDirectoryState(result.results.some((item) => item.ok) || result.events.length > 0 ? "loaded" : "failed");
  }

  async function lookupCoordinate() {
    const lookupValue = coordinate.trim();
    if (!lookupValue) {
      setAgentLookupFilter("");
      setDirectoryLog(["Enter a pubkey or addressable coordinate."]);
      setDirectoryState("failed");
      return;
    }

    setAgentLookupFilter(lookupValue);
    setDirectoryState("loading");
    setDirectoryLog([]);

    const response = await fetch("/api/agents/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relays, coordinate: lookupValue }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setDirectoryLog([typeof payload.error === "string" ? payload.error : "Lookup failed."]);
      setDirectoryState("failed");
      return;
    }
    const result = await response.json() as DirectorySnapshot;
    const lookedUpAgents = result.events.map(parseAgentEvent);
    setAgents((current) => mergeDirectoryItems(current, lookedUpAgents));
    setDirectoryLog(result.results.map((item) => `${item.relay}: ${item.ok ? "OK" : "failed"} - ${item.message}`));
    setDirectoryState(result.results.some((item) => item.ok) || result.events.length > 0 ? "loaded" : "failed");
  }

  function applyAgentSnapshot(snapshot: DirectorySnapshot) {
    setAgents(snapshot.events.map(parseAgentEvent));
    setDirectoryLog(snapshot.results.map((item) => `${item.relay}: ${item.ok ? "OK" : "failed"} - ${item.message}`));
  }

  async function publishEscrow() {
    if (!escrowSecretKey || !escrowPubkey) {
      return;
    }

    setEscrowPublishState("publishing");
    setEscrowPublishLog([]);

    const unsignedEvent = buildEscrowEvent({
      pubkey: escrowPubkey,
      identifier: ESCROW_D_TAG,
      escrowType,
      networks: escrowNetworks,
      requiredConfirmation,
      releaseTrigger,
      refundTrigger,
      disputePolicy,
      referenceFormat,
      invoiceNetwork,
      invoiceAsset,
      invoiceCurrency,
      invoiceAmountRule,
      holdExpiryRule,
      settleAuthority,
      cancelAuthority,
      custodyAuthority,
      releaseAuthority,
      refundAuthority,
      invoiceExpiryRule,
      preimageVisibility,
      payoutNetwork,
    });
    const event = finalizeEvent(unsignedEvent, escrowSecretKey) as NostrEvent;

    try {
      const response = await fetch("/api/escrows/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relays, event }),
      });
      const payload = await response.json();
      const results = Array.isArray(payload.results) ? payload.results as ApiRelayResult[] : [];
      setEscrowPublishLog(results.map((result) => `${result.relay}: ${result.ok ? "OK" : "failed"} - ${result.message}`));
      setEscrowPublishState(results.some((result) => result.ok) ? "published" : "failed");
    } catch {
      setEscrowPublishLog(["Server-side escrow publish failed."]);
      setEscrowPublishState("failed");
    }
  }

  async function loadCachedEscrows(background = false) {
    if (!background) {
      setEscrowDirectoryState("loading");
      setEscrowDirectoryLog([]);
    }

    try {
      const response = await fetch(`/api/escrows?${relaySearchParams(relays)}`, { cache: "no-store" });
      const snapshot = await response.json() as DirectorySnapshot;
      applyEscrowSnapshot(snapshot);
      setEscrowDirectoryState("loaded");

      if (snapshot.refreshing) {
        window.setTimeout(() => {
          void loadCachedEscrows(true);
        }, 1600);
      }
    } catch {
      setEscrowDirectoryLog(["Unable to load server-side escrow cache."]);
      setEscrowDirectoryState("failed");
    }
  }

  async function refreshEscrowDirectory() {
    setEscrowDirectoryState("loading");
    setEscrowDirectoryLog([]);

    const response = await fetch("/api/escrows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relays }),
    });
    const result = await response.json() as DirectorySnapshot;
    applyEscrowSnapshot(result);
    setEscrowDirectoryState(result.results.some((item) => item.ok) || result.events.length > 0 ? "loaded" : "failed");
  }

  async function lookupEscrowCoordinate() {
    const lookupValue = escrowCoordinateInput.trim();
    if (!lookupValue) {
      setEscrowLookupFilter("");
      setEscrowDirectoryLog(["Enter an escrow pubkey or addressable coordinate."]);
      setEscrowDirectoryState("failed");
      return;
    }

    setEscrowLookupFilter(lookupValue);
    setEscrowDirectoryState("loading");
    setEscrowDirectoryLog([]);

    const response = await fetch("/api/escrows/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relays, coordinate: lookupValue }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setEscrowDirectoryLog([typeof payload.error === "string" ? payload.error : "Escrow lookup failed."]);
      setEscrowDirectoryState("failed");
      return;
    }

    const result = await response.json() as DirectorySnapshot;
    const lookedUpEscrows = result.events.map(parseEscrowEvent);
    setEscrows((current) => mergeDirectoryItems(current, lookedUpEscrows));
    setEscrowDirectoryLog(result.results.map((item) => `${item.relay}: ${item.ok ? "OK" : "failed"} - ${item.message}`));
    setEscrowDirectoryState(result.results.some((item) => item.ok) || result.events.length > 0 ? "loaded" : "failed");
  }

  function applyEscrowSnapshot(snapshot: DirectorySnapshot) {
    setEscrows(snapshot.events.map(parseEscrowEvent));
    setEscrowDirectoryLog(snapshot.results.map((item) => `${item.relay}: ${item.ok ? "OK" : "failed"} - ${item.message}`));
  }

  function resetIdentity() {
    const generated = generateSecretKey();
    loadAgentIdentity(generated);
  }

  function loadAgentIdentity(secret: Uint8Array) {
    window.localStorage.setItem(SECRET_KEY_STORAGE, bytesToHex(secret));
    setSecretKey(secret);
    setPublishState("idle");
    setPublishLog([]);
    void loadAgentDefinitionForIdentity(getPublicKey(secret));
  }

  function generateFreshEscrowIdentity() {
    const generated = generateSecretKey();
    loadEscrowIdentity(generated);
  }

  function loadEscrowIdentity(secret: Uint8Array) {
    window.localStorage.setItem(ESCROW_SECRET_KEY_STORAGE, bytesToHex(secret));
    setEscrowSecretKey(secret);
    setEscrowPublishState("idle");
    setEscrowPublishLog([]);
    void loadEscrowDefinitionForIdentity(getPublicKey(secret));
  }

  async function loadAgentDefinitionForIdentity(identityPubkey: string) {
    const snapshot = await lookupDefinition(`/api/agents/lookup`, `${PIP00_AGENT_KIND}:${identityPubkey}:agent`);
    if (!snapshot) {
      return;
    }

    applyAgentSnapshot(snapshot);
    const definition = snapshot.events
      .map(parseAgentEvent)
      .find((agent) => agent.event.pubkey === identityPubkey && agent.identifier === "agent" && agent.content);

    if (definition) {
      prefillAgentForm(definition);
    }
  }

  async function loadEscrowDefinitionForIdentity(identityPubkey: string) {
    const snapshot = await lookupDefinition(`/api/escrows/lookup`, `${PIP01_ESCROW_KIND}:${identityPubkey}:escrow`);
    if (!snapshot) {
      return;
    }

    applyEscrowSnapshot(snapshot);
    const definition = snapshot.events
      .map(parseEscrowEvent)
      .find((escrow) => escrow.event.pubkey === identityPubkey && escrow.identifier === "escrow" && escrow.content);

    if (definition) {
      prefillEscrowForm(definition);
    }
  }

  async function lookupDefinition(endpoint: string, coordinateValue: string): Promise<DirectorySnapshot | null> {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relays, coordinate: coordinateValue }),
      });

      if (!response.ok) {
        return null;
      }

      return await response.json() as DirectorySnapshot;
    } catch {
      return null;
    }
  }

  function prefillAgentForm(agent: AgentDefinition) {
    const content = agent.content;
    if (!content) {
      return;
    }

    setName(content.name || name);
    setAbout(content.about || about);
    setSwapTypes(normalizeOptionList(content.capabilities?.swap_types));
    setFiatCurrencies(normalizeOptionList(content.capabilities?.fiat_currencies));
    setPaymentChannels(normalizeOptionList(content.capabilities?.payment_channels));
    setSettlementNetworks(normalizeOptionList(content.capabilities?.settlement_networks));
    setRegions(normalizeOptionList(content.capabilities?.regions).join(", "));
    setMinLimit(content.capabilities?.limits?.min || minLimit);
    setMaxLimit(content.capabilities?.limits?.max || maxLimit);
    setPricingPolicy(content.pricing_policy || pricingPolicy);
    setEscrowAddress(content.escrow?.descriptor || agent.escrowAddress || "");
    setEscrowNotes(content.escrow?.notes || escrowNotes);
  }

  function prefillEscrowForm(escrow: EscrowDescriptor) {
    const content = escrow.content;
    if (!content) {
      return;
    }

    setEscrowType(content.escrow_type || escrow.escrowType || EscrowType.LightningHoldInvoice);
    setEscrowNetworks(normalizeOptionList(content.networks));
    setRequiredConfirmation(content.funding_rules?.required_confirmation || requiredConfirmation);
    setReleaseTrigger(content.release_rules?.release_trigger || releaseTrigger);
    setRefundTrigger(content.release_rules?.refund_trigger || refundTrigger);
    setDisputePolicy(content.dispute_rules?.policy || disputePolicy);
    setReferenceFormat(content.reference_format || referenceFormat);
    setInvoiceNetwork(content.invoice_network || invoiceNetwork);
    setInvoiceAsset(content.invoice_asset || invoiceAsset);
    setInvoiceCurrency(content.invoice_currency || invoiceCurrency);
    setInvoiceAmountRule(content.invoice_amount_rule || invoiceAmountRule);
    setHoldExpiryRule(content.hold_expiry_rule || holdExpiryRule);
    setSettleAuthority(content.settle_authority || settleAuthority);
    setCancelAuthority(content.cancel_authority || cancelAuthority);
    setCustodyAuthority(content.custody_authority || custodyAuthority);
    setReleaseAuthority(content.release_authority || releaseAuthority);
    setRefundAuthority(content.refund_authority || refundAuthority);
    setInvoiceExpiryRule(content.invoice_expiry_rule || invoiceExpiryRule);
    setPreimageVisibility(content.preimage_visibility || preimageVisibility);
    setPayoutNetwork(content.payout_network || payoutNetwork);
  }

  function saveSettings() {
    const parsed = parseRelayInput(relayInput);
    if (parsed.length === 0) {
      setSettingsState("failed");
      return;
    }

    setRelays(parsed);
    setRelayInput(parsed.join("\n"));
    window.localStorage.setItem(RELAYS_STORAGE, parsed.join("\n"));
    setSettingsState("saved");
    window.setTimeout(() => setSettingsState("idle"), 1800);
  }

  function resetSettings() {
    const defaults = [...DEFAULT_RELAYS];
    setRelays(defaults);
    setRelayInput(defaults.join("\n"));
    window.localStorage.removeItem(RELAYS_STORAGE);
    setSettingsState("saved");
    window.setTimeout(() => setSettingsState("idle"), 1800);
  }

  function clearAgentFilters() {
    setCoordinate("");
    setAgentLookupFilter("");
    setCurrencyFilter("");
    setSwapDirectionFilter("");
    setPaymentChannelFilter("");
    setEscrowFilter("");
  }

  function clearEscrowFilters() {
    setEscrowCoordinateInput("");
    setEscrowLookupFilter("");
    setEscrowTypeFilter("");
    setEscrowNetworkFilter("");
    setEscrowReferenceFormatFilter("");
  }

  function editAgentFromListing(agent: AgentDefinition) {
    prefillAgentForm(agent);
    setActiveTab("publish");
  }

  function editEscrowFromListing(escrow: EscrowDescriptor) {
    prefillEscrowForm(escrow);
    setActiveTab("escrow-publish");
  }

  function selectTab(value: ActiveTab) {
    setActiveTab(value);
    setMobileNavOpen(false);
  }

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar disableGutters>
          <IconButton edge="start" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)} sx={{ display: { md: "none" }, mr: 1 }}>
            <MenuIcon />
          </IconButton>
          <Box sx={{ alignItems: "center", display: { xs: "none", md: "flex" }, height: "100%", px: 3, width: DRAWER_WIDTH }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 800 }}>
              Pontmore Protocol Next POC
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} />
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", flex: 1, px: { xs: 0, md: 3 } }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 800 }}>
              {pageTitle}
            </Typography>
            {pagePipLink ? (
              <Link
                href={pagePipLink.href}
                target="_blank"
                rel="noreferrer"
                underline="hover"
                sx={{ fontSize: 14, fontWeight: 700 }}
              >
                {pagePipLink.label}
              </Link>
            ) : null}
          </Stack>
          <Box sx={{ bgcolor: "action.selected", borderRadius: "50%", height: 32, mr: 3, width: 32 }} />
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            top: 64,
            height: "calc(100% - 64px)",
          },
        }}
      >
        <DashboardNav activeTab={activeTab} onSelect={selectTab} />
      </Drawer>

      <Drawer
        variant="temporary"
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
          },
        }}
      >
        <DashboardNav activeTab={activeTab} onSelect={selectTab} />
      </Drawer>

      <Box
        component="main"
        sx={{
          minHeight: "100vh",
          pl: { md: `${DRAWER_WIDTH}px` },
          pt: 7,
        }}
      >
        <Stack spacing={3} sx={{ p: { xs: 2, md: 3 }, maxWidth: "none" }}>
          <Box>
            <Typography color="text.secondary" sx={{ maxWidth: 980 }}>
              {pageDescription}
            </Typography>
          </Box>

        {activeTab === "publish" ? (
          <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", md: "320px 1fr" }, alignItems: "start" }}>
            <IdentityPanel
              title="Agent Identity"
              note="Agent signing keys are generated in this browser and stored in localStorage on this device."
              publicLabel="Agent public key (npub)"
              secretLabel="Agent secret key (nsec)"
              npub={npub}
              nsec={nsec}
              fallbackText="Generating..."
              actionLabel="Generate New Agent Identity"
              onAction={resetIdentity}
              onImport={loadAgentIdentity}
            />

            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Typography variant="h5" component="h2" sx={{ fontWeight: 800 }}>Agent Definition</Typography>
                    <Chip label={`d: ${AGENT_D_TAG}`} variant="outlined" />
                  </Stack>

                  <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" } }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, gridColumn: "1 / -1" }}>Profile</Typography>
                    <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} sx={{ gridColumn: "1 / -1" }} />
                    <TextField label="About" value={about} onChange={(event) => setAbout(event.target.value)} multiline minRows={3} sx={{ gridColumn: "1 / -1" }} />

                    <Typography variant="subtitle2" sx={{ fontWeight: 800, gridColumn: "1 / -1", mt: 1 }}>Capabilities</Typography>
                    <FormControl>
                      <InputLabel id="swap-directions-label">Swap directions</InputLabel>
                      <Select
                        labelId="swap-directions-label"
                        multiple
                        value={swapTypes}
                        onChange={(event) => setSwapTypes(selectedMuiValues(event))}
                        input={<OutlinedInput label="Swap directions" />}
                        renderValue={(selected) => renderSelectedChips(selected, SWAP_DIRECTION_OPTIONS)}
                      >
                        {SWAP_DIRECTION_OPTIONS.map((option) => (
                          <MenuItem value={option.value} key={option.value}>{option.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl>
                      <InputLabel id="fiat-currencies-label">Fiat currencies</InputLabel>
                      <Select
                        labelId="fiat-currencies-label"
                        multiple
                        value={fiatCurrencies}
                        onChange={(event) => setFiatCurrencies(selectedMuiValues(event))}
                        input={<OutlinedInput label="Fiat currencies" />}
                        renderValue={(selected) => renderSelectedChips(selected, FIAT_CURRENCY_OPTIONS.map((currency) => ({ value: currency, label: currency })))}
                      >
                        {FIAT_CURRENCY_OPTIONS.map((currency) => (
                          <MenuItem value={currency} key={currency}>{currency}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl>
                      <InputLabel id="payment-channels-label">Payment channels</InputLabel>
                      <Select
                        labelId="payment-channels-label"
                        multiple
                        value={paymentChannels}
                        onChange={(event) => setPaymentChannels(selectedMuiValues(event))}
                        input={<OutlinedInput label="Payment channels" />}
                        renderValue={(selected) => renderSelectedChips(selected, PAYMENT_CHANNEL_OPTIONS.map((channel) => ({ value: channel, label: formatProtocolValue(channel) })))}
                      >
                        {PAYMENT_CHANNEL_OPTIONS.map((channel) => (
                          <MenuItem value={channel} key={channel}>{formatProtocolValue(channel)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl>
                      <InputLabel id="settlement-networks-label">Settlement networks</InputLabel>
                      <Select
                        labelId="settlement-networks-label"
                        multiple
                        value={settlementNetworks}
                        onChange={(event) => setSettlementNetworks(selectedMuiValues(event))}
                        input={<OutlinedInput label="Settlement networks" />}
                        renderValue={(selected) => renderSelectedChips(selected, SETTLEMENT_NETWORK_OPTIONS.map((network) => ({ value: network, label: formatProtocolValue(network) })))}
                      >
                        {SETTLEMENT_NETWORK_OPTIONS.map((network) => (
                          <MenuItem value={network} key={network}>{formatProtocolValue(network)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField label="Regions" value={regions} onChange={(event) => setRegions(event.target.value)} />
                    <TextField label="Minimum" value={minLimit} onChange={(event) => setMinLimit(event.target.value)} />
                    <TextField label="Maximum" value={maxLimit} onChange={(event) => setMaxLimit(event.target.value)} />
                    <TextField label="Pricing policy" value={pricingPolicy} onChange={(event) => setPricingPolicy(event.target.value)} sx={{ gridColumn: "1 / -1" }} />

                    <Typography variant="subtitle2" sx={{ fontWeight: 800, gridColumn: "1 / -1", mt: 1 }}>Escrow Selection</Typography>
                    <Autocomplete
                      freeSolo
                      options={escrowAddressOptions}
                      getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
                      inputValue={escrowAddress}
                      onInputChange={(_, value) => setEscrowAddress(value)}
                      onChange={(_, option) => {
                        if (typeof option === "string") {
                          setEscrowAddress(option);
                          return;
                        }

                        setEscrowAddress(option?.value ?? "");
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Escrow descriptor address"
                          placeholder={effectiveEscrowAddress}
                        />
                      )}
                      sx={{ gridColumn: "1 / -1" }}
                    />
                    <TextField label="Escrow notes" value={escrowNotes} onChange={(event) => setEscrowNotes(event.target.value)} multiline minRows={3} sx={{ gridColumn: "1 / -1" }} />
                  </Box>

                  {publishLog.length > 0 ? <StatusLog title="Publish results" lines={publishLog} severity={publishState === "failed" ? "error" : "info"} /> : null}
                  <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                    <Button variant="contained" onClick={publishAgent} disabled={!secretKey || publishState === "publishing"}>
                      {publishState === "publishing" ? "Publishing..." : "Publish Agent"}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Box>
        ) : null}

        {activeTab === "escrow-publish" ? (
          <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", md: "320px 1fr" }, alignItems: "start" }}>
            <IdentityPanel
              title="Escrow Identity"
              note="Escrow descriptors default to the agent identity until a fresh escrow identity is generated and stored locally."
              publicLabel="Escrow public key (npub)"
              secretLabel="Escrow secret key (nsec)"
              npub={escrowNpub}
              nsec={escrowNsec}
              fallbackText="Using agent identity..."
              actionLabel="Generate New Escrow Identity"
              onAction={generateFreshEscrowIdentity}
              onImport={loadEscrowIdentity}
            />

            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Typography variant="h5" component="h2" sx={{ fontWeight: 800 }}>Escrow Descriptor</Typography>
                    <Chip label={`d: ${ESCROW_D_TAG}`} variant="outlined" />
                  </Stack>

                  <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" } }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, gridColumn: "1 / -1" }}>Descriptor</Typography>
                    <TextField label="Escrow type" select value={escrowType} onChange={(event) => setEscrowType(event.target.value)}>
                      {ESCROW_TYPE_OPTIONS.map((option) => (
                        <MenuItem value={option.value} key={option.value}>{option.label}</MenuItem>
                      ))}
                    </TextField>
                    <FormControl>
                      <InputLabel id="escrow-networks-label">Networks</InputLabel>
                      <Select
                        labelId="escrow-networks-label"
                        multiple
                        value={escrowNetworks}
                        onChange={(event) => setEscrowNetworks(isLightningHoldEscrow ? [Network.Lightning] : selectedMuiValues(event))}
                        input={<OutlinedInput label="Networks" />}
                        renderValue={(selected) => renderSelectedChips(selected, escrowNetworkOptions.map((network) => ({ value: network, label: formatProtocolValue(network) })))}
                      >
                        {escrowNetworkOptions.map((network) => (
                          <MenuItem value={network} key={network}>{formatProtocolValue(network)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField label="Reference format" value={referenceFormat} onChange={(event) => setReferenceFormat(event.target.value)} />

                    <Typography variant="subtitle2" sx={{ fontWeight: 800, gridColumn: "1 / -1", mt: 1 }}>Rules</Typography>
                    <TextField label="Required confirmation" select value={requiredConfirmation} onChange={(event) => setRequiredConfirmation(event.target.value)}>
                      {REQUIRED_CONFIRMATION_OPTIONS.map((option) => (
                        <MenuItem value={option.value} key={option.value}>{option.label}</MenuItem>
                      ))}
                    </TextField>
                    <TextField label="Dispute policy" select value={disputePolicy} onChange={(event) => setDisputePolicy(event.target.value)}>
                      {DISPUTE_POLICY_OPTIONS.map((option) => (
                        <MenuItem value={option.value} key={option.value}>{option.label}</MenuItem>
                      ))}
                    </TextField>
                    <TextField label="Release trigger" select value={releaseTrigger} onChange={(event) => setReleaseTrigger(event.target.value)}>
                      {RELEASE_TRIGGER_OPTIONS.map((option) => (
                        <MenuItem value={option.value} key={option.value}>{option.label}</MenuItem>
                      ))}
                    </TextField>
                    <TextField label="Refund trigger" select value={refundTrigger} onChange={(event) => setRefundTrigger(event.target.value)}>
                      {REFUND_TRIGGER_OPTIONS.map((option) => (
                        <MenuItem value={option.value} key={option.value}>{option.label}</MenuItem>
                      ))}
                    </TextField>
                    {(isLightningHoldEscrow || isCustodialEscrow) ? (
                      <>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, gridColumn: "1 / -1", mt: 1 }}>Invoice</Typography>
                        <TextField label="Invoice network" select value={invoiceNetwork} onChange={(event) => setInvoiceNetwork(event.target.value)}>
                          {NETWORK_OPTIONS.map((network) => (
                            <MenuItem value={network} key={network}>{formatProtocolValue(network)}</MenuItem>
                          ))}
                        </TextField>
                        <TextField label="Invoice asset" select value={invoiceAsset} onChange={(event) => setInvoiceAsset(event.target.value)}>
                          {INVOICE_ASSET_OPTIONS.map((asset) => (
                            <MenuItem value={asset} key={asset}>{asset}</MenuItem>
                          ))}
                        </TextField>
                        <TextField label="Invoice currency" select value={invoiceCurrency} onChange={(event) => setInvoiceCurrency(event.target.value)}>
                          {INVOICE_CURRENCY_OPTIONS.map((currency) => (
                            <MenuItem value={currency} key={currency}>{currency}</MenuItem>
                          ))}
                        </TextField>
                        <TextField label="Invoice amount rule" value={invoiceAmountRule} onChange={(event) => setInvoiceAmountRule(event.target.value)} />
                      </>
                    ) : null}
                    {isLightningHoldEscrow ? (
                      <>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, gridColumn: "1 / -1", mt: 1 }}>Hold Invoice Controls</Typography>
                        <TextField label="Hold expiry rule" value={holdExpiryRule} onChange={(event) => setHoldExpiryRule(event.target.value)} />
                        <TextField label="Settle authority" value={settleAuthority} onChange={(event) => setSettleAuthority(event.target.value)} />
                        <TextField label="Cancel authority" value={cancelAuthority} onChange={(event) => setCancelAuthority(event.target.value)} />
                        <TextField label="Preimage visibility" value={preimageVisibility} onChange={(event) => setPreimageVisibility(event.target.value)} />
                      </>
                    ) : null}
                    {isCustodialEscrow ? (
                      <>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, gridColumn: "1 / -1", mt: 1 }}>Custody Controls</Typography>
                        <TextField label="Invoice expiry rule" value={invoiceExpiryRule} onChange={(event) => setInvoiceExpiryRule(event.target.value)} />
                        <TextField label="Custody authority" value={custodyAuthority} onChange={(event) => setCustodyAuthority(event.target.value)} />
                        <TextField label="Release authority" value={releaseAuthority} onChange={(event) => setReleaseAuthority(event.target.value)} />
                        <TextField label="Refund authority" value={refundAuthority} onChange={(event) => setRefundAuthority(event.target.value)} />
                      </>
                    ) : null}
                    {(isLightningHoldEscrow || isCustodialEscrow) ? (
                      <TextField label="Payout network" select value={payoutNetwork} onChange={(event) => setPayoutNetwork(event.target.value)}>
                        {NETWORK_OPTIONS.map((network) => (
                          <MenuItem value={network} key={network}>{formatProtocolValue(network)}</MenuItem>
                        ))}
                      </TextField>
                    ) : null}
                  </Box>

                  {escrowPublishLog.length > 0 ? <StatusLog title="Publish results" lines={escrowPublishLog} severity={escrowPublishState === "failed" ? "error" : "info"} /> : null}
                  <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                    <Button variant="contained" onClick={publishEscrow} disabled={!escrowSecretKey || escrowPublishState === "publishing"}>
                      {escrowPublishState === "publishing" ? "Publishing..." : "Publish Escrow Descriptor"}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Box>
        ) : null}

        {activeTab === "discover" ? (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "flex-end", alignItems: { xs: "stretch", sm: "center" } }}>
              <Button variant="contained" onClick={refreshDirectory} disabled={directoryState === "loading"}>
                {directoryState === "loading" ? "Refreshing..." : "Refresh directory"}
              </Button>
            </Stack>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0, 1fr)) auto" }, alignItems: "center" }}>
                <FilterSelect label="Currency" value={currencyFilter} options={filterOptions.currencies} onChange={setCurrencyFilter} />
                <FilterSelect label="Swap direction" value={swapDirectionFilter} options={filterOptions.swapDirections} onChange={setSwapDirectionFilter} formatOption={formatProtocolValue} />
                <FilterSelect label="Payment channel" value={paymentChannelFilter} options={filterOptions.paymentChannels} onChange={setPaymentChannelFilter} formatOption={formatProtocolValue} />
                <FilterSelect label="Selected escrow" value={escrowFilter} options={filterOptions.escrows} onChange={setEscrowFilter} />
                <Button variant="outlined" onClick={clearAgentFilters} disabled={activeFilterCount === 0}>Clear filters</Button>
              </Box>
            </Paper>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 380px" }, alignItems: "start" }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
                  <TextField
                    fullWidth
                    label="Pubkey or coordinate"
                    value={coordinate}
                    placeholder="<pubkey> or 30360:<pubkey>:agent"
                    onChange={(event) => {
                      setCoordinate(event.target.value);
                      if (!event.target.value.trim()) {
                        setAgentLookupFilter("");
                      }
                    }}
                  />
                  <Button variant="contained" onClick={lookupCoordinate} disabled={directoryState === "loading"} sx={{ minWidth: 120 }}>
                    {directoryState === "loading" ? "Looking..." : "Lookup"}
                  </Button>
                </Stack>
              </Paper>
              {directoryLog.length > 0 ? <StatusLog title="Relay reads" lines={directoryLog} severity={directoryState === "failed" ? "error" : "info"} /> : null}
            </Box>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
              {filteredAgents.map((agent) => (
                <AgentCard
                  agent={agent}
                  activeAgentPubkey={pubkey}
                  onEdit={editAgentFromListing}
                  key={agent.event.id}
                />
              ))}
            </Box>
          </Stack>
        ) : null}

        {activeTab === "escrow-discover" ? (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "flex-end", alignItems: { xs: "stretch", sm: "center" } }}>
              <Button variant="contained" onClick={refreshEscrowDirectory} disabled={escrowDirectoryState === "loading"}>
                {escrowDirectoryState === "loading" ? "Refreshing..." : "Refresh escrows"}
              </Button>
            </Stack>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr)) auto" }, alignItems: "center" }}>
                <FilterSelect label="Escrow type" value={escrowTypeFilter} options={escrowFilterOptions.types} onChange={setEscrowTypeFilter} formatOption={formatProtocolValue} />
                <FilterSelect label="Network" value={escrowNetworkFilter} options={escrowFilterOptions.networks} onChange={setEscrowNetworkFilter} formatOption={formatProtocolValue} />
                <FilterSelect label="Reference format" value={escrowReferenceFormatFilter} options={escrowFilterOptions.referenceFormats} onChange={setEscrowReferenceFormatFilter} />
                <Button variant="outlined" onClick={clearEscrowFilters} disabled={activeEscrowFilterCount === 0}>Clear filters</Button>
              </Box>
            </Paper>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 380px" }, alignItems: "start" }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
                  <TextField
                    fullWidth
                    label="Pubkey or coordinate"
                    value={escrowCoordinateInput}
                    placeholder="<pubkey> or 30361:<pubkey>:escrow"
                    onChange={(event) => {
                      setEscrowCoordinateInput(event.target.value);
                      if (!event.target.value.trim()) {
                        setEscrowLookupFilter("");
                      }
                    }}
                  />
                  <Button variant="contained" onClick={lookupEscrowCoordinate} disabled={escrowDirectoryState === "loading"} sx={{ minWidth: 120 }}>
                    {escrowDirectoryState === "loading" ? "Looking..." : "Lookup"}
                  </Button>
                </Stack>
              </Paper>
              {escrowDirectoryLog.length > 0 ? <StatusLog title="Relay reads" lines={escrowDirectoryLog} severity={escrowDirectoryState === "failed" ? "error" : "info"} /> : null}
            </Box>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
              {filteredEscrows.map((escrow) => (
                <EscrowCard
                  escrow={escrow}
                  activeEscrowPubkey={escrowPubkey}
                  onEdit={editEscrowFromListing}
                  key={escrow.event.id}
                />
              ))}
            </Box>
          </Stack>
        ) : null}

        {activeTab === "settings" ? (
          <Card variant="outlined" sx={{ width: "100%" }}>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } }}>
                  <Box>
                    <Typography variant="h5" component="h2" sx={{ fontWeight: 800 }}>Relay Defaults</Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" onClick={resetSettings}>Reset</Button>
                    <Button variant="contained" onClick={saveSettings}>{settingsState === "saved" ? "Saved" : "Save"}</Button>
                  </Stack>
                </Stack>

                <TextField
                  label="Default relays"
                  value={relayInput}
                  onChange={(event) => {
                    setRelayInput(event.target.value);
                    setSettingsState("idle");
                  }}
                  multiline
                  minRows={5}
                />
                {settingsState === "failed" ? <Alert severity="error">Enter at least one relay URL.</Alert> : null}
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {relays.map((relay) => (
                    <Chip label={relay} key={relay} variant="outlined" />
                  ))}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ) : null}
        </Stack>
      </Box>
    </Box>
  );
}

function DashboardNav({ activeTab, onSelect }: { activeTab: ActiveTab; onSelect: (value: ActiveTab) => void }) {
  return (
    <Stack sx={{ height: "100%" }}>
      <Box sx={{ display: { md: "none" }, p: 2.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
          Pontmore Protocol Next POC
        </Typography>
      </Box>
      <Divider />
      <List component="nav" aria-label="Pontmore POC sections" sx={{ p: 1 }}>
        {NAV_ITEMS.map((item) => (
          <ListItemButton
            selected={activeTab === item.value}
            onClick={() => onSelect(item.value)}
            key={item.value}
            sx={{ borderRadius: 1 }}
          >
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Stack>
  );
}

function StatusLog({ title, lines, severity = "info" }: { title: string; lines: string[]; severity?: "info" | "error" }) {
  return (
    <Alert severity={severity}>
      <Typography sx={{ mb: 0.5, fontWeight: 800 }}>{title}</Typography>
      <Stack spacing={0.25}>
        {lines.map((line) => (
          <Typography variant="body2" sx={{ overflowWrap: "anywhere" }} key={line}>{line}</Typography>
        ))}
      </Stack>
    </Alert>
  );
}

function IdentityPanel({
  title,
  note,
  publicLabel,
  secretLabel,
  npub,
  nsec,
  fallbackText,
  actionLabel,
  onAction,
  onImport,
}: {
  title: string;
  note: string;
  publicLabel: string;
  secretLabel: string;
  npub: string;
  nsec: string;
  fallbackText: string;
  actionLabel: string;
  onAction: () => void;
  onImport: (secret: Uint8Array) => void;
}) {
  const [npubCopyState, setNpubCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [nsecCopyState, setNsecCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [importValue, setImportValue] = useState("");
  const [importState, setImportState] = useState<"idle" | "loaded" | "failed">("idle");
  const [importMode, setImportMode] = useState(false);
  const identityName = title.replace(/\s+Identity$/, "");

  function importNsec() {
    try {
      const decoded = nip19.decode(importValue.trim());
      if (decoded.type !== "nsec" || !(decoded.data instanceof Uint8Array)) {
        setImportState("failed");
        return;
      }

      onImport(decoded.data);
      setImportValue("");
      setImportMode(false);
      setImportState("loaded");
      window.setTimeout(() => setImportState("idle"), 1800);
    } catch {
      setImportState("failed");
    }
  }

  return (
    <Card variant="outlined" sx={{ position: { md: "sticky" }, top: { md: 20 } }}>
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 800 }}>{title}</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>{note}</Typography>
          </Box>
          <Divider />
          <Stack spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: "uppercase" }}>{publicLabel}</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: "stretch" }}>
              <Paper variant="outlined" sx={{ p: 1, flex: 1, bgcolor: "action.hover", overflowWrap: "anywhere", fontFamily: "monospace", fontSize: 12 }}>
                {npub || fallbackText}
              </Paper>
              <Button variant="outlined" onClick={() => copyIdentityValue(npub, setNpubCopyState)} disabled={!npub}>
                {npubCopyState === "copied" ? "Copied" : "Copy"}
              </Button>
            </Stack>
            {npubCopyState === "failed" ? <Alert severity="error">Clipboard write failed.</Alert> : null}
          </Stack>
          <Stack spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: "uppercase" }}>{secretLabel}</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: "stretch" }}>
              <Paper variant="outlined" sx={{ p: 1, flex: 1, bgcolor: "action.hover", overflowWrap: "anywhere", fontFamily: "monospace", fontSize: 12 }}>
                {nsec ? `${nsec.slice(0, 18)}...${nsec.slice(-8)}` : fallbackText}
              </Paper>
              <Button variant="outlined" onClick={() => copyIdentityValue(nsec, setNsecCopyState)} disabled={!nsec}>
                {nsecCopyState === "copied" ? "Copied" : "Copy"}
              </Button>
            </Stack>
            {nsecCopyState === "failed" ? <Alert severity="error">Clipboard write failed.</Alert> : null}
          </Stack>
          {importMode ? (
            <Stack spacing={1}>
              <TextField
                label="Paste nsec"
                value={importValue}
                onChange={(event) => {
                  setImportValue(event.target.value);
                  setImportState("idle");
                }}
                placeholder="nsec1..."
                type="password"
              />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={importNsec} disabled={!importValue.trim()} sx={{ flex: 1 }}>
                  {importState === "loaded" ? "Loaded" : "Load"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setImportMode(false);
                    setImportValue("");
                    setImportState("idle");
                  }}
                >
                  Cancel
                </Button>
              </Stack>
              {importState === "failed" ? <Alert severity="error">Enter a valid nsec.</Alert> : null}
            </Stack>
          ) : (
            <Stack spacing={1} sx={{ textAlign: "center" }}>
              <Button variant="outlined" onClick={onAction}>{actionLabel}</Button>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase" }}>or</Typography>
              <Button variant="outlined" onClick={() => setImportMode(true)}>
                Load Existing {identityName} Identity
              </Button>
              {importState === "loaded" ? <Alert severity="success">Identity loaded.</Alert> : null}
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  formatOption = (option) => option,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  formatOption?: (option: string) => string;
}) {
  return (
    <TextField label={label} select value={value} onChange={(event) => onChange(event.target.value)} fullWidth>
      <MenuItem value="">All</MenuItem>
      {options.map((option) => (
        <MenuItem value={option} key={option}>{formatOption(option)}</MenuItem>
      ))}
    </TextField>
  );
}

function AgentCard({
  agent,
  activeAgentPubkey,
  onEdit,
}: {
  agent: AgentDefinition;
  activeAgentPubkey: string;
  onEdit: (agent: AgentDefinition) => void;
}) {
  const canEdit = Boolean(activeAgentPubkey) && agent.event.pubkey === activeAgentPubkey && agent.identifier === "agent";
  const [coordinateCopyState, setCoordinateCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [pubkeyCopyState, setPubkeyCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [definitionCopyState, setDefinitionCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [showJson, setShowJson] = useState(false);
  const coordinate = `${agent.event.kind}:${agent.event.pubkey}:${agent.identifier}`;
  const npub = nip19.npubEncode(agent.event.pubkey);
  const agentJson = JSON.stringify(
    {
      coordinate,
      npub,
      identifier: agent.identifier,
      content: agent.content,
      event: agent.event,
    },
    null,
    2,
  );

  return (
    <DirectoryDefinitionCard
      identifier={agent.identifier}
      createdAt={agent.event.created_at}
      json={agentJson}
      showJson={showJson}
      toggleLabel={showJson ? "Show agent summary" : "Show agent JSON"}
      onToggleJson={() => setShowJson((current) => !current)}
      copyState={definitionCopyState}
      onCopyDefinition={() => copyIdentityValue(agentJson, setDefinitionCopyState)}
      editAction={
        canEdit ? (
          <Button variant="outlined" size="small" onClick={() => onEdit(agent)}>
            Edit in Publishing
          </Button>
        ) : null
      }
    >
      <Box>
        <Typography variant="h6" component="h3" sx={{ fontWeight: 800 }}>
          {agent.content?.name || "Unnamed agent"}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {agent.content?.about || (agent.malformedContent ? "Content is not valid JSON." : "No description.")}
        </Typography>
      </Box>
      <CopyableDetail
        label="Coordinate"
        value={coordinate}
        copyState={coordinateCopyState}
        onCopy={() => copyIdentityValue(coordinate, setCoordinateCopyState)}
      />
      <CopyableDetail
        label="Pubkey"
        value={npub}
        copyState={pubkeyCopyState}
        onCopy={() => copyIdentityValue(npub, setPubkeyCopyState)}
      />
      <Detail label="Currencies">
        <CurrencyPills values={agentCurrencies(agent)} />
      </Detail>
      <Detail label="Swap directions">
        <ValuePills values={agent.content?.capabilities?.swap_types} />
      </Detail>
      <Detail label="Payment channels">{joinDisplayList(agent.content?.capabilities?.payment_channels) || "None"}</Detail>
      <Detail label="Selected escrow">{selectedEscrow(agent) || "None"}</Detail>
    </DirectoryDefinitionCard>
  );
}

function EscrowCard({
  escrow,
  activeEscrowPubkey,
  onEdit,
}: {
  escrow: EscrowDescriptor;
  activeEscrowPubkey: string;
  onEdit: (escrow: EscrowDescriptor) => void;
}) {
  const canEdit = Boolean(activeEscrowPubkey) && escrow.event.pubkey === activeEscrowPubkey && escrow.identifier === "escrow";
  const [coordinateCopyState, setCoordinateCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [definitionCopyState, setDefinitionCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [showJson, setShowJson] = useState(false);
  const coordinate = escrowCoordinate(escrow);
  const npub = nip19.npubEncode(escrow.event.pubkey);
  const escrowJson = JSON.stringify(
    {
      coordinate,
      npub,
      identifier: escrow.identifier,
      content: escrow.content,
      event: escrow.event,
    },
    null,
    2,
  );

  return (
    <DirectoryDefinitionCard
      identifier={escrow.identifier}
      createdAt={escrow.event.created_at}
      json={escrowJson}
      showJson={showJson}
      toggleLabel={showJson ? "Show escrow summary" : "Show escrow JSON"}
      onToggleJson={() => setShowJson((current) => !current)}
      copyState={definitionCopyState}
      onCopyDefinition={() => copyIdentityValue(escrowJson, setDefinitionCopyState)}
      editAction={
        canEdit ? (
          <Button variant="outlined" size="small" onClick={() => onEdit(escrow)}>
            Edit in Publishing
          </Button>
        ) : null
      }
    >
      <Typography variant="h6" component="h3" sx={{ fontWeight: 800 }}>
        {escrow.content?.escrow_type || escrow.escrowType || "Unnamed escrow"}
      </Typography>
      <CopyableDetail
        label="Coordinate"
        value={coordinate}
        copyState={coordinateCopyState}
        onCopy={() => copyIdentityValue(coordinate, setCoordinateCopyState)}
      />
      <Detail label="Networks">
        <ValuePills values={escrow.content?.networks || escrow.networks} />
      </Detail>
      <Detail label="Reference format">{escrow.content?.reference_format || "None"}</Detail>
      <Detail label="Required confirmation">{escrow.content?.funding_rules?.required_confirmation || "None"}</Detail>
      <Detail label="Release trigger">{escrow.content?.release_rules?.release_trigger || "None"}</Detail>
      <Detail label="Refund trigger">{escrow.content?.release_rules?.refund_trigger || "None"}</Detail>
      <Detail label="Dispute policy">{escrow.content?.dispute_rules?.policy || "None"}</Detail>
    </DirectoryDefinitionCard>
  );
}

function DirectoryDefinitionCard({
  identifier,
  createdAt,
  json,
  showJson,
  toggleLabel,
  onToggleJson,
  copyState,
  onCopyDefinition,
  editAction,
  children,
}: {
  identifier: string;
  createdAt: number;
  json: string;
  showJson: boolean;
  toggleLabel: string;
  onToggleJson: () => void;
  copyState: "idle" | "copied" | "failed";
  onCopyDefinition: () => void;
  editAction: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: { xs: "auto", md: 600 },
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CardContent sx={{ flexGrow: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        <Stack spacing={1.5} sx={{ flexGrow: 1, minHeight: 0 }}>
          <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
            <Chip label={identifier} size="small" color="primary" variant="outlined" />
            <Typography variant="caption" color="text.secondary">
              {formatEventTime(createdAt)}
            </Typography>
          </Stack>
          {showJson ? (
            <Paper
              variant="outlined"
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                flexGrow: 1,
                minHeight: 0,
                overflow: "auto",
                fontFamily: "monospace",
                fontSize: 12,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {json}
            </Paper>
          ) : (
            <Stack spacing={1.5} sx={{ flexGrow: 1, minHeight: 0, overflow: "auto", pr: 0.5 }}>
              {children}
            </Stack>
          )}
        </Stack>
      </CardContent>
      <DirectoryCardFooter
        showJson={showJson}
        toggleLabel={toggleLabel}
        onToggleJson={onToggleJson}
        copyState={copyState}
        onCopyDefinition={onCopyDefinition}
        editAction={editAction}
      />
    </Card>
  );
}

function DirectoryCardFooter({
  showJson,
  toggleLabel,
  onToggleJson,
  copyState,
  onCopyDefinition,
  editAction,
}: {
  showJson: boolean;
  toggleLabel: string;
  onToggleJson: () => void;
  copyState: "idle" | "copied" | "failed";
  onCopyDefinition: () => void;
  editAction: React.ReactNode;
}) {
  return (
    <>
      <CardActions
        sx={{
          mt: "auto",
          px: 2,
          py: 1.5,
          borderTop: 1,
          borderColor: "divider",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>{editAction}</Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Tooltip title={toggleLabel}>
            <IconButton
              size="small"
              color={showJson ? "primary" : "default"}
              aria-label={toggleLabel}
              onClick={onToggleJson}
            >
              <DataObjectIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button variant="outlined" size="small" onClick={onCopyDefinition}>
            {copyState === "copied" ? "Copied" : "Copy definition"}
          </Button>
        </Stack>
      </CardActions>
      {copyState === "failed" ? <Alert severity="error" sx={{ mx: 2, mb: 2 }}>Clipboard write failed.</Alert> : null}
    </>
  );
}

function CopyableDetail({
  label,
  value,
  copyState,
  onCopy,
}: {
  label: string;
  value: string;
  copyState: "idle" | "copied" | "failed";
  onCopy: () => void;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: "uppercase" }}>{label}</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "start" }}>
        <Typography component="div" variant="body2" sx={{ flex: 1, overflowWrap: "anywhere" }}>{value}</Typography>
        <Button variant="outlined" size="small" onClick={onCopy}>
          {copyState === "copied" ? "Copied" : "Copy"}
        </Button>
      </Stack>
      {copyState === "failed" ? <Alert severity="error" sx={{ mt: 1 }}>Clipboard write failed.</Alert> : null}
    </Box>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: "uppercase" }}>{label}</Typography>
      <Typography component="div" variant="body2" sx={{ overflowWrap: "anywhere" }}>{children}</Typography>
    </Box>
  );
}

async function copyIdentityValue(value: string, setState: (state: "idle" | "copied" | "failed") => void) {
  if (!value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setState("copied");
    window.setTimeout(() => setState("idle"), 1800);
  } catch {
    setState("failed");
  }
}

function CurrencyPills({ values }: { values: string[] | undefined }) {
  const currencies = values?.filter(Boolean) ?? [];
  if (currencies.length === 0) {
    return "None";
  }

  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
      {currencies.map((currency) => {
        const normalized = currency.toUpperCase();
        return <Chip label={`${currencyFlag(normalized)} ${normalized}`} size="small" key={normalized} />;
      })}
    </Stack>
  );
}

function ValuePills({ values }: { values: string[] | undefined }) {
  const normalizedValues = values?.filter(Boolean) ?? [];
  if (normalizedValues.length === 0) {
    return "None";
  }

  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
      {normalizedValues.map((value) => (
        <Chip label={formatProtocolValue(value)} size="small" variant="outlined" key={value} />
      ))}
    </Stack>
  );
}

function joinDisplayList(values: string[] | undefined): string {
  return values?.filter(Boolean).join(", ") || "";
}

function agentCurrencies(agent: AgentDefinition): string[] {
  return normalizeOptionList(agent.currencies.length > 0 ? agent.currencies : agent.content?.capabilities?.fiat_currencies);
}

function selectedEscrow(agent: AgentDefinition): string {
  return agent.escrowAddress || agent.content?.escrow?.descriptor || "";
}

function matchesFilter(values: string[] | undefined, filter: string): boolean {
  if (!filter) {
    return true;
  }

  return normalizeOptionList(values).includes(filter);
}

function matchesLookup(kind: number, pubkey: string, identifier: string, lookupValue: string): boolean {
  const parsed = parseLookupFilter(lookupValue);
  if (!parsed) {
    return true;
  }

  if (parsed.kind && parsed.kind !== kind) {
    return false;
  }

  if (parsed.identifier && parsed.identifier !== identifier) {
    return false;
  }

  return parsed.pubkey === pubkey;
}

function parseLookupFilter(value: string): { kind?: number; pubkey: string; identifier?: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const coordinateParts = trimmed.split(":");
  if (coordinateParts.length >= 3) {
    const kind = Number(coordinateParts[0]);
    const pubkey = normalizePubkey(coordinateParts[1]);
    const identifier = coordinateParts.slice(2).join(":");

    if (Number.isFinite(kind) && pubkey && identifier) {
      return { kind, pubkey, identifier };
    }

    return { pubkey: "" };
  }

  const pubkey = normalizePubkey(trimmed);
  return pubkey ? { pubkey } : { pubkey: "" };
}

function normalizePubkey(value: string): string {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (trimmed.startsWith("npub1")) {
    try {
      const decoded = nip19.decode(trimmed);
      return decoded.type === "npub" && typeof decoded.data === "string" ? decoded.data : "";
    } catch {
      return "";
    }
  }

  return "";
}

function mergeDirectoryItems<T extends { event: NostrEvent; identifier: string }>(current: T[], incoming: T[]): T[] {
  const byCoordinate = new Map<string, T>();

  for (const item of current) {
    byCoordinate.set(directoryItemKey(item), item);
  }

  for (const item of incoming) {
    const key = directoryItemKey(item);
    const previous = byCoordinate.get(key);
    if (!previous || item.event.created_at >= previous.event.created_at) {
      byCoordinate.set(key, item);
    }
  }

  return Array.from(byCoordinate.values()).sort((a, b) => b.event.created_at - a.event.created_at);
}

function directoryItemKey(item: { event: NostrEvent; identifier: string }): string {
  return `${item.event.kind}:${item.event.pubkey}:${item.identifier}`;
}

function buildFilterOptions(agents: AgentDefinition[]) {
  return {
    currencies: uniqueSorted(agents.flatMap((agent) => agentCurrencies(agent))),
    swapDirections: uniqueSorted(agents.flatMap((agent) => normalizeOptionList(agent.content?.capabilities?.swap_types))),
    paymentChannels: uniqueSorted(agents.flatMap((agent) => normalizeOptionList(agent.content?.capabilities?.payment_channels))),
    escrows: uniqueSorted(agents.map(selectedEscrow).filter(Boolean)),
  };
}

function buildEscrowFilterOptions(escrows: EscrowDescriptor[]) {
  return {
    types: uniqueSorted(escrows.map((escrow) => escrow.content?.escrow_type || escrow.escrowType).filter(Boolean)),
    networks: uniqueSorted(escrows.flatMap((escrow) => normalizeOptionList(escrow.content?.networks || escrow.networks))),
    referenceFormats: uniqueSorted(escrows.map((escrow) => escrow.content?.reference_format || "").filter(Boolean)),
  };
}

function normalizeOptionList(values: string[] | undefined): string[] {
  return values?.map((value) => value.trim()).filter(Boolean) ?? [];
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function escrowCoordinate(escrow: EscrowDescriptor): string {
  return `${escrow.event.kind}:${escrow.event.pubkey}:${escrow.identifier}`;
}

function uniqueByValue<T extends { value: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.value)) {
      return false;
    }

    seen.add(item.value);
    return true;
  });
}

function enumValues<T extends Record<string, string>>(items: T): T[keyof T][] {
  return Object.values(items) as T[keyof T][];
}

function enumOptions<T extends Record<string, string>>(items: T): { value: T[keyof T]; label: string }[] {
  return enumValues(items).map((value) => ({
    value,
    label: formatProtocolValue(value),
  }));
}

function selectedMuiValues(event: SelectChangeEvent<string[]>): string[] {
  const selected = event.target.value;
  return typeof selected === "string" ? selected.split(",") : selected;
}

function renderSelectedChips(selected: string[], options: { value: string; label: string }[]) {
  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
      {selected.map((value) => {
        const option = options.find((item) => item.value === value);
        return <Chip key={value} label={option?.label ?? value} size="small" />;
      })}
    </Stack>
  );
}

function formatEventTime(createdAt: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(createdAt * 1000));
}

function formatProtocolValue(value: string): string {
  if (value.includes("-to-")) {
    return value
      .split("-to-")
      .map(formatProtocolValue)
      .join(" -> ");
  }

  return value
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((part) => part.toUpperCase())
    .join(" ");
}

function currencyFlag(currency: string): string {
  const flags: Record<string, string> = {
    AED: "🇦🇪",
    AUD: "🇦🇺",
    CAD: "🇨🇦",
    CHF: "🇨🇭",
    CNY: "🇨🇳",
    EUR: "🇪🇺",
    GBP: "🇬🇧",
    GHS: "🇬🇭",
    INR: "🇮🇳",
    JPY: "🇯🇵",
    KES: "🇰🇪",
    NGN: "🇳🇬",
    TZS: "🇹🇿",
    UGX: "🇺🇬",
    USD: "🇺🇸",
    XOF: "🇸🇳",
    ZAR: "🇿🇦",
  };

  return flags[currency] ?? "¤";
}

function parseRelayInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((relay) => relay.trim())
        .filter(Boolean),
    ),
  );
}

function relaySearchParams(relays: string[]): string {
  const params = new URLSearchParams();
  for (const relay of relays) {
    params.append("relay", relay);
  }
  return params.toString();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
