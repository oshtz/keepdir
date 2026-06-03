import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

export interface RenameTemplate {
  id: string;
  name: string;
  description: string;
  pattern: string;
  preview: (filename: string, index?: number) => string;
  icon?: string;
}

// Built-in rename templates
export const builtInTemplates: RenameTemplate[] = [
  {
    id: 'date_prefix',
    name: 'Add Date Prefix',
    description: 'Add current date (YYYY-MM-DD) before filename',
    pattern: '{date}_{filename}',
    icon: 'CalendarToday',
    preview: (filename: string) => {
      const date = new Date().toISOString().split('T')[0];
      return `${date}_${filename}`;
    }
  },
  {
    id: 'date_suffix',
    name: 'Add Date Suffix',
    description: 'Add current date (YYYY-MM-DD) after filename',
    pattern: '{basename}_{date}.{ext}',
    icon: 'CalendarToday',
    preview: (filename: string) => {
      const date = new Date().toISOString().split('T')[0];
      const lastDot = filename.lastIndexOf('.');
      if (lastDot === -1) return `${filename}_${date}`;
      const basename = filename.substring(0, lastDot);
      const ext = filename.substring(lastDot + 1);
      return `${basename}_${date}.${ext}`;
    }
  },
  {
    id: 'lowercase',
    name: 'Lowercase',
    description: 'Convert filename to lowercase',
    pattern: '{filename:lower}',
    icon: 'TextFormat',
    preview: (filename: string) => filename.toLowerCase()
  },
  {
    id: 'uppercase',
    name: 'Uppercase',
    description: 'Convert filename to UPPERCASE',
    pattern: '{filename:upper}',
    icon: 'TextFormat',
    preview: (filename: string) => filename.toUpperCase()
  },
  {
    id: 'title_case',
    name: 'Title Case',
    description: 'Convert filename to Title Case',
    pattern: '{filename:title}',
    icon: 'Title',
    preview: (filename: string) => {
      const lastDot = filename.lastIndexOf('.');
      const basename = lastDot === -1 ? filename : filename.substring(0, lastDot);
      const ext = lastDot === -1 ? '' : filename.substring(lastDot);
      const titleCase = basename
        .replace(/([_-])/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      return titleCase + ext;
    }
  },
  {
    id: 'spaces_to_underscores',
    name: 'Spaces to Underscores',
    description: 'Replace spaces with underscores',
    pattern: '{filename:space_to_underscore}',
    icon: 'SpaceBar',
    preview: (filename: string) => filename.replace(/\s+/g, '_')
  },
  {
    id: 'spaces_to_dashes',
    name: 'Spaces to Dashes',
    description: 'Replace spaces with dashes',
    pattern: '{filename:space_to_dash}',
    icon: 'Remove',
    preview: (filename: string) => filename.replace(/\s+/g, '-')
  },
  {
    id: 'underscores_to_spaces',
    name: 'Underscores to Spaces',
    description: 'Replace underscores with spaces',
    pattern: '{filename:underscore_to_space}',
    icon: 'SpaceBar',
    preview: (filename: string) => filename.replace(/_/g, ' ')
  },
  {
    id: 'strip_punctuation',
    name: 'Strip Punctuation',
    description: 'Remove special characters (keep letters, numbers, dots)',
    pattern: '{filename:strip_punct}',
    icon: 'TextFields',
    preview: (filename: string) => {
      const lastDot = filename.lastIndexOf('.');
      const basename = lastDot === -1 ? filename : filename.substring(0, lastDot);
      const ext = lastDot === -1 ? '' : filename.substring(lastDot);
      const clean = basename.replace(/[^a-zA-Z0-9\s_-]/g, '');
      return clean + ext;
    }
  },
  {
    id: 'add_sequence',
    name: 'Add Sequence Number',
    description: 'Add sequential number prefix (001, 002, ...)',
    pattern: '{seq:3}_{filename}',
    icon: 'FormatListNumbered',
    preview: (filename: string, index: number = 1) => {
      const seq = String(index).padStart(3, '0');
      return `${seq}_${filename}`;
    }
  },
  {
    id: 'remove_numbers',
    name: 'Remove Leading Numbers',
    description: 'Remove leading numbers and separators',
    pattern: '{filename:no_leading_numbers}',
    icon: 'TextFields',
    preview: (filename: string) => {
      return filename.replace(/^[\d\s_-]+/, '');
    }
  },
  {
    id: 'camel_case',
    name: 'CamelCase',
    description: 'Convert to camelCase (remove spaces/underscores)',
    pattern: '{filename:camel}',
    icon: 'TextFormat',
    preview: (filename: string) => {
      const lastDot = filename.lastIndexOf('.');
      const basename = lastDot === -1 ? filename : filename.substring(0, lastDot);
      const ext = lastDot === -1 ? '' : filename.substring(lastDot);
      const camel = basename
        .replace(/([_\s-])/g, ' ')
        .split(' ')
        .map((word, index) => 
          index === 0 
            ? word.toLowerCase() 
            : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join('');
      return camel + ext;
    }
  },
  {
    id: 'snake_case',
    name: 'snake_case',
    description: 'Convert to snake_case (lowercase with underscores)',
    pattern: '{filename:snake}',
    icon: 'TextFormat',
    preview: (filename: string) => {
      const lastDot = filename.lastIndexOf('.');
      const basename = lastDot === -1 ? filename : filename.substring(0, lastDot);
      const ext = lastDot === -1 ? '' : filename.substring(lastDot);
      const snake = basename
        .replace(/([A-Z])/g, '_$1')
        .replace(/[\s-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_/, '')
        .toLowerCase();
      return snake + ext;
    }
  },
  {
    id: 'kebab_case',
    name: 'kebab-case',
    description: 'Convert to kebab-case (lowercase with dashes)',
    pattern: '{filename:kebab}',
    icon: 'TextFormat',
    preview: (filename: string) => {
      const lastDot = filename.lastIndexOf('.');
      const basename = lastDot === -1 ? filename : filename.substring(0, lastDot);
      const ext = lastDot === -1 ? '' : filename.substring(lastDot);
      const kebab = basename
        .replace(/([A-Z])/g, '-$1')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-/, '')
        .toLowerCase();
      return kebab + ext;
    }
  }
];

// Apply a template to multiple files
export const applyTemplate = (
  template: RenameTemplate,
  files: string[],
  options: { customDate?: string; startIndex?: number } = {}
): { original: string; renamed: string }[] => {
  const { startIndex = 1 } = options;
  
  return files.map((file, index) => ({
    original: file,
    renamed: template.preview(file, startIndex + index)
  }));
};

// Hook for managing rename templates
export const useRenameTemplates = () => {
  const [customTemplates, setCustomTemplates] = useState<RenameTemplate[]>([]);
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);
  const templatesLoadedRef = useRef(false);

  // Load custom templates from database-backed settings, then migrate old localStorage data.
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        if (!window.electronAPI?.loadSettings) {
          return;
        }

        const result = await window.electronAPI.loadSettings();
        const settings = (result.settings || {}) as Record<string, any>;
        const hasPersistedTemplates = settings.customRenameTemplates !== undefined && settings.customRenameTemplates !== null;
        const hasPersistedRecent = settings.recentRenameTemplates !== undefined && settings.recentRenameTemplates !== null;
        const savedTemplates = hasPersistedTemplates ? settings.customRenameTemplates : localStorage.getItem('customRenameTemplates');
        const savedRecent = hasPersistedRecent ? settings.recentRenameTemplates : localStorage.getItem('recentRenameTemplates');

        if (savedTemplates) {
          setCustomTemplates(typeof savedTemplates === 'string' ? JSON.parse(savedTemplates) : savedTemplates);
        }
        if (savedRecent) {
          setRecentlyUsed(typeof savedRecent === 'string' ? JSON.parse(savedRecent) : savedRecent);
        }
        const migratedSettings: Record<string, unknown> = {};
        if (!hasPersistedTemplates && localStorage.getItem('customRenameTemplates')) {
          migratedSettings.customRenameTemplates = JSON.parse(localStorage.getItem('customRenameTemplates') || '[]');
        }
        if (!hasPersistedRecent && localStorage.getItem('recentRenameTemplates')) {
          migratedSettings.recentRenameTemplates = JSON.parse(localStorage.getItem('recentRenameTemplates') || '[]');
        }
        if (Object.keys(migratedSettings).length > 0) {
          await window.electronAPI?.saveSettings?.(migratedSettings);
          localStorage.removeItem('customRenameTemplates');
          localStorage.removeItem('recentRenameTemplates');
        }
      } catch (error) {
        console.error('Failed to load custom templates:', error);
      } finally {
        templatesLoadedRef.current = true;
      }
    };

    loadTemplates();
  }, []);

  // Save custom templates to database-backed settings.
  useEffect(() => {
    if (!templatesLoadedRef.current) {
      return;
    }
    if (!window.electronAPI?.saveSettings) {
      return;
    }
    window.electronAPI.saveSettings({ customRenameTemplates: customTemplates }).catch((error) => {
      console.error('Failed to save custom templates:', error);
    });
  }, [customTemplates]);

  // Save recently used templates to database-backed settings.
  useEffect(() => {
    if (!templatesLoadedRef.current) {
      return;
    }
    if (!window.electronAPI?.saveSettings) {
      return;
    }
    window.electronAPI.saveSettings({ recentRenameTemplates: recentlyUsed }).catch((error) => {
      console.error('Failed to save recent templates:', error);
    });
  }, [recentlyUsed]);

  const allTemplates = useMemo(
    () => [...builtInTemplates, ...customTemplates],
    [customTemplates],
  );

  const addCustomTemplate = useCallback((template: Omit<RenameTemplate, 'id'>) => {
    const newTemplate: RenameTemplate = {
      ...template,
      id: `custom_${Date.now()}`
    };
    setCustomTemplates(prev => [...prev, newTemplate]);
    return newTemplate.id;
  }, []);

  const removeCustomTemplate = useCallback((id: string) => {
    setCustomTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateCustomTemplate = useCallback((id: string, updates: Partial<RenameTemplate>) => {
    setCustomTemplates(prev => prev.map(t => 
      t.id === id ? { ...t, ...updates } : t
    ));
  }, []);

  const markAsUsed = useCallback((id: string) => {
    setRecentlyUsed(prev => {
      const filtered = prev.filter(tid => tid !== id);
      return [id, ...filtered].slice(0, 5);
    });
  }, []);

  const getTemplateById = useCallback((id: string): RenameTemplate | undefined => {
    return allTemplates.find(t => t.id === id);
  }, [allTemplates]);

  const getRecentTemplates = useCallback((): RenameTemplate[] => {
    return recentlyUsed
      .map(id => getTemplateById(id))
      .filter((t): t is RenameTemplate => t !== undefined);
  }, [recentlyUsed, getTemplateById]);

  return {
    allTemplates,
    builtInTemplates,
    customTemplates,
    recentlyUsed: getRecentTemplates(),
    addCustomTemplate,
    removeCustomTemplate,
    updateCustomTemplate,
    markAsUsed,
    getTemplateById,
    applyTemplate
  };
};

export default useRenameTemplates;
