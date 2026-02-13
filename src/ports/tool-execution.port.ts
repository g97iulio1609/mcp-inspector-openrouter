/**
 * IToolExecutionPort — contract for executing tools on browser targets.
 *
 * Abstracts tool routing (Chrome tabs, background script, local handlers)
 * behind a uniform interface. Supports dynamic tool discovery.
 */

import type { ToolCallResult, ToolDefinition, ToolTarget } from './types';

export interface IToolExecutionPort {
  /** Execute a tool by name with given args on the specified target */
  execute(
    toolName: string,
    args: Record<string, unknown>,
    target: ToolTarget,
  ): Promise<ToolCallResult>;

  /** Get all currently available tool definitions */
  getAvailableTools(tabId: number): Promise<readonly ToolDefinition[]>;

  /** Subscribe to tool-list changes (e.g. after navigation) */
  onToolsChanged(callback: (tools: readonly ToolDefinition[]) => void): () => void;
}
