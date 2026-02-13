/**
 * IAgentPort — orchestration contract for AI agent execution.
 *
 * The primary entry point for running an agent with a user prompt.
 * Implementations wrap specific AI frameworks (e.g. DeepAgent, custom tool-loop).
 */

import type { AgentContext, AgentResult } from './types';

export interface IAgentPort {
  /** Execute the agent with a prompt and context, returning the final result */
  run(prompt: string, context: AgentContext): Promise<AgentResult>;

  /** Release resources (connections, event listeners, etc.) */
  dispose(): Promise<void>;
}
