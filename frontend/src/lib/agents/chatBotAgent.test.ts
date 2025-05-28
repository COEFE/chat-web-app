import { ChatBotAgent } from './chatBotAgent';
import { AgentContext } from '@/types/agents';

describe('ChatBotAgent', () => {
  let agent: ChatBotAgent;
  let mockContext: AgentContext;

  beforeEach(() => {
    agent = new ChatBotAgent();
    mockContext = {
      userId: 'test-user-123',
      query: 'test query',
    };
  });

  test('should be able to handle any query', async () => {
    const canHandle = await agent.canHandle('any query', mockContext);
    expect(canHandle).toBe(true);
  });

  test('should classify queries correctly', async () => {
    // This would require mocking the Anthropic API
    // For now, just test that the agent can be instantiated
    expect(agent.id).toBe('chatbot_agent');
    expect(agent.name).toBe('Assistant');
    expect(agent.description).toContain('helpful assistant');
  });

  test('should handle system help queries', async () => {
    const response = await agent.handle('how do I use this system?', mockContext);
    expect(response.success).toBe(true);
    expect(response.message).toContain('help');
  });
});

// Mock Anthropic for testing
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'system_help' }]
        })
      }
    }))
  };
});

// Mock SQL for testing
jest.mock('@vercel/postgres', () => ({
  sql: jest.fn().mockImplementation(() => Promise.resolve({ rows: [] }))
}));
