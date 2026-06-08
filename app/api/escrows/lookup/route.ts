import { NextRequest, NextResponse } from "next/server";
import { PIP01_ESCROW_KIND } from "../../../../lib/pip01";
import { parseLookupFilter, parseRelays } from "../../../../lib/server/api-utils";
import { refreshEscrows } from "../../../../lib/server/escrow-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const lookup = typeof body.coordinate === "string" ? body.coordinate : "";
  const parsed = parseLookupFilter(lookup, PIP01_ESCROW_KIND);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid lookup. Expected pubkey, npub, or kind:pubkey:d-tag." }, { status: 400 });
  }

  const relays = parseRelays(body.relays);
  return NextResponse.json(await refreshEscrows(relays, parsed));
}
