const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  normalizeRenameSuggestions,
  normalizeSortSuggestions
} = require('../suggestionValidation');

describe('AI suggestion validation', () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keepdir-suggestions-'));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('keeps rename suggestions only for analyzed files and safe targets', () => {
    expect(normalizeRenameSuggestions({
      renames: [
        {
          originalName: 'alpha.txt',
          suggestedName: 'CON.txt',
          reason: 'reserved target'
        },
        {
          originalName: 'missing.txt',
          suggestedName: 'missing-renamed.txt'
        },
        {
          originalName: 'alpha.txt',
          suggestedName: '../escaped.txt'
        }
      ]
    }, ['alpha.txt'])).toEqual({
      renames: [{
        originalName: 'alpha.txt',
        suggestedName: 'CON-file.txt',
        reason: 'reserved target'
      }]
    });
  });

  it('keeps sort suggestions only for analyzed files and safe folders', () => {
    expect(normalizeSortSuggestions({
      categories: [
        {
          name: 'Docs',
          description: 'Project documents',
          suggestedPath: './Docs/2026',
          files: ['safe.txt', 'outside.txt', 'safe.txt']
        },
        {
          name: 'Outside',
          suggestedPath: '../outside',
          files: ['bad.txt']
        },
        {
          name: 'Malformed',
          suggestedPath: 'Other',
          files: 'safe.txt'
        }
      ]
    }, ['safe.txt', 'bad.txt'], baseDir)).toEqual({
      categories: [{
        name: 'Docs',
        description: 'Project documents',
        suggestedPath: 'Docs/2026',
        files: ['safe.txt']
      }]
    });
  });
});
