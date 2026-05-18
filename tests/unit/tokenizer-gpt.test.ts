import { describe, it, expect } from 'vitest';
import { countPromptTokens, countCompletionTokens, getStreamCounter, ChatMessage } from '../../src/tokenizer/index.js';

describe('countPromptTokens (GPT path)', () => {
  it('returns a positive integer for a simple message', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];
    const result = await countPromptTokens(messages, 'openai/gpt-4o');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });
});

describe('countCompletionTokens (GPT path)', () => {
  it('returns a positive integer for simple text', async () => {
    const result = await countCompletionTokens('hello world', 'openai/gpt-4o');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });
});

describe('getStreamCounter (GPT path)', () => {
  it('counts accumulated deltas and total matches separate count within tolerance', async () => {
    const counter = await getStreamCounter('openai/gpt-4o');
    expect(counter).not.toBeNull();

    const text = 'The quick brown fox jumps over the lazy dog.';
    const midpoint = Math.floor(text.length / 2);
    counter!.feed(text.slice(0, midpoint));
    counter!.feed(text.slice(midpoint));

    const streamedTotal = counter!.total();
    const separateCount = await countCompletionTokens(text, 'openai/gpt-4o');

    expect(streamedTotal).toBeGreaterThan(0);
    expect(separateCount).toBeGreaterThan(0);
    // Within ~5% tolerance because chunk boundaries can split multi-token sequences differently
    const diff = Math.abs(streamedTotal - separateCount!);
    expect(diff / separateCount!).toBeLessThan(0.05);
  });
});

describe('countPromptTokens (fallback GPT tokenizer for unmappable OpenAI models)', () => {
  it('still returns a positive integer for o4-mini', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];
    const result = await countPromptTokens(messages, 'openai/o4-mini');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });
});

// HF tokenizer tests are skipped here because they require network access to
// download model weights from Hugging Face, which is unavailable in CI and
// slow/fragile in local test runs.
