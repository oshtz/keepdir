const fs = require('fs').promises;
const { requireExistingPath } = require('./ipcValidation');

const DEFAULT_MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_WORKSPACES = 500;
const MAX_SETTINGS_ENTRIES = 500;
const MAX_CUSTOM_SECTIONS = 200;
const MAX_CUSTOM_SECTION_ITEMS = 500;
const MAX_STRING_LENGTH = 1024 * 1024;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 50000;
const MAX_ARRAY_LENGTH = 5000;
const MAX_OBJECT_KEYS = 1000;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireBoundedString(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  if (value.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }
  if (/[\x00-\x1F]/.test(value)) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  return value;
}

function validateJsonValue(value, label, state = { depth: 0, nodes: { count: 0 } }) {
  state.nodes.count += 1;
  if (state.nodes.count > MAX_JSON_NODES) {
    throw new Error(`${label} is too complex.`);
  }

  if (state.depth > MAX_JSON_DEPTH) {
    throw new Error(`${label} is nested too deeply.`);
  }

  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return;
  }

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      throw new Error(`${label} contains a string that is too long.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      throw new Error(`${label} contains too many array items.`);
    }
    value.forEach((item, index) => {
      validateJsonValue(item, `${label}[${index}]`, {
        depth: state.depth + 1,
        nodes: state.nodes
      });
    });
    return;
  }

  if (!isPlainObject(value)) {
    throw new Error(`${label} contains an unsupported value.`);
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) {
    throw new Error(`${label} contains too many object keys.`);
  }

  entries.forEach(([key, nestedValue]) => {
    validateSettingKey(key, `${label} key`);
    validateJsonValue(nestedValue, `${label}.${key}`, {
      depth: state.depth + 1,
      nodes: state.nodes
    });
  });
}

function validateSettingKey(key, label = 'Setting key') {
  requireBoundedString(key, label, 128);
}

function validateSettingsObject(settings, label = 'Settings') {
  if (settings == null) {
    return {};
  }

  const settingsObject = requirePlainObject(settings, label);
  const entries = Object.entries(settingsObject);
  if (entries.length > MAX_SETTINGS_ENTRIES) {
    throw new Error(`${label} contains too many entries.`);
  }

  entries.forEach(([key, value]) => {
    validateSettingKey(key);
    validateJsonValue(value, `Setting ${key}`);
  });

  return settingsObject;
}

function validateWorkspaceRecord(workspace, label = 'Workspace') {
  const workspaceObject = requirePlainObject(workspace, label);
  return {
    id: requireBoundedString(workspaceObject.id, `${label} id`, 256),
    name: requireBoundedString(workspaceObject.name, `${label} name`, 200),
    emoji: typeof workspaceObject.emoji === 'string' && workspaceObject.emoji.length <= 32
      ? workspaceObject.emoji
      : '',
    created_at: typeof workspaceObject.created_at === 'string' && workspaceObject.created_at.length <= 64
      ? workspaceObject.created_at
      : undefined,
    updated_at: typeof workspaceObject.updated_at === 'string' && workspaceObject.updated_at.length <= 64
      ? workspaceObject.updated_at
      : undefined
  };
}

function validateCustomSectionItem(item, label = 'Custom section item') {
  const itemObject = requirePlainObject(item, label);
  const normalized = {};

  if (itemObject.id != null) {
    normalized.id = requireBoundedString(itemObject.id, `${label} id`, 256);
  }
  if (itemObject.name != null) {
    normalized.name = requireBoundedString(itemObject.name, `${label} name`, 200);
  }
  if (itemObject.path != null) {
    normalized.path = requireBoundedString(itemObject.path, `${label} path`, 32767);
  }
  if (itemObject.type != null) {
    normalized.type = requireBoundedString(itemObject.type, `${label} type`, 64);
  }

  if (!normalized.name && !normalized.path) {
    throw new Error(`${label} requires a name or path.`);
  }

  return normalized;
}

function validateCustomSectionItems(items = [], label = 'Custom section items') {
  if (!Array.isArray(items)) {
    throw new Error(`${label} must be an array.`);
  }

  if (items.length > MAX_CUSTOM_SECTION_ITEMS) {
    throw new Error(`${label} cannot contain more than ${MAX_CUSTOM_SECTION_ITEMS} items.`);
  }

  return items.map((item, index) => validateCustomSectionItem(item, `${label} ${index + 1}`));
}

function validateCustomSections(customSections = [], label = 'Custom sections') {
  if (!Array.isArray(customSections)) {
    throw new Error(`${label} must be an array.`);
  }

  if (customSections.length > MAX_CUSTOM_SECTIONS) {
    throw new Error(`${label} cannot contain more than ${MAX_CUSTOM_SECTIONS} sections.`);
  }

  return customSections.map((section, index) => {
    const sectionObject = requirePlainObject(section, `${label} ${index + 1}`);
    const normalized = {
      id: sectionObject.id == null
        ? undefined
        : requireBoundedString(sectionObject.id, `${label} ${index + 1} id`, 256),
      name: requireBoundedString(sectionObject.name, `${label} ${index + 1} name`, 100),
      icon: typeof sectionObject.icon === 'string' && sectionObject.icon.length <= 32
        ? sectionObject.icon
        : undefined,
      color: typeof sectionObject.color === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(sectionObject.color)
        ? sectionObject.color
        : undefined,
      items: validateCustomSectionItems(sectionObject.items || [], `${label} ${index + 1} items`),
      created_at: typeof sectionObject.created_at === 'string' && sectionObject.created_at.length <= 64
        ? sectionObject.created_at
        : undefined,
      updated_at: typeof sectionObject.updated_at === 'string' && sectionObject.updated_at.length <= 64
        ? sectionObject.updated_at
        : undefined
    };

    Object.keys(normalized).forEach((key) => {
      if (normalized[key] === undefined) {
        delete normalized[key];
      }
    });

    return normalized;
  });
}

function validateVersion(value, label = 'Import version') {
  return requireBoundedString(value, label, 20);
}

function validateWorkspaceImportData(data) {
  const importData = requirePlainObject(data, 'Workspace import data');
  return {
    version: validateVersion(importData.version),
    exportedAt: typeof importData.exportedAt === 'string' && importData.exportedAt.length <= 64
      ? importData.exportedAt
      : undefined,
    workspace: validateWorkspaceRecord(importData.workspace),
    settings: validateSettingsObject(importData.settings, 'Workspace settings'),
    customSections: validateCustomSections(importData.customSections || [])
  };
}

function validateAllDataImport(data) {
  const backupData = requirePlainObject(data, 'Backup data');
  const workspaces = Array.isArray(backupData.workspaces) ? backupData.workspaces : null;

  if (!workspaces) {
    throw new Error('Backup workspaces must be an array.');
  }

  if (workspaces.length > MAX_WORKSPACES) {
    throw new Error(`Backup cannot contain more than ${MAX_WORKSPACES} workspaces.`);
  }

  return {
    version: validateVersion(backupData.version, 'Backup version'),
    exportedAt: requireBoundedString(backupData.exportedAt, 'Backup export timestamp', 64),
    settings: validateSettingsObject(backupData.settings, 'Global settings'),
    workspaces: workspaces.map((workspaceData, index) => {
      const entry = requirePlainObject(workspaceData, `Workspace entry ${index + 1}`);
      return {
        workspace: validateWorkspaceRecord(entry.workspace, `Workspace entry ${index + 1}`),
        settings: validateSettingsObject(entry.settings, `Workspace entry ${index + 1} settings`),
        customSections: validateCustomSections(
          entry.customSections || [],
          `Workspace entry ${index + 1} custom sections`
        )
      };
    })
  };
}

function normalizeImportOptions(options = {}) {
  if (options == null) {
    return {};
  }

  const optionsObject = requirePlainObject(options, 'Import options');
  return {
    generateNewId: optionsObject.generateNewId === true,
    overwriteExisting: optionsObject.overwriteExisting === true
  };
}

async function readJsonImportFile(filePath, { maxBytes = DEFAULT_MAX_IMPORT_BYTES } = {}) {
  const result = await requireExistingPath(filePath, 'Import file');
  if (!result.stats.isFile()) {
    throw new Error('Import file must be a file.');
  }

  if (result.stats.size > maxBytes) {
    throw new Error(`Import file cannot exceed ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
  }

  const fileContent = await fs.readFile(result.filePath, 'utf8');
  if (!fileContent.trim()) {
    throw new Error('Import file is empty.');
  }

  try {
    return JSON.parse(fileContent);
  } catch (error) {
    throw new Error('Import file is not valid JSON.');
  }
}

module.exports = {
  DEFAULT_MAX_IMPORT_BYTES,
  normalizeImportOptions,
  readJsonImportFile,
  validateAllDataImport,
  validateCustomSections,
  validateWorkspaceImportData
};
