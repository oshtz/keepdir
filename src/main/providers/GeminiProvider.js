const { Provider } = require('./Provider');
const axios = require('axios');

const VALIDATION_TIMEOUT_MS = 15000;

class GeminiProvider extends Provider {
  constructor() {
    super();
    this.name = 'google';
    this.defaultModel = 'gemini-2.0-flash-exp';
    this.supportedModels = [
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ];
    this.supportsVision = true;
    this.maxImagesPerRequest = 3600; // Gemini supports up to 3,600 image files
  }

  /**
   * @param {string} modelName
   * @returns {string}
   */
  normalizeModelName(modelName) {
    if (!modelName) {
      return '';
    }
    return modelName.startsWith('models/')
      ? modelName.slice('models/'.length)
      : modelName;
  }

  /**
   * @param {import('./Provider').ProviderConfig} config
   * @returns {string}
   */
  resolveModelName(config) {
    return this.normalizeModelName(config.model || this.defaultModel);
  }

  /**
   * Prepares Gemini API headers.
   * @param {import('./Provider').ProviderConfig} config
   * @returns {Object}
   */
  prepareHeaders(config) {
    const headers = {
      'Content-Type': 'application/json'
    };

    // Gemini uses x-goog-api-key instead of Authorization header
    if (config.apiKey) {
      headers['x-goog-api-key'] = config.apiKey;
    }

    return headers;
  }

  /**
   * @param {import('./Provider').ProviderConfig} config
   * @returns {Promise<boolean>}
   */
  async validateConfig(config) {
    try {
      const headers = this.prepareHeaders(config);
      const modelName = this.resolveModelName(config);
      
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
        {
          contents: [
            {
              role: 'user',
              parts: [{ text: 'test' }]
            }
          ],
        },
        { headers, timeout: VALIDATION_TIMEOUT_MS }
      );
      return response.status === 200;
    } catch (error) {
      console.error('Gemini validation error:', error);
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
      const modelName = this.resolveModelName(config);

      // Convert messages to Gemini format
      const geminiMessages = messages.filter(msg => msg.role !== 'system').map(msg => {
        if (!Array.isArray(msg.content)) {
          throw new Error('Invalid message content format - content must be an array');
        }

        // Convert content to parts format
        const parts = msg.content.map(c => {
          switch (c.type) {
            case 'text':
              if (!c.text) {
                throw new Error('Text content must have a text property');
              }
              return { text: c.text };
            case 'image':
              if (!c.source || !c.source.media_type || !c.source.data) {
                throw new Error('Image content must have source with media_type and data');
              }
              return {
                inlineData: {
                  data: c.source.data,
                  mimeType: c.source.media_type,
                }
              };
            default:
              throw new Error(`Invalid message content type: ${c.type}`);
          }
        });

        // Map role to Gemini's format
        // Note: Gemini doesn't have a direct system role, so we treat system messages as user messages
        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts
        };
      });

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
        {
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            candidateCount: 1,
            maxOutputTokens: config.maxTokens || 1024,
          }
        },
        {
          headers,
          timeout: 30000,
        }
      );

      const candidate = response.data.candidates[0];
      if (!candidate?.content?.parts?.[0]?.text) {
        throw new Error('No content in response');
      }

      let text = candidate.content.parts[0].text;

      // Helper function to validate and parse JSON
      const tryParseJSON = (str) => {
        try {
          // Clean the string before parsing
          const cleaned = str
            // Remove any markdown code blocks
            .replace(/^```(?:json)?\s*|\s*```$/g, '')
            // Remove any non-printable characters
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
            // Normalize newlines
            .replace(/\r?\n/g, ' ')
            // Remove multiple spaces
            .replace(/\s+/g, ' ')
            .trim();

          const parsed = JSON.parse(cleaned);
          // Verify it has the expected structure (renames or categories)
          if (parsed.renames || parsed.categories) {
            return { valid: true, json: cleaned };
          }
        } catch {
        }
        return { valid: false };
      };

      // First clean the full response
      text = text
        .replace(/^```(?:json)?\s*|\s*```$/g, '')
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // First try: direct parse of full response
      let result = tryParseJSON(text);
      if (result.valid) {
        return result.json;
      }
      
      // Second try: find all potential JSON objects
      const jsonObjects = text.match(/{[\s\S]*?}/g) || [];
      
      for (const obj of jsonObjects) {
        result = tryParseJSON(obj);
        if (result.valid) {
          return result.json;
        }
      }
      
      // Third try: find the largest JSON-like structure
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      if (start !== -1 && end > start) {
        const jsonCandidate = text.slice(start, end);
        result = tryParseJSON(jsonCandidate);
        if (result.valid) {
          return result.json;
        }
      }
      
      // If all attempts fail, throw an error with details
      console.error('Failed to extract valid JSON from Gemini response.');
      throw new Error('Could not extract valid JSON from model response');
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
  }

  /**
   * @param {string} base64Data
   * @param {string} mimeType
   * @returns {Promise<import('./Provider').ImageValidationResult>}
   */
  async validateImage(base64Data, mimeType) {
    // Gemini supported image formats
    const validMimeTypes = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/heic',
      'image/heif',
    ];

    if (!validMimeTypes.includes(mimeType)) {
      return {
        valid: false,
        error: 'Unsupported image format. Please use PNG, JPEG, WEBP, HEIC, or HEIF.',
      };
    }

    // Each image is equivalent to 258 tokens in Gemini
    return {
      valid: true,
      tokens: 258,
    };
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
      const headers = this.prepareHeaders(config);
      const response = await axios.get(
        'https://generativelanguage.googleapis.com/v1beta/models',
        {
          headers,
          timeout: 15000
        }
      );

      const models = (response.data?.models || [])
        .filter((model) => {
          const methods = model.supportedGenerationMethods || [];
          return (
            methods.includes('generateContent') ||
            methods.includes('streamGenerateContent')
          );
        })
        .map((model) => this.normalizeModelName(model.name))
        .filter((name) => typeof name === 'string' && name.length > 0)
        .sort();

      this.supportedModels = models;
      return models;
    } catch (error) {
      console.error('Gemini model list error:', error);
      throw error;
    }
  }
}

module.exports = { GeminiProvider };
