import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { providerCredentials } from '../../db/schema.js';
import type { ChatGPTCodexCredentials } from './types.js';
import { CHATGPT_CODEX_PROVIDER_ID } from './types.js';

export function getChatGPTCodexCredentials(): ChatGPTCodexCredentials | null {
  const db = getDb();
  const row = db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.providerId, CHATGPT_CODEX_PROVIDER_ID))
    .get();
  if (!row) return null;
  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    accountId: row.accountId,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt),
  };
}

export function saveChatGPTCodexCredentials(credentials: ChatGPTCodexCredentials): void {
  const db = getDb();
  const now = new Date();
  db
    .insert(providerCredentials)
    .values({
      providerId: CHATGPT_CODEX_PROVIDER_ID,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      accountId: credentials.accountId,
      expiresAt: credentials.expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: providerCredentials.providerId,
      set: {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        accountId: credentials.accountId,
        expiresAt: credentials.expiresAt,
        updatedAt: now,
      },
    })
    .run();
}

export function deleteChatGPTCodexCredentials(): void {
  const db = getDb();
  db
    .delete(providerCredentials)
    .where(eq(providerCredentials.providerId, CHATGPT_CODEX_PROVIDER_ID))
    .run();
}

export function extractChatGPTAccountId(accessToken: string): string {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
    const auth = payload['https://api.openai.com/auth'];
    if (!auth || typeof auth !== 'object') throw new Error('Missing auth claim');
    const accountId = (auth as Record<string, unknown>).chatgpt_account_id;
    if (typeof accountId !== 'string' || accountId.length === 0) throw new Error('Missing account id');
    return accountId;
  } catch {
    throw new Error('Failed to extract ChatGPT account id from access token');
  }
}
