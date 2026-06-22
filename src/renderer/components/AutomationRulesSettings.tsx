import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CaretDown, CaretUp, Copy, MagicWand, Plus, Trash } from 'phosphor-react';
import {
  Alert,
  Button,
  Checkbox,
  Combobox,
  IconButton,
  Input,
  Select,
  Switch,
  TextArea,
} from './ui';
import RuleActionsQueue from './RuleActionsQueue';
import WatchFoldersSettings from './WatchFoldersSettings';
import type { FileRule } from '../appApi';
import { cn } from '../utils';

const AUTOMATION_RULES_KEY = 'automationRules';
const RULE_ASSISTANT_SETTINGS_KEY = 'ruleAssistantSettings';
const COLLAPSED_RULES_KEY = 'keepdir.collapsedRules';

function loadCollapsedRuleIds(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_RULES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function persistCollapsedRuleIds(ids: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_RULES_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}
type RuleAssistantProvider = 'openai' | 'google' | 'anthropic' | 'openrouter' | 'lmstudio' | 'ollama';

const RULE_ASSISTANT_PROVIDERS: Record<
  RuleAssistantProvider,
  { label: string; endpoint: string; model: string }
> = {
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-5.4-mini' },
  google: {
    label: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-3-flash-preview',
  },
  anthropic: { label: 'Anthropic', endpoint: 'https://api.anthropic.com/v1', model: 'claude-2' },
  openrouter: {
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4',
  },
  lmstudio: { label: 'LM Studio', endpoint: 'http://localhost:1234/v1', model: 'openai/gpt-oss-20b' },
  ollama: { label: 'Ollama', endpoint: 'http://localhost:11434/v1', model: 'gemma3' },
};

const RULE_ASSISTANT_PROMPT =
  'Draft one or more KeepDir FileRule objects as JSON only. Return either one object or an array. Allowed keys: name, match.nameContains, match.extensionIn, match.sourceUrlContains, match.downloadedFromContains, action.targetFolder, action.targetNameTemplate, action.ask, stopOnMatch. Do not invent other keys. Use relative target folders. If the user asks to move or sort files, set action.targetFolder. Set action.ask true when the request is ambiguous.';

interface AutomationRulesSettingsProps {
  workspaceId?: string | null;
  showQueue?: boolean;
  showWatchFolders?: boolean;
}

interface RuleAssistantSettings {
  provider: RuleAssistantProvider;
  endpoint: string;
  model: string;
}

function createRuleId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `rule-${globalThis.crypto.randomUUID()}`;
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeOrders(rules: FileRule[]) {
  return rules.map((rule, index) => ({ ...rule, order: index }));
}

function parseExtensions(value: string) {
  return value
    .split(',')
    .map((item) => item.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

function normalizeLookupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findValueByLooseKey(raw: any, key: string) {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(raw, key)) {
    return raw[key];
  }
  const normalized = normalizeLookupKey(key);
  for (const [candidate, value] of Object.entries(raw)) {
    if (normalizeLookupKey(candidate) === normalized) {
      return value;
    }
  }
  return undefined;
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRuleAssistantProvider(value: unknown): value is RuleAssistantProvider {
  return typeof value === 'string' && value in RULE_ASSISTANT_PROVIDERS;
}

function parseJsonValue(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const objectStart = text.indexOf('{');
    const arrayStart = text.indexOf('[');
    const useArray = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart);
    const start = useArray ? arrayStart : objectStart;
    const end = useArray ? text.lastIndexOf(']') : text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('Rule assistant did not return JSON');
  }
}

function nestedValue(raw: any, section: string, key: string) {
  const sectionValue = findValueByLooseKey(raw, section);
  const sectionObject =
    sectionValue && typeof sectionValue === 'object' && !Array.isArray(sectionValue)
      ? sectionValue
      : null;
  if (sectionObject) {
    const direct = findValueByLooseKey(sectionObject, key);
    if (direct !== undefined) {
      return direct;
    }
  }
  const dotted = `${section}.${key}`;
  const fromFlattened = findValueByLooseKey(raw, dotted);
  if (fromFlattened !== undefined) {
    return fromFlattened;
  }
  for (const [candidate, value] of Object.entries(raw || {})) {
    if (normalizeLookupKey(candidate) === normalizeLookupKey(dotted)) {
      return value;
    }
  }
  return undefined;
}

function normalizeAssistantRule(raw: any, order: number): FileRule {
  const extensionValue = nestedValue(raw, 'match', 'extensionIn');
  const extensionIn = Array.isArray(extensionValue)
    ? extensionValue
        .map((item: unknown) => cleanString(item))
        .filter((item: string | undefined): item is string => Boolean(item))
        .map((item) => item.replace(/^\./, '').toLowerCase())
    : parseExtensions(cleanString(extensionValue) || '');

  return {
    id: createRuleId(),
    name: cleanString(raw?.name) || 'Drafted rule',
    enabled: false,
    order,
    match: {
      nameContains: cleanString(nestedValue(raw, 'match', 'nameContains')),
      extensionIn,
      sourceUrlContains: cleanString(nestedValue(raw, 'match', 'sourceUrlContains')),
      downloadedFromContains: cleanString(nestedValue(raw, 'match', 'downloadedFromContains')),
    },
    action: {
      targetFolder: cleanString(nestedValue(raw, 'action', 'targetFolder')),
      targetNameTemplate: cleanString(nestedValue(raw, 'action', 'targetNameTemplate')),
      ask: nestedValue(raw, 'action', 'ask') === true,
    },
    stopOnMatch: findValueByLooseKey(raw, 'stopOnMatch') !== false,
  };
}

function normalizeAssistantRules(raw: any, order: number): FileRule[] {
  const items: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.rules)
      ? raw.rules
      : [raw];
  return items.map((item: any, index: number) => normalizeAssistantRule(item, order + index));
}

