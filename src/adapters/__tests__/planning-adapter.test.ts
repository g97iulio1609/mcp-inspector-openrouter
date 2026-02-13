import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanningAdapter } from '../planning-adapter';
import type { Plan, PlanStep } from '../../ports/types';
import type { PlanManager } from '../../sidebar/plan-manager';

const makePlan = (goal = 'Test goal', steps: PlanStep[] = []): Plan => ({
  goal,
  steps,
});

const makeStep = (overrides: Partial<PlanStep> = {}): PlanStep => ({
  id: 'step-1',
  title: 'Step one',
  status: 'pending',
  ...overrides,
});

function createMockPlanManager(activePlan: { plan: Plan } | null = null) {
  return {
    handlePlanTool: vi.fn(),
    activePlan,
    advancePlanStep: vi.fn(),
    markStepDone: vi.fn(),
    markStepFailed: vi.fn(),
  } as unknown as PlanManager & {
    handlePlanTool: ReturnType<typeof vi.fn>;
    activePlan: { plan: Plan } | null;
    advancePlanStep: ReturnType<typeof vi.fn>;
    markStepDone: ReturnType<typeof vi.fn>;
    markStepFailed: ReturnType<typeof vi.fn>;
  };
}

describe('PlanningAdapter', () => {
  let mockManager: ReturnType<typeof createMockPlanManager>;
  let adapter: PlanningAdapter;
  const plan = makePlan('Build feature', [makeStep()]);

  beforeEach(() => {
    mockManager = createMockPlanManager({ plan });
    adapter = new PlanningAdapter(mockManager as unknown as PlanManager);
  });

  // ── createPlan ──

  describe('createPlan', () => {
    it('calls handlePlanTool with create_plan', () => {
      const steps = [makeStep()];
      adapter.createPlan('goal', steps);

      expect(mockManager.handlePlanTool).toHaveBeenCalledWith(
        'create_plan',
        { goal: 'goal', steps },
        expect.stringMatching(/^plan_\d+$/),
      );
    });

    it('returns current plan from manager', () => {
      const result = adapter.createPlan('goal', [makeStep()]);
      expect(result).toBe(plan);
    });

    it('notifies listeners', () => {
      const listener = vi.fn();
      adapter.onPlanChanged(listener);

      adapter.createPlan('goal', [makeStep()]);

      expect(listener).toHaveBeenCalledWith(plan);
    });
  });

  // ── updatePlan ──

  describe('updatePlan', () => {
    it('calls handlePlanTool with update_plan', () => {
      const steps = [makeStep()];
      adapter.updatePlan('new goal', steps);

      expect(mockManager.handlePlanTool).toHaveBeenCalledWith(
        'update_plan',
        { goal: 'new goal', steps },
        expect.stringMatching(/^plan_\d+$/),
      );
    });

    it('returns current plan from manager', () => {
      const result = adapter.updatePlan('new goal', [makeStep()]);
      expect(result).toBe(plan);
    });

    it('notifies listeners', () => {
      const listener = vi.fn();
      adapter.onPlanChanged(listener);

      adapter.updatePlan('new goal', [makeStep()]);

      expect(listener).toHaveBeenCalledWith(plan);
    });
  });

  // ── getCurrentPlan ──

  describe('getCurrentPlan', () => {
    it('returns plan from activePlan', () => {
      expect(adapter.getCurrentPlan()).toBe(plan);
    });

    it('returns null when no active plan', () => {
      const emptyManager = createMockPlanManager(null);
      const emptyAdapter = new PlanningAdapter(emptyManager as unknown as PlanManager);

      expect(emptyAdapter.getCurrentPlan()).toBeNull();
    });
  });

  // ── advanceStep ──

  describe('advanceStep', () => {
    it('calls planManager.advancePlanStep', () => {
      adapter.advanceStep();
      expect(mockManager.advancePlanStep).toHaveBeenCalled();
    });

    it('notifies listeners', () => {
      const listener = vi.fn();
      adapter.onPlanChanged(listener);

      adapter.advanceStep();

      expect(listener).toHaveBeenCalledWith(plan);
    });
  });

  // ── markStepDone ──

  describe('markStepDone', () => {
    it('calls planManager.markStepDone with detail', () => {
      adapter.markStepDone('completed successfully');
      expect(mockManager.markStepDone).toHaveBeenCalledWith('completed successfully');
    });

    it('calls planManager.markStepDone without detail', () => {
      adapter.markStepDone();
      expect(mockManager.markStepDone).toHaveBeenCalledWith(undefined);
    });
  });

  // ── markStepFailed ──

  describe('markStepFailed', () => {
    it('calls planManager.markStepFailed with detail', () => {
      adapter.markStepFailed('network error');
      expect(mockManager.markStepFailed).toHaveBeenCalledWith('network error');
    });
  });

  // ── onPlanChanged ──

  describe('onPlanChanged', () => {
    it('adds listener and returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = adapter.onPlanChanged(listener);

      expect(typeof unsub).toBe('function');

      adapter.advanceStep();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe removes listener', () => {
      const listener = vi.fn();
      const unsub = adapter.onPlanChanged(listener);

      unsub();

      adapter.advanceStep();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ── notify (listener isolation & fan-out) ──

  describe('notify', () => {
    it('isolates listener errors so other listeners still fire', () => {
      const first = vi.fn(() => { throw new Error('boom'); });
      const second = vi.fn();

      adapter.onPlanChanged(first);
      adapter.onPlanChanged(second);

      adapter.advanceStep();

      expect(first).toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith(plan);
    });

    it('multiple listeners all receive notifications', () => {
      const listeners = [vi.fn(), vi.fn(), vi.fn()];
      listeners.forEach((l) => adapter.onPlanChanged(l));

      adapter.advanceStep();

      listeners.forEach((l) => {
        expect(l).toHaveBeenCalledWith(plan);
      });
    });
  });
});
