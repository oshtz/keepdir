import { Provider, ProviderConfig, Message, ImageValidationResult } from './Provider';
import axios from 'axios';

export class OllamaProvider extends Provider {
  constructor() {
    super();
    this.name = 'ollama';
    this.defaultModel = 'llama2';
    this.supportedModels = []; // Will be populated dynamically from Ollama
    this.supportsVision = true; // Ollama supports vision models like llava, bakllava, etc.
    this.maxImagesPerRequest = 10;
  }

  /**
   * Override canUseProvider to not require API key for Ollama
   */
  override async canUseProvider(_config: ProviderConfig): Promise<{valid: boolean, error?: string}> {
    // Ollama doesn't need an API key, so skip the base class API key check
    try {
      // Just check if Ollama is running by trying to connect
      await axios.get('http://localhost:11434/api/tags', { timeout: 5000 });
      return { valid: true };
    } catch {
      return {
        valid: false,
        error: 'Ollama is not running. Please start Ollama first.'
      };
    }
  }

  override async validateConfig(_config: ProviderConfig): Promise<boolean> {
    try {
      // Check if Ollama is running
      await axios.get('http://localhost:11434/api/tags', { timeout: 5000 });
      return true;
    } catch (error) {
      console.error('Ollama validation error:', error);
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

      // Convert our message format to Ollama's format
      const ollamaMessages = messages.map(msg => {
        let textContent = '';
        const images: string[] = [];

        if (Array.isArray(msg.content)) {
          // New format: content is an array of objects
          for (const c of msg.content) {
            if (c.type === 'text' && c.text) {
              textContent += (textContent ? '\n' : '') + c.text;
            } else if (c.type === 'image' && c.source?.data) {
              // Ollama expects base64 strings in the images array
              images.push(c.source.data);
            }
          }
        } else if (typeof msg.content === 'string') {
          // Legacy format: content is a string
          textContent = msg.content;
        } else {
          throw new Error('Invalid message content format - content must be an array or string');
        }

        const ollamaMsg: { role: string; content: string; images?: string[] } = {
          role: msg.role,
          content: textContent
        };

        // Add images array if there are any images
        if (images.length > 0) {
          ollamaMsg.images = images;
        }

        return ollamaMsg;
      });

      const response = await axios.post(
        'http://localhost:11434/api/chat',
        {
          model: config.model || this.defaultModel,
          messages: ollamaMessages,
          stream: false
        },
        {
          timeout: 60000 // Ollama can be slower than cloud APIs
        }
      );

      return response.data.message.content;
    } catch (error) {
      console.error('Ollama API error:', error);
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error('Ollama is not running. Please start Ollama first.');
        }
        if (error.response?.status === 404) {
          throw new Error(`Model "${config.model || this.defaultModel}" not found. Please pull the model first.`);
        }
      }
      throw error;
    }
  }

  override async validateImage(base64Data: string, mimeType: string): Promise<ImageValidationResult> {
    // Ollama vision models (llava, bakllava, etc.) support common image formats
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
   * Get available models from Ollama
   */
  override async getAvailableModels(_config?: ProviderConfig): Promise<string[]> {
    try {
      const response = await axios.get('http://localhost:11434/api/tags', {
        timeout: 2000
      });
      return response.data.models.map((model: any) => model.name);
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      throw error;
    }
  }
}
