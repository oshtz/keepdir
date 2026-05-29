const {
  isSafeSettingKey,
  parseCustomSectionsRows,
  parseJsonArrayValue,
  parseJsonValue,
  parseSettingsRows
} = require('../database');

describe('database JSON parsing helpers', () => {
  it('parses JSON values while preserving malformed legacy values', () => {
    expect(parseJsonValue('{"enabled":true}')).toEqual({ enabled: true });
    expect(parseJsonValue('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parseJsonValue('plain text')).toBe('plain text');
    expect(parseJsonValue('plain text', null)).toBeNull();
  });

  it('parses settings rows with raw fallbacks for malformed values', () => {
    expect(parseSettingsRows([
      { key: 'apiKeys', value: '{"openai":"sk-test"}' },
      { key: 'legacyValue', value: 'not-json' }
    ])).toEqual({
      apiKeys: { openai: 'sk-test' },
      legacyValue: 'not-json'
    });
  });

  it('skips unsafe setting keys from legacy rows', () => {
    const settings = parseSettingsRows([
      { key: 'selectedProvider', value: '"openai"' },
      { key: '__proto__', value: '{"polluted":true}' },
      { key: 'bad.key', value: '"bad"' }
    ]);

    expect(isSafeSettingKey('selectedProvider')).toBe(true);
    expect(isSafeSettingKey('__proto__')).toBe(false);
    expect(settings).toEqual({ selectedProvider: 'openai' });
    expect(settings.polluted).toBeUndefined();
  });

  it('uses empty arrays for malformed custom-section item payloads', () => {
    expect(parseJsonArrayValue('[{"name":"Docs"}]')).toEqual([{ name: 'Docs' }]);
    expect(parseJsonArrayValue('{"not":"an-array"}')).toEqual([]);
    expect(parseJsonArrayValue('bad-json')).toEqual([]);
  });

  it('parses custom-section rows with safe item fallbacks', () => {
    expect(parseCustomSectionsRows([
      {
        id: 'custom-1',
        workspace_id: 'workspace-1',
        name: 'Projects',
        items: '[{"name":"Docs"}]'
      },
      {
        id: 'custom-2',
        workspace_id: 'workspace-1',
        name: 'Broken',
        items: 'not-json'
      }
    ])).toEqual([
      {
        id: 'custom-1',
        workspace_id: 'workspace-1',
        name: 'Projects',
        items: [{ name: 'Docs' }]
      },
      {
        id: 'custom-2',
        workspace_id: 'workspace-1',
        name: 'Broken',
        items: []
      }
    ]);
  });
});
