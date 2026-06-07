import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Sidebar from "./components/Sidebar";
import TitleBar from "./components/TitleBar";
import DirectoryExplorer from "./components/DirectoryExplorer";
import { WorkspaceProvider, useWorkspace } from "./contexts/WorkspaceContext";
import { OperationHistoryProvider } from "./contexts/OperationHistoryContext";
import { UpdateProvider } from "./contexts/UpdateContext";
import { ToastProvider } from "./components/ToastNotification";
import AutoUpdater from "./components/AutoUpdater";
import { SelectChangeEvent } from "@mui/material";
import Settings from "./components/Settings";
import { useGlobalKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import AppCommandBar from "./components/AppCommandBar";

export const DEFAULT_MONO_ACCENT_COLOR = "#525252";

export const getTheme = (
  darkMode: boolean,
  accentColor: string = DEFAULT_MONO_ACCENT_COLOR,
  workspaceTheme?: any,
) => {
  // Generate light and dark variants of the accent color
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 82, g: 82, b: 82 };
  };

  // Validate and sanitize color input
  const isValidHexColor = (color: string) => {
    return /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.test(color);
  };

  const sanitizedAccentColor = isValidHexColor(accentColor)
    ? accentColor
    : DEFAULT_MONO_ACCENT_COLOR;
  const workspaceAccentColor = workspaceTheme?.accentColor;
  const sanitizedWorkspaceAccentColor =
    workspaceAccentColor && isValidHexColor(workspaceAccentColor)
      ? workspaceAccentColor
      : sanitizedAccentColor;
  const finalAccentColor = sanitizedWorkspaceAccentColor;
  const finalDarkMode =
    workspaceTheme?.darkMode !== undefined ? workspaceTheme.darkMode : darkMode;
  const customColors = workspaceTheme?.customColors || {};
  const sanitizedCustomPrimary =
    customColors.primary && isValidHexColor(customColors.primary)
      ? customColors.primary
      : undefined;
  const primaryBaseColor = sanitizedCustomPrimary || finalAccentColor;

  const usesDefaultMonoAccent =
    !sanitizedCustomPrimary &&
    finalAccentColor.toLowerCase() === DEFAULT_MONO_ACCENT_COLOR.toLowerCase();
  const { r: finalR, g: finalG, b: finalB } = hexToRgb(primaryBaseColor);
  const finalLightVariant = `rgb(${Math.min(255, finalR + 40)}, ${Math.min(255, finalG + 40)}, ${Math.min(255, finalB + 40)})`;
  const finalDarkVariant = `rgb(${Math.max(0, finalR - 40)}, ${Math.max(0, finalG - 40)}, ${Math.max(0, finalB - 40)})`;
  const monoPrimary = finalDarkMode
    ? {
        main: "#E5E5E5",
        light: "#FAFAFA",
        dark: "#A3A3A3",
        contrastText: "#111111",
      }
    : {
        main: DEFAULT_MONO_ACCENT_COLOR,
        light: "#737373",
        dark: "#262626",
        contrastText: "#FFFFFF",
      };

  return createTheme({
    palette: {
      mode: finalDarkMode ? "dark" : "light",
      primary: {
        ...(usesDefaultMonoAccent
          ? monoPrimary
          : {
              main: primaryBaseColor,
              light: finalLightVariant,
              dark: finalDarkVariant,
              contrastText: "#FFFFFF",
            }),
      },
      background: {
        default:
          customColors.background || (finalDarkMode ? "#151515" : "#F7F7F7"),
        paper: customColors.surface || (finalDarkMode ? "#1F1F1F" : "#FFFFFF"),
      },
      text: {
        primary: finalDarkMode ? "#F5F5F5" : "#111111",
        secondary: finalDarkMode ? "#A3A3A3" : "#626262",
      },
      divider: finalDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
      success: {
        main: "#16A34A",
        light: "#4ADE80",
        dark: "#15803D",
        contrastText: "#FFFFFF",
      },
      error: {
        main: "#DC2626",
        light: "#F87171",
        dark: "#991B1B",
        contrastText: "#FFFFFF",
      },
      warning: {
        main: "#D97706",
        light: "#FBBF24",
        dark: "#92400E",
        contrastText: "#111111",
      },
      action: {
        disabledBackground: finalDarkMode
          ? "rgba(255,255,255,0.08)"
          : "rgba(0,0,0,0.08)",
      },
    },
    typography: {
      fontFamily: "var(--font-body)",
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 800,
      h1: { fontFamily: "var(--font-header)", fontWeight: 900 },
      h2: { fontFamily: "var(--font-header)", fontWeight: 900 },
      h3: { fontFamily: "var(--font-header)", fontWeight: 800 },
      h4: { fontFamily: "var(--font-header)", fontWeight: 800 },
      h5: {
        fontFamily: "var(--font-header)",
        fontWeight: 800,
        fontSize: "1.5rem",
      },
      h6: {
        fontFamily: "var(--font-header)",
        fontWeight: 700,
      },
      subtitle1: {
        fontWeight: 600,
      },
      subtitle2: {
        fontWeight: 600,
      },
      button: {
        fontFamily: "var(--font-header)",
        fontWeight: 600,
      },
    },
    shape: {
      borderRadius: 4,
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: "none",
            backgroundImage: "none",
            transition: "background-color 0.16s, border-color 0.16s",
            "&:hover": {
              boxShadow: "none",
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              backgroundColor: finalDarkMode
                ? "rgba(255,255,255,0.04)"
                : "#ffffff",
            },
            "& .MuiInputBase-input": {
              fontFamily: "var(--font-body)",
            },
            "& .MuiInputLabel-root": {
              fontFamily: "var(--font-body)",
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 1.5,
            textTransform: "none",
            fontWeight: 500,
            fontFamily: "var(--font-header)",
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          select: {
            fontFamily: "var(--font-body)",
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontFamily: "var(--font-body)",
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontFamily: "var(--font-header)",
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor:
              customColors.background ||
              (finalDarkMode ? "#151515" : "#F7F7F7"),
          },
        },
      },
    },
  });
};

