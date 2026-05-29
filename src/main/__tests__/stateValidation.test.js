const {
  normalizeCustomSectionData,
  normalizeCustomSectionItem,
  normalizeCustomSectionUpdates,
  normalizeSettingsPayload,
  normalizeWorkspace,
  normalizeWorkspaceSettingRequest,
  validateJsonValue
} = require('../stateValidation');

describe('main state validation', () => {
  it('normalizes bounded settings payloads', () => {
    expect(normalizeSettingsPayload({
      selectedProvider: 'openai',
      renameFiles: true,
      apiKeys: { openai: 'sk-test' },
      operationHistory: [{
        id: 'batch-1',
        timestamp: new Date('2026-01-01T00:00:00.000Z')
      }]
    })).toEqual({
      selectedProvider: 'openai',
      renameFiles: true,
      apiKeys: { openai: 'sk-test' },
      operationHistory: [{
        id: 'batch-1',
        timestamp: '2026-01-01T00:00:00.000Z'
      }]
    });

    expect(() => normalizeSettingsPayload([])).toThrow('Settings must be an object');
    expect(() => normalizeSettingsPayload({ ['__proto__']: 'bad' })).toThrow('Setting key is invalid');
  });

  it('rejects settings values that are too deep or non-finite', () => {
    let deepValue = 'end';
    for (let index = 0; index < 14; index += 1) {
      deepValue = { nested: deepValue };
    }

    expect(() => normalizeSettingsPayload({ deepValue })).toThrow('nested too deeply');
    expect(() => normalizeSettingsPayload({ badNumber: Number.POSITIVE_INFINITY })).toThrow('finite number');
  });

  it('normalizes workspace records and workspace setting requests', () => {
    expect(normalizeWorkspace({ id: 'workspace-1', name: 'Workspace', emoji: 'K' })).toEqual({
      id: 'workspace-1',
      name: 'Workspace',
      emoji: 'K'
    });

    expect(normalizeWorkspaceSettingRequest({
      workspaceId: 'workspace-1',
      key: 'recentFolders',
      value: ['C:/Users/Ada']
    }, { requireValue: true })).toEqual({
      workspaceId: 'workspace-1',
      key: 'recentFolders',
      value: ['C:/Users/Ada']
    });

    expect(() => normalizeWorkspace({ id: '../bad', name: 'Workspace' })).toThrow('Workspace id is invalid');
    expect(() => normalizeWorkspaceSettingRequest({ workspaceId: 'workspace-1', key: 'bad.key' }))
      .toThrow('Workspace setting key is invalid');
  });

  it('normalizes custom section data and updates', () => {
    expect(normalizeCustomSectionData({
      name: 'Projects',
      color: '#FF5733',
      icon: 'P',
      items: [{ name: 'Docs', path: 'C:/Docs', ignored: true }]
    })).toEqual({
      name: 'Projects',
      color: '#FF5733',
      icon: 'P',
      items: [{ name: 'Docs', path: 'C:/Docs' }]
    });

    expect(normalizeCustomSectionUpdates({
      color: '#123456',
      items: [{ id: '1', name: 'Docs' }]
    })).toEqual({
      color: '#123456',
      items: [{ id: '1', name: 'Docs' }]
    });

    expect(() => normalizeCustomSectionData({ name: '', items: [] })).toThrow('Custom section name is required');
    expect(() => normalizeCustomSectionUpdates({ color: 'red' })).toThrow('color is invalid');
  });

  it('requires custom section items to contain a useful label or path', () => {
    expect(normalizeCustomSectionItem({ path: 'C:/Docs' })).toEqual({ path: 'C:/Docs' });
    expect(() => normalizeCustomSectionItem({ id: 'only-id' })).toThrow('requires a name or path');
  });

  it('rejects unsupported JSON values', () => {
    expect(() => validateJsonValue(() => {}, 'Callback')).toThrow('unsupported value');
  });
});
