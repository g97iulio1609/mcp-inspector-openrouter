/**
 * OpenRouterChat — stateful chat with history and streaming support.
 */

import type {
  AIResponse,
  AIResponseChoice,
  ChatMessage,
  ChatRole,
  ChatSendResponse,
  ContentPart,
  ParsedFunctionCall,
} from '../../../types';
import {
  OPENROUTER_CHAT_ENDPOINT,
  AI_MAX_RETRIES,
  AI_RETRY_DELAY_MS,
} from '../../../utils/constants';
import type { ChatSendParams, StreamChunk } from './types';
import {
  buildHeaders,
  formatFunctionDeclarations,
  fetchWithBackoff,
  throwApiError,
  safeParseArguments,
  delay,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_INPUT_TOKENS,
  MAX_HISTORY_MESSAGES,
} from './api-client';
import { parseSSEStream } from './streaming';

const TOKEN_ESTIMATE_CHARS_PER_TOKEN = 4;
const RETRY_HISTORY_TARGET = 40;

function estimateContentTokens(content: ChatMessage['content']): number {
  if (typeof content === 'string') {
    return Math.ceil(content.length / TOKEN_ESTIMATE_CHARS_PER_TOKEN);
  }

  let chars = 0;
  for (const part of content) {
    if (part.type === 'text') {
      chars += part.text.length;
    } else if (part.type === 'image_url') {
      chars += part.image_url.url.length;
    }
  }

  return Math.ceil(chars / TOKEN_ESTIMATE_CHARS_PER_TOKEN);
}

function estimateMessageTokens(message: ChatMessage): number {
  let tokens = estimateContentTokens(message.content);

  if (message.tool_calls?.length) {
    for (const toolCall of message.tool_calls) {
      tokens += Math.ceil(
        (toolCall.function.name.length + toolCall.function.arguments.length) /
          TOKEN_ESTIMATE_CHARS_PER_TOKEN,
      );
    }
  }

  if (message.tool_call_id) {
    tokens += Math.ceil(
      message.tool_call_id.length / TOKEN_ESTIMATE_CHARS_PER_TOKEN,
    );
  }

  return Math.max(tokens, 1);
}

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

  private trimHistoryByInputBudget(maxInputTokens: number): void {
    const targetBudget = Math.max(1, Math.floor(maxInputTokens));
    if (this.history.length === 0) return;

    let total = this.history.reduce(
      (sum, msg) => sum + estimateMessageTokens(msg),
      0,
    );

    let removed = 0;
    while (this.history.length > 1 && total > targetBudget) {
      const dropped = this.history.shift();
      if (!dropped) break;
      total -= estimateMessageTokens(dropped);
      removed += 1;
    }

    if (removed > 0) {
      console.debug(
        `[OpenRouter] Trimmed ${removed} messages to respect input budget ~${targetBudget} tokens`,
      );
    }
  }

  private resolveMaxInputTokens(config: ChatSendParams['config']): number {
    const raw = config?.maxInputTokens;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_MAX_INPUT_TOKENS;
    }
    return Math.max(1, Math.floor(raw));
  }

  /** Append user or tool messages to history based on message type */
  private appendIncomingMessages(
    message: ChatSendParams['message'],
  ): void {
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
  }

  /** Build the request body for the API call */
  private buildRequestBody(
    config: ChatSendParams['config'],
    stream = false,
  ): Record<string, unknown> {
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

    if (stream) {
      body.stream = true;
    }

    if (functionDecls.length > 0) {
      body.tools = formatFunctionDeclarations(functionDecls);
    }

    return body;
  }

  async sendMessage(params: ChatSendParams): Promise<ChatSendResponse> {
    const { message, config } = params;
    const maxInputTokens = this.resolveMaxInputTokens(config);

    this.appendIncomingMessages(message);
    this.trimHistory(MAX_HISTORY_MESSAGES);
    this.trimHistoryByInputBudget(maxInputTokens);

    const body = this.buildRequestBody(config);

    console.debug(
      `[OpenRouter] Request: model=${this.model}, messages=${(body.messages as ChatMessage[]).length}, tools=${(config?.tools?.[0]?.functionDeclarations ?? []).length}`,
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

    const reasoning = typeof assistantMessage.reasoning === 'string'
      ? assistantMessage.reasoning
      : '';

    const finishReason = data.choices[0].finish_reason;

    if (finishReason === 'length' && !textContent && reasoning) {
      console.warn('[OpenRouter] Model ran out of tokens — reasoning consumed all output. Consider increasing max_tokens.');
    }

    // Retry once if finish_reason is 'length' with empty content and no function calls
    if (finishReason === 'length' && !textContent && (!functionCalls || functionCalls.length === 0)) {
      console.warn('[OpenRouter] Empty content with finish_reason=length, retrying with trimmed history and increased max_tokens.');
      this.trimHistory(Math.min(RETRY_HISTORY_TARGET, MAX_HISTORY_MESSAGES));
      this.trimHistoryByInputBudget(maxInputTokens);
      const retryBody = this.buildRequestBody(config);
      const currentMaxTokens = (retryBody.max_tokens as number) ?? DEFAULT_MAX_TOKENS;
      retryBody.max_tokens = Math.max(currentMaxTokens, DEFAULT_MAX_TOKENS);

      const retryRes = await fetchWithBackoff(OPENROUTER_CHAT_ENDPOINT, {
        method: 'POST',
        headers: buildHeaders(this.apiKey),
        body: JSON.stringify(retryBody),
      });

      if (retryRes.ok) {
        const retryData = (await retryRes.json()) as AIResponse;
        if (retryData.choices?.length && retryData.choices[0].message) {
          const retryMsg = retryData.choices[0].message;
          const retryText = typeof retryMsg.content === 'string' ? retryMsg.content : '';
          const retryReasoning = typeof retryMsg.reasoning === 'string' ? retryMsg.reasoning : '';
          const retryFinishReason = retryData.choices[0].finish_reason;
          const retryFunctionCalls: ParsedFunctionCall[] | undefined =
            retryMsg.tool_calls?.map((tc) => ({
              name: tc.function.name,
              args: safeParseArguments(tc.function.arguments, tc.id, tc.function.name),
              id: tc.id,
            }));

          // Update history with retry response
          this.history[this.history.length - 1] = {
            ...retryMsg,
            content: retryMsg.content ?? '',
          };

          return {
            text: retryText,
            reasoning: retryReasoning || undefined,
            finishReason: retryFinishReason,
            functionCalls: retryFunctionCalls,
            candidates: retryData.choices as readonly AIResponseChoice[],
          };
        }
      }
    }

    return {
      text: textContent,
      reasoning: reasoning || undefined,
      finishReason,
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
    const maxInputTokens = this.resolveMaxInputTokens(config);

    this.appendIncomingMessages(message);
    this.trimHistory(MAX_HISTORY_MESSAGES);
    this.trimHistoryByInputBudget(maxInputTokens);

    const body = this.buildRequestBody(config, true);

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

    yield* parseSSEStream(reader, this.history);
  }
}
