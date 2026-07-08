export const CHATGPT_CODEX_PROVIDER_ID = 'chatgpt-codex';
export const CHATGPT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api';

export type ChatGPTCodexModelId =
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.3-codex-spark'
  | 'gpt-5-codex'
  | 'codex-mini-latest'
  | (string & {});

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type ReasoningSummary = 'auto' | 'concise' | 'detailed' | 'off' | 'on' | null;

export type ChatGPTCodexProviderOptions = {
  reasoningEffort?: ReasoningEffort;
  reasoningSummary?: ReasoningSummary;
  serviceTier?: 'auto' | 'default' | 'flex' | 'priority' | string;
  textVerbosity?: 'low' | 'medium' | 'high';
};

export type ChatGPTCodexCredentials = {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  expiresAt: Date;
};

export type ChatGPTCodexMessage =
  | {
      role: 'user' | 'assistant';
      content: string | null;
    }
  | {
      type: 'function_call';
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: 'function_call_output';
      call_id: string;
      output: string;
    };

export type ChatGPTCodexRequest = {
  model: string;
  store: false;
  stream: true;
  instructions: string;
  input: ChatGPTCodexMessage[];
  tools?: unknown[];
  tool_choice?: 'auto';
  parallel_tool_calls: boolean;
  reasoning?: { effort?: string; summary?: string | null };
  service_tier?: string;
  text?: { verbosity?: string };
  include?: string[];
  prompt_cache_key?: string;
};

export type ChatGPTCodexUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
};
