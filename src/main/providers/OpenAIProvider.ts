import { Provider, ProviderConfig, Message, ImageValidationResult } from './Provider';
import axios from 'axios';

const VALIDATION_TIMEOUT_MS = 15000;

export class OpenAIProvider extends Provider {
  constructor() {
    super();
    this.name = 'openai';
    this.defaultModel = 'gpt-4o-mini';
    this.supportedModels = [
      'gpt-4o-mini',
      'gpt-4o'
    ];
    this.supportsVision = true;
    this.maxImagesPerRequest = 85;
  }

  /**
   * Formats the API key header for OpenAI
   */
  override formatApiKeyHeader(apiKey: string): string {
    return `Bearer ${apiKey}`;
  }

  async validateConfig(config: ProviderConfig): Promise<boolean> {
    try {
      const headers = this.prepareHeaders(config);
      
      await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: config.model || this.defaultModel,
          messages: [{ 
            role: 'user', 
            content: 'test'
          }],
          max_tokens: 1
        },
        { headers, timeout: VALIDATION_TIMEOUT_MS }
      );
      return true;
    } catch (error) {
      console.error('OpenAI validation error:', error);
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

      // Convert our message format to OpenAI's format
      // Filter out system messages and convert them to a system message string
      const systemMessage = messages.find(msg => msg.role === 'system');
      const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

      const openaiMessages: any[] = [];
      
      // Add system message first if present
      if (systemMessage) {
        if (!Array.isArray(systemMessage.content)) {
          throw new Error('Invalid message content format - content must be an array');
        }
        const systemText = systemMessage.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        openaiMessages.push({
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
                  url: `data:${c.source.media_type};base64,${c.source.data}`,
                  detail: 'auto'
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
        'https://api.openai.com/v1/chat/completions',
        {
          model: config.model || this.defaultModel,
          messages: [...openaiMessages, ...userMessages],
          max_tokens: config.maxTokens || 1000,
          temperature: 0.7
        },
        {
          headers,
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw error;
    }
  }

  override async getAvailableModels(config: ProviderConfig): Promise<string[]> {
    if (!config.apiKey) {
      return [];
    }

    const isTextModel = (modelId: string) => {
      const id = modelId.toLowerCase();
      const allowedPrefix =
        id.startsWith('gpt-') || id.startsWith('o1-') || id.startsWith('o3-');
      if (!allowedPrefix) {
        return false;
      }

      const blocked = [
        'audio',
        'embedding',
        'moderation',
        'omni-moderation',
        'realtime',
        'speech',
        'transcribe',
        'tts',
        'whisper'
      ];

      return !blocked.some(term => id.includes(term));
    };

    try {
      const headers = this.prepareHeaders(config);
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers,
        timeout: 15000
      });
      const models = (response.data?.data || [])
        .map((model: any) => model.id)
        .filter((id: string) => typeof id === 'string' && isTextModel(id))
        .sort();

      this.supportedModels = models;
      return models;
    } catch (error) {
      console.error('OpenAI model list error:', error);
      throw error;
    }
  }

  async validateImage(base64Data: string, mimeType: string): Promise<ImageValidationResult> {
    // OpenAI supports most common image formats
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
