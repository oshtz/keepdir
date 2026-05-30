const { AnthropicProvider } = require('./AnthropicProvider');
const { OpenAIProvider } = require('./OpenAIProvider');
const { GeminiProvider } = require('./GeminiProvider');
const { OllamaProvider } = require('./OllamaProvider');
const { OpenRouterProvider } = require('./OpenRouterProvider');
const { LMStudioProvider } = require('./LMStudioProvider');

const providers = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
  google: new GeminiProvider(),
  ollama: new OllamaProvider(),
  openrouter: new OpenRouterProvider(),
  lmstudio: new LMStudioProvider()
};

function getProvider(name) {
  if (!Object.prototype.hasOwnProperty.call(providers, name)) {
    return undefined;
  }
  return providers[name];
}

function getAllProviders() {
  return { ...providers };
}

module.exports = {
  getProvider,
  getAllProviders
};
