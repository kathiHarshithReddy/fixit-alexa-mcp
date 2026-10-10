import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
const client = new BedrockRuntimeClient({});
// The model only re-ranks likelihoods. DIY-safety flags and parts come from deterministic rules, so the model cannot make an unsafe fix look DIY.
export async function rankCauses(appliance, symptom, causes) {
  const r = await client.send(new ConverseCommand({
    modelId: process.env.BEDROCK_MODEL_ID || "apac.amazon.nova-lite-v1:0",
    system: [{ text: 'You rank likely causes of appliance faults. Reply with ONLY a JSON array of {"cause":string,"likelihood":integer} using exactly the candidate causes given, likelihoods summing to 100. No prose.' }],
    messages: [{ role: "user", content: [{ text: JSON.stringify({ appliance, symptom, candidates: causes.map((c) => c.cause) }) }] }],
    inferenceConfig: { maxTokens: 300, temperature: 0 } }));
  const arr = JSON.parse(r.output.message.content[0].text.replace(/```json|```/g, "").trim());
  return causes.map((c) => ({ ...c, likelihood: arr.find((a) => a.cause === c.cause)?.likelihood ?? c.likelihood })).sort((a, b) => b.likelihood - a.likelihood);
}
