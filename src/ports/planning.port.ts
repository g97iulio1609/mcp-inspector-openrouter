/**
 * IPlanningPort — contract for structured plan/todo management.
 *
 * Provides CRUD operations for execution plans with step tracking,
 * dependencies, and real-time status updates.
 */

import type { Plan, PlanStep } from './types';

export interface IPlanningPort {
  /** Create a new execution plan */
  createPlan(goal: string, steps: PlanStep[]): Plan;

  /** Update an existing plan's goal or steps */
  updatePlan(goal: string, steps: PlanStep[]): Plan;

  /** Get the currently active plan, or null if none */
  getCurrentPlan(): Plan | null;

  /** Advance the current step to the next pending step */
  advanceStep(): void;

  /** Mark the current step as done */
  markStepDone(detail?: string): void;

  /** Mark the current step as failed */
  markStepFailed(detail?: string): void;

  /** Subscribe to plan state changes */
  onPlanChanged(callback: (plan: Plan | null) => void): () => void;
}
