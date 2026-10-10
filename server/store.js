import fs from "fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
// Household memory. DynamoDB when TABLE_NAME is set (Lambda), local JSON file otherwise.
const EMPTY = () => ({ appliances: [], carts: {}, orders: [], visits: [], audit: [] });
const FILE = "data/home.json", TABLE = process.env.TABLE_NAME, KEY = { pk: "HOME#demo" };
let ddb;
const client = () => (ddb ??= DynamoDBDocumentClient.from(new DynamoDBClient({})));
export async function load() {
  if (TABLE) { const r = await client().send(new GetCommand({ TableName: TABLE, Key: KEY })); return r.Item?.data ?? EMPTY(); }
  return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : EMPTY();
}
export async function save(d) {
  if (TABLE) { await client().send(new PutCommand({ TableName: TABLE, Item: { ...KEY, data: d } })); return; }
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
}
