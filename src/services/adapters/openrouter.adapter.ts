/**
 * OpenRouter AI provider adapter — implements IAIProvider.
 * Converted from: openrouter-bridge.js
 */

import type { IAIProvider } from '../ports';
import type {
  AIModel,
  AIProviderConfig,
  AIResponse,
  AIResponseChoice,
  ChatMessage,
  ChatRole,
  ChatSendResponse,
  ContentPart,
  FunctionDeclaration,
  ParsedFunctionCall,
  Tool,
  ToolDeclaration,
  ToolResponse,
} from '../../types';
import {
  OPENROUTER_CHAT_ENDPOINT,
  OPENROUTER_MODELS_ENDPOINT,
  OPENROUTER_REFERER,
  OPENROUTER_TITLE,
  DEFAULT_MODEL,
  AI_MAX_RETRIES,
  AI_RETRY_DELAY_MS,
} from '../../utils/constants';

// ── Error Types ──

/** Base class for OpenRouter API errors */
export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

/** Thrown when the API key is invalid or missing (401/403) */
export class AuthenticationError extends OpenRouterError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
    this.name = 'AuthenticationError';
  }
}

/** Thrown when rate-limited by the API (429) */
export class RateLimitError extends OpenRouterError {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/** Thrown for model-specific errors (invalid model, context length exceeded) */
export class ModelError extends OpenRouterError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
    this.name = 'ModelError';
  }
}

// ── Constants ──

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;
const MAX_HISTORY_MESSAGES = 30;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const RATE_LIMIT_MAX_RETRIES = 3;

// ── Helpers ──

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': OPENROUTER_REFERER,
    'X-Title': OPENROUTER_TITLE,
  };
}

function formatToolDeclarations(tools: readonly Tool[]): ToolDeclaration[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters:
        typeof t.inputSchema === 'string'
          ? (JSON.parse(t.inputSchema) as Record<string, unknown>)
          : (t.inputSchema as unknown as Record<string, unknown>),
    },
  }));
}

function formatFunctionDeclarations(
  decls: readonly FunctionDeclaration[],
): ToolDeclaration[] {
  return decls.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parametersJsonSchema,
    },
  }));
}

/** OpenRouter error response shape */
interface OpenRouterErrorBody {
  error?: {
    message?: string;
    code?: number | string;
    type?: string;
    metadata?: { reasons?: string[] };
  };
}

/** Parse a raw API error body and throw a typed error */
async function throwApiError(res: Response): Promise<never> {
  let body: OpenRouterErrorBody | undefined;
  try {
    body = (await res.json()) as OpenRouterErrorBody;
  } catch {
    // If JSON parsing fails, fall through to generic error
  }

  const message = body?.error?.message ?? res.statusText;

  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
    throw new RateLimitError(message, retryMs);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AuthenticationError(message, res.status);
  }
  const errorType = body?.error?.type ?? '';
  if (
    res.status === 400 ||
    errorType.includes('model') ||
    errorType.includes('context')
  ) {
    throw new ModelError(message, res.status);
  }

  throw new OpenRouterError(message, res.status);
}

/** Safe JSON.parse for tool call arguments; returns empty object on failure */
function safeParseArguments(
  raw: string,
  toolCallId: string,
  fnName: string,
): Record<string, unknown> {
  if (!raw || raw.trim() === '') {
    console.warn(
      `[OpenRouter] Tool call ${toolCallId} (${fnName}) has empty arguments, defaulting to {}`,
    );
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    console.error(
      `[OpenRouter] Failed to parse arguments for tool call ${toolCallId} (${fnName}):`,
      raw,
      e,
    );
    return {};
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Execute a fetch with exponential backoff on rate-limit errors */
async function fetchWithBackoff(
  url: string,
  init: RequestInit,
): Promise<Response> {
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;

    const retryAfter = res.headers.get('retry-after');
    const waitMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt);

    console.warn(
      `[OpenRouter] Rate limited (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`,
    );

    if (attempt === RATE_LIMIT_MAX_RETRIES - 1) return res;
    await delay(waitMs);
  }
  // Should not reach here, but return last attempt
  return fetch(url, init);
}

// ── OpenRouterAdapter (implements IAIProvider) ──

export class OpenRouterAdapter implements IAIProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
  }

  async sendMessage(
    messages: readonly ChatMessage[],
    tools?: readonly Tool[],
  ): Promise<AIResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };

    if (tools && tools.length > 0) {
      body.tools = formatToolDeclarations(tools);
    }

    const res = await fetchWithBackoff(OPENROUTER_CHAT_ENDPOINT, {
      method: 'POST',
      headers: buildHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      await throwApiError(res);
    }

    return (await res.json()) as AIResponse;
  }

  async listModels(): Promise<readonly AIModel[]> {
    const res = await fetch(OPENROUTER_MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      await throwApiError(res);
    }

    const data = (await res.json()) as { data: AIModel[] };
    return data.data;
  }
}

