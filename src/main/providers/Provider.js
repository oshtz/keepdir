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
 * @typedef {Object} UserAuth
 * @property {string} email
 * @property {string} token
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} apiKey
 * @property {string} [model]
 * @property {number} [maxTokens]
 * @property {UserAuth} [userAuth] - User authentication information
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
  /** @type {boolean} */
  requiresAuth;

  constructor() {
    this.requiresAuth = false; // Default to not requiring authentication
  }

  /**
   * @param {ProviderConfig} config
   * @returns {Promise<boolean>}
   */
  async validateConfig(config) {
    throw new Error('Not implemented');
  }

  /**
   * @param {Message[]} messages
   * @param {ProviderConfig} config
   * @returns {Promise<string>}
   */
  async sendMessage(messages, config) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} base64Data
   * @param {string} mimeType
   * @returns {Promise<ImageValidationResult>}
   */
  async validateImage(base64Data, mimeType) {
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
   * Validates user authentication if required
   * @param {UserAuth} userAuth
   * @returns {Promise<boolean>}
   */
  async validateUserAuth(userAuth) {
    if (!this.requiresAuth) {
      return true; // No auth required
    }
    
    if (!userAuth || !userAuth.email || !userAuth.token) {
      return false;
    }

    // Default implementation - can be overridden by specific providers
    return true;
  }

  /**
   * Prepares headers with authentication if needed
   * @param {ProviderConfig} config
   * @returns {Object}
   */
  prepareHeaders(config) {
    const headers = {
      'Content-Type': 'application/json'
    };

    // Add API key if provided
    if (config.apiKey) {
      headers['Authorization'] = this.formatApiKeyHeader(config.apiKey);
    }

    // Add user authentication if required and provided
    if (this.requiresAuth && config.userAuth) {
      headers['X-User-Token'] = config.userAuth.token;
      headers['X-User-Email'] = config.userAuth.email;
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

    // Check user authentication if required
    if (this.requiresAuth) {
      const authValid = await this.validateUserAuth(config.userAuth);
      if (!authValid) {
        return {
          valid: false,
          error: 'User authentication is required'
        };
      }
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
