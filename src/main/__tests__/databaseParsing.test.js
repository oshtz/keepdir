const {
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

  it('uses empty arrays for malformed custom-section item payloads', () => {
    expect(parseJsonArrayValue('[{"name":"Docs"}]')).toEqual([{ name: 'Docs' }]);
    expect(parseJsonArrayValue('{"not":"an-array"}')).toEqual([]);
    expect(parseJsonArrayValue('bad-json')).toEqual([]);
  });
});
