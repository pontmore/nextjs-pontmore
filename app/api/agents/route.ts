import { NextRequest, NextResponse } from "next/server";
import { parseRelays } from "../../../lib/server/api-utils";
import { getAgentSnapshot, refreshAgents } from "../../../lib/server/agent-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const relays = readRelays(request);
  return NextResponse.json(getAgentSnapshot(relays));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const relays = parseRelays(body.relays);
  return NextResponse.json(await refreshAgents(relays));
}

function readRelays(request: NextRequest): string[] {
  return parseRelays(request.nextUrl.searchParams.getAll("relay"));
}
