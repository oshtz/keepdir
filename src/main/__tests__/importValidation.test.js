const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  normalizeImportOptions,
  readJsonImportFile,
  validateAllDataImport,
  validateCustomSections,
  validateWorkspaceImportData
} = require('../importValidation');

describe('main import validation', () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keepdir-import-validation-'));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  async function writeImportFile(name, content) {
    const filePath = path.join(baseDir, name);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('reads bounded JSON import files', async () => {
    const filePath = await writeImportFile('workspace.json', JSON.stringify({ ok: true }));

    await expect(readJsonImportFile(filePath, { maxBytes: 100 })).resolves.toEqual({ ok: true });
    await expect(readJsonImportFile(filePath, { maxBytes: 5 })).rejects.toThrow('cannot exceed');
    await expect(readJsonImportFile(baseDir)).rejects.toThrow('must be a file');
  });

  it('reports malformed JSON consistently', async () => {
    const invalidPath = await writeImportFile('invalid.json', '{not-json');
    const emptyPath = await writeImportFile('empty.json', '  ');

    await expect(readJsonImportFile(invalidPath)).rejects.toThrow('not valid JSON');
    await expect(readJsonImportFile(emptyPath)).rejects.toThrow('empty');
  });

  it('validates workspace import structure', () => {
    const validated = validateWorkspaceImportData({
      version: '1.0',
      workspace: {
        id: 'workspace-1',
        name: 'Workspace',
        emoji: 'K',
        created_at: '2026-01-01T00:00:00.000Z'
      },
      settings: {
        recentFolders: ['C:/Users/Ada'],
        nested: { enabled: true }
      },
      customSections: [{
        id: 'custom-1',
        name: 'Projects',
        icon: 'P',
        color: '#123456',
        items: [{ id: 'item-1', name: 'Docs', path: 'C:/Docs', ignored: true }]
      }]
    });

    expect(validated.workspace).toMatchObject({
      id: 'workspace-1',
      name: 'Workspace',
      emoji: 'K'
    });
    expect(validated.settings.recentFolders).toEqual(['C:/Users/Ada']);
    expect(validated.customSections).toEqual([{
      id: 'custom-1',
      name: 'Projects',
      icon: 'P',
      color: '#123456',
      items: [{ id: 'item-1', name: 'Docs', path: 'C:/Docs' }]
    }]);

    expect(() => validateWorkspaceImportData({ version: '1.0', workspace: { id: '', name: 'x' } }))
      .toThrow('Workspace id is required');
    expect(() => validateWorkspaceImportData({ version: '1.0', workspace: { id: 'x', name: 'x' }, settings: [] }))
      .toThrow('Workspace settings must be an object');
  });

  it('validates full backup structure and workspace limits', () => {
    const validated = validateAllDataImport({
      version: '1.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      settings: {
        selectedProvider: 'openai'
      },
      workspaces: [{
        workspace: {
          id: 'workspace-1',
          name: 'Workspace'
        },
        settings: {
          recentFolders: []
        },
        customSections: [{
          id: 'custom-1',
          name: 'Projects',
          items: [{ name: 'Docs' }]
        }]
      }]
    });

    expect(validated.workspaces).toHaveLength(1);
    expect(validated.settings.selectedProvider).toBe('openai');
    expect(validated.workspaces[0].customSections).toHaveLength(1);

    expect(() => validateAllDataImport({
      version: '1.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      workspaces: {}
    })).toThrow('workspaces must be an array');
  });

  it('rejects deeply nested or oversized settings payloads', () => {
    let deepValue = 'end';
    for (let index = 0; index < 14; index += 1) {
      deepValue = { nested: deepValue };
    }

    expect(() => validateWorkspaceImportData({
      version: '1.0',
      workspace: { id: 'workspace-1', name: 'Workspace' },
      settings: { deepValue }
    })).toThrow('nested too deeply');

    expect(() => validateWorkspaceImportData({
      version: '1.0',
      workspace: { id: 'workspace-1', name: 'Workspace' },
      settings: { largeValue: 'x'.repeat(1024 * 1024 + 1) }
    })).toThrow('too long');
  });

  it('normalizes import options to supported booleans only', () => {
    expect(normalizeImportOptions({
      generateNewId: true,
      overwriteExisting: 'yes',
      unexpected: true
    })).toEqual({
      generateNewId: true,
      overwriteExisting: false
    });

    expect(() => normalizeImportOptions('invalid')).toThrow('Import options must be an object');
  });

  it('validates custom section records in imports', () => {
    expect(validateCustomSections([{
      name: 'Projects',
      items: [{ path: 'C:/Projects' }]
    }])).toEqual([{
      name: 'Projects',
      items: [{ path: 'C:/Projects' }]
    }]);

    expect(() => validateCustomSections([{ name: '', items: [] }]))
      .toThrow('name is required');
    expect(() => validateCustomSections([{ name: 'Projects', items: [{ id: 'only-id' }] }]))
      .toThrow('requires a name or path');
  });
});
