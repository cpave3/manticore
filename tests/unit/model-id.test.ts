import { describe, it, expect } from 'vitest';
import { parseModelId } from '../../src/services/model-id.js';
import { HttpError } from '../../src/lib/errors.js';

describe('parseModelId', () => {
  it('parses provider and modelPath', () => {
    expect(parseModelId('ollama/qwen3:9b')).toEqual({ provider: 'ollama', modelPath: 'qwen3:9b' });
  });

  it('keeps everything after the first slash for multi-segment paths', () => {
    expect(parseModelId('openrouter/anthropic/claude-3.5-sonnet')).toEqual({
      provider: 'openrouter',
      modelPath: 'anthropic/claude-3.5-sonnet',
    });
  });

  it('throws for a modelId with no slash', () => {
    expect(() => parseModelId('gpt-4o')).toThrow(HttpError);
  });

  it('throws for an empty provider', () => {
    expect(() => parseModelId('/foo')).toThrow(HttpError);
  });

  it('throws for an empty path', () => {
    expect(() => parseModelId('foo/')).toThrow(HttpError);
  });

  it('error has type invalid_request_error', () => {
    try {
      parseModelId('bad');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).type).toBe('invalid_request_error');
      expect((err as HttpError).status).toBe(400);
    }
  });
});
