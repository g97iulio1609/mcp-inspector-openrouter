import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SubagentAdapter } from '../subagent-adapter';
import type { IAgentPort } from '../../ports/agent.port';
import type { AgentResult } from '../../ports/types';

function makeAgentResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    text: 'done',
    toolCalls: [],
    updatedTools: [],
    updatedPageContext: null,
    stepsCompleted: 3,
    ...overrides,
  };
}

function createMockAgent(overrides: Partial<IAgentPort> = {}): IAgentPort {
  return {
    run: vi.fn<IAgentPort['run']>().mockResolvedValue(makeAgentResult()),
    dispose: vi.fn<IAgentPort['dispose']>().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('SubagentAdapter', () => {
  let adapter: SubagentAdapter;
  let mockAgent: IAgentPort;
  let factory: () => IAgentPort;

  beforeEach(() => {
    vi.useFakeTimers();
    mockAgent = createMockAgent();
    factory = vi.fn(() => mockAgent);
    adapter = new SubagentAdapter(factory);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. spawn creates and runs agent successfully
  it('spawn creates and runs agent successfully', async () => {
    const result = await adapter.spawn({ prompt: 'do something' });
    expect(result.success).toBe(true);
    expect(mockAgent.run).toHaveBeenCalledOnce();
  });

  // 2. spawn returns subagentId and result text
  it('spawn returns subagentId and result text', async () => {
    const result = await adapter.spawn({ prompt: 'do something' });
    expect(result.subagentId).toMatch(/^sub_/);
    expect(result.text).toBe('done');
    expect(result.stepsCompleted).toBe(3);
  });

  // 3. spawn calls dispose on agent after success
  it('spawn calls dispose on agent after success', async () => {
    await adapter.spawn({ prompt: 'do something' });
    expect(mockAgent.dispose).toHaveBeenCalledOnce();
  });

  // 4. spawn returns failure when agent throws
  it('spawn returns failure when agent throws', async () => {
    mockAgent = createMockAgent({ run: vi.fn().mockRejectedValue(new Error('boom')) });
    factory = () => mockAgent;
    adapter = new SubagentAdapter(factory);

    const result = await adapter.spawn({ prompt: 'fail' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
    expect(result.stepsCompleted).toBe(0);
  });

  // 5. spawn calls dispose on agent after failure
  it('spawn calls dispose on agent after failure', async () => {
    mockAgent = createMockAgent({ run: vi.fn().mockRejectedValue(new Error('boom')) });
    factory = () => mockAgent;
    adapter = new SubagentAdapter(factory);

    await adapter.spawn({ prompt: 'fail' });
    expect(mockAgent.dispose).toHaveBeenCalledOnce();
  });

  // 6. spawn returns cancelled status when aborted
  it('spawn returns cancelled status when aborted', async () => {
    let rejectRun!: (err: Error) => void;
    mockAgent = createMockAgent({
      run: vi.fn().mockReturnValue(new Promise<AgentResult>((_, reject) => { rejectRun = reject; })),
    });
    factory = () => mockAgent;
    adapter = new SubagentAdapter(factory);

    const spawnPromise = adapter.spawn({ prompt: 'long task' });

    // The agent is now running — grab its id and cancel it
    const active = adapter.getActiveSubagents();
    expect(active).toHaveLength(1);
    await adapter.cancel(active[0].id);

    const result = await spawnPromise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('Subagent cancelled');
  });

  // 7. spawn rejects when max concurrent (3) reached
  it('spawn rejects when max concurrent (3) reached', async () => {
    const agents: IAgentPort[] = [];
    const pendingFactory = () => {
      const a = createMockAgent({
        run: vi.fn().mockReturnValue(new Promise<AgentResult>(() => {})),
      });
      agents.push(a);
      return a;
    };
    adapter = new SubagentAdapter(pendingFactory);

    // Spawn 3 — all stay pending
    const p1 = adapter.spawn({ prompt: 'a' });
    const p2 = adapter.spawn({ prompt: 'b' });
    const p3 = adapter.spawn({ prompt: 'c' });

    expect(adapter.getActiveSubagents()).toHaveLength(3);

    // 4th should fail immediately
    const result = await adapter.spawn({ prompt: 'd' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Max concurrent subagents (3) reached');
    expect(result.subagentId).toBe('');
  });

  // 8. spawn uses custom timeoutMs from task
  it('spawn uses custom timeoutMs from task', async () => {
    mockAgent = createMockAgent({
      run: vi.fn().mockReturnValue(new Promise<AgentResult>(() => {})),
    });
    factory = () => mockAgent;
    adapter = new SubagentAdapter(factory);

    const spawnPromise = adapter.spawn({ prompt: 'slow', timeoutMs: 5_000 });

    // Advance just under custom timeout — still running
    await vi.advanceTimersByTimeAsync(4_999);
    expect(adapter.getActiveSubagents()).toHaveLength(1);

    // Advance past custom timeout — should abort
    await vi.advanceTimersByTimeAsync(2);
    const result = await spawnPromise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('Subagent cancelled');
  });

  // 9. spawn uses default context when task.context is undefined
  it('spawn uses default context when task.context is undefined', async () => {
    await adapter.spawn({ prompt: 'test' });
    const call = vi.mocked(mockAgent.run).mock.calls[0];
    const ctx = call[1];
    expect(ctx.pageContext).toBeNull();
    expect(ctx.conversationHistory).toEqual([]);
    expect(ctx.liveState).toBeNull();
    expect(ctx.tabId).toBe(0);
  });

  // 10. spawn uses task.tools in default context
  it('spawn uses task.tools in default context', async () => {
    const tools = [{ name: 'click', description: 'click', parameters: {} }] as any;
    await adapter.spawn({ prompt: 'test', tools });
    const ctx = vi.mocked(mockAgent.run).mock.calls[0][1];
    expect(ctx.tools).toBe(tools);
  });

  // 11. spawn truncates task prompt to 100 chars in info
  it('spawn truncates task prompt to 100 chars in info', async () => {
    mockAgent = createMockAgent({
      run: vi.fn().mockReturnValue(new Promise<AgentResult>(() => {})),
    });
    factory = () => mockAgent;
    adapter = new SubagentAdapter(factory);

    const longPrompt = 'x'.repeat(200);
    adapter.spawn({ prompt: longPrompt });

    const active = adapter.getActiveSubagents();
    expect(active[0].task).toHaveLength(100);
    expect(active[0].task).toBe('x'.repeat(100));
  });

  // 12. getActiveSubagents returns empty initially
  it('getActiveSubagents returns empty initially', () => {
    expect(adapter.getActiveSubagents()).toEqual([]);
  });

  // 13. getActiveSubagents shows running agents
  it('getActiveSubagents shows running agents', () => {
    mockAgent = createMockAgent({
      run: vi.fn().mockReturnValue(new Promise<AgentResult>(() => {})),
    });
    factory = () => mockAgent;
    adapter = new SubagentAdapter(factory);

    adapter.spawn({ prompt: 'pending task' });

    const active = adapter.getActiveSubagents();
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe('running');
    expect(active[0].id).toMatch(/^sub_/);
    expect(active[0].task).toBe('pending task');
  });

  // 14. cancel aborts the running agent
  it('cancel aborts the running agent', async () => {
    mockAgent = createMockAgent({
      run: vi.fn().mockReturnValue(new Promise<AgentResult>(() => {})),
    });
    factory = () => mockAgent;
    adapter = new SubagentAdapter(factory);

    const spawnPromise = adapter.spawn({ prompt: 'cancel me' });
    const active = adapter.getActiveSubagents();
    expect(active).toHaveLength(1);

    await adapter.cancel(active[0].id);
    const result = await spawnPromise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('Subagent cancelled');
  });

  // 15. cancel does nothing for unknown subagentId
  it('cancel does nothing for unknown subagentId', async () => {
    await expect(adapter.cancel('sub_unknown')).resolves.toBeUndefined();
  });

  // 16. spawn timeout triggers abort after default timeoutMs
  it('spawn timeout triggers abort after default timeoutMs', async () => {
    mockAgent = createMockAgent({
      run: vi.fn().mockReturnValue(new Promise<AgentResult>(() => {})),
    });
    factory = () => mockAgent;
    adapter = new SubagentAdapter(factory);

    const spawnPromise = adapter.spawn({ prompt: 'timeout test' });

    // Advance past default 30s timeout
    await vi.advanceTimersByTimeAsync(30_001);
    const result = await spawnPromise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('Subagent cancelled');
  });

  // 17. Agent dispose failure is silently caught
  it('agent dispose failure is silently caught', async () => {
    mockAgent = createMockAgent({
      dispose: vi.fn().mockRejectedValue(new Error('dispose kaboom')),
    });
    factory = () => mockAgent;
    adapter = new SubagentAdapter(factory);

    const result = await adapter.spawn({ prompt: 'disposable' });
    expect(result.success).toBe(true);
    expect(mockAgent.dispose).toHaveBeenCalledOnce();
  });

  // ── Configurable limits ──

  describe('configurable limits', () => {
    it('respects custom maxConcurrent', async () => {
      const pendingFactory = () =>
        createMockAgent({ run: vi.fn().mockReturnValue(new Promise<AgentResult>(() => {})) });
      adapter = new SubagentAdapter(pendingFactory, { maxConcurrent: 2 });

      adapter.spawn({ prompt: 'a' });
      adapter.spawn({ prompt: 'b' });
      const result = await adapter.spawn({ prompt: 'c' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Max concurrent subagents (2)');
    });

    it('respects custom maxDepth', async () => {
      adapter = new SubagentAdapter(factory, { maxDepth: 1 });
      const result = await adapter.spawn({ prompt: 'deep', depth: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Max subagent depth (1)');
    });

    it('respects custom defaultTimeoutMs', async () => {
      mockAgent = createMockAgent({
        run: vi.fn().mockReturnValue(new Promise<AgentResult>(() => {})),
      });
      factory = () => mockAgent;
      adapter = new SubagentAdapter(factory, { defaultTimeoutMs: 10_000 });

      const spawnPromise = adapter.spawn({ prompt: 'custom timeout' });
      await vi.advanceTimersByTimeAsync(10_001);
      const result = await spawnPromise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Subagent cancelled');
    });

    it('uses defaults when limits not provided', async () => {
      adapter = new SubagentAdapter(factory);
      // maxDepth defaults to 2
      const result = await adapter.spawn({ prompt: 'deep', depth: 2 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Max subagent depth (2)');
    });
  });
});
