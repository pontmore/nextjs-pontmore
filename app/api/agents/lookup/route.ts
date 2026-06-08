import { NextRequest, NextResponse } from "next/server";
import { PIP00_AGENT_KIND } from "../../../../lib/pip00";
import { parseLookupFilter, parseRelays } from "../../../../lib/server/api-utils";
import { refreshAgents } from "../../../../lib/server/agent-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const lookup = typeof body.coordinate === "string" ? body.coordinate : "";
  const parsed = parseLookupFilter(lookup, PIP00_AGENT_KIND);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid lookup. Expected pubkey, npub, or kind:pubkey:d-tag." }, { status: 400 });
  }

  const relays = parseRelays(body.relays);
  return NextResponse.json(await refreshAgents(relays, parsed));
}
