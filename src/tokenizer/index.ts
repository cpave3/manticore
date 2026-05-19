import { AutoTokenizer, PreTrainedTokenizer } from '@huggingface/transformers';
import { encode, encodeChat } from 'gpt-tokenizer';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | unknown;
  name?: string;
};

// ─── Model → HF repo lookup ──────────────────────────────────────────────────

type HfEntry = {
  repo: string;
  chatTemplate: boolean;
};

function resolveHfRepo(modelPath: string): HfEntry {
  const p = modelPath.toLowerCase();
  if (p.startsWith('qwen3:')) return { repo: 'Qwen/Qwen3-8B-Instruct', chatTemplate: true };
  if (p.startsWith('qwen2:') || p.startsWith('qwen2.5:')) return { repo: 'Qwen/Qwen2.5-7B-Instruct', chatTemplate: true };
  if (p.startsWith('llama3:') || p.startsWith('llama3.1:') || p.startsWith('llama-3')) return { repo: 'meta-llama/Llama-3.1-8B-Instruct', chatTemplate: true };
  if (p.startsWith('mistral:') || p.startsWith('mistral-')) return { repo: 'mistralai/Mistral-7B-Instruct-v0.3', chatTemplate: true };
  if (p.startsWith('gemma:') || p.startsWith('gemma2:')) return { repo: 'google/gemma-2-2b-it', chatTemplate: true };
  return { repo: modelPath, chatTemplate: false };
}

// ─── GPT-tokenizer path ──────────────────────────────────────────────────────

function isGptModelPath(modelPath: string): boolean {
  const p = modelPath.toLowerCase();
  return (
    p.startsWith('gpt-') ||
    p.startsWith('o1-') ||
    p.startsWith('o3-') ||
    p.startsWith('o4-') ||
    p.startsWith('chatgpt-')
  );
}

function usesGptTokenizer(provider: string, modelPath: string): boolean {
  const gd = provider === 'openai' || provider === 'azure' || provider === 'openrouter';
  return gd && isGptModelPath(modelPath);
}

function countPromptGpt(messages: ChatMessage[]): number | null {
  try {
    // gpt-tokenizer's encodeChat does a ChatML-style conversation template
    // internally; we pass the raw messages and it returns a token array.
    const tokens = encodeChat(messages as { role: string; content: string }[], 'gpt-4');
    return tokens.length;
  } catch {
    return null;
  }
}

function countGpt(text: string): number | null {
  try {
    return encode(text).length;
  } catch {
    return null;
  }
}

// ─── HF-tokenizer cache ──────────────────────────────────────────────────────

const hfLoadCache = new Map<string, Promise<PreTrainedTokenizer>>();

async function getHfTokenizer(repo: string): Promise<PreTrainedTokenizer | null> {
  let loader = hfLoadCache.get(repo);
  if (loader) return loader;

  loader = AutoTokenizer.from_pretrained(repo)
    .catch((err: unknown) => {
      console.warn(
        `[tokenizer] Failed to load HF tokenizer "${repo}": ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    });

  hfLoadCache.set(repo, loader);
  return loader;
}

// ─── Prompt counting with HF tokenizer ───────────────────────────────────────

function hfMessageContent(msg: ChatMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  try {
    return JSON.stringify(msg.content);
  } catch {
    return String(msg.content);
  }
}

async function countPromptHf(
  messages: ChatMessage[],
  modelPath: string
): Promise<number | null> {
  const { repo, chatTemplate } = resolveHfRepo(modelPath);
  const tokenizer = await getHfTokenizer(repo);
  if (!tokenizer) return null;

  try {
    if (chatTemplate && typeof tokenizer.apply_chat_template === 'function') {
      // @ts-expect-error – transformers' apply_chat_template accepts an
      // array of plain objects.  It returns a number[] when tokenize:true.
      const ids: number[] = tokenizer.apply_chat_template(
        messages.map(m => ({ role: m.role, content: hfMessageContent(m) })),
        { tokenize: true, add_generation_prompt: true }
      );
      return ids.length;
    }
    // Fallback: concatenate messages and count tokens
    const full = messages.map(m => hfMessageContent(m)).join('\n');
    const ids = tokenizer.encode(full);
    return ids.length;
  } catch (err: unknown) {
    console.warn(
      `[tokenizer] HF prompt counting failed for "${repo}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

async function countTextHf(text: string, modelPath: string): Promise<number | null> {
  const { repo } = resolveHfRepo(modelPath);
  const tokenizer = await getHfTokenizer(repo);
  if (!tokenizer) return null;

  try {
    const ids = tokenizer.encode(text);
    return ids.length;
  } catch (err: unknown) {
    console.warn(
      `[tokenizer] HF text counting failed for "${repo}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

function parseModelId(modelId: string): { provider: string; modelPath: string } {
  const idx = modelId.indexOf('/');
  if (idx === -1) return { provider: '', modelPath: modelId };
  return { provider: modelId.slice(0, idx), modelPath: modelId.slice(idx + 1) };
}

export async function countPromptTokens(
  messages: ChatMessage[],
  modelId: string
): Promise<number | null> {
  const { provider, modelPath } = parseModelId(modelId);

  if (usesGptTokenizer(provider, modelPath)) {
    return countPromptGpt(messages);
  }

  return countPromptHf(messages, modelPath);
}

export async function countCompletionTokens(
  text: string,
  modelId: string
): Promise<number | null> {
  const { provider, modelPath } = parseModelId(modelId);

  if (usesGptTokenizer(provider, modelPath)) {
    return countGpt(text);
  }

  return countTextHf(text, modelPath);
}

export async function getStreamCounter(
  modelId: string
): Promise<{ feed(textDelta: string): void; total(): number } | null> {
  const { provider, modelPath } = parseModelId(modelId);

  if (usesGptTokenizer(provider, modelPath)) {
    let buffer = '';
    return {
      feed(textDelta: string) {
        buffer += textDelta;
      },
      total(): number {
        // Count the accumulated buffer and return its length.
        // Re-tokenizing the full buffer on each total() call gives a ~2-5%
        // overcount for streaming because chunk boundaries can split multi-token
        // sequences differently than the final combined string.
        const n = countGpt(buffer);
        return n ?? 0;
      },
    };
  }

  const { repo } = resolveHfRepo(modelPath);
  const tokenizer = await getHfTokenizer(repo);
  if (!tokenizer) return null;

  let buffer = '';
  return {
    feed(textDelta: string) {
      buffer += textDelta;
    },
    total(): number {
      try {
        const ids = tokenizer.encode(buffer);
        return ids.length;
      } catch {
        return 0;
      }
    },
  };
}
