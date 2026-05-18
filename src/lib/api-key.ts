import { randomBytes } from 'node:crypto';

export const API_KEY_PREFIX = 'mc_' as const;

export function generateApiKey(): string {
  const hex = randomBytes(32).toString('hex');
  return `${API_KEY_PREFIX}${hex}`;
}

export function maskApiKey(key: string): string {
  if (key.length <= 4) return key;
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

export function apiKeyPrefix(key: string): string {
  return key.slice(0, 7);
}
