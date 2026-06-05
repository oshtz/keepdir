const axios = require('axios');

const mockAnthropicCreate = jest.fn();

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

jest.mock('@anthropic-ai/sdk', () => ({
  Anthropic: jest.fn(() => ({
    messages: {
      create: mockAnthropicCreate
    }
  }))
}));

const { Anthropic } = require('@anthropic-ai/sdk');
const { AnthropicProvider } = require('../providers/AnthropicProvider.js');
const { GeminiProvider } = require('../providers/GeminiProvider.js');
const { OpenAIProvider } = require('../providers/OpenAIProvider.js');
const { OpenRouterProvider } = require('../providers/OpenRouterProvider.js');

describe('provider validation timeouts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ status: 200, data: {} });
    mockAnthropicCreate.mockResolvedValue({});
  });

  it('bounds OpenAI validation requests with a timeout', async () => {
    const provider = new OpenAIProvider();

    await expect(provider.validateConfig({ apiKey: 'test-key' })).resolves.toBe(true);

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        model: 'gpt-4o-mini',
        max_tokens: 1
      }),
      expect.objectContaining({
        headers: expect.any(Object),
        timeout: 15000
      })
    );
  });

  it('bounds Google validation requests with a timeout', async () => {
    const provider = new GeminiProvider();

    await expect(provider.validateConfig({ apiKey: 'test-key' })).resolves.toBe(true);

    expect(axios.post).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
      expect.objectContaining({
        contents: expect.any(Array)
      }),
      expect.objectContaining({
        headers: expect.any(Object),
        timeout: 15000
      })
    );
  });

  it('keeps OpenRouter validation requests bounded', async () => {
    const provider = new OpenRouterProvider();

    await expect(provider.validateConfig({ apiKey: 'test-key' })).resolves.toBe(true);

    expect(axios.post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        model: 'openai/gpt-4o-mini',
        max_tokens: 1
      }),
      expect.objectContaining({
        headers: expect.any(Object),
        timeout: 15000
      })
    );
  });

  it('bounds Anthropic validation requests and disables validation retries', async () => {
    const provider = new AnthropicProvider();

    await expect(provider.validateConfig({ apiKey: 'test-key' })).resolves.toBe(true);

    expect(Anthropic).toHaveBeenCalledWith({
      apiKey: 'test-key',
      timeout: 15000,
      maxRetries: 0
    });
    expect(mockAnthropicCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1
    }));
  });
});
