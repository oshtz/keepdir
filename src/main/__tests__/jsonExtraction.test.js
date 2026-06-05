const {
  collectBalancedJsonObjects,
  normalizeJsonText,
  parseJsonPayload,
  stripJsonFence
} = require('../jsonExtraction');

describe('jsonExtraction', () => {
  it('parses a raw JSON object', () => {
    expect(parseJsonPayload('{"categories":[{"name":"Docs","files":["a.txt"]}]}')).toEqual({
      categories: [{ name: 'Docs', files: ['a.txt'] }]
    });
  });

  it('parses fenced JSON', () => {
    expect(parseJsonPayload('```json\n{"renames":[{"originalName":"a.txt","suggestedName":"b.txt"}]}\n```')).toEqual({
      renames: [{ originalName: 'a.txt', suggestedName: 'b.txt' }]
    });
  });

  it('extracts a nested JSON object from surrounding text', () => {
    const response = 'Here is the result:\n{"categories":[{"name":"Images","files":["a.png"],"metadata":{"score":1}}]}\nDone.';

    expect(parseJsonPayload(response)).toEqual({
      categories: [{ name: 'Images', files: ['a.png'], metadata: { score: 1 } }]
    });
  });

  it('ignores braces inside strings when collecting candidates', () => {
    const candidates = collectBalancedJsonObjects('prefix {"reason":"keeps {literal} braces","renames":[]} suffix');

    expect(candidates).toEqual(['{"reason":"keeps {literal} braces","renames":[]}']);
  });

  it('removes unsafe control characters before parsing', () => {
    expect(normalizeJsonText('\u0000{"renames":[]}')).toBe('{"renames":[]}');
  });

  it('strips only full-response JSON fences', () => {
    expect(stripJsonFence('```json\n{"renames":[]}\n```')).toBe('{"renames":[]}');
    expect(stripJsonFence('before ```json\n{"renames":[]}\n```')).toBe('before ```json\n{"renames":[]}\n```');
  });

  it('throws a helpful error when no JSON can be extracted', () => {
    expect(() => parseJsonPayload('no structured data here')).toThrow(
      'Could not extract valid JSON from model response.'
    );
  });
});
