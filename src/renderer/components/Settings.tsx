import React, { useState, useEffect, useCallback } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import AddIcon from "@mui/icons-material/Add";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { useWorkspace } from "../contexts/WorkspaceContext";
import SettingsSidepanel from "./SettingsSidepanel";
import WorkspaceShareDialog from "./WorkspaceShareDialog";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import {
  useGlobalKeyboardShortcuts,
  formatShortcut,
} from "../hooks/useKeyboardShortcuts";
import useBackgroundFetch from "../hooks/useBackgroundFetch";
import OperationHistoryPanel from "./OperationHistoryPanel";
import UpdateStatus from "./UpdateStatus";

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  onDarkModeChange: (darkMode: boolean) => void;
  accentColor: string;
  onAccentColorChange: (accentColor: string) => void;
  isOllamaAvailable: boolean;
  initialTab?: string;
}

interface Settings {
  apiKeys: {
    openai?: string;
    anthropic?: string;
    google?: string;
    openrouter?: string;
  };
  selectedProvider?: string;
  selectedModel?: string;
  renameFiles: boolean;
}

const defaultSettings: Settings = {
  apiKeys: {},
  selectedProvider: undefined,
  selectedModel: undefined,
  renameFiles: false,
};

interface SettingsResponse {
  settings?: Settings;
  error?: string;
  success?: boolean;
}

