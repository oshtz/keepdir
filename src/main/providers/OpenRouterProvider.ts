import { Provider, ProviderConfig, Message, ImageValidationResult } from './Provider';
import axios from 'axios';

export class OpenRouterProvider extends Provider {
  constructor() {
    super();
    this.name = 'openrouter';
    this.defaultModel = 'openai/gpt-4o-mini';
    this.supportedModels = [
      'openai/gpt-4o-mini',
      'openai/gpt-4o',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-haiku',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-70b-instruct',
      'mistralai/mistral-large'
    ];
    this.supportsVision = true;
    this.maxImagesPerRequest = 20;
  }

  /**
   * Formats the API key header for OpenRouter
   */
  override formatApiKeyHeader(apiKey: string): string {
    return `Bearer ${apiKey}`;
  }

  /**
   * Prepares headers with OpenRouter-specific headers
   */
  override prepareHeaders(config: ProviderConfig): Record<string, string> {
    const headers = super.prepareHeaders(config);
    // OpenRouter recommends including these headers
    headers['HTTP-Referer'] = 'https://keepdir.app';
    headers['X-Title'] = 'KeepDir';
    return headers;
  }

  async validateConfig(config: ProviderConfig): Promise<boolean> {
    try {
      const headers = this.prepareHeaders(config);
      
      await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: config.model || this.defaultModel,
          messages: [{ 
            role: 'user', 
            content: 'test'
          }],
          max_tokens: 1
        },
        { headers }
      );
      return true;
    } catch (error) {
      console.error('OpenRouter validation error:', error);
      return false;
    }
  }

  async sendMessage(messages: Message[], config: ProviderConfig): Promise<string> {
    try {
      // Check if provider can be used
      const canUse = await this.canUseProvider(config);
      if (!canUse.valid) {
        throw new Error(canUse.error);
      }

      const headers = this.prepareHeaders(config);

      // Convert our message format to OpenAI-compatible format (used by OpenRouter)
      const systemMessage = messages.find(msg => msg.role === 'system');
      const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

      const openrouterMessages: any[] = [];
      
      // Add system message first if present
      if (systemMessage) {
        if (!Array.isArray(systemMessage.content)) {
          throw new Error('Invalid message content format - content must be an array');
        }
        const systemText = systemMessage.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        openrouterMessages.push({
          role: 'system',
          content: systemText
        });
      }

      // Process non-system messages
      const userMessages = nonSystemMessages.map(msg => {
        if (!Array.isArray(msg.content)) {
          throw new Error('Invalid message content format - content must be an array');
        }

        const hasImage = msg.content.some(c => c.type === 'image');

        if (!hasImage) {
          const text = msg.content.map(c => {
            if (c.type !== 'text' || !c.text) {
              throw new Error('Text content must have a text property');
            }
            return c.text;
          }).join('\n');
          return {
            role: msg.role,
            content: text
          };
        }

        const content = msg.content.map(c => {
          switch (c.type) {
            case 'text':
              if (!c.text) {
                throw new Error('Text content must have a text property');
              }
              return {
                type: 'text',
                text: c.text
              };
            case 'image':
              if (!c.source || !c.source.media_type || !c.source.data) {
                throw new Error('Image content must have source with media_type and data');
              }
              return {
                type: 'image_url',
                image_url: {
                  url: `data:${c.source.media_type};base64,${c.source.data}`
                }
              };
            default:
              throw new Error(`Invalid message content type: ${(c as any).type}`);
          }
        });

        return {
          role: msg.role,
          content
        };
      });

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: config.model || this.defaultModel,
          messages: [...openrouterMessages, ...userMessages],
          max_tokens: config.maxTokens || 1000,
          temperature: 0.7
        },
        {
          headers,
          timeout: 60000 // Longer timeout for OpenRouter as it proxies to various providers
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('OpenRouter API error:', error);
      throw error;
    }
  }

  override async getAvailableModels(config: ProviderConfig): Promise<string[]> {
    if (!config.apiKey) {
      return [];
    }

    try {
      const headers = this.prepareHeaders(config);
      const response = await axios.get('https://openrouter.ai/api/v1/models', {
        headers,
        timeout: 15000
      });

      // Filter for text/chat models only
      const models = (response.data?.data || [])
        .filter((model: any) => {
          // Include models that support text generation
          const id = model.id?.toLowerCase() || '';
          // Exclude embedding, image generation, audio models
          const excluded = ['embedding', 'dall-e', 'whisper', 'tts', 'audio'];
          return !excluded.some(term => id.includes(term));
        })
        .map((model: any) => model.id)
        .filter((id: string) => typeof id === 'string')
        .sort();

      this.supportedModels = models;
      return models;
    } catch (error) {
      console.error('OpenRouter model list error:', error);
      // Return default models on error
      return this.supportedModels;
    }
  }

  async validateImage(base64Data: string, mimeType: string): Promise<ImageValidationResult> {
    // OpenRouter supports common image formats (depends on underlying model)
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validMimeTypes.includes(mimeType)) {
      return {
        valid: false,
        error: 'Unsupported image format. Please use JPEG, PNG, GIF, or WebP.'
      };
    }

    // Rough token estimation based on base64 length
    const tokens = Math.ceil(base64Data.length / 750);

    return {
      valid: true,
      tokens
    };
  }
}