// ── Chat config types (mirrors the original JS shape) ──

export interface ChatConfig {
  readonly systemInstruction?: readonly string[];
  readonly tools?: readonly [
    { readonly functionDeclarations: readonly FunctionDeclaration[] },
  ];
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface ChatSendParams {
  readonly message: string | readonly ContentPart[] | readonly ToolResponse[];
  readonly config?: ChatConfig;
}

/** A single streamed chunk from sendMessageStreaming */
export interface StreamChunk {
  readonly text: string;
  readonly done: boolean;
  readonly functionCalls?: readonly ParsedFunctionCall[];
}

// ── OpenRouterChat (stateful chat with history) ──

export class OpenRouterChat {
  private readonly apiKey: string;
  model: string;
  history: ChatMessage[];

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.history = [];
  }

  /**
   * Trim history to keep the last N user/assistant/tool messages,
   * preventing unbounded token growth.
   */
  trimHistory(maxMessages: number = MAX_HISTORY_MESSAGES): void {
    if (this.history.length <= maxMessages) return;

    const trimmed = this.history.length - maxMessages;
    this.history = this.history.slice(-maxMessages);
    console.debug(
      `[OpenRouter] Trimmed ${trimmed} messages from history, keeping last ${maxMessages}`,
    );
  }

  async sendMessage(params: ChatSendParams): Promise<ChatSendResponse> {
    const { message, config } = params;

    // Append user or tool messages to history
    if (typeof message === 'string') {
      this.history.push({ role: 'user', content: message });
    } else if (Array.isArray(message) && message.length > 0 && 'type' in message[0]) {
      // Multi-part content (text + image)
      this.history.push({ role: 'user', content: message as readonly ContentPart[] });
    } else if (Array.isArray(message)) {
      for (const m of message) {
        if (m.functionResponse) {
          this.history.push({
            role: 'tool' as ChatRole,
            tool_call_id: m.functionResponse.tool_call_id,
            content: JSON.stringify(
              m.functionResponse.response.result ??
                m.functionResponse.response.error,
            ),
          });
        }
      }
    }

    // Auto-trim history to prevent unbounded token growth
    this.trimHistory(MAX_HISTORY_MESSAGES);

    const systemMessage: ChatMessage | null = config?.systemInstruction
      ? { role: 'system', content: config.systemInstruction.join('\n') }
      : null;

    const functionDecls = config?.tools?.[0]?.functionDeclarations ?? [];

    const body: Record<string, unknown> = {
      model: this.model,
      messages: systemMessage
        ? [systemMessage, ...this.history]
        : this.history,
      temperature: config?.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: config?.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    if (functionDecls.length > 0) {
      body.tools = formatFunctionDeclarations(functionDecls);
    }

    console.debug(
      `[OpenRouter] Request: model=${this.model}, messages=${(body.messages as ChatMessage[]).length}, tools=${functionDecls.length}`,
    );

    // Retry logic for empty responses
    let data: AIResponse | undefined;

    for (let attempt = 0; attempt < AI_MAX_RETRIES; attempt++) {
      const res = await fetchWithBackoff(OPENROUTER_CHAT_ENDPOINT, {
        method: 'POST',
        headers: buildHeaders(this.apiKey),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        await throwApiError(res);
      }

      data = (await res.json()) as AIResponse;

      if (
        data.choices &&
        data.choices.length > 0 &&
        data.choices[0].message
      ) {
        break;
      }

      console.warn(
        `[OpenRouter] Empty response on attempt ${attempt + 1}/${AI_MAX_RETRIES}, retrying...`,
      );
      if (attempt < AI_MAX_RETRIES - 1) {
        await delay(AI_RETRY_DELAY_MS);
      }
    }

    if (!data?.choices?.length || !data.choices[0].message) {
      throw new Error(
        'OpenRouter returned no response after multiple attempts.',
      );
    }

    // Log token usage when available
    if (data.usage) {
      console.debug(
        `[OpenRouter] Usage: prompt=${data.usage.prompt_tokens}, completion=${data.usage.completion_tokens}, total=${data.usage.total_tokens}`,
      );
    }

    const assistantMessage = data.choices[0].message;

    // Ensure content is never null in stored history
    const historyEntry: ChatMessage = {
      ...assistantMessage,
      content: assistantMessage.content ?? '',
    };
    this.history.push(historyEntry);

    // Parse function calls with safe argument parsing
    const functionCalls: ParsedFunctionCall[] | undefined =
      assistantMessage.tool_calls?.map((tc) => ({
        name: tc.function.name,
        args: safeParseArguments(
          tc.function.arguments,
          tc.id,
          tc.function.name,
        ),
        id: tc.id,
      }));

    // Merge text and tool_calls: some models return both
    const textContent =
      typeof assistantMessage.content === 'string'
        ? assistantMessage.content
        : '';

    return {
      text: textContent,
      functionCalls,
      candidates: data.choices as readonly AIResponseChoice[],
    };
  }

  /**
   * Send a message and stream the response token-by-token via SSE.
   * Yields StreamChunk objects; the final chunk has `done: true`.
   */
  async *sendMessageStreaming(
    params: ChatSendParams,
  ): AsyncGenerator<StreamChunk> {
    const { message, config } = params;

    // Append user or tool messages to history (same logic as sendMessage)
    if (typeof message === 'string') {
      this.history.push({ role: 'user', content: message });
    } else if (Array.isArray(message) && message.length > 0 && 'type' in message[0]) {
      this.history.push({ role: 'user', content: message as readonly ContentPart[] });
    } else if (Array.isArray(message)) {
      for (const m of message) {
        if (m.functionResponse) {
          this.history.push({
            role: 'tool' as ChatRole,
            tool_call_id: m.functionResponse.tool_call_id,
            content: JSON.stringify(
              m.functionResponse.response.result ??
                m.functionResponse.response.error,
            ),
          });
        }
      }
    }

    this.trimHistory(MAX_HISTORY_MESSAGES);

    const systemMessage: ChatMessage | null = config?.systemInstruction
      ? { role: 'system', content: config.systemInstruction.join('\n') }
      : null;

    const functionDecls = config?.tools?.[0]?.functionDeclarations ?? [];

    const body: Record<string, unknown> = {
      model: this.model,
      messages: systemMessage
        ? [systemMessage, ...this.history]
        : this.history,
      temperature: config?.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: config?.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
    };

    if (functionDecls.length > 0) {
      body.tools = formatFunctionDeclarations(functionDecls);
    }

    console.debug(
      `[OpenRouter] Streaming request: model=${this.model}, messages=${(body.messages as ChatMessage[]).length}`,
    );

    const res = await fetchWithBackoff(OPENROUTER_CHAT_ENDPOINT, {
      method: 'POST',
      headers: buildHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      await throwApiError(res);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable for streaming');
    }

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    const accumulatedToolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const payload = trimmed.slice(6);
          if (payload === '[DONE]') {
            // Build final function calls from accumulated tool call deltas
            let functionCalls: ParsedFunctionCall[] | undefined;
            if (accumulatedToolCalls.size > 0) {
              functionCalls = [];
              for (const tc of accumulatedToolCalls.values()) {
                functionCalls.push({
                  name: tc.name,
                  args: safeParseArguments(tc.arguments, tc.id, tc.name),
                  id: tc.id,
                });
              }
            }

            // Store in history
            const historyEntry: ChatMessage = {
              role: 'assistant',
              content: fullText,
            };
            this.history.push(historyEntry);

            yield { text: '', done: true, functionCalls };
            return;
          }

          try {
            const chunk = JSON.parse(payload) as {
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{
                    index: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
              }>;
            };

            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              fullText += delta.content;
              yield { text: delta.content, done: false };
            }

            // Accumulate tool call deltas
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = accumulatedToolCalls.get(tc.index);
                if (existing) {
                  if (tc.function?.arguments) {
                    existing.arguments += tc.function.arguments;
                  }
                } else {
                  accumulatedToolCalls.set(tc.index, {
                    id: tc.id ?? '',
                    name: tc.function?.name ?? '',
                    arguments: tc.function?.arguments ?? '',
                  });
                }
              }
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Fallback: if stream ended without [DONE]
    const historyEntry: ChatMessage = {
      role: 'assistant',
      content: fullText,
    };
    this.history.push(historyEntry);

    let functionCalls: ParsedFunctionCall[] | undefined;
    if (accumulatedToolCalls.size > 0) {
      functionCalls = [];
      for (const tc of accumulatedToolCalls.values()) {
        functionCalls.push({
          name: tc.name,
          args: safeParseArguments(tc.arguments, tc.id, tc.name),
          id: tc.id,
        });
      }
    }

    yield { text: '', done: true, functionCalls };
  }
}