const Settings: React.FC<SettingsProps> = ({
  open,
  onClose,
  darkMode,
  onDarkModeChange,
  accentColor,
  onAccentColorChange,
  isOllamaAvailable,
  initialTab = "general",
}): JSX.Element => {
  const {
    sectionVisibility,
    setSectionVisibility,
    currentWorkspace,
    customSections,
    workspaceTheme,
    setWorkspaceTheme,
    createCustomSection,
    deleteCustomSection,
  } = useWorkspace();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelName, setModelName] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [pullStatus, setPullStatus] = useState("");
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string }>>([]);
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false);
  const [isDeletingOllamaModel, setIsDeletingOllamaModel] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelPendingDelete, setModelPendingDelete] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const { shortcuts } = useGlobalKeyboardShortcuts();
  const [activeTab, setActiveTab] = useState(initialTab);

  // AI Rules & Presets state
  const [aiRules, setAiRules] = useState({
    dateFormat: 'YYYY-MM-DD',
    groupingLogic: 'type',
    exclusionPatterns: [] as string[],
    customPromptPrefix: '',
    preferredNamingConvention: 'kebab-case',
  });
  const [newExclusionPattern, setNewExclusionPattern] = useState("");

  // Load AI rules from localStorage
  useEffect(() => {
    const savedRules = localStorage.getItem('aiRules');
    if (savedRules) {
      try {
        setAiRules(JSON.parse(savedRules));
      } catch (e) {
        console.error('Failed to parse saved AI rules:', e);
      }
    }
  }, []);

  // Save AI rules to localStorage when changed
  const saveAiRules = useCallback((newRules: typeof aiRules) => {
    setAiRules(newRules);
    localStorage.setItem('aiRules', JSON.stringify(newRules));
  }, []);

  const addExclusionPattern = () => {
    if (newExclusionPattern.trim() && !aiRules.exclusionPatterns.includes(newExclusionPattern.trim())) {
      saveAiRules({
        ...aiRules,
        exclusionPatterns: [...aiRules.exclusionPatterns, newExclusionPattern.trim()]
      });
      setNewExclusionPattern("");
    }
  };

  const removeExclusionPattern = (pattern: string) => {
    saveAiRules({
      ...aiRules,
      exclusionPatterns: aiRules.exclusionPatterns.filter(p => p !== pattern)
    });
  };

  // Stable function references for background fetch
  const fetchCacheStats = useCallback(async () => {
    const result = await window.electronAPI.getCacheStats();
    if (result.success) {
      return result.stats;
    }
    throw new Error(result.error || "Failed to fetch cache stats");
  }, []);

  const fetchDatabaseStats = useCallback(async () => {
    const result = await window.electronAPI.getDatabaseStats();
    if (result.success) {
      return result.stats;
    }
    throw new Error(result.error || "Failed to fetch database stats");
  }, []);

  // Background fetch for cache stats
  const {
    loading: cacheStatsLoading,
    refetch: refetchCacheStats,
  } = useBackgroundFetch(fetchCacheStats, {
    interval: 60000, // Refresh every minute
    enabled: open, // Only fetch when settings dialog is open
  });

  // Background fetch for database stats
  const {
    loading: databaseStatsLoading,
    refetch: refetchDatabaseStats,
  } = useBackgroundFetch(fetchDatabaseStats, {
    interval: 60000, // Refresh every minute
    enabled: open, // Only fetch when settings dialog is open
  });

  // Combine loading states for potential future use
  const _isLoadingStats = cacheStatsLoading || databaseStatsLoading;
  void _isLoadingStats; // Suppress unused warning

  useEffect(() => {
    // Subscribe to Ollama model pull progress updates
    const unsubscribe = window.electronAPI.onOllamaModelPullProgress(
      (data: { progress: number; status: string }) => {
        setPullProgress(data.progress);
        setPullStatus(data.status);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const handlePullModel = async () => {
    if (!modelName.trim()) return;

    setIsPulling(true);
    setPullProgress(0);
    setPullStatus("Starting download...");
    setError(null);

    try {
      await window.electronAPI.pullOllamaModel(modelName.trim());
      setPullStatus("Download complete!");
      await loadOllamaModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pull model");
    } finally {
      setIsPulling(false);
    }
  };

  const loadOllamaModels = useCallback(async () => {
    if (!isOllamaAvailable) {
      setOllamaModels([]);
      setIsLoadingOllamaModels(false);
      return;
    }

    setIsLoadingOllamaModels(true);
    setError(null);

    try {
      const result = await window.electronAPI.listOllamaModels();
      if (result.error) {
        setError(result.error);
        setOllamaModels([]);
        return;
      }
      setOllamaModels(result.models || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch Ollama models");
      setOllamaModels([]);
    } finally {
      setIsLoadingOllamaModels(false);
    }
  }, [isOllamaAvailable]);

  const handleDeleteModelRequest = (model: string) => {
    setModelPendingDelete(model);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    if (isDeletingOllamaModel) return;
    setDeleteDialogOpen(false);
    setModelPendingDelete(null);
  };

  const handleConfirmDeleteModel = async () => {
    if (!modelPendingDelete) return;

    setIsDeletingOllamaModel(true);
    setError(null);
    try {
      const result = await window.electronAPI.deleteOllamaModel(modelPendingDelete);
      if (result.error) {
        setError(result.error);
        return;
      }
      await loadOllamaModels();
      setDeleteDialogOpen(false);
      setModelPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete model");
    } finally {
      setIsDeletingOllamaModel(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSaved(false);
      setError(null);
      setActiveTab(initialTab);
      loadSettings();
      loadDatabaseStats();
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (open && activeTab === "providers") {
      loadOllamaModels();
    }
  }, [open, activeTab, loadOllamaModels]);

  const loadDatabaseStats = async () => {
    // Trigger manual refresh of background fetched data
    await Promise.all([refetchCacheStats(), refetchDatabaseStats()]);
  };

  
  const loadSettings = async () => {
    setLoading(true);
    try {
      const result =
        (await window.electronAPI.loadSettings()) as SettingsResponse;
      // Preserve existing settings structure
      setSettings({
        ...defaultSettings,
        ...result.settings,
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const saveResult = await window.electronAPI.saveSettings(settings);
      if (saveResult.success) {
        setSaved(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else if (saveResult.error) {
        setError(saveResult.error);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      setError("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomSection = async () => {
    if (!newSectionName.trim() || !currentWorkspace) return;

    setIsCreatingSection(true);
    try {
      const result = await createCustomSection(currentWorkspace.id, {
        name: newSectionName.trim(),
        items: [],
      });

      if (result.success) {
        setNewSectionName("");
        // Show success message
        console.log("Custom section created successfully");
      } else if (result.error) {
        setError(`Failed to create section: ${result.error}`);
      }
    } catch (error) {
      setError(
        `Failed to create section: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsCreatingSection(false);
    }
  };

  const handleDeleteCustomSection = async (sectionId: string) => {
    try {
      const result = await deleteCustomSection(sectionId);
      if (result.success) {
        console.log("Custom section deleted successfully");
      } else if (result.error) {
        setError(`Failed to delete section: ${result.error}`);
      }
    } catch (error) {
      setError(
        `Failed to delete section: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "general":
        return (
          <Box>
            <Typography
              variant="h6"
              gutterBottom
              sx={{
                mb: 2,
                color: "text.primary",
                fontFamily: "var(--font-header)",
              }}
            >
              Appearance
            </Typography>
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 3 }}
            >
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={darkMode}
                      onChange={(e) => onDarkModeChange(e.target.checked)}
                      color="primary"
                      disabled={workspaceTheme !== null}
                    />
                  }
                  label={
                    <Typography sx={{ fontFamily: "var(--font-body)" }}>
                      Dark Mode
                    </Typography>
                  }
                />
                {workspaceTheme !== null && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      ml: 4,
                      fontFamily: "var(--font-body)",
                      fontStyle: "italic",
                    }}
                  >
                    Overridden by workspace theme. Reset workspace theme in "Workspace Themes" tab to use global setting.
                  </Typography>
                )}
              </Box>

              <Box sx={{ mt: 2 }}>
                <Typography
                  variant="body2"
                  sx={{
                    mb: 1.5,
                    fontFamily: "var(--font-body)",
                    color: "text.secondary",
                  }}
                >
                  Accent Color
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 1,
                    maxWidth: "100%",
                    alignItems: "center",
                    opacity: workspaceTheme !== null ? 0.5 : 1,
                    pointerEvents: workspaceTheme !== null ? "none" : "auto",
                  }}
                >
                  {[
                    "#FF5733",
                    "#E74C3C",
                    "#9B59B6",
                    "#3498DB",
                    "#1ABC9C",
                    "#2ECC71",
                    "#F39C12",
                    "#E67E22",
                    "#34495E",
                    "#95A5A6",
                    "#FF6B9D",
                    "#4ECDC4",
                  ].map((color) => (
                    <Box
                      component="button"
                      type="button"
                      key={color}
                      aria-label={`Set accent color to ${color}`}
                      aria-pressed={accentColor === color}
                      onClick={() => onAccentColorChange(color)}
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        backgroundColor: color,
                        cursor: workspaceTheme !== null ? "not-allowed" : "pointer",
                        border:
                          accentColor === color ? "3px solid" : "2px solid",
                        borderColor:
                          accentColor === color
                            ? "text.primary"
                            : "rgba(0,0,0,0.1)",
                        transition: "all 0.25s ease",
                        position: "relative",
                        padding: 0,
                        outline: "none",
                        "&:hover": {
                          transform: workspaceTheme !== null ? "none" : "scale(1.15)",
                          boxShadow: workspaceTheme !== null ? "none" : `0 6px 20px ${color}60`,
                          borderColor:
                            accentColor === color ? "text.primary" : color,
                        },
                        "&:focus-visible": {
                          outline: "2px solid",
                          outlineColor: "primary.main",
                          outlineOffset: 2,
                        },
                        "&:active": {
                          transform: workspaceTheme !== null ? "none" : "scale(1.05)",
                        },
                        "&::after":
                          accentColor === color
                            ? {
                                content: '"✓"',
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%)",
                                color: "white",
                                fontSize: "14px",
                                fontWeight: "bold",
                                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                              }
                            : {},
                      }}
                    />
                  ))}
                </Box>
                {workspaceTheme !== null && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      mt: 1,
                      fontFamily: "var(--font-body)",
                      fontStyle: "italic",
                    }}
                  >
                    Overridden by workspace theme.
                  </Typography>
                )}
              </Box>
            </Box>

            <Typography
              variant="h6"
              gutterBottom
              sx={{
                mb: 2,
                color: "text.primary",
                fontFamily: "var(--font-header)",
              }}
            >
              Sidebar Sections
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, fontFamily: "var(--font-body)" }}
            >
              Choose which sections to display in the sidebar
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {["workspaces", "recent", "favorites"].map((section) => (
                <FormControlLabel
                  key={section}
                  control={
                    <Checkbox
                      size="small"
                      checked={sectionVisibility[section] !== false}
                      onChange={(e) =>
                        setSectionVisibility(section, e.target.checked)
                      }
                      color="primary"
                    />
                  }
                  label={
                    <Typography sx={{ fontFamily: "var(--font-body)" }}>
                      {section.charAt(0).toUpperCase() + section.slice(1)}
                    </Typography>
                  }
                />
              ))}
            </Box>
          </Box>
        );

      case "themes":
        return (
          <Box>
            <Typography
              variant="h6"
              gutterBottom
              sx={{
                mb: 2,
                color: "text.primary",
                fontFamily: "var(--font-header)",
              }}
            >
              Custom Workspace Theme
            </Typography>

            {currentWorkspace ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box>
                  <Typography
                    variant="body1"
                    sx={{
                      mb: 2,
                      fontFamily: "var(--font-body)",
                      fontWeight: 500,
                    }}
                  >
                    Theme for "{currentWorkspace.name}"
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2, fontFamily: "var(--font-body)" }}
                  >
                    Customize the appearance of this workspace. These settings
                    will override global theme settings.
                  </Typography>

                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                      mb: 2,
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Switch
                          checked={workspaceTheme?.darkMode ?? darkMode}
                          onChange={(e) => {
                            const newTheme = {
                              name: `${currentWorkspace.name} Theme`,
                              accentColor:
                                workspaceTheme?.accentColor || accentColor,
                              darkMode: e.target.checked,
                              customColors: workspaceTheme?.customColors || {},
                            };
                            setWorkspaceTheme(newTheme);
                          }}
                          color="primary"
                        />
                      }
                      label={
                        <Typography sx={{ fontFamily: "var(--font-body)" }}>
                          Dark Mode (Workspace Override)
                        </Typography>
                      }
                    />

                    <Box sx={{ mt: 2 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          mb: 1.5,
                          fontFamily: "var(--font-body)",
                          color: "text.secondary",
                        }}
                      >
                        Workspace Accent Color
                      </Typography>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "repeat(12, 1fr)",
                          gap: 1,
                          maxWidth: "100%",
                          alignItems: "center",
                        }}
                      >
                        {[
                          "#FF5733",
                          "#E74C3C",
                          "#9B59B6",
                          "#3498DB",
                          "#1ABC9C",
                          "#2ECC71",
                          "#F39C12",
                          "#E67E22",
                          "#34495E",
                          "#95A5A6",
                          "#FF6B9D",
                          "#4ECDC4",
                          "#8E44AD",
                          "#2980B9",
                          "#27AE60",
                          "#F1C40F",
                        ].map((color) => (
                          <Box
                            component="button"
                            type="button"
                            key={color}
                            aria-label={`Set workspace accent color to ${color}`}
                            aria-pressed={
                              (workspaceTheme?.accentColor || accentColor) ===
                              color
                            }
                            onClick={() => {
                              const newTheme = {
                                name: `${currentWorkspace.name} Theme`,
                                accentColor: color,
                                darkMode: workspaceTheme?.darkMode ?? darkMode,
                                customColors:
                                  workspaceTheme?.customColors || {},
                              };
                              setWorkspaceTheme(newTheme);
                            }}
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              backgroundColor: color,
                              cursor: "pointer",
                              border:
                                (workspaceTheme?.accentColor || accentColor) ===
                                color
                                  ? "3px solid"
                                  : "2px solid",
                              borderColor:
                                (workspaceTheme?.accentColor || accentColor) ===
                                color
                                  ? "text.primary"
                                  : "rgba(0,0,0,0.1)",
                              transition: "all 0.25s ease",
                              position: "relative",
                              padding: 0,
                              outline: "none",
                              "&:hover": {
                                transform: "scale(1.15)",
                                boxShadow: `0 6px 20px ${color}60`,
                                borderColor:
                                  (workspaceTheme?.accentColor ||
                                    accentColor) === color
                                    ? "text.primary"
                                    : color,
                              },
                              "&:focus-visible": {
                                outline: "2px solid",
                                outlineColor: "primary.main",
                                outlineOffset: 2,
                              },
                              "&:active": {
                                transform: "scale(1.05)",
                              },
                              "&::after":
                                (workspaceTheme?.accentColor || accentColor) ===
                                color
                                  ? {
                                      content: '"✓"',
                                      position: "absolute",
                                      top: "50%",
                                      left: "50%",
                                      transform: "translate(-50%, -50%)",
                                      color: "white",
                                      fontSize: "14px",
                                      fontWeight: "bold",
                                      textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                                    }
                                  : {},
                            }}
                          />
                        ))}
                      </Box>
                    </Box>
                  </Box>

                  <Box
                    sx={{ display: "flex", gap: 2, mt: 3, flexWrap: "wrap" }}
                  >
                    <Button
                      className="enhanced-button"
                      variant="outlined"
                      onClick={() => {
                        if (currentWorkspace) {
                          // Clear workspace theme override to use global settings
                          setWorkspaceTheme(null);
                        }
                      }}
                      sx={{
                        fontFamily: "var(--font-header)",
                        borderRadius: 1.5,
                        px: 3,
                      }}
                    >
                      Reset to Global Theme
                    </Button>
                    <Button
                      className="enhanced-button"
                      variant="contained"
                      onClick={() => {
                        // Theme is automatically saved via setWorkspaceTheme
                        console.log("Workspace theme saved");
                      }}
                      sx={{
                        fontFamily: "var(--font-header)",
                        borderRadius: 1.5,
                        px: 3,
                      }}
                    >
                      Apply Theme
                    </Button>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontFamily: "var(--font-body)", fontStyle: "italic" }}
              >
                No workspace selected
              </Typography>
            )}
          </Box>
        );

      case "workspace":
        return (
          <Box>
            <Typography
              variant="h6"
              gutterBottom
              sx={{
                mb: 2,
                color: "text.primary",
                fontFamily: "var(--font-header)",
              }}
            >
              Workspace Management
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box>
                <Typography
                  variant="body1"
                  sx={{
                    mb: 2,
                    fontFamily: "var(--font-body)",
                    fontWeight: 500,
                  }}
                >
                  Export/Import Workspace
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2, fontFamily: "var(--font-body)" }}
                >
                  Export your current workspace settings or import a workspace
                  from a file
                </Typography>
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                  <Button
                    variant="outlined"
                    onClick={async () => {
                      if (!currentWorkspace) return;
                      try {
                        const result = await window.electronAPI.exportWorkspace(
                          currentWorkspace.id,
                        );
                        if (result.success) {
                          // Show success message
                          console.log("Workspace exported successfully");
                        } else if (result.error) {
                          setError(`Export failed: ${result.error}`);
                        }
                      } catch (error) {
                        setError(
                          `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                        );
                      }
                    }}
                    disabled={!currentWorkspace}
                    sx={{ fontFamily: "var(--font-header)" }}
                  >
                    Export Current Workspace
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={async () => {
                      try {
                        const result = await window.electronAPI.importWorkspace(
                          { generateNewId: true },
                        );
                        if (result.success) {
                          // Show success message
                          console.log("Workspace imported successfully");
                        } else if (result.error) {
                          setError(`Import failed: ${result.error}`);
                        }
                      } catch (error) {
                        setError(
                          `Import failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                        );
                      }
                    }}
                    sx={{ fontFamily: "var(--font-header)" }}
                  >
                    Import Workspace
                  </Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => setShareDialogOpen(true)}
                    disabled={!currentWorkspace}
                    sx={{ fontFamily: "var(--font-header)" }}
                  >
                    Share Workspace
                  </Button>
                </Box>
              </Box>

              <Box>
                <Typography
                  variant="body1"
                  sx={{
                    mb: 2,
                    fontFamily: "var(--font-body)",
                    fontWeight: 500,
                  }}
                >
                  Backup & Restore
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2, fontFamily: "var(--font-body)" }}
                >
                  Create a complete backup of all your data or restore from a
                  backup file
                </Typography>
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      try {
                        const result = await window.electronAPI.exportAllData();
                        if (result.success) {
                          // Show success message
                          console.log("Backup created successfully");
                        } else if (result.error) {
                          setError(`Backup failed: ${result.error}`);
                        }
                      } catch (error) {
                        setError(
                          `Backup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                        );
                      }
                    }}
                    sx={{ fontFamily: "var(--font-header)" }}
                  >
                    Create Backup
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    onClick={async () => {
                      try {
                        const result = await window.electronAPI.importAllData({
                          overwriteExisting: true,
                        });
                        if (result.success) {
                          // Show success message
                          console.log("Data restored successfully");
                        } else if (result.error) {
                          setError(`Restore failed: ${result.error}`);
                        }
                      } catch (error) {
                        setError(
                          `Restore failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                        );
                      }
                    }}
                    sx={{ fontFamily: "var(--font-header)" }}
                  >
                    Restore from Backup
                  </Button>
                </Box>
              </Box>
            </Box>
          </Box>
        );

      case "sections":
        return (
          <Box>
            <Typography
              variant="h6"
              gutterBottom
              sx={{
                mb: 2,
                color: "text.primary",
                fontFamily: "var(--font-header)",
              }}
            >
              Custom Sidebar Sections
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box>
                <Typography
                  variant="body1"
                  sx={{
                    mb: 2,
                    fontFamily: "var(--font-body)",
                    fontWeight: 500,
                  }}
                >
                  Create New Section
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2, fontFamily: "var(--font-body)" }}
                >
                  Add custom sections to organize your folders and files
                </Typography>
                <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-end" }}>
                  <TextField
                    label="Section Name"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="e.g., Projects, Documents"
                    size="small"
                    disabled={isCreatingSection || !currentWorkspace}
                    sx={{
                      flex: 1,
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 1.5,
                        backgroundColor: "background.paper",
                        "&:hover": {
                          backgroundColor: "background.default",
                        },
                      },
                      "& .MuiInputBase-input": {
                        fontFamily: "var(--font-body)",
                      },
                      "& .MuiInputLabel-root": {
                        fontFamily: "var(--font-body)",
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleCreateCustomSection}
                    disabled={
                      !newSectionName.trim() ||
                      isCreatingSection ||
                      !currentWorkspace
                    }
                    startIcon={
                      isCreatingSection ? <CircularProgress size={16} /> : null
                    }
                    sx={{ fontFamily: "var(--font-header)" }}
                  >
                    Create
                  </Button>
                </Box>
              </Box>

              <Divider />

              <Box>
                <Typography
                  variant="body1"
                  sx={{
                    mb: 2,
                    fontFamily: "var(--font-body)",
                    fontWeight: 500,
                  }}
                >
                  Existing Sections
                </Typography>
                {customSections.length === 0 ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontFamily: "var(--font-body)", fontStyle: "italic" }}
                  >
                    No custom sections created yet
                  </Typography>
                ) : (
                  <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    {customSections.map((section) => (
                      <Box
                        key={section.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          p: 2,
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 1.5,
                          backgroundColor: "background.paper",
                        }}
                      >
                        <Box>
                          <Typography
                            variant="body1"
                            sx={{
                              fontFamily: "var(--font-body)",
                              fontWeight: 500,
                            }}
                          >
                            {section.name}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ fontFamily: "var(--font-body)" }}
                          >
                            {section.items?.length || 0} items
                          </Typography>
                        </Box>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleDeleteCustomSection(section.id)}
                          sx={{ fontFamily: "var(--font-header)" }}
                        >
                          Delete
                        </Button>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        );

      case "providers":
        return (
          <Box>
            <Typography
              variant="h6"
              gutterBottom
              sx={{
                mb: 2,
                color: "text.primary",
                fontFamily: "var(--font-header)",
              }}
            >
              AI Providers
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 3, fontFamily: "var(--font-body)" }}
            >
              Configure API keys for cloud providers and manage local AI models.
            </Typography>

            {/* Cloud Providers Section */}
            <Typography
              variant="subtitle1"
              sx={{
                mb: 2,
                fontFamily: "var(--font-header)",
                fontWeight: 600,
              }}
            >
              Cloud Providers
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 4 }}>
              <TextField
                className="enhanced-input"
                label="OpenAI API Key"
                value={settings.apiKeys.openai || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    apiKeys: { ...settings.apiKeys, openai: e.target.value },
                  })
                }
                type="password"
                fullWidth
                size="small"
                placeholder="sk-..."
                helperText="For GPT-4o, GPT-4o-mini models"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    backgroundColor: "background.paper",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      backgroundColor: "background.default",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    },
                    "&.Mui-focused": {
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    },
                  },
                  "& .MuiInputBase-input": {
                    fontFamily: "var(--font-body)",
                  },
                  "& .MuiInputLabel-root": {
                    fontFamily: "var(--font-body)",
                  },
                }}
              />
              <TextField
                className="enhanced-input"
                label="Anthropic API Key"
                value={settings.apiKeys.anthropic || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    apiKeys: { ...settings.apiKeys, anthropic: e.target.value },
                  })
                }
                type="password"
                fullWidth
                size="small"
                placeholder="sk-ant-..."
                helperText="For Claude 3.5 Sonnet, Claude 3 Haiku models"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    backgroundColor: "background.paper",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      backgroundColor: "background.default",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    },
                    "&.Mui-focused": {
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    },
                  },
                  "& .MuiInputBase-input": {
                    fontFamily: "var(--font-body)",
                  },
                  "& .MuiInputLabel-root": {
                    fontFamily: "var(--font-body)",
                  },
                }}
              />
              <TextField
                className="enhanced-input"
                label="Google API Key"
                value={settings.apiKeys.google || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    apiKeys: { ...settings.apiKeys, google: e.target.value },
                  })
                }
                type="password"
                fullWidth
                size="small"
                placeholder="AIza..."
                helperText="For Gemini Pro, Gemini Flash models"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    backgroundColor: "background.paper",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      backgroundColor: "background.default",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    },
                    "&.Mui-focused": {
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    },
                  },
                  "& .MuiInputBase-input": {
                    fontFamily: "var(--font-body)",
                  },
                  "& .MuiInputLabel-root": {
                    fontFamily: "var(--font-body)",
                  },
                }}
              />
              <TextField
                className="enhanced-input"
                label="OpenRouter API Key"
                value={settings.apiKeys.openrouter || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    apiKeys: { ...settings.apiKeys, openrouter: e.target.value },
                  })
                }
                type="password"
                fullWidth
                size="small"
                placeholder="sk-or-..."
                helperText="Access multiple providers through OpenRouter"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    backgroundColor: "background.paper",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      backgroundColor: "background.default",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    },
                    "&.Mui-focused": {
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    },
                  },
                  "& .MuiInputBase-input": {
                    fontFamily: "var(--font-body)",
                  },
                  "& .MuiInputLabel-root": {
                    fontFamily: "var(--font-body)",
                  },
                }}
              />
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Local Providers Section */}
            <Typography
              variant="subtitle1"
              sx={{
                mb: 2,
                fontFamily: "var(--font-header)",
                fontWeight: 600,
              }}
            >
              Local Providers
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, fontFamily: "var(--font-body)" }}
            >
              Local providers run on your machine and don't require API keys.
            </Typography>

            {/* LM Studio Info */}
            <Box
              sx={{
                p: 2,
                mb: 2,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1.5,
                backgroundColor: "background.paper",
              }}
            >
              <Typography
                variant="body1"
                sx={{ fontFamily: "var(--font-body)", fontWeight: 500, mb: 1 }}
              >
                LM Studio
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontFamily: "var(--font-body)" }}
              >
                Run local models using LM Studio. Download from{" "}
                <a href="https://lmstudio.ai" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                  lmstudio.ai
                </a>
                , load a model, and start the local server on port 1234.
              </Typography>
            </Box>

            {/* Ollama Section */}
            <Box
              sx={{
                p: 2,
                border: "1px solid",
                borderColor: isOllamaAvailable ? "success.main" : "divider",
                borderRadius: 1.5,
                backgroundColor: "background.paper",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Typography
                  variant="body1"
                  sx={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
                >
                  Ollama
                </Typography>
                <Chip
                  label={isOllamaAvailable ? "Running" : "Not Running"}
                  size="small"
                  color={isOllamaAvailable ? "success" : "default"}
                  sx={{ fontFamily: "var(--font-body)", fontSize: "0.7rem" }}
                />
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontFamily: "var(--font-body)", mb: 2 }}
              >
                Run local models using Ollama. Download from{" "}
                <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                  ollama.ai
                </a>
              </Typography>

              <Box
                sx={{
                  opacity: isOllamaAvailable ? 1 : 0.5,
                  pointerEvents: isOllamaAvailable ? "auto" : "none",
                }}
              >
                <Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
                  <TextField
                    label="Model Name"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g., llama2"
                    fullWidth
                    size="small"
                    disabled={isPulling}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 1.5,
                        backgroundColor: "background.default",
                        "&:hover": {
                          backgroundColor: "background.default",
                        },
                      },
                      "& .MuiInputBase-input": {
                        fontFamily: "var(--font-body)",
                      },
                      "& .MuiInputLabel-root": {
                        fontFamily: "var(--font-body)",
                      },
                    }}
                  />
                  <Button
                    onClick={handlePullModel}
                    variant="contained"
                    disabled={!modelName.trim() || isPulling}
                    sx={{
                      minWidth: "100px",
                      fontFamily: "var(--font-header)",
                      "&.Mui-disabled": {
                        backgroundColor: "action.disabledBackground",
                      },
                    }}
                  >
                    Pull
                  </Button>
                </Box>

                {isPulling && (
                  <Box sx={{ width: "100%", mb: 2 }}>
                    <LinearProgress
                      variant="determinate"
                      value={pullProgress}
                      sx={{
                        height: 8,
                        borderRadius: 1.5,
                        backgroundColor: "rgba(0,0,0,0.08)",
                        "& .MuiLinearProgress-bar": {
                          borderRadius: 1.5,
                        },
                      }}
                    />
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1, fontFamily: "var(--font-body)" }}
                    >
                      {pullStatus}
                    </Typography>
                  </Box>
                )}

                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: "var(--font-header)",
                    fontWeight: 600,
                    mb: 1,
                  }}
                >
                  Installed Models
                </Typography>

                {isLoadingOllamaModels ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={20} />
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontFamily: "var(--font-body)" }}
                    >
                      Loading models...
                    </Typography>
                  </Box>
                ) : ollamaModels.length === 0 ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontFamily: "var(--font-body)", fontStyle: "italic" }}
                  >
                    No models downloaded yet
                  </Typography>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {ollamaModels.map((model) => (
                      <Box
                        key={model.name}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          p: 1.5,
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 1.5,
                          backgroundColor: "background.default",
                        }}
                      >
                        <Typography
                          variant="body1"
                          sx={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
                        >
                          {model.name}
                        </Typography>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => handleDeleteModelRequest(model.name)}
                          disabled={isDeletingOllamaModel}
                          sx={{ fontFamily: "var(--font-header)" }}
                        >
                          Delete
                        </Button>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        );

      case "airules":
        return (
          <Box>
            <Typography
              variant="h6"
              gutterBottom
              sx={{
                mb: 2,
                color: "text.primary",
                fontFamily: "var(--font-header)",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <SmartToyIcon />
              AI Rules & Presets
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 3, fontFamily: "var(--font-body)" }}
            >
              Customize how AI analyzes and suggests file organization. These
              preferences guide AI suggestions for renaming and sorting.
            </Typography>

            {/* Date Format */}
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="body1"
                sx={{
                  mb: 1.5,
                  fontFamily: "var(--font-body)",
                  fontWeight: 500,
                }}
              >
                Date Format Preference
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontFamily: "var(--font-body)" }}>
                  Date Format
                </InputLabel>
                <Select
                  value={aiRules.dateFormat}
                  label="Date Format"
                  onChange={(e) =>
                    saveAiRules({ ...aiRules, dateFormat: e.target.value })
                  }
                  sx={{
                    "& .MuiSelect-select": {
                      fontFamily: "var(--font-body)",
                    },
                  }}
                >
                  <MenuItem value="YYYY-MM-DD">YYYY-MM-DD (2024-01-15)</MenuItem>
                  <MenuItem value="DD-MM-YYYY">DD-MM-YYYY (15-01-2024)</MenuItem>
                  <MenuItem value="MM-DD-YYYY">MM-DD-YYYY (01-15-2024)</MenuItem>
                  <MenuItem value="YYYY_MM_DD">YYYY_MM_DD (2024_01_15)</MenuItem>
                  <MenuItem value="YYYYMMDD">YYYYMMDD (20240115)</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Grouping Logic */}
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="body1"
                sx={{
                  mb: 1.5,
                  fontFamily: "var(--font-body)",
                  fontWeight: 500,
                }}
              >
                Preferred Grouping Logic
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontFamily: "var(--font-body)" }}>
                  Group By
                </InputLabel>
                <Select
                  value={aiRules.groupingLogic}
                  label="Group By"
                  onChange={(e) =>
                    saveAiRules({ ...aiRules, groupingLogic: e.target.value })
                  }
                  sx={{
                    "& .MuiSelect-select": {
                      fontFamily: "var(--font-body)",
                    },
                  }}
                >
                  <MenuItem value="type">File Type (Documents, Images, etc.)</MenuItem>
                  <MenuItem value="date">Date (Year/Month folders)</MenuItem>
                  <MenuItem value="project">Project Context</MenuItem>
                  <MenuItem value="size">File Size</MenuItem>
                  <MenuItem value="custom">Custom (based on prompt)</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Naming Convention */}
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="body1"
                sx={{
                  mb: 1.5,
                  fontFamily: "var(--font-body)",
                  fontWeight: 500,
                }}
              >
                Preferred Naming Convention
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontFamily: "var(--font-body)" }}>
                  Naming Style
                </InputLabel>
                <Select
                  value={aiRules.preferredNamingConvention}
                  label="Naming Style"
                  onChange={(e) =>
                    saveAiRules({
                      ...aiRules,
                      preferredNamingConvention: e.target.value,
                    })
                  }
                  sx={{
                    "& .MuiSelect-select": {
                      fontFamily: "var(--font-body)",
                    },
                  }}
                >
                  <MenuItem value="kebab-case">kebab-case (my-file-name)</MenuItem>
                  <MenuItem value="snake_case">snake_case (my_file_name)</MenuItem>
                  <MenuItem value="camelCase">camelCase (myFileName)</MenuItem>
                  <MenuItem value="Title Case">Title Case (My File Name)</MenuItem>
                  <MenuItem value="lowercase">lowercase (myfilename)</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Exclusion Patterns */}
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="body1"
                sx={{
                  mb: 1.5,
                  fontFamily: "var(--font-body)",
                  fontWeight: 500,
                }}
              >
                Exclusion Patterns
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 2, fontFamily: "var(--font-body)" }}
              >
                Files and folders matching these patterns will be ignored by AI
                analysis.
              </Typography>
              <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                <TextField
                  size="small"
                  value={newExclusionPattern}
                  onChange={(e) => setNewExclusionPattern(e.target.value)}
                  placeholder="e.g., node_modules, *.tmp, .git"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      addExclusionPattern();
                    }
                  }}
                  sx={{
                    flex: 1,
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 1.5,
                      fontFamily: "var(--font-body)",
                    },
                  }}
                />
                <Button
                  variant="contained"
                  onClick={addExclusionPattern}
                  disabled={!newExclusionPattern.trim()}
                  sx={{ fontFamily: "var(--font-header)" }}
                >
                  <AddIcon />
                </Button>
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {aiRules.exclusionPatterns.map((pattern) => (
                  <Chip
                    key={pattern}
                    label={pattern}
                    onDelete={() => removeExclusionPattern(pattern)}
                    sx={{
                      fontFamily: "var(--font-body)",
                      backgroundColor: "action.hover",
                    }}
                  />
                ))}
                {aiRules.exclusionPatterns.length === 0 && (
                  <Typography
                    variant="body2"
                    color="text.disabled"
                    sx={{ fontFamily: "var(--font-body)", fontStyle: "italic" }}
                  >
                    No exclusion patterns set
                  </Typography>
                )}
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Custom Prompt Prefix */}
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="body1"
                sx={{
                  mb: 1.5,
                  fontFamily: "var(--font-body)",
                  fontWeight: 500,
                }}
              >
                Custom Prompt Instructions
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 2, fontFamily: "var(--font-body)" }}
              >
                Add custom instructions that will be included in all AI prompts.
              </Typography>
              <TextField
                multiline
                rows={4}
                fullWidth
                value={aiRules.customPromptPrefix}
                onChange={(e) =>
                  saveAiRules({ ...aiRules, customPromptPrefix: e.target.value })
                }
                placeholder="e.g., 'Always prefix project files with the project name. Keep folder names short. Organize by client name first, then by date.'"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    fontFamily: "var(--font-body)",
                  },
                }}
              />
            </Box>

            {/* Info Box */}
            <Alert severity="info" sx={{ fontFamily: "var(--font-body)" }}>
              These preferences are stored locally and will be applied to all AI
              suggestions. Changes take effect immediately for new analyses.
            </Alert>
          </Box>
        );

      case "shortcuts":
        return (
          <Box>
            <Typography
              variant="h6"
              gutterBottom
              sx={{
                mb: 2,
                color: "text.primary",
                fontFamily: "var(--font-header)",
              }}
            >
              Keyboard Shortcuts
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, fontFamily: "var(--font-body)" }}
            >
              Use these keyboard shortcuts to navigate and perform actions
              quickly. Press <strong>?</strong> anytime to show the shortcuts
              dialog.
            </Typography>

            {/* Group shortcuts by category */}
            {Object.entries(
              shortcuts.reduce(
                (acc, shortcut) => {
                  if (!acc[shortcut.category]) {
                    acc[shortcut.category] = [];
                  }
                  acc[shortcut.category].push(shortcut);
                  return acc;
                },
                {} as Record<string, typeof shortcuts>,
              ),
            ).map(([category, categoryShortcuts], index) => (
              <Box key={category} sx={{ mb: 2 }}>
                {index > 0 && <Divider sx={{ mb: 1.5 }} />}

                <Typography
                  variant="body1"
                  sx={{
                    mb: 2,
                    color: "primary.main",
                    fontFamily: "var(--font-header)",
                    fontWeight: 600,
                  }}
                >
                  {category}
                </Typography>

                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
                >
                  {categoryShortcuts.map((shortcut, shortcutIndex) => (
                    <Box
                      key={shortcutIndex}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        p: 1,
                        borderRadius: 1.5,
                        backgroundColor: "background.paper",
                        border: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: "var(--font-body)",
                          flex: 1,
                          fontSize: "0.875rem",
                        }}
                      >
                        {shortcut.description}
                      </Typography>

                      <Box
                        sx={{
                          px: 1,
                          py: 0.5,
                          backgroundColor: "background.default",
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 1.5,
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}
                      >
                        {formatShortcut(shortcut)}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}

            <Box
              sx={{
                mt: 2,
                p: 1.5,
                backgroundColor: "info.light",
                borderRadius: 1.5,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                <KeyboardIcon
                  sx={{ mr: 1, color: "info.main", fontSize: "1.2rem" }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: "var(--font-body)",
                    color: "info.dark",
                    fontWeight: 600,
                  }}
                >
                  Pro Tip
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{ fontFamily: "var(--font-body)", color: "info.dark" }}
              >
                Keyboard shortcuts are automatically disabled when typing in
                input fields. You can customize shortcuts by modifying the
                keyboard shortcuts configuration.
              </Typography>
            </Box>
          </Box>
        );

      case "history":
        return <OperationHistoryPanel />;

      case "about":
        return (
          <Box>
            <Typography
              variant="h6"
              gutterBottom
              sx={{
                mb: 2,
                color: "text.primary",
                fontFamily: "var(--font-header)",
              }}
            >
              About & Updates
            </Typography>
            <UpdateStatus darkMode={darkMode} />
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 1.5,
          overflow: "hidden",
          maxHeight: "90vh",
        },
      }}
    >
      <DialogTitle
        sx={{
          p: 2,
          background:
            "linear-gradient(135deg, rgba(255,87,51,0.03) 0%, rgba(255,255,255,1) 100%)",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <Box display="flex" alignItems="center">
          <Typography
            variant="h5"
            component="div"
            sx={{
              flexGrow: 1,
              fontWeight: 600,
              fontFamily: "var(--font-header)",
            }}
          >
            Settings
          </Typography>
          <IconButton
            onClick={onClose}
            size="small"
            aria-label="close"
            sx={{
              color: "text.secondary",
              "&:hover": {
                backgroundColor: "rgba(0,0,0,0.04)",
                color: "text.primary",
              },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent
        sx={{
          p: 0,
          overflow: "hidden",
          display: "flex",
          height: "70vh",
          backgroundColor: "background.default",
        }}
      >
        <SettingsSidepanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            { id: "general", label: "General", icon: null },
            { id: "themes", label: "Workspace Themes", icon: null },
            { id: "workspace", label: "Workspace", icon: null },
            { id: "sections", label: "Custom Sections", icon: null },
            { id: "history", label: "Operation History", icon: null },
            { id: "airules", label: "AI Rules & Presets", icon: null },
            { id: "providers", label: "AI Providers", icon: null },
            { id: "shortcuts", label: "Keyboard Shortcuts", icon: null },
            { id: "about", label: "About & Updates", icon: null },
          ]}
        />

        <Box
          sx={{
            flex: 1,
            p: 3,
            overflow: "auto",
            backgroundColor: "background.default",
            "&::-webkit-scrollbar": {
              width: "6px",
            },
            "&::-webkit-scrollbar-track": {
              background: "transparent",
            },
            "&::-webkit-scrollbar-thumb": {
              background: (theme) => theme.palette.primary.main + "40",
              borderRadius: "var(--border-radius-small)",
            },
            "&::-webkit-scrollbar-thumb:hover": {
              background: (theme) => theme.palette.primary.main + "60",
            },
            scrollbarWidth: "thin",
            scrollbarColor: (theme) =>
              `${theme.palette.primary.main}40 transparent`,
          }}
        >
          {renderTabContent()}
        </Box>

        {saved && (
          <Alert
            severity="success"
            sx={{
              position: "absolute",
              bottom: 80,
              left: 260,
              right: 20,
              borderRadius: 1.5,
              backgroundColor: "success.light",
              color: "success.dark",
              "& .MuiAlert-icon": { color: "success.main" },
              "& .MuiAlert-message": { fontFamily: "var(--font-body)" },
            }}
          >
            Settings saved successfully
          </Alert>
        )}

        {error && (
          <Alert
            severity="error"
            sx={{
              position: "absolute",
              bottom: 80,
              left: 260,
              right: 20,
              borderRadius: 1.5,
              backgroundColor: "error.light",
              color: "error.dark",
              "& .MuiAlert-icon": { color: "error.main" },
              "& .MuiAlert-message": { fontFamily: "var(--font-body)" },
            }}
          >
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3, gap: 1.5 }}>
        <Button
          className="enhanced-button"
          onClick={onClose}
          disabled={loading}
          sx={{
            color: "text.secondary",
            fontFamily: "var(--font-header)",
            borderRadius: 1.5,
            px: 3,
            "&:hover": {
              backgroundColor: "rgba(0,0,0,0.04)",
              transform: "translateY(-1px)",
            },
          }}
        >
          Cancel
        </Button>
        <Button
          className="enhanced-button"
          onClick={handleSave}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
          sx={{
            px: 4,
            fontFamily: "var(--font-header)",
            borderRadius: 1.5,
            "&.Mui-disabled": {
              backgroundColor: "action.disabledBackground",
            },
          }}
        >
          Save Changes
        </Button>
      </DialogActions>

      <WorkspaceShareDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
      />

      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        aria-labelledby="delete-ollama-model-title"
      >
        <DialogTitle id="delete-ollama-model-title" sx={{ fontFamily: "var(--font-header)" }}>
          Delete Model
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: "var(--font-body)" }}>
            {`Are you sure you want to delete "${modelPendingDelete || "this model"}"? This will remove the model from your machine.`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={handleCloseDeleteDialog}
            disabled={isDeletingOllamaModel}
            sx={{ fontFamily: "var(--font-header)" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDeleteModel}
            color="error"
            variant="contained"
            disabled={isDeletingOllamaModel}
            startIcon={isDeletingOllamaModel ? <CircularProgress size={16} /> : null}
            sx={{ fontFamily: "var(--font-header)" }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default Settings;
