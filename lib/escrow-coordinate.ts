import type { EscrowDescriptor } from "./pip01";

export function escrowCoordinate(escrow: EscrowDescriptor): string {
  return `${escrow.event.kind}:${escrow.event.pubkey}:${escrow.identifier}`;
}
