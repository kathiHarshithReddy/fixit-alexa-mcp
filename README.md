# Fixit: a household-maintenance MCP server

Self-hosted MCP server (Streamable HTTP, official TypeScript SDK) that remembers your appliances, diagnoses breakdowns, builds a parts cart, and never spends without a spoken yes. A browser simulator acts as a real MCP client and shows the JSON-RPC wire log.

## Run
```
npm install
npm start
```
Open http://localhost:3000 and use the chips (in order): register, diagnose, order it, yes. Click **New session** to re-run the MCP handshake; memory persists in `data/home.json`.

## What is real vs mocked
- Real: MCP server and client handshake (`initialize`, `notifications/initialized`, `tools/list`, `tools/call`), persistent household memory, server-side purchase gate (`confirm_purchase` rejects anything without a pending cart and a spoken yes), hazard handoff (gas, smoke, sparks are never given a DIY fix).
- Mocked: parts catalog, pro scheduling, orders and bookings. The browser simulator stands in for Alexa+, because partner Alexa+ tooling isn't available to hackathon participants.
- AWS path (written, deploy to verify): Lambda Function URL hosts the server, DynamoDB stores memory, Amazon Bedrock (Converse API) re-ranks likely causes. DIY-safety flags and parts always come from deterministic rules, never from the model. Locally (no env vars) it uses a JSON file and rule-based ranking.
- Demo only: the Function URL is public (no auth). Run `cdk destroy` after recording.

## Tools
register_appliance, get_maintenance_plan, diagnose_issue, build_cart, confirm_purchase, propose_visits, book_visit

## Layout
`server/index.js` MCP server (stateless per-request transport, Lambda-friendly) · `web/index.html` simulator · `data/` local memory · `FRICTION_LOG.md`

License: MIT

## Deploy to AWS
Needs AWS credentials, `npm install` in this folder first, and Bedrock model access in your region. Check `BEDROCK_MODEL_ID` (default `apac.amazon.nova-lite-v1:0`).
```
cd infra && npm install && npx cdk bootstrap && npx cdk deploy
```
The output `Url` serves the simulator and the MCP endpoint at `/mcp`. Remove everything with `npx cdk destroy`.
