const { Provider } = require('./Provider');
const axios = require('axios');

class OpenAIProvider extends Provider {
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
    this.requiresAuth = false; // OpenAI doesn't require user auth, just API key
  }

  /**
   * Formats the API key header for OpenAI
   * @param {string} apiKey
   * @returns {string}
   */
  formatApiKeyHeader(apiKey) {
    return `Bearer ${apiKey}`;
  }

  /**
   * @param {import('./Provider').ProviderConfig} config
   * @returns {Promise<boolean>}
   */
  async validateConfig(config) {
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
        { headers }
      );
      return true;
    } catch (error) {
      console.error('OpenAI validation error:', error);
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

      const headers = this.prepareHeaders(config);

      // Convert our message format to OpenAI's format
      const openaiMessages = messages.map(msg => {
        // Handle both string content and array content formats
        if (typeof msg.content === 'string') {
          return {
            role: msg.role,
            content: msg.content
          };
        }
        
        // Handle array content format (for complex messages with images, etc.)
        if (Array.isArray(msg.content)) {
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
                throw new Error(`Invalid message content type: ${c.type}`);
            }
          });

          return {
            role: msg.role,
            content
          };
        }
        
        throw new Error('Invalid message content format - content must be a string or array');
      });

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: config.model || this.defaultModel,
          messages: openaiMessages,
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
      if (error.response && error.response.data) {
        console.error('OpenAI API error details:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * @param {import('./Provider').ProviderConfig} config
   * @returns {Promise<string[]>}
   */
  async getAvailableModels(config) {
    if (!config.apiKey) {
      return [];
    }

    const isTextModel = (modelId) => {
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
        .map((model) => model.id)
        .filter((id) => typeof id === 'string' && isTextModel(id))
        .sort();

      this.supportedModels = models;
      return models;
    } catch (error) {
      console.error('OpenAI model list error:', error);
      throw error;
    }
  }

  /**
   * @param {string} base64Data
   * @param {string} mimeType
   * @returns {Promise<import('./Provider').ImageValidationResult>}
   */
  async validateImage(base64Data, mimeType) {
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

module.exports = { OpenAIProvider };
