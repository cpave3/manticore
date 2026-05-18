#!/usr/bin/env tsx
/**
 * Manual end-to-end script.
 *
 * Assumes the server is already running (or will start it via npm run dev).
 * Set env vars to override defaults:
 *   MANTICORE_PORT      — default 3456
 *   MANTICORE_HOST      — default localhost
 *   UPSTREAM_URL        — base URL of an OpenAI-compatible endpoint
 *   UPSTREAM_NAME       — provider name to register
 *   MODEL_ID            — e.g. ollama/qwen2.5:0.5b
 */

const PORT = process.env.MANTICORE_PORT || '3456';
const HOST = process.env.MANTICORE_HOST || 'localhost';
const BASE = `http://${HOST}:${PORT}`;

const UPSTREAM_URL = process.env.UPSTREAM_URL || 'http://localhost:11434';
const UPSTREAM_NAME = process.env.UPSTREAM_NAME || 'ollama';
const MODEL_ID = process.env.MODEL_ID || `${UPSTREAM_NAME}/qwen2.5:0.5b`;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Non-JSON response ${res.status}: ${body.slice(0, 500)}`);
  }
}

async function main() {
  console.log(`== E2E against ${BASE} ==`);
  console.log(`   Upstream: ${UPSTREAM_NAME} @ ${UPSTREAM_URL}`);
  console.log(`   Model:    ${MODEL_ID}`);
  console.log();

  // 1. Create client
  const client = await json<{ id: string; name: string; apiKey: string; createdAt: string }>(
    `${BASE}/api/clients`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'e2e-runner' }),
    }
  );
  const apiKey = client.apiKey;
  console.log('1. Created client:', client.id, client.name);
  console.log('   API key (masked):', apiKey.slice(0, 12) + '...');
  console.log();

  // 2. Create upstream
  const upstream = await json<{ id: string; name: string; baseUrl: string }>(
    `${BASE}/api/upstreams`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: UPSTREAM_NAME, baseUrl: UPSTREAM_URL }),
    }
  );
  console.log('2. Created upstream:', upstream.id, upstream.name, upstream.baseUrl);
  console.log();

  // 3. Non-streaming chat completion
  const chatPayload = {
    model: MODEL_ID,
    messages: [{ role: 'user', content: 'Say the word hello in one word.' }],
    stream: false,
  };

  console.log('3. Non-streaming request…');
  const nonStreamRes = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(chatPayload),
  });
  const nonStreamBody = await nonStreamRes.text();
  console.log(`   Status: ${nonStreamRes.status}`);
  if (nonStreamRes.ok) {
    const parsed = JSON.parse(nonStreamBody) as Record<string, unknown>;
    console.log('   Response:', JSON.stringify(parsed, null, 2).slice(0, 400) + '…');
    const usage = (parsed.usage as Record<string, number> | undefined) || {};
    console.log('   prompt_tokens:', usage.prompt_tokens ?? '-');
    console.log('   completion_tokens:', usage.completion_tokens ?? '-');
    console.log('   total_tokens:', usage.total_tokens ?? '-');
  } else {
    console.log('   Body:', nonStreamBody.slice(0, 500));
  }
  console.log();

  // 4. Streaming chat completion
  console.log('4. Streaming request…');
  const streamRes = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...chatPayload, stream: true }),
  });
  console.log(`   Status: ${streamRes.status}`);
  if (streamRes.body) {
    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let buffer = '';
    while (!done) {
      const { value, done: d } = await reader.read();
      done = d;
      if (value) {
        const text = decoder.decode(value, { stream: true });
        buffer += text;
        process.stdout.write(text);
      }
    }
    // Extract just the data lines for a tidy finish
    const lines = buffer.split('\n').filter((l) => l.startsWith('data:'));
    const last = lines[lines.length - 1]?.trim();
    console.log('\n   Stream finished. Last chunk:', last ?? '[none]');
  } else {
    console.log('   No response body');
  }
  console.log();

  // 5. Dashboard summary
  const summary = await json<{
    totalRequests: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
  }>(`${BASE}/api/dashboard/summary`);
  console.log('5. Dashboard summary:');
  console.log('   totalRequests:', summary.totalRequests);
  console.log('   totalPromptTokens:', summary.totalPromptTokens);
  console.log('   totalCompletionTokens:', summary.totalCompletionTokens);
  console.log('   totalTokens:', summary.totalTokens);
  console.log();

  console.log('== E2E complete ==');
}

main().catch((err: unknown) => {
  console.error('E2E failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