interface AppSettings {
  apiKeys: {
    openai?: string;
    anthropic?: string;
    google?: string;
    openrouter?: string;
  };
  selectedProvider: string;
  selectedModel: string;
  renameFiles: boolean;
  accentColor?: string;
}

interface SettingsResponse {
  settings?: AppSettings;
  error?: string;
  success?: boolean;
}

const defaultSettings: AppSettings = {
  apiKeys: {},
  selectedProvider: "google",
  selectedModel: "gemini-2.0-flash-exp",
  renameFiles: false,
  accentColor: DEFAULT_MONO_ACCENT_COLOR,
};

// Inner component that has access to workspace context
const AppContent: React.FC = () => {
  const { workspaceTheme } = useWorkspace();
  useGlobalKeyboardShortcuts();
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [settingsTab, setSettingsTab] = useState("general");

  // Load initial provider and model from settings
  useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        const result =
          (await window.electronAPI.loadSettings()) as SettingsResponse;
        const settings = result.settings || defaultSettings;
        setSelectedProvider(settings.selectedProvider);
        setSelectedModel(settings.selectedModel);
        if (settings.accentColor) {
          setAccentColor(settings.accentColor);
          localStorage.setItem("accentColor", settings.accentColor);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
        setSelectedProvider(defaultSettings.selectedProvider);
        setSelectedModel(defaultSettings.selectedModel);
      }
    };
    loadInitialSettings();
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [models, setModels] = useState<
    Array<{ name: string; status?: string; description?: string }>
  >([]);
  const [, setOllamaModels] = useState<Array<{ name: string }>>([]);
  const [isOllamaAvailable, setIsOllamaAvailable] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem("darkMode");
    return savedMode === "true";
  });
  const [accentColor, setAccentColor] = useState(() => {
    const savedColor = localStorage.getItem("accentColor");
    return savedColor || DEFAULT_MONO_ACCENT_COLOR;
  });
  const [searchTerm, setSearchTerm] = useState("");
  const theme = useMemo(
    () => getTheme(darkMode, accentColor, workspaceTheme),
    [darkMode, accentColor, workspaceTheme],
  );
  
  // Compute effective dark mode - workspace theme overrides global setting
  const effectiveDarkMode = workspaceTheme?.darkMode !== undefined 
    ? workspaceTheme.darkMode 
    : darkMode;
  const [filters, setFilters] = useState<{
    type: string;
    date: string;
    size: string;
  }>({ type: "any", date: "any", size: "any" });

  // Add help shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "?" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        // Don't trigger when typing in input fields
        const target = event.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.contentEditable === "true"
        ) {
          return;
        }
        event.preventDefault();
        setSettingsTab("shortcuts");
        setSettingsOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchOllamaModels = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    try {
      const response = await fetch("http://localhost:11434/api/tags", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      const modelList = data.models.map((model: { name: string }) => ({
        name: model.name,
        status: "ready",
      }));
      setOllamaModels(modelList);
      setIsOllamaAvailable(true);
      return modelList;
    } catch {
      clearTimeout(timeoutId);
      setIsOllamaAvailable(false);
      return [];
    }
  }, []);

  const mapModelNames = useCallback((
    modelNames: string[],
    status: "ready" = "ready",
  ) => {
    return modelNames.map((name) => ({ name, status }));
  }, []);

  const resolveDefaultModel = useCallback((
    modelNames: string[],
    preferred?: string,
  ): string => {
    if (preferred && modelNames.includes(preferred)) {
      return preferred;
    }
    return modelNames[0] || "";
  }, []);

  const fetchProviderModels = useCallback(async (provider: string) => {
    if (provider === "ollama") {
      const ollamaModelList = await fetchOllamaModels();
      const modelNames = ollamaModelList.map((model: { name: string }) => model.name);
      return {
        models: ollamaModelList,
        defaultModel: resolveDefaultModel(modelNames),
      };
    }

    const result = await window.electronAPI.getProviderModels(provider);
    if (result.error) {
      throw new Error(result.error);
    }

    const modelNames = result.models || [];
    return {
      models: mapModelNames(modelNames),
      defaultModel: resolveDefaultModel(modelNames, result.defaultModel),
    };
  }, [fetchOllamaModels, mapModelNames, resolveDefaultModel]);

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 2;
    const retryInterval = 2000;

    const checkOllama = async () => {
      const result = await fetchOllamaModels();
      if (result.length === 0 && retryCount < maxRetries) {
        retryCount++;
        setTimeout(checkOllama, retryInterval);
      }
    };

    checkOllama();
  }, [fetchOllamaModels]);

  // Initialize models for selected provider on mount
  useEffect(() => {
    const initializeModels = async () => {
      setIsLoading(true);
      try {
        const result =
          (await window.electronAPI.loadSettings()) as SettingsResponse;
        const settings = result.settings || defaultSettings;
        const { models: newModels, defaultModel } =
          await fetchProviderModels(selectedProvider);
        setModels(newModels);

        if (
          defaultModel &&
          (!selectedModel || !newModels.some((model: { name: string }) => model.name === selectedModel))
        ) {
          const { apiKeys = {}, renameFiles = false } = settings;
          await window.electronAPI.saveSettings({
            apiKeys,
            selectedProvider,
            selectedModel: defaultModel,
            renameFiles,
          });
          setSelectedModel(defaultModel);
        }
      } catch (error) {
        console.error("Failed to initialize models:", error);
        setModels([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (selectedProvider) {
      initializeModels();
    }
  }, [fetchProviderModels, selectedModel, selectedProvider]);

  const handleProviderChange = async (event: SelectChangeEvent) => {
    const newProvider = event.target.value;
    setIsLoading(true);
    try {
      const result =
        (await window.electronAPI.loadSettings()) as SettingsResponse;
      const settings = result.settings || defaultSettings;

      let newModels: Array<{
        name: string;
        status?: string;
        description?: string;
      }> = [];
      let newModel = "";

      try {
        const providerModels = await fetchProviderModels(newProvider);
        newModels = providerModels.models;
        newModel = providerModels.defaultModel;
      } catch (error) {
        console.error("Failed to load provider models:", error);
      }

      const { apiKeys = {}, renameFiles = false } = settings;
      await window.electronAPI.saveSettings({
        apiKeys,
        selectedProvider: newProvider,
        selectedModel: newModel,
        renameFiles,
      });

      setSelectedProvider(newProvider);
      setModels(newModels);
      setSelectedModel(newModel);
    } catch (error) {
      console.error("Failed to save provider setting:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
  };

  const handleModelChange = async (event: SelectChangeEvent<string>) => {
    const newModel = event.target.value;
    const result = (await window.electronAPI.loadSettings()) as SettingsResponse;
    const currentSettings = result.settings || defaultSettings;
    const { apiKeys = {}, renameFiles = false } = currentSettings;
    await window.electronAPI.saveSettings({
      apiKeys,
      selectedProvider,
      selectedModel: newModel,
      renameFiles,
    });
    setSelectedModel(newModel);
  };

  const handleDarkModeChange = (newDarkMode: boolean) => {
    setDarkMode(newDarkMode);
    localStorage.setItem("darkMode", String(newDarkMode));
  };

  const handleAccentColorChange = (newAccentColor: string) => {
    setAccentColor(newAccentColor);
    localStorage.setItem("accentColor", newAccentColor);
  };

  // Ensure select values are valid against available options
  const validProviders = ["ollama", "openai", "anthropic", "google", "openrouter", "lmstudio"];
  const providerValue = validProviders.includes(selectedProvider)
    ? selectedProvider
    : "";
  const modelValue = models.some((m) => m.name === selectedModel)
    ? selectedModel
    : "";

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          minWidth: 320, // Minimum supported width
          maxWidth: "100vw",
        }}
      >
        <TitleBar />
        <Box
          sx={{
            display: "flex",
            flex: 1,
            minHeight: 0,
            width: "100%",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              display: { xs: "none", sm: "block" },
              flexShrink: 0,
            }}
          >
            <Sidebar
              darkMode={darkMode}
              effectiveDarkMode={effectiveDarkMode}
              onDarkModeChange={handleDarkModeChange}
              accentColor={accentColor}
              onAccentColorChange={handleAccentColorChange}
              isOllamaAvailable={isOllamaAvailable}
              selectedProvider={selectedProvider}
              setSelectedProvider={setSelectedProvider}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              models={models}
              onModelsLoaded={setModels}
            />
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              width: { xs: "100vw", sm: "auto" },
            }}
          >
            <Settings
              open={settingsOpen}
              onClose={handleCloseSettings}
              darkMode={darkMode}
              onDarkModeChange={handleDarkModeChange}
              accentColor={accentColor}
              onAccentColorChange={handleAccentColorChange}
              isOllamaAvailable={isOllamaAvailable}
              initialTab={settingsTab}
            />
            <Box
              component="main"
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                minHeight: 0,
                background: effectiveDarkMode
                  ? "linear-gradient(180deg, #151515 0%, #1C1C1C 100%)"
                  : "linear-gradient(180deg, #F7F7F7 0%, #EDEDED 100%)",
              }}
            >
              <AppCommandBar
                effectiveDarkMode={effectiveDarkMode}
                isLoading={isLoading}
                isOllamaAvailable={isOllamaAvailable}
                providerValue={providerValue}
                modelValue={modelValue}
                models={models}
                searchTerm={searchTerm}
                filters={filters}
                onProviderChange={handleProviderChange}
                onModelChange={handleModelChange}
                onSearchTermChange={setSearchTerm}
                onFiltersChange={setFilters}
              />
              <Box
                sx={{
                  flex: 1,
                  overflow: "hidden",
                  px: 2,
                  pb: 2,
                  minHeight: 0,
                }}
              >
                <DirectoryExplorer searchTerm={searchTerm} filters={filters} />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

const App: React.FC = () => {
  return (
    <WorkspaceProvider>
      <OperationHistoryProvider>
        <UpdateProvider>
          <ToastProvider>
            <AutoUpdater />
            <AppContent />
          </ToastProvider>
        </UpdateProvider>
      </OperationHistoryProvider>
    </WorkspaceProvider>
  );
};

export default App;
