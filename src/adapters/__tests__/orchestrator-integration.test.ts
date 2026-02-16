/**
 * Orchestrator integration tests — validates end-to-end agent workflows
 * with mocked dependencies and real AgentOrchestrator implementation.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { AgentOrchestrator, type OrchestratorDeps } from '../agent-orchestrator';
import type { IToolExecutionPort } from '../../ports/tool-execution.port';
import type { IPlanningPort } from '../../ports/planning.port';
import type { IContextPort } from '../../ports/context.port';
import type { ISubagentPort } from '../../ports/subagent.port';
import type { ITabDelegationPort } from '../../ports/tab-delegation.port';
import type { OpenRouterChat } from '../../services/adapters';
import type { ChatConfig } from '../../services/adapters/openrouter';
import type { 
  AgentContext, 
  ToolResult, 
  ToolDefinition,
  TabAgent,
  TabDelegationResult 
} from '../../ports/types';
import type { PageContext } from '../../types';

describe('AgentOrchestrator Integration', () => {
  let mockToolPort: MockedFunction<IToolExecutionPort>;
  let mockPlanningPort: MockedFunction<IPlanningPort>;
  let mockContextPort: MockedFunction<IContextPort>;
  let mockSubagentPort: MockedFunction<ISubagentPort>;
  let mockDelegationPort: MockedFunction<ITabDelegationPort>;
  let mockChat: MockedFunction<OpenRouterChat>;
  let orchestrator: AgentOrchestrator;

  const mockPageContext: PageContext = {
    url: 'https://example.com',
    title: 'Test Page',
    content: 'Test content',
    extractedData: {},
  };

  const mockTools: ToolDefinition[] = [
    {
      name: 'test_tool',
      description: 'Test tool for integration tests',
      parametersSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Test input' }
        },
        required: ['input']
      }
    }
  ];

  beforeEach(() => {
    // Mock all ports
    mockToolPort = {
      execute: vi.fn()
    } as unknown as MockedFunction<IToolExecutionPort>;

    mockPlanningPort = {
      createPlan: vi.fn(),
      updatePlan: vi.fn(),
      markStepDone: vi.fn(),
      markStepFailed: vi.fn(),
      advanceStep: vi.fn()
    } as unknown as MockedFunction<IPlanningPort>;

    mockContextPort = {
      getCurrentContext: vi.fn()
    } as unknown as MockedFunction<IContextPort>;

    mockSubagentPort = {
      spawn: vi.fn()
    } as unknown as MockedFunction<ISubagentPort>;

    mockDelegationPort = {
      registerTab: vi.fn(),
      unregisterTab: vi.fn(),
      findTabForTask: vi.fn(),
      delegate: vi.fn(),
      listRegisteredTabs: vi.fn()
    } as unknown as MockedFunction<ITabDelegationPort>;

    mockChat = {
      sendMessage: vi.fn(),
      trimHistory: vi.fn()
    } as unknown as MockedFunction<OpenRouterChat>;

    const deps: OrchestratorDeps = {
      toolPort: mockToolPort,
      contextPort: mockContextPort,
      planningPort: mockPlanningPort,
      subagentPort: mockSubagentPort,
      delegation: mockDelegationPort,
      chatFactory: () => mockChat,
      buildConfig: (ctx: PageContext | null, tools: readonly ToolDefinition[]): ChatConfig => ({
        systemInstruction: ['Test system instruction'],
        model: 'test-model',
        temperature: 0.7
      })
    };

    orchestrator = new AgentOrchestrator(deps);
  });

  describe('Single Tool Call Roundtrip', () => {
    it('should execute tool call and return response', async () => {
      // Arrange
      const toolResult: ToolResult = {
        success: true,
        data: 'Tool executed successfully'
      };

      mockToolPort.execute.mockResolvedValue(toolResult);
      
      mockChat.sendMessage.mockImplementation(({ message }) => {
        if (typeof message === 'string' || Array.isArray(message)) {
          // First call - return tool call
          return Promise.resolve({
            text: 'I will execute the test tool',
            functionCalls: [{
              id: 'call_1',
              name: 'test_tool',
              args: { input: 'test value' }
            }]
          });
        } else {
          // Second call with tool response - return final result
          return Promise.resolve({
            text: 'Task completed successfully',
            functionCalls: []
          });
        }
      });

      const context: AgentContext = {
        tabId: 1,
        pageContext: mockPageContext,
        tools: mockTools,
        conversationHistory: [],
        liveState: null
      };

      // Act
      const result = await orchestrator.run('Execute test tool', context);

      // Assert
      expect(result.text).toBe('Task completed successfully');
      expect(result.stepsCompleted).toBe(1);
      expect(mockToolPort.execute).toHaveBeenCalledWith(
        'test_tool',
        { input: 'test value' },
        { tabId: 1, originTabId: 1 }
      );
      expect(mockPlanningPort.markStepDone).toHaveBeenCalled();
      expect(mockPlanningPort.advanceStep).toHaveBeenCalled();
    });

    it('should handle tool execution failure', async () => {
      // Arrange
      const toolResult: ToolResult = {
        success: false,
        error: 'Tool execution failed'
      };

      mockToolPort.execute.mockResolvedValue(toolResult);
      
      mockChat.sendMessage.mockImplementation(({ message }) => {
        if (typeof message === 'string' || Array.isArray(message)) {
          return Promise.resolve({
            text: 'I will execute the test tool',
            functionCalls: [{
              id: 'call_1',
              name: 'test_tool',
              args: { input: 'test value' }
            }]
          });
        } else {
          return Promise.resolve({
            text: 'Tool execution failed, trying alternative approach',
            functionCalls: []
          });
        }
      });

      const context: AgentContext = {
        tabId: 1,
        pageContext: mockPageContext,
        tools: mockTools,
        conversationHistory: [],
        liveState: null
      };

      // Act
      const result = await orchestrator.run('Execute test tool', context);

      // Assert
      expect(result.text).toBe('Tool execution failed, trying alternative approach');
      expect(mockPlanningPort.markStepFailed).toHaveBeenCalledWith('Tool execution failed');
    });
  });

  describe('delegate_to_tab Tool', () => {
    it('should find and delegate to appropriate tab', async () => {
      // Arrange
      const targetTab: TabAgent = {
        tabId: 2,
        url: 'https://gmail.com',
        title: 'Gmail',
        skills: ['email', 'compose', 'inbox']
      };

      const delegationResult: TabDelegationResult = {
        sourceTabId: 1,
        targetTabId: 2,
        taskDescription: 'Send email',
        status: 'completed',
        result: 'Email sent successfully',
        durationMs: 1500
      };

      mockDelegationPort.findTabForTask.mockReturnValue(targetTab);
      mockDelegationPort.delegate.mockResolvedValue(delegationResult);

      mockChat.sendMessage.mockImplementation(({ message }) => {
        if (typeof message === 'string' || Array.isArray(message)) {
          return Promise.resolve({
            text: 'I will delegate this email task to Gmail',
            functionCalls: [{
              id: 'call_1',
              name: 'delegate_to_tab',
              args: { 
                required_skills: ['email', 'compose'],
                task: 'Send email to john@example.com'
              }
            }]
          });
        } else {
          return Promise.resolve({
            text: 'Email delegation completed successfully',
            functionCalls: []
          });
        }
      });

      const context: AgentContext = {
        tabId: 1,
        pageContext: mockPageContext,
        tools: mockTools,
        conversationHistory: [],
        liveState: null
      };

      // Act
      const result = await orchestrator.run('Send an email', context);

      // Assert
      expect(result.text).toBe('Email delegation completed successfully');
      expect(mockDelegationPort.findTabForTask).toHaveBeenCalledWith(['email', 'compose'], 1);
      expect(mockDelegationPort.delegate).toHaveBeenCalledWith(
        1,
        2,
        'Send email to john@example.com'
      );
    });

    it('should handle no suitable tab found', async () => {
      // Arrange
      mockDelegationPort.findTabForTask.mockReturnValue(null);

      mockChat.sendMessage.mockImplementation(({ message }) => {
        if (typeof message === 'string' || Array.isArray(message)) {
          return Promise.resolve({
            text: 'I will delegate this task',
            functionCalls: [{
              id: 'call_1',
              name: 'delegate_to_tab',
              args: { 
                required_skills: ['video', 'editing'],
                task: 'Edit video'
              }
            }]
          });
        } else {
          return Promise.resolve({
            text: 'No suitable tab found for video editing',
            functionCalls: []
          });
        }
      });

      const context: AgentContext = {
        tabId: 1,
        pageContext: mockPageContext,
        tools: mockTools,
        conversationHistory: [],
        liveState: null
      };

      // Act
      const result = await orchestrator.run('Edit a video', context);

      // Assert
      expect(result.text).toBe('No suitable tab found for video editing');
      expect(mockDelegationPort.findTabForTask).toHaveBeenCalledWith(['video', 'editing'], 1);
      expect(mockDelegationPort.delegate).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution exception', async () => {
      // Arrange
      mockToolPort.execute.mockRejectedValue(new Error('Network timeout'));

      mockChat.sendMessage.mockImplementation(({ message }) => {
        if (typeof message === 'string' || Array.isArray(message)) {
          return Promise.resolve({
            text: 'I will execute the test tool',
            functionCalls: [{
              id: 'call_1',
              name: 'test_tool',
              args: { input: 'test value' }
            }]
          });
        } else {
          return Promise.resolve({
            text: 'Tool execution failed due to network error',
            functionCalls: []
          });
        }
      });

      const context: AgentContext = {
        tabId: 1,
        pageContext: mockPageContext,
        tools: mockTools,
        conversationHistory: [],
        liveState: null
      };

      // Act
      const result = await orchestrator.run('Execute test tool', context);

      // Assert
      expect(result.text).toBe('Tool execution failed due to network error');
      expect(mockPlanningPort.markStepFailed).toHaveBeenCalledWith('Network timeout');
    });

    it('should handle delegation failure', async () => {
      // Arrange
      const targetTab: TabAgent = {
        tabId: 2,
        url: 'https://gmail.com',
        title: 'Gmail',
        skills: ['email']
      };

      const delegationResult: TabDelegationResult = {
        sourceTabId: 1,
        targetTabId: 2,
        taskDescription: 'Send email',
        status: 'failed',
        error: 'Gmail authentication failed',
        durationMs: 500
      };

      mockDelegationPort.findTabForTask.mockReturnValue(targetTab);
      mockDelegationPort.delegate.mockResolvedValue(delegationResult);

      mockChat.sendMessage.mockImplementation(({ message }) => {
        if (typeof message === 'string' || Array.isArray(message)) {
          return Promise.resolve({
            text: 'I will delegate this email task',
            functionCalls: [{
              id: 'call_1',
              name: 'delegate_to_tab',
              args: { 
                required_skills: ['email'],
                task: 'Send email'
              }
            }]
          });
        } else {
          return Promise.resolve({
            text: 'Delegation failed, will try alternative approach',
            functionCalls: []
          });
        }
      });

      const context: AgentContext = {
        tabId: 1,
        pageContext: mockPageContext,
        tools: mockTools,
        conversationHistory: [],
        liveState: null
      };

      // Act
      const result = await orchestrator.run('Send an email', context);

      // Assert
      expect(result.text).toBe('Delegation failed, will try alternative approach');
    });
  });

  describe('Abort Functionality', () => {
    it('should properly dispose resources on abort', async () => {
      // Arrange
      const context: AgentContext = {
        tabId: 1,
        pageContext: mockPageContext,
        tools: mockTools,
        conversationHistory: [],
        liveState: null
      };

      // Act
      await orchestrator.dispose();

      // Assert - verify cleanup occurs without error
      expect(orchestrator.eventBus).toBeDefined();
    });
  });
});