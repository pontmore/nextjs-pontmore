import type { NostrEvent, NostrTag, UnsignedNostrEvent } from "./pip00";

export const PIP01_ESCROW_KIND = 30361;

export enum EscrowType {
  LightningHoldInvoice = "lightning_hold_invoice",
  CustodialEscrow = "custodial_escrow",
}

export type EscrowDescriptorContent = {
  version: number;
  escrow_type: EscrowType | string;
  networks: string[];
  funding_rules: {
    required_confirmation: string;
  };
  release_rules: {
    release_trigger: string;
    refund_trigger: string;
  };
  dispute_rules: {
    policy: string;
  };
  reference_format: string;
  invoice_network?: string;
  invoice_asset?: string;
  invoice_currency?: string;
  invoice_amount_rule?: string;
  hold_expiry_rule?: string;
  settle_authority?: string;
  cancel_authority?: string;
  custody_authority?: string;
  release_authority?: string;
  refund_authority?: string;
  invoice_expiry_rule?: string;
  implementations?: Array<{
    network: string;
    invoice_asset?: string;
    invoice_currency?: string;
    invoice_amount_rule?: string;
    invoice_expiry_rule?: string;
    payout_network?: string;
  }>;
  preimage_visibility?: string;
  payout_network?: string;
  updated_at: number;
};

export type EscrowDescriptor = {
  event: NostrEvent;
  identifier: string;
  escrowType: EscrowType | string;
  networks: string[];
  content: EscrowDescriptorContent | null;
  malformedContent: boolean;
};

export function buildEscrowEvent({
  pubkey,
  identifier,
  escrowType,
  networks,
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
}: {
  pubkey: string;
  identifier: string;
  escrowType: EscrowType | string;
  networks: string[];
  requiredConfirmation: string;
  releaseTrigger: string;
  refundTrigger: string;
  disputePolicy: string;
  referenceFormat: string;
  invoiceNetwork: string;
  invoiceAsset: string;
  invoiceCurrency: string;
  invoiceAmountRule: string;
  holdExpiryRule: string;
  settleAuthority: string;
  cancelAuthority: string;
  custodyAuthority: string;
  releaseAuthority: string;
  refundAuthority: string;
  invoiceExpiryRule: string;
  preimageVisibility: string;
  payoutNetwork: string;
}): UnsignedNostrEvent {
  const now = new Date();
  const normalizedNetworks = normalizeNetworks(networks);
  const trimmedEscrowType = escrowType.trim();
  const content: EscrowDescriptorContent = {
    version: 1,
    escrow_type: trimmedEscrowType,
    networks: normalizedNetworks,
    funding_rules: {
      required_confirmation: requiredConfirmation.trim(),
    },
    release_rules: {
      release_trigger: releaseTrigger.trim(),
      refund_trigger: refundTrigger.trim(),
    },
    dispute_rules: {
      policy: disputePolicy.trim(),
    },
    reference_format: referenceFormat.trim(),
    invoice_network: invoiceNetwork.trim(),
    invoice_asset: invoiceAsset.trim(),
    invoice_currency: invoiceCurrency.trim(),
    invoice_amount_rule: invoiceAmountRule.trim(),
    payout_network: payoutNetwork.trim(),
    updated_at: Math.floor(now.getTime() / 1000),
  };

  if (trimmedEscrowType === EscrowType.LightningHoldInvoice) {
    content.hold_expiry_rule = holdExpiryRule.trim();
    content.settle_authority = settleAuthority.trim();
    content.cancel_authority = cancelAuthority.trim();
    content.preimage_visibility = preimageVisibility.trim();
  }

  if (trimmedEscrowType === EscrowType.CustodialEscrow) {
    content.custody_authority = custodyAuthority.trim();
    content.release_authority = releaseAuthority.trim();
    content.refund_authority = refundAuthority.trim();
    content.invoice_expiry_rule = invoiceExpiryRule.trim();
    content.implementations = [
      {
        network: invoiceNetwork.trim(),
        invoice_asset: invoiceAsset.trim(),
        invoice_currency: invoiceCurrency.trim(),
        invoice_amount_rule: invoiceAmountRule.trim(),
        invoice_expiry_rule: invoiceExpiryRule.trim(),
        payout_network: payoutNetwork.trim(),
      },
    ];
  }

  return {
    pubkey,
    created_at: Math.floor(now.getTime() / 1000),
    kind: PIP01_ESCROW_KIND,
    tags: [
      ["d", identifier.trim() || "escrow"],
      ["t", "escrow"],
      ["escrow_type", content.escrow_type],
      ...content.networks.map((network) => ["network", network]),
      ["client", "pontmore-pip00-poc"],
    ],
    content: JSON.stringify(content),
  };
}

export function parseEscrowEvent(event: NostrEvent): EscrowDescriptor {
  const identifier = findTagValue(event.tags, "d") || "escrow";

  try {
    const content = JSON.parse(event.content) as EscrowDescriptorContent;
    return {
      event,
      identifier,
      escrowType: findTagValue(event.tags, "escrow_type") || content.escrow_type || "",
      networks: normalizeNetworks(content.networks),
      content,
      malformedContent: false,
    };
  } catch {
    return {
      event,
      identifier,
      escrowType: findTagValue(event.tags, "escrow_type") || "",
      networks: event.tags
        .filter((tag) => tag[0] === "network" && tag[1])
        .map((tag) => tag[1]),
      content: null,
      malformedContent: true,
    };
  }
}

function findTagValue(tags: NostrTag[], name: string): string | undefined {
  return tags.find((tag) => tag[0] === name)?.[1];
}

function normalizeNetworks(networks: string[] | undefined): string[] {
  const normalized = networks?.map((network) => network.trim().toLowerCase()).filter(Boolean) ?? [];
  return Array.from(new Set(normalized));
}