function extractModelNames(provider: RuleAssistantProvider, data: any) {
  const items =
    provider === 'google'
      ? data?.models
      : Array.isArray(data?.data)
        ? data.data
        : data?.models;

  if (!Array.isArray(items)) {
    return [];
  }

  return Array.from(
    new Set(
      items
        .filter(
          (item: any) =>
            provider !== 'google' || item?.supportedGenerationMethods?.includes('generateContent')
        )
        .map((item: any) => item?.id || item?.name)
        .filter((name: unknown): name is string => typeof name === 'string' && Boolean(name.trim()))
        .map((name) => name.replace(/^models\//, ''))
    )
  ).sort();
}

async function fetchAssistantModels(options: {
  provider: RuleAssistantProvider;
  apiKey: string;
  endpoint: string;
}) {
  const endpoint = options.endpoint.replace(/\/+$/, '');
  const apiKey = options.apiKey.trim();
  const headers: Record<string, string> = {};

  if (options.provider === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
  } else if (options.provider === 'google') {
    if (apiKey) {
      headers['x-goog-api-key'] = apiKey;
    }
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${endpoint}/models`, { headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Failed to load models');
  }
  return extractModelNames(options.provider, data);
}

async function draftRuleWithAssistant(options: {
  provider: RuleAssistantProvider;
  apiKey: string;
  endpoint: string;
  model: string;
  description: string;
  order: number;
}) {
  const endpoint = options.endpoint.replace(/\/+$/, '');
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  let response: Response;

  if (options.provider === 'anthropic') {
    response = await fetch(`${endpoint}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        temperature: 0,
        system: RULE_ASSISTANT_PROMPT,
        messages: [{ role: 'user', content: options.description }],
      }),
    });
  } else if (options.provider === 'google') {
    response = await fetch(`${endpoint}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-goog-api-key': apiKey } : {}),
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${RULE_ASSISTANT_PROMPT}\n\nUser request:\n${options.description}` },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
  } else {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: RULE_ASSISTANT_PROMPT },
          { role: 'user', content: options.description },
        ],
      }),
    });
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Rule assistant request failed');
  }
  const content =
    options.provider === 'anthropic'
      ? data?.content?.find((item: any) => typeof item?.text === 'string')?.text
      : options.provider === 'google'
        ? data?.candidates?.[0]?.content?.parts?.find((item: any) => typeof item?.text === 'string')
            ?.text
        : data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Rule assistant returned no content');
  }
  return normalizeAssistantRules(parseJsonValue(content), options.order);
}

