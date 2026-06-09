import { NextRequest, NextResponse } from "next/server";
import { fetchFromRelays, isNostrEvent, publishToRelays } from "../../../lib/nostr-relays";
import { parseRelays } from "../../../lib/server/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_KIND = 0;

export async function GET(request: NextRequest) {
  const relays = parseRelays(request.nextUrl.searchParams.getAll("relay"));
  const pubkey = request.nextUrl.searchParams.get("pubkey");

  if (!pubkey) {
    return NextResponse.json({ error: "Missing pubkey." }, { status: 400 });
  }

  return NextResponse.json(await fetchFromRelays(relays, {
    kinds: [PROFILE_KIND],
    authors: [pubkey],
    limit: 1,
  }));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!isNostrEvent(body.event) || body.event.kind !== PROFILE_KIND) {
    return NextResponse.json({ error: "Invalid profile event." }, { status: 400 });
  }

  const relays = parseRelays(body.relays);
  const results = await publishToRelays(relays, body.event);
  return NextResponse.json({ results });
}
