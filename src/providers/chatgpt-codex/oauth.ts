import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { extractChatGPTAccountId } from './credentials.js';
import type { ChatGPTCodexCredentials } from './types.js';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTH_BASE_URL = 'https://auth.openai.com';
const AUTHORIZE_URL = `${AUTH_BASE_URL}/oauth/authorize`;
const TOKEN_URL = `${AUTH_BASE_URL}/oauth/token`;
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const DEVICE_USER_CODE_URL = `${AUTH_BASE_URL}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${AUTH_BASE_URL}/api/accounts/deviceauth/token`;
const DEVICE_VERIFICATION_URI = `${AUTH_BASE_URL}/codex/device`;
const DEVICE_REDIRECT_URI = `${AUTH_BASE_URL}/deviceauth/callback`;
const DEVICE_CODE_TIMEOUT_SECONDS = 15 * 60;
const SCOPE = 'openid profile email offline_access';

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function credentialsFromToken(token: TokenResponse): ChatGPTCodexCredentials {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    accountId: extractChatGPTAccountId(token.access_token),
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  };
}

async function readTokenResponse(response: Response, operation: string): Promise<TokenResponse> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ChatGPT Codex token ${operation} failed (${response.status}): ${text || response.statusText}`);
  }
  const json = (await response.json()) as Partial<TokenResponse>;
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
    throw new Error(`ChatGPT Codex token ${operation} response missing fields`);
  }
  return json as TokenResponse;
}

export async function refreshChatGPTCodexCredentials(refreshToken: string): Promise<ChatGPTCodexCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  return credentialsFromToken(await readTokenResponse(response, 'refresh'));
}

async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  redirectUri = REDIRECT_URI,
): Promise<ChatGPTCodexCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  });
  return credentialsFromToken(await readTokenResponse(response, 'exchange'));
}

function parseAuthorizationInput(input: string): { code?: string; state?: string } {
  const value = input.trim();
  if (!value) return {};
  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get('code') ?? undefined,
      state: url.searchParams.get('state') ?? undefined,
    };
  } catch {
    // Not a URL.
  }
  if (value.includes('#')) {
    const [code, state] = value.split('#', 2);
    return { code, state };
  }
  if (value.includes('code=')) {
    const params = new URLSearchParams(value);
    return {
      code: params.get('code') ?? undefined,
      state: params.get('state') ?? undefined,
    };
  }
  return { code: value };
}

export function createChatGPTCodexAuthUrl(): { url: string; verifier: string; state: string } {
  const { verifier, challenge } = createPkce();
  const state = randomBytes(16).toString('hex');
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('id_token_add_organizations', 'true');
  url.searchParams.set('codex_cli_simplified_flow', 'true');
  url.searchParams.set('originator', 'manticore');
  return { url: url.toString(), verifier, state };
}

export async function loginChatGPTCodexWithCode(input: {
  codeOrRedirectUrl: string;
  verifier: string;
  state?: string;
}): Promise<ChatGPTCodexCredentials> {
  const parsed = parseAuthorizationInput(input.codeOrRedirectUrl);
  if (!parsed.code) throw new Error('Missing authorization code');
  if (input.state && parsed.state && parsed.state !== input.state) {
    throw new Error('OAuth state mismatch');
  }
  return exchangeAuthorizationCode(parsed.code, input.verifier);
}

export async function loginChatGPTCodexWithBrowser(
  onAuthUrl: (url: string) => void,
): Promise<ChatGPTCodexCredentials> {
  const { url, verifier, state } = createChatGPTCodexAuthUrl();
  const server = http.createServer();
  const codePromise = new Promise<string>((resolve, reject) => {
    server.on('request', (req, res) => {
      try {
        const callbackUrl = new URL(req.url || '/', 'http://localhost:1455');
        if (callbackUrl.pathname !== '/auth/callback') {
          res.writeHead(404).end('Not found');
          return;
        }
        if (callbackUrl.searchParams.get('state') !== state) {
          res.writeHead(400).end('State mismatch');
          reject(new Error('OAuth state mismatch'));
          return;
        }
        const code = callbackUrl.searchParams.get('code');
        if (!code) {
          res.writeHead(400).end('Missing authorization code');
          reject(new Error('Missing authorization code'));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('OpenAI authentication completed. You can close this window.');
        resolve(code);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    server.on('error', reject);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(1455, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error('OAuth callback server failed to start');

  onAuthUrl(url);
  try {
    const code = await codePromise;
    return exchangeAuthorizationCode(code, verifier);
  } finally {
    server.close();
  }
}

export async function loginChatGPTCodexWithDeviceCode(
  onDeviceCode: (info: { userCode: string; verificationUri: string; expiresInSeconds: number }) => void,
): Promise<ChatGPTCodexCredentials> {
  const start = await fetch(DEVICE_USER_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!start.ok) {
    throw new Error(`Device code request failed (${start.status}): ${await start.text().catch(() => start.statusText)}`);
  }
  const device = (await start.json()) as {
    device_auth_id?: string;
    user_code?: string;
    interval?: number | string;
  };
  if (!device.device_auth_id || !device.user_code) {
    throw new Error('Invalid device code response');
  }
  const intervalMs = Math.max(1000, Number(device.interval ?? 5) * 1000);
  onDeviceCode({
    userCode: device.user_code,
    verificationUri: DEVICE_VERIFICATION_URI,
    expiresInSeconds: DEVICE_CODE_TIMEOUT_SECONDS,
  });

  const expiresAt = Date.now() + DEVICE_CODE_TIMEOUT_SECONDS * 1000;
  while (Date.now() < expiresAt) {
    const response = await fetch(DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_auth_id: device.device_auth_id,
        user_code: device.user_code,
      }),
    });
    if (response.ok) {
      const json = (await response.json()) as { authorization_code?: string; code_verifier?: string };
      if (!json.authorization_code || !json.code_verifier) {
        throw new Error('Invalid device authorization token response');
      }
      return exchangeAuthorizationCode(json.authorization_code, json.code_verifier, DEVICE_REDIRECT_URI);
    }
    if (response.status !== 403 && response.status !== 404) {
      throw new Error(`Device authorization failed (${response.status}): ${await response.text().catch(() => '')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Device authorization timed out');
}