const AutomationRulesSettings: React.FC<AutomationRulesSettingsProps> = ({
  workspaceId,
  showQueue = true,
  showWatchFolders = true,
}) => {
  const [rules, setRules] = useState<FileRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantDescription, setAssistantDescription] = useState('');
  const [assistantApiKey, setAssistantApiKey] = useState('');
  const [assistantProvider, setAssistantProvider] = useState<RuleAssistantProvider>('openai');
  const [assistantEndpoint, setAssistantEndpoint] = useState(RULE_ASSISTANT_PROVIDERS.openai.endpoint);
  const [assistantModel, setAssistantModel] = useState(RULE_ASSISTANT_PROVIDERS.openai.model);
  const [assistantKeySaved, setAssistantKeySaved] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);
  const [assistantSettingsOpen, setAssistantSettingsOpen] = useState(false);
  const [assistantModels, setAssistantModels] = useState<string[]>([]);
  const [assistantModelLoading, setAssistantModelLoading] = useState(false);
  const [assistantModelError, setAssistantModelError] = useState<string | null>(null);
  const [collapsedRuleIds, setCollapsedRuleIds] = useState<Set<string>>(() => loadCollapsedRuleIds());

  const toggleRuleCollapsed = useCallback((ruleId: string) => {
    setCollapsedRuleIds((previous) => {
      const next = new Set(previous);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      persistCollapsedRuleIds(next);
      return next;
    });
  }, []);

  const loadAssistantKey = useCallback(async (provider: RuleAssistantProvider) => {
    try {
      const result = await window.keepdirAPI.getRuleAssistantKey(provider);
      setAssistantApiKey(result.apiKey || '');
      setAssistantKeySaved(Boolean(result.apiKey));
    } catch (err) {
      setAssistantApiKey('');
      setAssistantKeySaved(false);
      setError(err instanceof Error ? err.message : 'Failed to load saved API key');
    }
  }, []);

  const loadRules = useCallback(async () => {
    if (!workspaceId) {
      setRules([]);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const value = await window.keepdirAPI.getWorkspaceSetting(workspaceId, AUTOMATION_RULES_KEY);
      setRules(normalizeOrders(Array.isArray(value) ? (value as FileRule[]) : []));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const loadAssistantSettings = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    try {
      const value = await window.keepdirAPI.getWorkspaceSetting(workspaceId, RULE_ASSISTANT_SETTINGS_KEY);
      const settings =
        value && typeof value === 'object' ? (value as Partial<RuleAssistantSettings>) : null;
      const provider = isRuleAssistantProvider(settings?.provider) ? settings.provider : 'openai';
      const defaults = RULE_ASSISTANT_PROVIDERS[provider];
      setAssistantProvider(provider);
      setAssistantEndpoint(cleanString(settings?.endpoint) || defaults.endpoint);
      setAssistantModel(cleanString(settings?.model) || defaults.model);
      setAssistantModels([]);
      setAssistantModelError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assistant settings');
    }
  }, [workspaceId]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    void loadAssistantSettings();
  }, [loadAssistantSettings]);

  useEffect(() => {
    void loadAssistantKey(assistantProvider);
  }, [assistantProvider, loadAssistantKey]);

  const saveAssistantSettings = async (settings: RuleAssistantSettings) => {
    if (!workspaceId) {
      return;
    }
    const result = await window.keepdirAPI.saveWorkspaceSetting(
      workspaceId,
      RULE_ASSISTANT_SETTINGS_KEY,
      settings
    );
    if (result.error) {
      throw new Error(result.error);
    }
  };

  const updateAssistantSettings = (settings: RuleAssistantSettings) => {
    setAssistantProvider(settings.provider);
    setAssistantEndpoint(settings.endpoint);
    setAssistantModel(settings.model);
    setAssistantModels([]);
    setAssistantModelError(null);
    void saveAssistantSettings(settings).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to save assistant settings');
    });
  };

  const saveRules = async (nextRules: FileRule[]) => {
    if (!workspaceId) {
      return;
    }
    const ordered = normalizeOrders(nextRules);
    setRules(ordered);
    try {
      const result = await window.keepdirAPI.saveWorkspaceSetting(
        workspaceId,
        AUTOMATION_RULES_KEY,
        ordered
      );
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rules');
    }
  };

  const updateRule = (ruleId: string, update: (rule: FileRule) => FileRule) => {
    void saveRules(rules.map((rule) => (rule.id === ruleId ? update(rule) : rule)));
  };

  const addRule = () => {
    const nextRule: FileRule = {
      id: createRuleId(),
      name: 'PDFs to Documents',
      enabled: false,
      order: rules.length,
      match: { extensionIn: ['pdf'] },
      action: { targetFolder: 'Documents' },
      stopOnMatch: true,
    };
    void saveRules([...rules, nextRule]);
  };

  const changeAssistantProvider = (provider: RuleAssistantProvider) => {
    const defaults = RULE_ASSISTANT_PROVIDERS[provider];
    updateAssistantSettings({ provider, endpoint: defaults.endpoint, model: defaults.model });
  };

  const saveAssistantKey = async () => {
    if (!assistantApiKey.trim()) {
      return;
    }
    const result = await window.keepdirAPI.saveRuleAssistantKey(assistantProvider, assistantApiKey);
    if (result.error) {
      throw new Error(result.error);
    }
    setAssistantKeySaved(true);
  };

  const saveAssistantKeyFromField = () => {
    void saveAssistantKey().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to save API key');
    });
  };

  const forgetAssistantKey = async () => {
    try {
      const result = await window.keepdirAPI.deleteRuleAssistantKey(assistantProvider);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAssistantApiKey('');
      setAssistantKeySaved(false);
      setAssistantMessage('Forgot saved API key.');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to forget API key');
    }
  };

  const loadAssistantModels = async () => {
    if (!assistantEndpoint.trim()) {
      return;
    }
    setAssistantModelLoading(true);
    setAssistantModelError(null);
    try {
      await saveAssistantKey();
      const models = await fetchAssistantModels({
        provider: assistantProvider,
        apiKey: assistantApiKey,
        endpoint: assistantEndpoint,
      });
      setAssistantModels(models);
      if (!assistantModel.trim() && models[0]) {
        setAssistantModel(models[0]);
      }
    } catch (err) {
      setAssistantModels([]);
      setAssistantModelError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setAssistantModelLoading(false);
    }
  };

  const draftRule = async () => {
    if (!workspaceId || !assistantDescription.trim() || !assistantEndpoint.trim() || !assistantModel.trim()) {
      return;
    }

    setAssistantLoading(true);
    setAssistantMessage(null);
    setError(null);
    try {
      await saveAssistantKey();
      const draftedRules = await draftRuleWithAssistant({
        provider: assistantProvider,
        apiKey: assistantApiKey,
        endpoint: assistantEndpoint,
        model: assistantModel,
        description: assistantDescription,
        order: rules.length,
      });
      await saveRules([...rules, ...draftedRules]);
      setAssistantMessage(
        draftedRules.length === 1
          ? 'Drafted a disabled rule for review.'
          : `Drafted ${draftedRules.length} disabled rules for review.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to draft rule');
    } finally {
      setAssistantLoading(false);
    }
  };

  const removeRule = (ruleId: string) => {
    void saveRules(rules.filter((rule) => rule.id !== ruleId));
    setCollapsedRuleIds((previous) => {
      if (!previous.has(ruleId)) return previous;
      const next = new Set(previous);
      next.delete(ruleId);
      persistCollapsedRuleIds(next);
      return next;
    });
  };

  const duplicateRule = (ruleId: string) => {
    const source = rules.find((rule) => rule.id === ruleId);
    if (!source) return;
    const index = rules.findIndex((rule) => rule.id === ruleId);
    const nextRule: FileRule = {
      ...source,
      id: createRuleId(),
      name: `${source.name} (copy)`,
      enabled: false,
    };
    const nextRules = [...rules.slice(0, index + 1), nextRule, ...rules.slice(index + 1)];
    void saveRules(nextRules);
  };

  const moveRule = (ruleId: string, direction: -1 | 1) => {
    const index = rules.findIndex((rule) => rule.id === ruleId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= rules.length) {
      return;
    }
    const nextRules = [...rules];
    [nextRules[index], nextRules[nextIndex]] = [nextRules[nextIndex], nextRules[index]];
    void saveRules(nextRules);
  };

  return (
    <div className="flex flex-col gap-4 min-w-0 min-h-full">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-[var(--radius-md)] bg-accent/10 text-accent-ink dark:text-accent">
          <ListChecksIcon />
        </div>
        <h2 className="font-display font-semibold text-xl tracking-[-0.01em] text-balance">Automation Rules</h2>
      </div>

      {error && <Alert severity="error">{error}</Alert>}

      {showWatchFolders && <WatchFoldersSettings workspaceId={workspaceId} />}

      <div className="kd-card p-4">
        <div className="font-header font-semibold text-base">Rule assistant</div>
        {assistantMessage && (
          <Alert severity="info" className="mt-2">
            {assistantMessage}
          </Alert>
        )}
        <TextArea
          label="Describe rule"
          value={assistantDescription}
          onChange={(event) => setAssistantDescription(event.target.value)}
          placeholder="Move screenshots to Media/Images, archives to Archives, installers to Apps"
          className="mt-3"
        />
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <Button
            variant="primary"
            leftIcon={<MagicWand size={16} weight="light" />}
            onClick={draftRule}
            disabled={
              !workspaceId ||
              assistantLoading ||
              !assistantDescription.trim() ||
              !assistantEndpoint.trim() ||
              !assistantModel.trim()
            }
          >
            Draft Rule
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAssistantSettingsOpen((open) => !open)}
            rightIcon={
              assistantSettingsOpen ? <CaretUp size={14} weight="light" /> : <CaretDown size={14} weight="light" />
            }
          >
            Assistant Settings
          </Button>
        </div>

        {assistantSettingsOpen && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[170px_1fr_1fr_1fr] gap-3">
              <Select
                label="Rule assistant provider"
                value={assistantProvider}
                onChange={(event) => changeAssistantProvider(event.target.value as RuleAssistantProvider)}
                options={Object.entries(RULE_ASSISTANT_PROVIDERS).map(([value, provider]) => ({
                  value,
                  label: provider.label,
                }))}
              />
              <Input
                label="Rule assistant base URL"
                value={assistantEndpoint}
                onChange={(event) => {
                  const endpoint = event.target.value;
                  setAssistantEndpoint(endpoint);
                  void saveAssistantSettings({
                    provider: assistantProvider,
                    endpoint,
                    model: assistantModel,
                  }).catch((err) => {
                    setError(err instanceof Error ? err.message : 'Failed to save assistant settings');
                  });
                }}
              />
              <Combobox
                label="Rule assistant model"
                value={assistantModel}
                onChange={(event) => {
                  const model = event.target.value;
                  setAssistantModel(model);
                  void saveAssistantSettings({
                    provider: assistantProvider,
                    endpoint: assistantEndpoint,
                    model,
                  }).catch((err) => {
                    setError(err instanceof Error ? err.message : 'Failed to save assistant settings');
                  });
                }}
                options={assistantModels}
              />
              <Input
                label="Rule assistant API key"
                type="password"
                value={assistantApiKey}
                onChange={(event) => {
                  setAssistantApiKey(event.target.value);
                  setAssistantKeySaved(false);
                }}
                onBlur={saveAssistantKeyFromField}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={loadAssistantModels}
                disabled={assistantModelLoading || !assistantEndpoint.trim()}
              >
                {assistantModelLoading ? 'Loading Models' : 'Load Models'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={forgetAssistantKey}
                disabled={!assistantKeySaved && !assistantApiKey.trim()}
              >
                Forget Key
              </Button>
              <span className="text-sm text-text-secondary">
                {assistantModelError ||
                  (assistantKeySaved
                    ? 'API key saved in OS keychain.'
                    : 'API key saves to OS keychain on blur, model load, or draft.')}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap min-w-0">
        <div className="min-w-0 flex-1">
          <div className="font-header font-semibold text-base">Ordered Rules</div>
          <div className="text-sm text-text-secondary">
            Rules are evaluated top to bottom. Disable ask-only rules when you want files to move.
          </div>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus size={16} weight="light" />}
          onClick={addRule}
          disabled={!workspaceId || loading}
          className="flex-shrink-0"
        >
          Add Rule
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {rules.map((rule, index) => {
          const collapsed = collapsedRuleIds.has(rule.id);
          const compactInput = 'text-xs px-2.5 py-1.5';
          return (
            <div key={rule.id} className="kd-card p-3">
              <div className="flex items-center gap-2 min-w-0">
                <IconButton
                  label={collapsed ? `Expand ${rule.name}` : `Collapse ${rule.name}`}
                  aria-expanded={!collapsed}
                  aria-controls={`${rule.id}-body`}
                  onClick={() => toggleRuleCollapsed(rule.id)}
                  className="flex-shrink-0 -ml-1"
                >
                  <CaretDown
                    size={15}
                    weight="light"
                    className={cn(
                      'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                      collapsed && '-rotate-90'
                    )}
                  />
                </IconButton>
                <Switch
                  checked={rule.enabled}
                  onChange={(event) =>
                    updateRule(rule.id, (item) => ({ ...item, enabled: event.target.checked }))
                  }
                  aria-label={`Enable ${rule.name}`}
                />
                {collapsed ? (
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-header font-semibold text-sm truncate flex-shrink-0 max-w-[40%]">
                      {rule.name}
                    </span>
                    <RuleSummary rule={rule} />
                  </div>
                ) : (
                  <Input
                    value={rule.name}
                    onChange={(event) => updateRule(rule.id, (item) => ({ ...item, name: event.target.value }))}
                    aria-label="Rule name"
                    placeholder="Rule name"
                    className="flex-1 min-w-0"
                    inputClassName={compactInput}
                  />
                )}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <IconButton
                    label={`Move ${rule.name} up`}
                    disabled={index === 0}
                    onClick={() => moveRule(rule.id, -1)}
                  >
                    <ArrowUp size={15} weight="light" />
                  </IconButton>
                  <IconButton
                    label={`Move ${rule.name} down`}
                    disabled={index === rules.length - 1}
                    onClick={() => moveRule(rule.id, 1)}
                  >
                    <ArrowDown size={15} weight="light" />
                  </IconButton>
                  <IconButton label={`Duplicate ${rule.name}`} onClick={() => duplicateRule(rule.id)}>
                    <Copy size={15} weight="light" />
                  </IconButton>
                  <IconButton label={`Delete ${rule.name}`} onClick={() => removeRule(rule.id)}>
                    <Trash size={15} weight="light" />
                  </IconButton>
                </div>
              </div>

              <div
                id={`${rule.id}-body`}
                className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                style={{ gridTemplateRows: collapsed ? '0fr' : '1fr' }}
              >
                <div className="overflow-hidden min-h-0" style={{ visibility: collapsed ? 'hidden' : 'visible' }}>
                  <div className="mt-2.5 flex flex-col gap-2.5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input
                        value={rule.match.nameContains || ''}
                        onChange={(event) =>
                          updateRule(rule.id, (item) => ({
                            ...item,
                            match: { ...item.match, nameContains: event.target.value || undefined },
                          }))
                        }
                        aria-label={`Name contains for ${rule.name}`}
                        placeholder="name contains"
                        inputClassName={compactInput}
                      />
                      <Input
                        value={(rule.match.extensionIn || []).join(', ')}
                        onChange={(event) =>
                          updateRule(rule.id, (item) => ({
                            ...item,
                            match: { ...item.match, extensionIn: parseExtensions(event.target.value) },
                          }))
                        }
                        aria-label={`Extensions for ${rule.name}`}
                        placeholder="ext: pdf, png"
                        inputClassName={compactInput}
                      />
                      <Input
                        value={rule.match.sourceUrlContains || ''}
                        onChange={(event) =>
                          updateRule(rule.id, (item) => ({
                            ...item,
                            match: { ...item.match, sourceUrlContains: event.target.value || undefined },
                          }))
                        }
                        aria-label={`Source URL contains for ${rule.name}`}
                        placeholder="source url contains"
                        inputClassName={compactInput}
                      />
                      <Input
                        value={rule.match.downloadedFromContains || ''}
                        onChange={(event) =>
                          updateRule(rule.id, (item) => ({
                            ...item,
                            match: { ...item.match, downloadedFromContains: event.target.value || undefined },
                          }))
                        }
                        aria-label={`Downloaded from contains for ${rule.name}`}
                        placeholder="downloaded from"
                        inputClassName={compactInput}
                      />
                      <Input
                        value={rule.action.targetFolder || ''}
                        onChange={(event) =>
                          updateRule(rule.id, (item) => ({
                            ...item,
                            action: { ...item.action, targetFolder: event.target.value || undefined },
                          }))
                        }
                        aria-label={`Target folder for ${rule.name}`}
                        placeholder="→ folder"
                        inputClassName={compactInput}
                      />
                      <Input
                        value={rule.action.targetNameTemplate || ''}
                        onChange={(event) =>
                          updateRule(rule.id, (item) => ({
                            ...item,
                            action: { ...item.action, targetNameTemplate: event.target.value || undefined },
                          }))
                        }
                        aria-label={`Target name template for ${rule.name}`}
                        placeholder="name: {date}-{basename}.{ext}"
                        inputClassName={compactInput}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <Checkbox
                        checked={rule.action.ask === true}
                        onChange={(event) =>
                          updateRule(rule.id, (item) => ({
                            ...item,
                            action: { ...item.action, ask: event.target.checked },
                          }))
                        }
                        label="Ask before acting"
                      />
                      <Checkbox
                        checked={rule.stopOnMatch}
                        onChange={(event) =>
                          updateRule(rule.id, (item) => ({ ...item, stopOnMatch: event.target.checked }))
                        }
                        label="Stop after match"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && rules.length === 0 && (
        <div className="max-w-[420px] border-t border-border pt-4 mt-2">
          <div className="font-header font-semibold text-sm">No rules yet</div>
          <div className="text-sm text-text-secondary mt-1 leading-relaxed">
            Draft rules with the assistant, then enable only the ones you trust.
          </div>
        </div>
      )}

      {showQueue && (
        <>
          <div className="h-px bg-black/[0.08] dark:bg-white/[0.08]" />
          <div className="font-header font-semibold text-base mb-1">Dry-run Queue</div>
          <RuleActionsQueue workspaceId={workspaceId} embedded />
        </>
      )}
    </div>
  );
};

function RuleSummary({ rule }: { rule: FileRule }) {
  const match = rule.match;
  const matchParts: string[] = [];
  if (match.extensionIn && match.extensionIn.length) matchParts.push(match.extensionIn.join(', '));
  if (match.nameContains) matchParts.push(`name~${match.nameContains}`);
  if (match.sourceUrlContains) matchParts.push(`url~${match.sourceUrlContains}`);
  if (match.downloadedFromContains) matchParts.push(`from~${match.downloadedFromContains}`);
  const matchText = matchParts.length ? matchParts.join(' · ') : 'matches anything';
  const target = rule.action.targetFolder || '(ask)';
  const template = rule.action.targetNameTemplate ? ` · ${rule.action.targetNameTemplate}` : '';
  const flags: string[] = [];
  if (rule.action.ask) flags.push('ask');
  if (rule.stopOnMatch) flags.push('stop');
  return (
    <div className="flex items-center gap-2 min-w-0 font-mono text-[11px] text-text-secondary">
      <span className="truncate flex-1 min-w-0">
        {matchText} <span className="text-accent">→</span> {target}{template}
      </span>
      {flags.map((flag) => (
        <span
          key={flag}
          className="flex-shrink-0 rounded-[var(--radius-sm)] bg-black/[0.05] dark:bg-white/[0.08] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em]"
        >
          {flag}
        </span>
      ))}
    </div>
  );
}

function ListChecksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l2 2 4-4" />
      <path d="M9 13l2 2 4-4" />
      <path d="M4 6h3M4 12h3M4 18h14" />
    </svg>
  );
}

export default AutomationRulesSettings;
