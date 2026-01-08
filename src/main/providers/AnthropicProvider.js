const { Provider } = require('./Provider');
const { Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');

class AnthropicProvider extends Provider {
  constructor() {
    super();
    this.name = 'anthropic';
    this.defaultModel = 'claude-3-sonnet-20240229';
    this.supportedModels = [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
    this.supportsVision = true;
    this.maxImagesPerRequest = 100;
    this.requiresAuth = false; // Anthropic doesn't require user auth, just API key
  }

  /** @type {number} */
  static MAX_IMAGE_DIMENSION = 1568;
  /** @type {number} */
  static OPTIMAL_MAX_MEGAPIXELS = 1.15;

  /**
   * Formats the API key header for Anthropic
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
      const client = new Anthropic({
        apiKey: config.apiKey
      });

      await client.messages.create({
        model: config.model || this.defaultModel,
        max_tokens: 1,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'test'
              }
            ]
          }
        ]
      });
      return true;
    } catch (error) {
      console.error('Anthropic validation error:', error);
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

      const client = new Anthropic({
        apiKey: config.apiKey
      });

      // Convert our message format to Anthropic's format
      const anthropicMessages = messages.map(msg => {
        let contentArray = [];

        if (!Array.isArray(msg.content)) {
          throw new Error('Invalid message content format - content must be an array');
        }
        contentArray = msg.content;

        // Process each content item
        const content = contentArray.map(c => {
          switch (c.type) {
            case 'text':
              if (!c.text) {
                throw new Error('Text content must have a text property');
              }
              return { type: 'text', text: c.text };
            case 'image':
              if (!c.source || !c.source.media_type || !c.source.data) {
                throw new Error('Image content must have source with media_type and data');
              }
              return {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: c.source.media_type,
                  data: c.source.data
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
      });

      // Extract system message if present
      const systemMessage = anthropicMessages.find(m => m.role === 'system');
      const nonSystemMessages = anthropicMessages.filter(m => m.role !== 'system');

      const requestOptions = {
        model: config.model || this.defaultModel,
        max_tokens: config.maxTokens || 1024,
        messages: nonSystemMessages,
        ...(systemMessage && { system: systemMessage.content[0].text })
      };

      // Add user authentication headers if required
      if (this.requiresAuth && config.userAuth) {
        // Note: Anthropic SDK doesn't directly support custom headers in this way
        // This is a placeholder for future implementation if needed
        requestOptions.headers = {
          'X-User-Token': config.userAuth.token,
          'X-User-Email': config.userAuth.email
        };
      }

      const response = await client.messages.create(requestOptions);

      // Extract text from the assistant's response
      // The Messages API returns a single response with content blocks
      return response.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');
    } catch (error) {
      console.error('Anthropic API error:', error);
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

    try {
      const response = await axios.get('https://api.anthropic.com/v1/models', {
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': config.apiKey
        },
        timeout: 15000
      });

      const models = (response.data?.data || [])
        .map((model) => model.id)
        .filter((id) => typeof id === 'string' && id.startsWith('claude-'))
        .sort();

      this.supportedModels = models;
      return models;
    } catch (error) {
      console.error('Anthropic model list error:', error);
      throw error;
    }
  }

  /**
   * @param {string} base64Data
   * @param {string} mimeType
   * @returns {Promise<import('./Provider').ImageValidationResult>}
   */
  async validateImage(base64Data, mimeType) {
    // Check supported formats
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validMimeTypes.includes(mimeType)) {
      return {
        valid: false,
        error: 'Unsupported image format. Please use JPEG, PNG, GIF, or WebP.'
      };
    }

    // Decode base64 to get image dimensions
    const buffer = Buffer.from(base64Data, 'base64');
    const sharp = require('sharp');
    const metadata = await sharp(buffer).metadata();

    // Check dimensions
    if (
      metadata.width > AnthropicProvider.MAX_IMAGE_DIMENSION ||
      metadata.height > AnthropicProvider.MAX_IMAGE_DIMENSION
    ) {
      return {
        valid: false,
        error: `Image dimensions exceed maximum of ${AnthropicProvider.MAX_IMAGE_DIMENSION}px`
      };
    }

    // Check megapixels
    const megapixels = (metadata.width * metadata.height) / 1000000;
    if (megapixels > AnthropicProvider.OPTIMAL_MAX_MEGAPIXELS) {
      return {
        valid: false,
        error: `Image size exceeds optimal maximum of ${AnthropicProvider.OPTIMAL_MAX_MEGAPIXELS} megapixels`
      };
    }

    // Estimate tokens (using same formula as documentation)
    const tokens = Math.ceil((metadata.width * metadata.height) / 750);

    return {
      valid: true,
      tokens
    };
  }
}

module.exports = { AnthropicProvider };
