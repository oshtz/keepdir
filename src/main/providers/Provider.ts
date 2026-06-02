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

export interface ProviderConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
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
   * Prepares provider API headers.
   */
  prepareHeaders(config: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (config.apiKey) {
      headers['Authorization'] = this.formatApiKeyHeader(config.apiKey);
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
