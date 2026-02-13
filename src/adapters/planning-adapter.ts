/**
 * PlanningAdapter — IPlanningPort implementation wrapping PlanManager.
 *
 * Thin adapter that delegates to the existing PlanManager while
 * adding observer support for plan state changes.
 */

import type { IPlanningPort } from '../ports/planning.port';
import type { Plan, PlanStep } from '../ports/types';
import type { PlanManager } from '../sidebar/plan-manager';

export class PlanningAdapter implements IPlanningPort {
  private readonly listeners = new Set<(plan: Plan | null) => void>();

  constructor(private readonly planManager: PlanManager) {}

  createPlan(goal: string, steps: PlanStep[]): Plan {
    this.planManager.handlePlanTool(
      'create_plan',
      { goal, steps },
      `plan_${Date.now()}`,
    );
    const plan = this.getCurrentPlan()!;
    this.notify();
    return plan;
  }

  updatePlan(goal: string, steps: PlanStep[]): Plan {
    this.planManager.handlePlanTool(
      'update_plan',
      { goal, steps },
      `plan_${Date.now()}`,
    );
    const plan = this.getCurrentPlan()!;
    this.notify();
    return plan;
  }

  getCurrentPlan(): Plan | null {
    return this.planManager.activePlan?.plan ?? null;
  }

  advanceStep(): void {
    this.planManager.advancePlanStep();
    this.notify();
  }

  markStepDone(detail?: string): void {
    this.planManager.markStepDone(detail);
    this.notify();
  }

  markStepFailed(detail?: string): void {
    this.planManager.markStepFailed(detail);
    this.notify();
  }

  onPlanChanged(callback: (plan: Plan | null) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  // ── Private ──

  private notify(): void {
    const plan = this.getCurrentPlan();
    for (const cb of this.listeners) {
      try {
        cb(plan);
      } catch {
        // Isolate listener errors so remaining listeners still fire
      }
    }
  }
}
