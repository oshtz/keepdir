import { Provider, ProviderConfig, Message, ImageValidationResult } from './Provider';
import axios from 'axios';

export class LMStudioProvider extends Provider {
  private baseUrl: string = 'http://localhost:1234/v1';

  constructor() {
    super();
    this.name = 'lmstudio';
    this.defaultModel = 'local-model';
    this.supportedModels = []; // Will be populated dynamically from LM Studio
    this.supportsVision = true; // LM Studio supports vision models if loaded
    this.maxImagesPerRequest = 10;
    this.requiresAuth = false; // LM Studio doesn't require authentication
  }

  /**
   * Override canUseProvider to not require API key for LM Studio
   */
  override async canUseProvider(_config: ProviderConfig): Promise<{valid: boolean, error?: string}> {
    // LM Studio doesn't need an API key, so skip the base class API key check
    try {
      // Just check if LM Studio is running by trying to connect
      await axios.get(`${this.baseUrl}/models`, { timeout: 5000 });
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'LM Studio is not running. Please start LM Studio and load a model first.'
      };
    }
  }

  override async validateConfig(_config: ProviderConfig): Promise<boolean> {
    try {
      // Check if LM Studio is running
      await axios.get(`${this.baseUrl}/models`, { timeout: 5000 });
      return true;
    } catch (error) {
      console.error('LM Studio validation error:', error);
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

      // Convert our message format to OpenAI-compatible format (used by LM Studio)
      const systemMessage = messages.find(msg => msg.role === 'system');
      const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

      const lmstudioMessages: any[] = [];
      
      // Add system message first if present
      if (systemMessage) {
        if (!Array.isArray(systemMessage.content)) {
          throw new Error('Invalid message content format - content must be an array');
        }
        const systemText = systemMessage.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        lmstudioMessages.push({
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

        // Handle messages with images (OpenAI-compatible format)
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
        `${this.baseUrl}/chat/completions`,
        {
          model: config.model || this.defaultModel,
          messages: [...lmstudioMessages, ...userMessages],
          max_tokens: config.maxTokens || 1000,
          temperature: 0.7,
          stream: false
        },
        {
          timeout: 120000 // LM Studio can be slower than cloud APIs
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('LM Studio API error:', error);
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error('LM Studio is not running. Please start LM Studio and load a model first.');
        }
        if (error.response?.status === 404) {
          throw new Error(`Model "${config.model || this.defaultModel}" not found. Please load a model in LM Studio.`);
        }
      }
      throw error;
    }
  }

  override async validateImage(base64Data: string, mimeType: string): Promise<ImageValidationResult> {
    // LM Studio with vision models supports common image formats
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

  /**
   * Get available models from LM Studio
   */
  override async getAvailableModels(_config?: ProviderConfig): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        timeout: 5000
      });
      
      const models = (response.data?.data || [])
        .map((model: any) => model.id)
        .filter((id: string) => typeof id === 'string');
      
      this.supportedModels = models;
      return models;
    } catch (error) {
      console.error('Error fetching LM Studio models:', error);
      throw error;
    }
  }
}
