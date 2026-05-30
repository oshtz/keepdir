const { requireString } = require('./ipcValidation');

const MAX_SETTINGS_ENTRIES = 200;
const MAX_CUSTOM_SECTION_ITEMS = 500;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 50000;
const MAX_ARRAY_LENGTH = 10000;
const MAX_OBJECT_KEYS = 1000;
const MAX_STRING_LENGTH = 1024 * 1024;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function validateStoredString(value, label, maxLength) {
  const stringValue = requireString(value, label, { maxLength, trim: true });
  if (/[\x00-\x1F]/.test(stringValue)) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  return stringValue;
}

function normalizeRecordId(value, label = 'Record id') {
  const id = validateStoredString(value, label, 256);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
    throw new Error(`${label} is invalid.`);
  }
  return id;
}

function normalizeSettingKey(value, label = 'Setting key') {
  const key = validateStoredString(value, label, 128);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) {
    throw new Error(`${label} is invalid.`);
  }
  return key;
}

function validateJsonValue(value, label, state = { depth: 0, nodes: { count: 0 } }) {
  state.nodes.count += 1;
  if (state.nodes.count > MAX_JSON_NODES) {
    throw new Error(`${label} is too complex.`);
  }

  if (state.depth > MAX_JSON_DEPTH) {
    throw new Error(`${label} is nested too deeply.`);
  }

  if (value == null || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must be a finite number.`);
    }
    return value;
  }

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      throw new Error(`${label} contains a string that is too long.`);
    }
    if (/[\x00-\x08\x0E-\x1F]/.test(value)) {
      throw new Error(`${label} contains unsupported control characters.`);
    }
    return value;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`${label} must be a valid date.`);
    }
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      throw new Error(`${label} contains too many array items.`);
    }
    return value.map((item, index) => validateJsonValue(item, `${label}[${index}]`, {
      depth: state.depth + 1,
      nodes: state.nodes
    }));
  }

  if (!isPlainObject(value)) {
    throw new Error(`${label} contains an unsupported value.`);
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) {
    throw new Error(`${label} contains too many object keys.`);
  }

  const normalized = {};
  entries.forEach(([key, nestedValue]) => {
    validateStoredString(key, `${label} object key`, 256);
    normalized[key] = validateJsonValue(nestedValue, `${label}.${key}`, {
      depth: state.depth + 1,
      nodes: state.nodes
    });
  });

  return normalized;
}

function normalizeSettingsPayload(settings) {
  const settingsObject = requirePlainObject(settings, 'Settings');
  const entries = Object.entries(settingsObject);

  if (entries.length > MAX_SETTINGS_ENTRIES) {
    throw new Error(`Settings cannot contain more than ${MAX_SETTINGS_ENTRIES} entries.`);
  }

  const normalized = {};
  entries.forEach(([key, value]) => {
    normalized[normalizeSettingKey(key)] = validateJsonValue(value, `Setting ${key}`);
  });

  return normalized;
}

function normalizeWorkspace(workspace) {
  const workspaceObject = requirePlainObject(workspace, 'Workspace');
  return {
    id: normalizeRecordId(workspaceObject.id, 'Workspace id'),
    name: validateStoredString(workspaceObject.name, 'Workspace name', 200),
    emoji: typeof workspaceObject.emoji === 'string' && workspaceObject.emoji.length <= 32
      ? workspaceObject.emoji
      : ''
  };
}

function normalizeWorkspaceId(value) {
  return normalizeRecordId(value, 'Workspace id');
}

function normalizeWorkspaceSettingRequest(payload, { requireValue = false } = {}) {
  const request = requirePlainObject(payload, 'Workspace setting request');
  const normalized = {
    workspaceId: normalizeWorkspaceId(request.workspaceId),
    key: normalizeSettingKey(request.key, 'Workspace setting key')
  };

  if (requireValue) {
    normalized.value = validateJsonValue(request.value, `Workspace setting ${normalized.key}`);
  }

  return normalized;
}

function normalizeSectionColor(value) {
  if (value == null) {
    return undefined;
  }

  const color = validateStoredString(value, 'Custom section color', 64);
  if (!/^#[0-9A-Fa-f]{3,8}$/.test(color)) {
    throw new Error('Custom section color is invalid.');
  }
  return color;
}

function normalizeSectionIcon(value) {
  if (value == null) {
    return undefined;
  }
  return validateStoredString(value, 'Custom section icon', 32);
}

function normalizeCustomSectionItem(item) {
  const itemObject = requirePlainObject(item, 'Custom section item');
  const normalized = {};

  if (itemObject.id != null) {
    normalized.id = validateStoredString(itemObject.id, 'Custom section item id', 256);
  }
  if (itemObject.name != null) {
    normalized.name = validateStoredString(itemObject.name, 'Custom section item name', 200);
  }
  if (itemObject.path != null) {
    normalized.path = validateStoredString(itemObject.path, 'Custom section item path', 32767);
  }
  if (itemObject.type != null) {
    normalized.type = validateStoredString(itemObject.type, 'Custom section item type', 64);
  }

  if (!normalized.name && !normalized.path) {
    throw new Error('Custom section item requires a name or path.');
  }

  return normalized;
}

function normalizeCustomSectionItems(items = []) {
  if (!Array.isArray(items)) {
    throw new Error('Custom section items must be an array.');
  }
  if (items.length > MAX_CUSTOM_SECTION_ITEMS) {
    throw new Error(`Custom section cannot contain more than ${MAX_CUSTOM_SECTION_ITEMS} items.`);
  }
  return items.map(normalizeCustomSectionItem);
}

function normalizeCustomSectionData(sectionData) {
  const section = requirePlainObject(sectionData, 'Custom section');
  const normalized = {
    name: validateStoredString(section.name, 'Custom section name', 100),
    items: normalizeCustomSectionItems(section.items || [])
  };

  const icon = normalizeSectionIcon(section.icon);
  if (icon !== undefined) {
    normalized.icon = icon;
  }

  const color = normalizeSectionColor(section.color);
  if (color !== undefined) {
    normalized.color = color;
  }

  return normalized;
}

function normalizeCustomSectionUpdates(updates) {
  const updateObject = requirePlainObject(updates, 'Custom section updates');
  const normalized = {};

  if (updateObject.name !== undefined) {
    normalized.name = validateStoredString(updateObject.name, 'Custom section name', 100);
  }
  if (updateObject.icon !== undefined) {
    normalized.icon = normalizeSectionIcon(updateObject.icon);
  }
  if (updateObject.color !== undefined) {
    normalized.color = normalizeSectionColor(updateObject.color);
  }
  if (updateObject.items !== undefined) {
    normalized.items = normalizeCustomSectionItems(updateObject.items);
  }

  return normalized;
}

module.exports = {
  normalizeCustomSectionData,
  normalizeCustomSectionItem,
  normalizeCustomSectionUpdates,
  normalizeRecordId,
  normalizeSettingsPayload,
  normalizeWorkspace,
  normalizeWorkspaceId,
  normalizeWorkspaceSettingRequest,
  validateJsonValue
};
