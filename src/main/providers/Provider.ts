export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
}

export interface UserAuth {
  email: string;
  token: string;
}

export interface ProviderConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  userAuth?: UserAuth;
}

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  tokens?: number;
}

export abstract class Provider {
  public name: string = '';
  public defaultModel: string = '';
  public supportedModels: string[] = [];
  public supportsVision: boolean = false;
  public maxImagesPerRequest: number = 0;
  public requiresAuth: boolean = false;

  constructor() {
    this.requiresAuth = false; // Default to not requiring authentication
  }

  abstract validateConfig(config: ProviderConfig): Promise<boolean>;

  abstract sendMessage(messages: Message[], config: ProviderConfig): Promise<string>;

  abstract validateImage(base64Data: string, mimeType: string): Promise<ImageValidationResult>;

  /**
   * Returns the provider's available text-capable models.
   */
  async getAvailableModels(_config: ProviderConfig): Promise<string[]> {
    return this.supportedModels;
  }

  /**
   * Validates user authentication if required
   */
  async validateUserAuth(userAuth?: UserAuth): Promise<boolean> {
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
   */
  prepareHeaders(config: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
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
   */
  formatApiKeyHeader(apiKey: string): string {
    return `Bearer ${apiKey}`;
  }

  /**
   * Checks if the provider can be used with the given configuration
   */
  async canUseProvider(config: ProviderConfig): Promise<{valid: boolean, error?: string}> {
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
        error: error instanceof Error ? error.message : 'Configuration validation failed'
      };
    }

    return { valid: true };
  }
}
