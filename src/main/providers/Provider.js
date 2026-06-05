/**
 * @typedef {Object} Message
 * @property {'user' | 'assistant' | 'system'} role
 * @property {Array<{
 *   type: 'text' | 'image',
 *   text?: string,
 *   source?: {
 *     type: 'base64',
 *     media_type: string,
 *     data: string
 *   }
 * }>} content
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} apiKey
 * @property {string} [model]
 * @property {number} [maxTokens]
 */

/**
 * @typedef {Object} ImageValidationResult
 * @property {boolean} valid
 * @property {string} [error]
 * @property {number} [tokens]
 */

/**
 * @interface Provider
 */
class Provider {
  /** @type {string} */
  name;
  /** @type {string} */
  defaultModel;
  /** @type {string[]} */
  supportedModels;
  /** @type {boolean} */
  supportsVision;
  /** @type {number} */
  maxImagesPerRequest;
  /**
   * @param {ProviderConfig} config
   * @returns {Promise<boolean>}
   */
  async validateConfig(_config) {
    throw new Error('Not implemented');
  }

  /**
   * @param {Message[]} messages
   * @param {ProviderConfig} config
   * @returns {Promise<string>}
   */
  async sendMessage(_messages, _config) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} base64Data
   * @param {string} mimeType
   * @returns {Promise<ImageValidationResult>}
   */
  async validateImage(_base64Data, _mimeType) {
    throw new Error('Not implemented');
  }

  /**
   * Returns the provider's available text-capable models.
   * @param {ProviderConfig} _config
   * @returns {Promise<string[]>}
   */
  async getAvailableModels(_config) {
    return this.supportedModels || [];
  }

  /**
   * Prepares provider API headers.
   * @param {ProviderConfig} config
   * @returns {Object}
   */
  prepareHeaders(config) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (config.apiKey) {
      headers['Authorization'] = this.formatApiKeyHeader(config.apiKey);
    }

    return headers;
  }

  /**
   * Formats the API key header - can be overridden by specific providers
   * @param {string} apiKey
   * @returns {string}
   */
  formatApiKeyHeader(apiKey) {
    return `Bearer ${apiKey}`;
  }

  /**
   * Checks if the provider can be used with the given configuration
   * @param {ProviderConfig} config
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async canUseProvider(config) {
    // Check if API key is provided
    if (!config.apiKey) {
      return {
        valid: false,
        error: 'API key is required'
      };
    }

    // Validate the configuration
    try {
      const configValid = await this.validateConfig(config);
      if (!configValid) {
        return {
          valid: false,
          error: 'Invalid configuration'
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: error.message || 'Configuration validation failed'
      };
    }

    return { valid: true };
  }
}

module.exports = { Provider };
