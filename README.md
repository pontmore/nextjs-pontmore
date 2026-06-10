# nextjs-pontmore

Next.js + TypeScript proof of concept for publishing, discovering, and inspecting Pontmore protocol events on Nostr.

The app defaults to these relays:

- `wss://nos.lol`
- `wss://relay.damus.io`

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3001`.

## Docker

Build and run the production image locally:

```bash
docker build -t pontmore/nextjs-pontmore .
docker run --rm -p 3001:3001 pontmore/nextjs-pontmore
```

The GitHub Actions workflow in `.github/workflows/publish-docker.yml` publishes `pontmore/nextjs-pontmore` to Docker Hub on every push to `main`.

Required repository secrets:

- `DOCKER_PONTMORE_OWNER`
- `DOCKER_HUB_PONTMORE_PUBLISH_TOKEN`

## Behavior

- Generates local Nostr identities in browser `localStorage`.
- Publishes kind `30360` addressable PIP-00 agent definition events.
- Publishes kind `30361` addressable PIP-01 escrow descriptor events.
- Supports server-side relay reads, lookup, publishing, and process-local caching through Next.js API routes.
- Provides discovery filters, pubkey/coordinate lookup, copyable coordinates, and JSON definition inspection for agent and escrow cards.
- Lets relay defaults be edited from the Settings page.

The relay WebSocket client is intentionally small and lives in `lib/nostr-relays.ts`. Server-side cache orchestration lives in `lib/server/`.
