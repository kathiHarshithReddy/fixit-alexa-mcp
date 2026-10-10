import express from "express";
import { load, save } from "./store.js";
import { rankCauses } from "./bedrock.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const ok = (o) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
const log = (d, tool, info) => d.audit.push({ at: new Date().toISOString(), tool, ...info });

// MOCK backends (parts catalog + pro scheduling). Swap for real APIs without changing tool contracts.
const PARTS = {
  "dw-filter": { name: "Drain filter basket", price: 14.2 },
  "dw-hose": { name: "Drain hose", price: 22.5 },
  "fr-filter": { name: "Water filter cartridge", price: 39.99 },
};
const RULES = {
  dishwasher: { match: /drain|standing water|water (stays|left)/i, causes: [
    { cause: "Clogged drain filter", likelihood: 62, diy: true, part_id: "dw-filter" },
    { cause: "Kinked drain hose", likelihood: 23, diy: true, part_id: "dw-hose" },
    { cause: "Failed drain pump (mains-wired)", likelihood: 15, diy: false, part_id: null } ] },
  refrigerator: { match: /leak|water|filter|ice/i, causes: [
    { cause: "Expired water filter", likelihood: 55, diy: true, part_id: "fr-filter" },
    { cause: "Clogged defrost drain", likelihood: 30, diy: true, part_id: null },
    { cause: "Failed water inlet valve (mains-wired)", likelihood: 15, diy: false, part_id: null } ] },
};
const HAZARD = /\bgas\b|smoke|spark|shock|burning|carbon monoxide|flood/i;
const CONFIRM = /^\s*(yes|yeah|yep|confirm|go ahead)\b/i;

function buildServer() {
  const s = new McpServer({ name: "fixit", version: "0.1.0" });

  s.registerTool("register_appliance", { description: "Remember an appliance in the household memory.",
    inputSchema: { type: z.enum(["dishwasher", "refrigerator"]), brand: z.string(), model: z.string(), installed_year: z.number().int() } },
    async (a) => { const d = await load(); d.appliances = d.appliances.filter((x) => x.type !== a.type); d.appliances.push(a);
      log(d, "register_appliance", a); await save(d); return ok({ saved: a, total: d.appliances.length }); });

  s.registerTool("get_maintenance_plan", { description: "List remembered appliances and upkeep due.", inputSchema: {} },
    async () => { const d = await load(); const y = new Date().getFullYear();
      return ok({ appliances: d.appliances.map((a) => ({ ...a, age_years: y - a.installed_year,
        due: a.type === "refrigerator" ? "Replace water filter every 6 months" : "Clean drain filter monthly" })) }); });

  s.registerTool("diagnose_issue", { description: "Rank likely causes of a symptom. Hazards get a hard handoff to a licensed pro.",
    inputSchema: { symptom: z.string(), appliance_type: z.enum(["dishwasher", "refrigerator"]).optional() } },
    async ({ symptom, appliance_type }) => { const d = await load();
      if (HAZARD.test(symptom)) { log(d, "diagnose_issue", { hazard: true }); await save(d);
        return ok({ hazard: true, message: "This could be dangerous. Stop, leave the area, and call a licensed professional or emergency services. I won't suggest a DIY fix." }); }
      const rule = RULES[appliance_type];
      if (!rule) return ok({ needs: "appliance_type", message: "Which appliance is it: dishwasher or refrigerator?" });
      const appliance = d.appliances.find((x) => x.type === appliance_type);
      if (!appliance) return ok({ needs: "register_appliance", message: `I don't know your ${appliance_type} yet. Tell me the brand, model and install year.` });
      log(d, "diagnose_issue", { appliance_type, symptom }); await save(d);
      const hit = rule.match.test(symptom); let causes = hit ? rule.causes : [{ cause: "Unclear. Describe what you see or hear.", likelihood: 0, diy: false, part_id: null }], source = "rules";
      if (hit && process.env.USE_BEDROCK === "1") { try { causes = await rankCauses(appliance, symptom, causes); source = "bedrock"; } catch (e) { console.error("bedrock fallback:", e.message); } }
      return ok({ appliance, causes, source }); });

  s.registerTool("build_cart", { description: "Create a PENDING cart. Does not spend money.", inputSchema: { part_id: z.string() } },
    async ({ part_id }) => { const p = PARTS[part_id]; if (!p) return ok({ error: "Unknown part" });
      const d = await load(); const cart_id = "cart_" + Date.now(); d.carts[cart_id] = { cart_id, part_id, ...p, status: "pending_confirmation" };
      log(d, "build_cart", { cart_id, part_id }); await save(d);
      return ok({ ...d.carts[cart_id], prompt: `Add ${p.name} for $${p.price.toFixed(2)}? Say yes to confirm.` }); });

  s.registerTool("confirm_purchase", { description: "Place the order. Requires a pending cart and the user's spoken confirmation.",
    inputSchema: { cart_id: z.string(), user_utterance: z.string() } },
    async ({ cart_id, user_utterance }) => { const d = await load(); const c = d.carts[cart_id];
      if (!c || c.status !== "pending_confirmation") return ok({ ok: false, error: "No pending cart with that id." });
      if (!CONFIRM.test(user_utterance)) { log(d, "confirm_purchase", { cart_id, rejected: true }); await save(d);
        return ok({ ok: false, error: "Purchase rejected: no spoken confirmation. Nothing was ordered." }); }
      c.status = "ordered (MOCK)"; d.orders.push(c); log(d, "confirm_purchase", { cart_id, confirmed: true }); await save(d);
      return ok({ ok: true, order: c }); });

  s.registerTool("propose_visits", { description: "Offer pro appointment slots (mock scheduler).", inputSchema: { appliance_type: z.string() } },
    async ({ appliance_type }) => ok({ slots: [{ slot_id: "s1", when: "Tomorrow 10:00" }, { slot_id: "s2", when: "Tomorrow 15:00" }, { slot_id: "s3", when: "Friday 09:00" }].map((x) => ({ ...x, appliance_type })) }));

  s.registerTool("book_visit", { description: "Book a pro visit slot (mock).", inputSchema: { slot_id: z.string(), appliance_type: z.string() } },
    async (a) => { const d = await load(); d.visits.push(a); log(d, "book_visit", a); await save(d); return ok({ booked: a, note: "MOCK booking" }); });
  return s;
}

const app = express();
app.use(express.json());
// Stateless Streamable HTTP: one server+transport per request (Lambda-friendly).
app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.all("/mcp", (_q, r) => r.status(405).json({ error: "Use POST" }));
app.use(express.static(process.env.LAMBDA_TASK_ROOT ? process.env.LAMBDA_TASK_ROOT + "/web" : "web"));
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) app.listen(3000, () => console.log("Fixit MCP server + simulator: http://localhost:3000"));
export { app };
