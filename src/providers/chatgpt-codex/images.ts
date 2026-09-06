import { HttpError } from '../../lib/errors.js';
import type { ChatGPTCodexInputPart } from './types.js';

// Codex backend model metadata observed on 2026-09-06, not alias-name inference.
const imageModels = new Set([
  'gpt-6-astra', 'gpt-reserve', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
  'gpt-5.5', 'gpt-5.4-mini', 'codex-auto-review',
]);

export function codexInputModalities(modelId: string): Array<'text' | 'image'> | undefined {
  if (imageModels.has(modelId)) return ['text', 'image'];
  if (modelId === 'gpt-5.3-codex-spark') return ['text'];
  return undefined;
}

export function imageInputError(message: string): HttpError {
  return new HttpError({ status: 400, type: 'invalid_request_error', code: 'invalid_image_input', message });
}

const imageMediaTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function codexImageInput(
  modelId: string,
  data: string | Uint8Array | URL,
  mediaType: string,
  detail: unknown,
): Extract<ChatGPTCodexInputPart, { type: 'input_image' }> {
  if (codexInputModalities(modelId)?.includes('image') === false)
    throw imageInputError(`${modelId} does not accept image input.`);
  if (detail !== undefined && !['auto', 'low', 'high', 'original'].includes(detail as string))
    throw imageInputError('Image detail must be auto, low, high, or original.');
  if (detail === 'original' && !imageModels.has(modelId))
    throw imageInputError(`${modelId} has no verified support for original image detail.`);
  if (!imageMediaTypes.has(mediaType) && !(mediaType === 'image/*' && data instanceof URL && /^https?:$/.test(data.protocol)))
    throw imageInputError('Image input must use PNG, JPEG, WebP, or GIF media types.');

  let imageUrl: string;
  if (data instanceof URL) imageUrl = data.href;
  else if (typeof data === 'string' && data.startsWith('data:')) imageUrl = data;
  else imageUrl = `data:${mediaType};base64,${typeof data === 'string' ? data : Buffer.from(data).toString('base64')}`;

  if (imageUrl.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageUrl);
    if (!match || match[1] !== mediaType || match[2].length % 4 !== 0
      || Buffer.from(match[2], 'base64').toString('base64') !== match[2])
      throw imageInputError('Image data URI must contain valid base64 matching its image media type.');
  } else {
    let url: URL;
    try { url = new URL(imageUrl); } catch { throw imageInputError('Image URL must use HTTP(S).'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw imageInputError('Image URL must use HTTP(S) without embedded credentials.');
  }
  return { type: 'input_image', image_url: imageUrl,
    ...(detail === undefined ? {} : { detail: detail as 'auto' | 'low' | 'high' | 'original' }) };
}
