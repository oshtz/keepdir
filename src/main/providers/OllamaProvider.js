const { Provider } = require('./Provider');
const axios = require('axios');

class OllamaProvider extends Provider {
  constructor() {
    super();
    this.name = 'ollama';
    this.defaultModel = 'llama2';
    this.supportedModels = []; // Will be populated dynamically from Ollama
    this.supportsVision = false; // Most Ollama models don't support vision yet
    this.maxImagesPerRequest = 0;
    this.requiresAuth = false; // Ollama doesn't require authentication
  }

  /**
   * Override canUseProvider to not require API key for Ollama
   * @param {import('./Provider').ProviderConfig} config
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async canUseProvider(config) {
    // Ollama doesn't need an API key, so skip the base class API key check
    try {
      // Just check if Ollama is running by trying to connect
      await axios.get('http://localhost:11434/api/tags', { timeout: 5000 });
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'Ollama is not running. Please start Ollama first.'
      };
    }
  }

  /**
   * @param {import('./Provider').ProviderConfig} config
   * @returns {Promise<boolean>}
   */
  async validateConfig(config) {
    try {
      // Check if Ollama is running
      await axios.get('http://localhost:11434/api/tags', { timeout: 5000 });
      return true;
    } catch (error) {
      console.error('Ollama validation error:', error);
      return false;
    }
  }

  /**
   * @param {import('./Provider').Message[]} messages
   * @param {import('./Provider').ProviderConfig} config
   * @returns {Promise<string>}
   */
  async sendMessage(messages, config) {
    try {
      // Check if provider can be used
      const canUse = await this.canUseProvider(config);
      if (!canUse.valid) {
        throw new Error(canUse.error);
      }

      // Convert our message format to Ollama's format
      const ollamaMessages = messages.map(msg => {
        let textContent = '';
        
        if (Array.isArray(msg.content)) {
          // New format: content is an array of objects
          textContent = msg.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');
        } else if (typeof msg.content === 'string') {
          // Legacy format: content is a string
          textContent = msg.content;
        } else {
          throw new Error('Invalid message content format - content must be an array or string');
        }

        return {
          role: msg.role,
          content: textContent
        };
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
      if (axios.isAxiosError && axios.isAxiosError(error)) {
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

  /**
   * @param {string} base64Data
   * @param {string} mimeType
   * @returns {Promise<import('./Provider').ImageValidationResult>}
   */
  async validateImage(base64Data, mimeType) {
    // Most Ollama models don't support images yet
    return {
      valid: false,
      error: 'Image processing is not supported by most Ollama models.'
    };
  }

  /**
   * Get available models from Ollama
   * @returns {Promise<string[]>}
   */
  async getAvailableModels(_config) {
    try {
      const response = await axios.get('http://localhost:11434/api/tags', {
        timeout: 2000
      });
      return response.data.models.map(model => model.name);
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      throw error;
    }
  }
}

module.exports = { OllamaProvider };
