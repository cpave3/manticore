import { findUpstreamById, findUpstreamByName } from './upstreams.js';
import { resolveModelMapping } from './model-mappings.js';
import { parseModelId } from './model-id.js';

export function resolveRoute(modelId: string) {
  const mapping = resolveModelMapping(modelId.startsWith('manticore/') ? modelId.slice(10) : modelId);
  if (mapping) return { upstream: findUpstreamById(mapping.upstreamId), modelPath: mapping.modelPath, provider: undefined };
  const parsed = parseModelId(modelId);
  return { upstream: findUpstreamByName(parsed.provider), modelPath: parsed.modelPath, provider: parsed.provider };
}
