import { Provider, Message, ProviderConfig } from './Provider';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { OllamaProvider } from './OllamaProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { LMStudioProvider } from './LMStudioProvider';

const providers: { [key: string]: Provider } = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
  ollama: new OllamaProvider(),
  google: new GeminiProvider(),
  openrouter: new OpenRouterProvider(),
  lmstudio: new LMStudioProvider()
};

export function getProvider(name: string): Provider | undefined {
  return providers[name];
}

export function getAllProviders(): { [key: string]: Provider } {
  return providers;
}

export type { Provider, Message, ProviderConfig };
