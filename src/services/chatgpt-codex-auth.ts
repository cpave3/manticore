import { HttpError } from '../lib/errors.js';
import {
  getChatGPTCodexCredentials,
  saveChatGPTCodexCredentials,
  deleteChatGPTCodexCredentials,
} from '../providers/chatgpt-codex/credentials.js';
import {
  refreshChatGPTCodexCredentials,
  loginChatGPTCodexWithBrowser,
  loginChatGPTCodexWithDeviceCode,
  loginChatGPTCodexWithCode,
  createChatGPTCodexAuthUrl,
} from '../providers/chatgpt-codex/oauth.js';
import type { ChatGPTCodexCredentials } from '../providers/chatgpt-codex/types.js';

const REFRESH_SKEW_MS = 60_000;

export async function getFreshChatGPTCodexCredentials(): Promise<ChatGPTCodexCredentials> {
  const credentials = getChatGPTCodexCredentials();
  if (!credentials) {
    throw new HttpError({
      status: 401,
      message: 'ChatGPT Codex is not authenticated. Run `manticore codex login`.',
      type: 'invalid_request_error',
    });
  }
  if (credentials.expiresAt.getTime() > Date.now() + REFRESH_SKEW_MS) {
    return credentials;
  }
  const refreshed = await refreshChatGPTCodexCredentials(credentials.refreshToken);
  saveChatGPTCodexCredentials(refreshed);
  return refreshed;
}

export function getChatGPTCodexStatus(): { authenticated: boolean; accountId: string | null; expiresAt: string | null } {
  const credentials = getChatGPTCodexCredentials();
  return {
    authenticated: credentials != null,
    accountId: credentials?.accountId ?? null,
    expiresAt: credentials?.expiresAt.toISOString() ?? null,
  };
}

export async function loginChatGPTCodexBrowser(onAuthUrl: (url: string) => void): Promise<ChatGPTCodexCredentials> {
  const credentials = await loginChatGPTCodexWithBrowser(onAuthUrl);
  saveChatGPTCodexCredentials(credentials);
  return credentials;
}

export async function loginChatGPTCodexDeviceCode(
  onDeviceCode: (info: { userCode: string; verificationUri: string; expiresInSeconds: number }) => void,
): Promise<ChatGPTCodexCredentials> {
  const credentials = await loginChatGPTCodexWithDeviceCode(onDeviceCode);
  saveChatGPTCodexCredentials(credentials);
  return credentials;
}

export async function loginChatGPTCodexManualCode(input: {
  codeOrRedirectUrl: string;
  verifier: string;
  state?: string;
}): Promise<ChatGPTCodexCredentials> {
  const credentials = await loginChatGPTCodexWithCode(input);
  saveChatGPTCodexCredentials(credentials);
  return credentials;
}

export function createChatGPTCodexManualAuthUrl(): { url: string; verifier: string; state: string } {
  return createChatGPTCodexAuthUrl();
}

export function logoutChatGPTCodex(): void {
  deleteChatGPTCodexCredentials();
}
