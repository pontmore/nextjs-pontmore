import { NextRequest, NextResponse } from "next/server";
import { parseRelays } from "../../../lib/server/api-utils";
import { getEscrowSnapshot, refreshEscrows } from "../../../lib/server/escrow-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const relays = readRelays(request);
  return NextResponse.json(getEscrowSnapshot(relays));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const relays = parseRelays(body.relays);
  return NextResponse.json(await refreshEscrows(relays));
}

function readRelays(request: NextRequest): string[] {
  return parseRelays(request.nextUrl.searchParams.getAll("relay"));
}
