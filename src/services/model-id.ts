import { HttpError } from '../lib/errors.js';

export function parseModelId(modelId: string): { provider: string; modelPath: string } {
  const idx = modelId.indexOf('/');
  if (idx <= 0 || idx === modelId.length - 1) {
    throw new HttpError({
      message: "Invalid model ID: expected '{provider}/{model-path}'",
      status: 400,
      type: 'invalid_request_error',
    });
  }
  const provider = modelId.slice(0, idx);
  const modelPath = modelId.slice(idx + 1);
  if (!provider || !modelPath) {
    throw new HttpError({
      message: "Invalid model ID: expected '{provider}/{model-path}'",
      status: 400,
      type: 'invalid_request_error',
    });
  }
  return { provider, modelPath };
}
