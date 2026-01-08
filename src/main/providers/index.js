const { AnthropicProvider } = require('./AnthropicProvider');
const { OpenAIProvider } = require('./OpenAIProvider');
const { GeminiProvider } = require('./GeminiProvider');
const { OllamaProvider } = require('./OllamaProvider');

const providers = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
  google: new GeminiProvider(),
  ollama: new OllamaProvider()
};

function getProvider(name) {
  return providers[name];
}

function getAllProviders() {
  return providers;
}

module.exports = {
  getProvider,
  getAllProviders
};
