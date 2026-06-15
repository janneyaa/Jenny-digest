#!/usr/bin/env node
/**
 * deliver.js — sends digest text to Feishu webhook
 * Usage:
 *   echo "text" | node deliver.js
 *   node deliver.js --file /tmp/digest.txt
 *   node deliver.js --message "text"
 */

import { readFile } from 'fs/promises';
import { config as loadEnv } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dir, '..', '.env') });

const WEBHOOK = process.env.FEISHU_WEBHOOK_URL;

async function getInput() {
  const args = process.argv.slice(2);
  const msgIdx  = args.indexOf('--message');
  const fileIdx = args.indexOf('--file');
  if (msgIdx  !== -1 && args[msgIdx + 1])  return args[msgIdx + 1];
  if (fileIdx !== -1 && args[fileIdx + 1]) return readFile(args[fileIdx + 1], 'utf-8');
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf-8');
}

const text = (await getInput()).trim();
if (!text) { console.log(JSON.stringify({ status: 'skipped', reason: 'empty' })); process.exit(0); }

if (!WEBHOOK) { console.log(text); process.exit(0); }

const MAX = 4000;
const chunks = [];
let rem = text;
while (rem.length > 0) {
  if (rem.length <= MAX) { chunks.push(rem); break; }
  let cut = rem.lastIndexOf('\n', MAX);
  if (cut < MAX * 0.5) cut = MAX;
  chunks.push(rem.slice(0, cut));
  rem = rem.slice(cut).trimStart();
}

for (const chunk of chunks) {
  const res  = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: chunk } })
  });
  const data = await res.json();
  if (data.code !== 0) {
    console.log(JSON.stringify({ status: 'error', message: data.msg }));
    process.exit(1);
  }
  if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
}

console.log(JSON.stringify({ status: 'ok', method: 'feishu', chunks: chunks.length }));
