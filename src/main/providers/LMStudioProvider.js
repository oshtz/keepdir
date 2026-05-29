const { Provider } = require('./Provider');
const axios = require('axios');

class LMStudioProvider extends Provider {
  constructor() {
    super();
    this.name = 'lmstudio';
    this.baseUrl = 'http://localhost:1234/v1';
    this.defaultModel = 'local-model';
    this.supportedModels = [];
    this.supportsVision = true;
    this.maxImagesPerRequest = 10;
    this.requiresAuth = false;
  }

  async canUseProvider() {
    try {
      await axios.get(`${this.baseUrl}/models`, { timeout: 5000 });
      return { valid: true };
    } catch {
      return {
        valid: false,
        error: 'LM Studio is not running. Please start LM Studio and load a model first.'
      };
    }
  }

  async validateConfig() {
    try {
      await axios.get(`${this.baseUrl}/models`, { timeout: 5000 });
      return true;
    } catch (error) {
      console.error('LM Studio validation error:', error);
      return false;
    }
  }

  async sendMessage(messages, config) {
    try {
      const canUse = await this.canUseProvider(config);
      if (!canUse.valid) {
        throw new Error(canUse.error);
      }

      const systemMessage = messages.find(msg => msg.role === 'system');
      const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
      const lmstudioMessages = [];

      if (systemMessage) {
        if (!Array.isArray(systemMessage.content)) {
          throw new Error('Invalid message content format - content must be an array');
        }
        lmstudioMessages.push({
          role: 'system',
          content: systemMessage.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n')
        });
      }

      const userMessages = nonSystemMessages.map(msg => {
        if (!Array.isArray(msg.content)) {
          throw new Error('Invalid message content format - content must be an array');
        }

        const hasImage = msg.content.some(c => c.type === 'image');
        if (!hasImage) {
          return {
            role: msg.role,
            content: msg.content.map(c => {
              if (c.type !== 'text' || !c.text) {
                throw new Error('Text content must have a text property');
              }
              return c.text;
            }).join('\n')
          };
        }

        return {
          role: msg.role,
          content: msg.content.map(c => {
            if (c.type === 'text') {
              if (!c.text) {
                throw new Error('Text content must have a text property');
              }
              return { type: 'text', text: c.text };
            }
            if (c.type === 'image') {
              if (!c.source || !c.source.media_type || !c.source.data) {
                throw new Error('Image content must have source with media_type and data');
              }
              return {
                type: 'image_url',
                image_url: {
                  url: `data:${c.source.media_type};base64,${c.source.data}`
                }
              };
            }
            throw new Error(`Invalid message content type: ${c.type}`);
          })
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
          timeout: 120000
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

  async validateImage(base64Data, mimeType) {
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validMimeTypes.includes(mimeType)) {
      return {
        valid: false,
        error: 'Unsupported image format. Please use JPEG, PNG, GIF, or WebP.'
      };
    }

    return {
      valid: true,
      tokens: Math.ceil(base64Data.length / 750)
    };
  }

  async getAvailableModels() {
    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        timeout: 5000
      });

      const models = (response.data?.data || [])
        .map((model) => model.id)
        .filter((id) => typeof id === 'string');

      this.supportedModels = models;
      return models;
    } catch (error) {
      console.error('Error fetching LM Studio models:', error);
      throw error;
    }
  }
}

module.exports = { LMStudioProvider };
