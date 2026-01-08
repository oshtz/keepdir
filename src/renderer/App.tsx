import React, { useState, useEffect, useMemo } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Sidebar from "./components/Sidebar";
import TitleBar from "./components/TitleBar";
import DirectoryExplorer from "./components/DirectoryExplorer";
import CircularProgress from "@mui/material/CircularProgress";
import { WorkspaceProvider, useWorkspace } from "./contexts/WorkspaceContext";
import { OperationHistoryProvider } from "./contexts/OperationHistoryContext";
import { UpdateProvider } from "./contexts/UpdateContext";
import { ToastProvider } from "./components/ToastNotification";
import AutoUpdater from "./components/AutoUpdater";
import {
  SelectChangeEvent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
} from "@mui/material";
import Settings from "./components/Settings";
import { useGlobalKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import SearchIcon from "@mui/icons-material/Search";

const getTheme = (
  darkMode: boolean,
  accentColor: string = "#FF5733",
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
      : { r: 255, g: 87, b: 51 };
  };

  // Validate and sanitize color input
  const isValidHexColor = (color: string) => {
    return /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.test(color);
  };

  const sanitizedAccentColor = isValidHexColor(accentColor)
    ? accentColor
    : "#FF5733";
  const workspaceAccentColor = workspaceTheme?.accentColor;
  const sanitizedWorkspaceAccentColor =
    workspaceAccentColor && isValidHexColor(workspaceAccentColor)
      ? workspaceAccentColor
      : sanitizedAccentColor;
  const finalAccentColor = sanitizedWorkspaceAccentColor;
  const finalDarkMode =
    workspaceTheme?.darkMode !== undefined ? workspaceTheme.darkMode : darkMode;
  const customColors = workspaceTheme?.customColors || {};

  const { r: finalR, g: finalG, b: finalB } = hexToRgb(finalAccentColor);
  const finalLightVariant = `rgb(${Math.min(255, finalR + 40)}, ${Math.min(255, finalG + 40)}, ${Math.min(255, finalB + 40)})`;
  const finalDarkVariant = `rgb(${Math.max(0, finalR - 40)}, ${Math.max(0, finalG - 40)}, ${Math.max(0, finalB - 40)})`;

  return createTheme({
    palette: {
      mode: finalDarkMode ? "dark" : "light",
      primary: {
        main: customColors.primary || finalAccentColor,
        light: finalLightVariant,
        dark: finalDarkVariant,
      },
      background: {
        default:
          customColors.background || (finalDarkMode ? "#1A1A1A" : "#F8F9FA"),
        paper: customColors.surface || (finalDarkMode ? "#2D2D2D" : "#FFFFFF"),
      },
      text: {
        primary: finalDarkMode ? "#FFFFFF" : "#2D3436",
        secondary: finalDarkMode ? "#B0B0B0" : "#636E72",
      },
      success: {
        main: "#00B894",
        light: "#55EFC4",
        dark: "#00A187",
        contrastText: "#FFFFFF",
      },
      error: {
        main: "#FF7675",
        light: "#FFB8B8",
        dark: "#D63031",
        contrastText: "#FFFFFF",
      },
      warning: {
        main: "#FFA502",
        light: "#FFD43B",
        dark: "#E67E22",
        contrastText: "#FFFFFF",
      },
      action: {
        disabledBackground: "rgba(0,0,0,0.08)",
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
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            transition: "transform 0.2s, box-shadow 0.2s",
            "&:hover": {
              transform: "translateY(-2px)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              backgroundColor: finalDarkMode
                ? "rgba(255,255,255,0.05)"
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
              (finalDarkMode ? "#1A1A1A" : "#f8f9fa"),
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
  accentColor: "#FF5733",
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
    return savedColor || "#FF5733";
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

  const fetchOllamaModels = async () => {
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
    } catch (error) {
      clearTimeout(timeoutId);
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.debug("Ollama not available");
      }
      setIsOllamaAvailable(false);
      return [];
    }
  };

  const mapModelNames = (
    modelNames: string[],
    status: "ready" = "ready",
  ) => {
    return modelNames.map((name) => ({ name, status }));
  };

  const resolveDefaultModel = (
    modelNames: string[],
    preferred?: string,
  ): string => {
    if (preferred && modelNames.includes(preferred)) {
      return preferred;
    }
    return modelNames[0] || "";
  };

  const fetchProviderModels = async (provider: string) => {
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
  };

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
  }, []);

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
  }, [selectedProvider]);

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
                  ? "linear-gradient(135deg, rgba(255,87,51,0.05) 0%, rgba(26,26,26,1) 100%)"
                  : "linear-gradient(135deg, rgba(255,87,51,0.03) 0%, rgba(255,255,255,1) 100%)",
              }}
            >
              <Box
                sx={{
                  p: { xs: 1, sm: 2 },
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  backgroundColor: effectiveDarkMode
                    ? "rgba(45,45,45,0.95)"
                    : "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(12px)",
                  flexShrink: 0,
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: { xs: 0.5, sm: 1 },
                    minWidth: 0,
                    width: "100%",
                    overflow: "hidden",
                  }}
                >
                  {/* AI Controls - Priority 1 (always visible) */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: { xs: 0.25, sm: 0.5 },
                      p: { xs: 0.25, sm: 0.5 },
                      borderRadius: 1.5,
                      backgroundColor: effectiveDarkMode
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(0,0,0,0.02)",
                      border: "1px solid",
                      borderColor: effectiveDarkMode
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(0,0,0,0.08)",
                      flexShrink: 0,
                      minWidth: 0,
                    }}
                  >
                    <Box
                      sx={{
                        display: { xs: "none", md: "flex" },
                        alignItems: "center",
                        gap: 0.25,
                        mr: 0.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          backgroundColor: "primary.main",
                          boxShadow: "0 0 4px rgba(255,87,51,0.4)",
                          flexShrink: 0,
                        }}
                      />
                      <Box
                        sx={{
                          fontSize: "0.6rem",
                          fontWeight: 600,
                          color: "text.secondary",
                          fontFamily: "var(--font-header)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        AI ENGINE
                      </Box>
                    </Box>

                    {isLoading ? (
                      <CircularProgress size={14} />
                    ) : (
                      <>
                        <FormControl
                          size="small"
                          sx={{ minWidth: 90, maxWidth: 130 }}
                        >
                          <InputLabel sx={{ fontSize: "0.85rem" }}>
                            Provider
                          </InputLabel>
                          <Select
                            value={providerValue}
                            label="Provider"
                            onChange={handleProviderChange}
                            sx={{
                              minHeight: 40,
                              "& .MuiSelect-select": {
                                fontSize: "0.9rem",
                                py: 0.75,
                              },
                            }}
                          >
                            <MenuItem
                              value="ollama"
                              disabled={!isOllamaAvailable}
                              sx={{ fontSize: "0.65rem" }}
                            >
                              Ollama
                            </MenuItem>
                            <MenuItem
                              value="lmstudio"
                              sx={{ fontSize: "0.65rem" }}
                            >
                              LM Studio
                            </MenuItem>
                            <MenuItem
                              value="openai"
                              sx={{ fontSize: "0.65rem" }}
                            >
                              OpenAI
                            </MenuItem>
                            <MenuItem
                              value="anthropic"
                              sx={{ fontSize: "0.65rem" }}
                            >
                              Anthropic
                            </MenuItem>
                            <MenuItem
                              value="google"
                              sx={{ fontSize: "0.65rem" }}
                            >
                              Google
                            </MenuItem>
                            <MenuItem
                              value="openrouter"
                              sx={{ fontSize: "0.65rem" }}
                            >
                              OpenRouter
                            </MenuItem>
                          </Select>
                        </FormControl>

                        <FormControl
                          size="small"
                          sx={{ minWidth: 120, maxWidth: 180 }}
                        >
                          <InputLabel sx={{ fontSize: "0.85rem" }}>
                            Model
                          </InputLabel>
                          <Select
                            value={modelValue}
                            label="Model"
                            onChange={async (e) => {
                              const newModel = e.target.value;
                              const result =
                                (await window.electronAPI.loadSettings()) as SettingsResponse;
                              const currentSettings =
                                result.settings || defaultSettings;
                              const { apiKeys = {}, renameFiles = false } =
                                currentSettings;
                              await window.electronAPI.saveSettings({
                                apiKeys,
                                selectedProvider,
                                selectedModel: newModel,
                                renameFiles,
                              });
                              setSelectedModel(newModel);
                            }}
                            sx={{
                              minHeight: 40,
                              "& .MuiSelect-select": {
                                fontSize: "0.9rem",
                                py: 0.75,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              },
                            }}
                          >
                            {models.map((model) => (
                              <MenuItem
                                key={model.name}
                                value={model.name}
                                sx={{ fontSize: "0.65rem" }}
                              >
                                {model.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </>
                    )}
                  </Box>

                  {/* Search - Priority 2 (flexible) */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: { xs: 0.25, sm: 0.5 },
                      p: { xs: 0.25, sm: 0.5 },
                      borderRadius: 1.5,
                      backgroundColor: effectiveDarkMode
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(0,0,0,0.02)",
                      border: "1px solid",
                      borderColor: effectiveDarkMode
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(0,0,0,0.08)",
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                    }}
                  >
                    <SearchIcon
                      sx={{
                        fontSize: "0.75rem",
                        color: "primary.main",
                        flexShrink: 0,
                        display: { xs: "none", sm: "block" },
                      }}
                    />
                    <Box
                      sx={{
                        fontSize: "0.6rem",
                        fontWeight: 600,
                        color: "text.secondary",
                        fontFamily: "var(--font-header)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        whiteSpace: "nowrap",
                        mr: 0.5,
                        display: { xs: "none", lg: "block" },
                      }}
                    >
                      SEARCH & FILTER
                    </Box>

                    <TextField
                      size="small"
                      placeholder="Search files and folders..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      sx={{
                        flex: 1,
                        minWidth: 140,
                        "& .MuiOutlinedInput-root": {
                          backgroundColor: effectiveDarkMode
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(255,255,255,0.8)",
                          height: "40px", // Match the increased height of the Select components
                        },
                      }}
                      InputProps={{
                        sx: {
                          height: "40px",
                          "& input": {
                            fontSize: "0.9rem",
                            py: 0.9,
                            height: "auto",
                          },
                        },
                      }}
                    />
                  </Box>

                  {/* Filters - Priority 3 (hide on small screens) */}
                  <Box
                    sx={{
                      display: { xs: "none", lg: "flex" },
                      alignItems: "center",
                      gap: 0.5,
                      p: 0.5,
                      borderRadius: 1.5,
                      backgroundColor: effectiveDarkMode
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(0,0,0,0.02)",
                      border: "1px solid",
                      borderColor: effectiveDarkMode
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(0,0,0,0.08)",
                      flexShrink: 0,
                    }}
                  >
                    <FormControl
                      size="small"
                      sx={{ minWidth: 50, maxWidth: 60 }}
                    >
                      <InputLabel sx={{ fontSize: "0.6rem" }}>Type</InputLabel>
                      <Select
                        value={filters.type}
                        label="Type"
                        onChange={(e) =>
                          setFilters({ ...filters, type: e.target.value })
                        }
                        sx={{
                          "& .MuiSelect-select": {
                            fontSize: "0.6rem",
                            py: 0.25,
                          },
                        }}
                      >
                        <MenuItem value="any" sx={{ fontSize: "0.6rem" }}>
                          Any
                        </MenuItem>
                        <MenuItem value="files" sx={{ fontSize: "0.6rem" }}>
                          Files
                        </MenuItem>
                        <MenuItem value="folders" sx={{ fontSize: "0.6rem" }}>
                          Folders
                        </MenuItem>
                      </Select>
                    </FormControl>

                    <FormControl
                      size="small"
                      sx={{ minWidth: 50, maxWidth: 60 }}
                    >
                      <InputLabel sx={{ fontSize: "0.6rem" }}>Date</InputLabel>
                      <Select
                        value={filters.date}
                        label="Date"
                        onChange={(e) =>
                          setFilters({ ...filters, date: e.target.value })
                        }
                        sx={{
                          "& .MuiSelect-select": {
                            fontSize: "0.6rem",
                            py: 0.25,
                          },
                        }}
                      >
                        <MenuItem value="any" sx={{ fontSize: "0.6rem" }}>
                          Any
                        </MenuItem>
                        <MenuItem value="24h" sx={{ fontSize: "0.6rem" }}>
                          24h
                        </MenuItem>
                        <MenuItem value="7d" sx={{ fontSize: "0.6rem" }}>
                          7d
                        </MenuItem>
                        <MenuItem value="30d" sx={{ fontSize: "0.6rem" }}>
                          30d
                        </MenuItem>
                        <MenuItem value="year" sx={{ fontSize: "0.6rem" }}>
                          Year
                        </MenuItem>
                      </Select>
                    </FormControl>

                    <FormControl
                      size="small"
                      sx={{ minWidth: 50, maxWidth: 60 }}
                    >
                      <InputLabel sx={{ fontSize: "0.6rem" }}>Size</InputLabel>
                      <Select
                        value={filters.size}
                        label="Size"
                        onChange={(e) =>
                          setFilters({ ...filters, size: e.target.value })
                        }
                        sx={{
                          "& .MuiSelect-select": {
                            fontSize: "0.6rem",
                            py: 0.25,
                          },
                        }}
                      >
                        <MenuItem value="any" sx={{ fontSize: "0.6rem" }}>
                          Any
                        </MenuItem>
                        <MenuItem value="lt1" sx={{ fontSize: "0.6rem" }}>
                          &lt;1MB
                        </MenuItem>
                        <MenuItem value="1to10" sx={{ fontSize: "0.6rem" }}>
                          1-10MB
                        </MenuItem>
                        <MenuItem value="10to100" sx={{ fontSize: "0.6rem" }}>
                          10-100MB
                        </MenuItem>
                        <MenuItem value=">100" sx={{ fontSize: "0.6rem" }}>
                          &gt;100MB
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                </Box>
              </Box>
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
