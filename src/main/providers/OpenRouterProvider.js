const { Provider } = require('./Provider');
const axios = require('axios');

class OpenRouterProvider extends Provider {
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

  prepareHeaders(config) {
    const headers = super.prepareHeaders(config);
    headers['HTTP-Referer'] = 'https://keepdir.app';
    headers['X-Title'] = 'KeepDir';
    return headers;
  }

  async validateConfig(config) {
    try {
      const headers = this.prepareHeaders(config);
      await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: config.model || this.defaultModel,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        },
        { headers, timeout: 15000 }
      );
      return true;
    } catch (error) {
      console.error('OpenRouter validation error:', error);
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
      const openrouterMessages = [];

      if (systemMessage) {
        if (!Array.isArray(systemMessage.content)) {
          throw new Error('Invalid message content format - content must be an array');
        }
        openrouterMessages.push({
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
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: config.model || this.defaultModel,
          messages: [...openrouterMessages, ...userMessages],
          max_tokens: config.maxTokens || 1000,
          temperature: 0.7
        },
        {
          headers: this.prepareHeaders(config),
          timeout: 60000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('OpenRouter API error:', error);
      throw error;
    }
  }

  async getAvailableModels(config) {
    if (!config.apiKey) {
      return [];
    }

    try {
      const response = await axios.get('https://openrouter.ai/api/v1/models', {
        headers: this.prepareHeaders(config),
        timeout: 15000
      });

      const models = (response.data?.data || [])
        .filter((model) => {
          const id = model.id?.toLowerCase() || '';
          const excluded = ['embedding', 'dall-e', 'whisper', 'tts', 'audio'];
          return !excluded.some(term => id.includes(term));
        })
        .map((model) => model.id)
        .filter((id) => typeof id === 'string')
        .sort();

      this.supportedModels = models;
      return models;
    } catch (error) {
      console.error('OpenRouter model list error:', error);
      return this.supportedModels;
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
}

module.exports = { OpenRouterProvider };
