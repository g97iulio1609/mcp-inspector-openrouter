/**
 * ISubagentPort — contract for spawning and managing child agents.
 *
 * Enables the orchestrator to delegate subtasks to independent agents
 * with configurable depth limits and timeouts.
 */

import type { SubagentInfo, SubagentResult, SubagentTask } from './types';

export interface ISubagentPort {
  /** Spawn a child agent to handle a subtask */
  spawn(task: SubagentTask): Promise<SubagentResult>;

  /** List all active (running) subagents */
  getActiveSubagents(): readonly SubagentInfo[];

  /** Cancel a running subagent by ID */
  cancel(subagentId: string): Promise<void>;
}
