import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useOperationHistory } from "../contexts/OperationHistoryContext";
import { useToast } from "../components/ToastNotification";
import { useContextMenu } from "../hooks/useContextMenu";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import GridViewIcon from "@mui/icons-material/GridView";
import ListIcon from "@mui/icons-material/List";

import TableRowsIcon from "@mui/icons-material/TableRows";

import ViewModuleIcon from "@mui/icons-material/ViewModule";

import ViewCompactIcon from "@mui/icons-material/ViewCompact";

import ViewListIcon from "@mui/icons-material/ViewList";

import SortIcon from "@mui/icons-material/Sort";

import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import {
  FileInfo,
  SortSuggestions as SortSuggestionsType,
  FileRename,
  RenameApplyResult,
  SortApplyResult,
} from "../electron";
import SortSuggestions from "./SortSuggestions";
import RenameDialog from "./RenameDialog";
import ContextMenu from "./ContextMenu";
import WatchedRenameQueue from "./WatchedRenameQueue";
import { useWatchedRenameQueue } from "../hooks/useWatchedRenameQueue";
import { DirectorySkeleton } from "./LoadingSkeletons";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import { getPathBreadcrumbs } from "../utils/pathBreadcrumbs";

interface DirectoryExplorerProps {
  searchTerm?: string;
  filters?: { type: string; date: string; size: string };
}

const DirectoryExplorer: React.FC<DirectoryExplorerProps> = ({
  searchTerm = "",
  filters = { type: "any", date: "any", size: "any" },
}) => {
  const {
    addRecentFolder,
    addFavoriteFolder,
    removeFavoriteFolder,
    favoriteFolders,
    currentWorkspace,
    currentDirectoryPath,
    setCurrentDirectoryPath,
    viewMode,
    setViewMode,
  } = useWorkspace();
  
  const { startBatch, addOperation, completeBatch, failBatch, canUndo, undo } = useOperationHistory();
  const { showSuccess, showError, showInfo, showWarning } = useToast();

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortDialogOpen, setSortDialogOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<SortSuggestionsType>();
  const [error, setError] = useState<string>();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [watchQueueOpen, setWatchQueueOpen] = useState(false);
  const [renameSuggestions, setRenameSuggestions] = useState<{
    renames: FileRename[];
  }>();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [, setContextFile] = useState<FileInfo | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    additive: boolean;
    baseSelection: Set<string>;
  } | null>(null);
  const lastSelectedPathRef = useRef<string | null>(null);
  const autoScrollRef = useRef<number | null>(null);
  const watchedQueue = useWatchedRenameQueue(currentWorkspace?.id || null);
  const [dragBox, setDragBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const isDragSelecting = Boolean(dragBox);
  const { contextMenu, showContextMenu, hideContextMenu, handleItemClick } =
    useContextMenu();

  useEffect(() => {
    if (currentDirectoryPath) {
      loadDirectory(currentDirectoryPath);
    }
  }, [currentDirectoryPath]);

  const filteredFiles = useMemo(() => {
    const now = Date.now();
    const lowerSearchTerm = (searchTerm || "").toLowerCase();

    const inDateRange = (modified: any) => {
      if (!filters.date || filters.date === "any") return true;
      const ts = new Date(modified).getTime();
      const oneDay = 24 * 60 * 60 * 1000;
      switch (filters.date) {
        case "24h":
          return ts >= now - oneDay;
        case "7d":
          return ts >= now - 7 * oneDay;
        case "30d":
          return ts >= now - 30 * oneDay;
        case "year": {
          const d = new Date(modified);
          return d.getFullYear() === new Date().getFullYear();
        }
        default:
          return true;
      }
    };

    const inSizeRange = (size: number, isDirectory: boolean) => {
      if (isDirectory) return true; // size filter for files only
      switch (filters.size) {
        case "lt1":
          return size < 1 * 1024 * 1024;
        case "1to10":
          return size >= 1 * 1024 * 1024 && size <= 10 * 1024 * 1024;
        case "10to100":
          return size >= 10 * 1024 * 1024 && size <= 100 * 1024 * 1024;
        case ">100":
          return size > 100 * 1024 * 1024;
        default:
          return true;
      }
    };

    return files.filter((file) => {
      if (lowerSearchTerm && !file.name.toLowerCase().includes(lowerSearchTerm))
        return false;
      if (filters.type === "files" && file.isDirectory) return false;
      if (filters.type === "folders" && !file.isDirectory) return false;
      if (!inDateRange(file.modified)) return false;
      if (!inSizeRange(file.size, file.isDirectory)) return false;
      return true;
    });
  }, [files, searchTerm, filters]);

  const selectedCount = selectedItems.size;
  const visibleFolderCount = filteredFiles.filter((file) => file.isDirectory).length;
  const visibleFileCount = filteredFiles.length - visibleFolderCount;
  const currentFolderName = currentDirectoryPath
    ? currentDirectoryPath.split(/[\\/]/).filter(Boolean).pop() || currentDirectoryPath
    : "No folder selected";
  const viewToggleSx = (active: boolean) => ({
    width: 34,
    height: 34,
    borderRadius: 1,
    border: "none",
    bgcolor: active ? "action.selected" : "transparent",
    color: active ? "text.primary" : "text.secondary",
    "&:hover": {
      bgcolor: "action.hover",
      color: "text.primary",
    },
  });

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
    lastSelectedPathRef.current = null;
  }, []);

  const formatFileSize = (bytes: number) => {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const renderBreadcrumbs = () => {
    if (!currentDirectoryPath) return null;
    const breadcrumbs = getPathBreadcrumbs(currentDirectoryPath);
    return (
      <Breadcrumbs sx={{ mb: 1, px: 1 }}>
        {breadcrumbs.map((breadcrumb) => {
          return (
            <Link
              key={breadcrumb.path}
              component="button"
              variant="body2"
              onClick={() => {
                setSelectedItems(new Set());
                addRecentFolder(breadcrumb.path);
                setCurrentDirectoryPath(breadcrumb.path);
              }}
              sx={{
                cursor: "pointer",
                fontFamily: "var(--font-header)",
                fontSize: "0.875rem",
              }}
            >
              {breadcrumb.label}
            </Link>
          );
        })}
      </Breadcrumbs>
    );
  };

  const handleSelectDirectory = useCallback(async () => {
    const path = await window.electronAPI.selectDirectory();
    if (path) {
      setSelectedItems(new Set());
      addRecentFolder(path);
      setCurrentDirectoryPath(path);
    }
  }, [addRecentFolder, setCurrentDirectoryPath]);

  const handleToggleFavorite = useCallback(
    (path: string, name: string) => {
      const isFavorite = favoriteFolders.some((f) => f.path === path);
      if (isFavorite) {
        removeFavoriteFolder(path);
      } else {
        addFavoriteFolder({ path, name });
      }
    },
    [favoriteFolders, addFavoriteFolder, removeFavoriteFolder],
  );

  const handleOpenPath = useCallback(async (targetPath: string) => {
    try {
      const result = await window.electronAPI.openFile(targetPath);
      if (result?.error) {
        showError(result.error, "Open Failed");
      }
    } catch (error) {
      console.error("Failed to open path:", error);
      showError(
        error instanceof Error ? error.message : "Failed to open item",
        "Open Failed",
      );
    }
  }, [showError]);

  const handleRevealPath = useCallback(async (targetPath: string) => {
    try {
      const result = await window.electronAPI.revealInFolder(targetPath);
      if (result?.error) {
        showError(result.error, "Reveal Failed");
      }
    } catch (error) {
      console.error("Failed to reveal path:", error);
      showError(
        error instanceof Error ? error.message : "Failed to show item",
        "Reveal Failed",
      );
    }
  }, [showError]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    try {
      const result = await window.electronAPI.loadDirectory(path);
      if (result && result.files) {
        setFiles(
          result.files.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          }),
        );
      }
    } catch (error) {
      console.error("Failed to load directory:", error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = useCallback(async () => {
    if (!currentDirectoryPath) return;

    const selectedPaths = Array.from(selectedItems);
    if (selectedPaths.length === 0) {
      showWarning("Please select folders to sort", "No Selection");
      return;
    }

    setAnalyzing(true);
    setError(undefined);
    setSuggestions(undefined);
    if (!sortDialogOpen) {
      setSortDialogOpen(true);
    }
    showInfo("Analyzing files for organization suggestions...", "AI Analysis");

    try {
      // If no items selected, process entire directory
      const selectedPaths =
        selectedItems.size > 0 ? Array.from(selectedItems) : undefined;
      const result = await window.electronAPI.analyzeDirectoryForSort(
        currentDirectoryPath,
        selectedPaths,
      );
      if (result.error) {
        setError(result.error);
        showError(result.error, "Analysis Failed");
      } else if (result.suggestions) {
        setSuggestions(result.suggestions);
      }
    } catch (error) {
      setError("Failed to analyze directory");
      showError("Failed to analyze directory", "Analysis Failed");
      console.error("Failed to analyze directory:", error);
    } finally {
      setAnalyzing(false);
    }
  }, [currentDirectoryPath, selectedItems, sortDialogOpen, showWarning, showInfo, showError]);

  const handleRename = useCallback(async () => {
    if (!currentDirectoryPath) return;

    const selectedPaths = Array.from(selectedItems);
    if (selectedPaths.length === 0) {
      showWarning("Please select files or folders to rename", "No Selection");
      return;
    }

    setAnalyzing(true);
    setError(undefined);
    setRenameSuggestions(undefined);
    if (!renameDialogOpen) {
      setRenameDialogOpen(true);
    }
    showInfo("Analyzing files for rename suggestions...", "AI Analysis");

    try {
      // If no items selected, process entire directory
      const selectedPaths =
        selectedItems.size > 0 ? Array.from(selectedItems) : undefined;
      const result = await window.electronAPI.analyzeDirectoryForRename(
        currentDirectoryPath,
        selectedPaths,
      );
      if (result.error) {
        setError(result.error);
        showError(result.error, "Analysis Failed");
      } else if (result.suggestions?.categories?.[0]?.renames) {
        const renames = result.suggestions.categories[0].renames;
        if (renames && renames.length > 0) {
          setRenameSuggestions({ renames });
        } else {
          setError("No rename suggestions available");
          setRenameSuggestions(undefined);
        }
      } else {
        setError("No rename suggestions available");
        setRenameSuggestions(undefined);
      }
    } catch (error) {
      setError("Failed to analyze directory");
      showError("Failed to analyze directory", "Analysis Failed");
      console.error("Failed to analyze directory:", error);
    } finally {
      setAnalyzing(false);
    }
  }, [currentDirectoryPath, selectedItems, renameDialogOpen, showWarning, showInfo, showError]);

  const handleSortRefresh = useCallback(async () => {
    if (!currentDirectoryPath) return;

    const selectedPaths = Array.from(selectedItems);
    if (selectedPaths.length === 0) {
      alert("Please select folders to sort");
      return;
    }

    setAnalyzing(true);
    setError(undefined);
    setSuggestions(undefined);
    if (!sortDialogOpen) {
      setSortDialogOpen(true);
    }

    try {
      // Use fresh analysis method to bypass cache
      const selectedPaths =
        selectedItems.size > 0 ? Array.from(selectedItems) : undefined;
      const result = await window.electronAPI.analyzeDirectoryForSortFresh(
        currentDirectoryPath,
        selectedPaths,
      );
      if (result.error) {
        setError(result.error);
      } else if (result.suggestions) {
        setSuggestions(result.suggestions);
      }
    } catch (error) {
      setError("Failed to analyze directory");
      console.error("Failed to analyze directory:", error);
    } finally {
      setAnalyzing(false);
    }
  }, [currentDirectoryPath, selectedItems, sortDialogOpen]);

  const handleRenameRefresh = useCallback(async () => {
    if (!currentDirectoryPath) return;

    const selectedPaths = Array.from(selectedItems);
    if (selectedPaths.length === 0) {
      alert("Please select files or folders to rename");
      return;
    }

    setAnalyzing(true);
    setError(undefined);
    setRenameSuggestions(undefined);
    if (!renameDialogOpen) {
      setRenameDialogOpen(true);
    }

    try {
      // Use fresh analysis method to bypass cache
      const selectedPaths =
        selectedItems.size > 0 ? Array.from(selectedItems) : undefined;
      const result = await window.electronAPI.analyzeDirectoryForRenameFresh(
        currentDirectoryPath,
        selectedPaths,
      );
      if (result.error) {
        setError(result.error);
      } else if (result.suggestions?.categories?.[0]?.renames) {
        const renames = result.suggestions.categories[0].renames;
        if (renames && renames.length > 0) {
          setRenameSuggestions({ renames });
        } else {
          setError("No rename suggestions available");
          setRenameSuggestions(undefined);
        }
      } else {
        setError("No rename suggestions available");
        setRenameSuggestions(undefined);
      }
    } catch (error) {
      setError("Failed to analyze directory");
      console.error("Failed to analyze directory:", error);
    } finally {
      setAnalyzing(false);
    }
  }, [currentDirectoryPath, selectedItems, renameDialogOpen]);

  interface RenameSuggestions {
    categories: [
      {
        name: string;
        description: string;
        suggestedPath: string;
        files: string[];
        renames: FileRename[];
      },
    ];
  }

  const handleApplyRenames = async (suggestions: { renames: FileRename[] }) => {
    if (!currentDirectoryPath) return;

    setAnalyzing(true);
    setError(undefined);

    // Start tracking this batch operation
    const batchId = startBatch(`Rename ${suggestions.renames.length} files`, currentDirectoryPath);

    try {
      const result = await applyRenameSuggestions(suggestions, batchId);
      const renamedCount = result.renamedFiles?.length ?? 0;
      const errorCount = result.errors?.length ?? 0;
      setSelectedItems(new Set()); // Clear selections after renaming
      completeBatch(batchId);
      if (errorCount > 0) {
        showWarning(
          `Renamed ${renamedCount} files; ${errorCount} failed`,
          'Rename Partially Complete',
          renamedCount > 0 && canUndo ? { label: 'Undo', onClick: () => undo() } : undefined
        );
      } else {
        showSuccess(
          `Successfully renamed ${renamedCount} files`,
          'Rename Complete',
          canUndo ? { label: 'Undo', onClick: () => undo() } : undefined
        );
      }
    } catch (error) {
      failBatch(batchId, error instanceof Error ? error.message : 'Unknown error');
      setError("Failed to apply renames");
      showError("Failed to apply renames", "Operation Failed");
      console.error("Failed to apply renames:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const applyRenameSuggestions = async (suggestions: {
    renames: FileRename[];
  }, batchId?: string): Promise<RenameApplyResult> => {
    if (!currentDirectoryPath) return { success: false, error: "No directory selected" };

    setAnalyzing(true);
    setError(undefined);

    try {
      const renameSuggestions: RenameSuggestions = {
        categories: [
          {
            name: "Files to Rename",
            description: "Files that will be renamed",
            suggestedPath: ".",
            files: suggestions.renames.map((r) => r.originalName),
            renames: suggestions.renames,
          },
        ],
      };

      const result = await window.electronAPI.applyRenames(
        currentDirectoryPath,
        renameSuggestions,
      );
      
      const errorsByFile = new Map((result.errors || []).map((item) => [item.file, item.error]));
      const renamedByOriginal = new Map((result.renamedFiles || []).map((item) => [item.original, item.new]));

      // Track individual operations if batchId provided
      if (batchId) {
        suggestions.renames.forEach((rename) => {
          const error = errorsByFile.get(rename.originalName);
          const actualName = renamedByOriginal.get(rename.originalName) || rename.suggestedName;
          addOperation(batchId, {
            type: 'rename',
            originalPath: `${currentDirectoryPath}/${rename.originalName}`,
            newPath: `${currentDirectoryPath}/${actualName}`,
            originalName: rename.originalName,
            newName: actualName,
            status: error ? 'failed' : 'completed',
            error,
            metadata: { reason: rename.reason }
          });
        });
      }
      
      if (result.error && !result.partial) {
        throw new Error(result.error);
      }
      if (result.errors?.length) {
        setError(result.errors.map((item) => `${item.file}: ${item.error}`).join("; "));
      }
      await loadDirectory(currentDirectoryPath);
      setRenameDialogOpen(false);
      return result;
    } catch (error) {
      setError("Failed to apply renames");
      console.error("Failed to apply renames:", error);
      throw error;
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplySuggestions = async (suggestions: SortSuggestionsType) => {
    if (!currentDirectoryPath) return;

    setAnalyzing(true);
    setError(undefined);

    // Count total files being sorted
    const totalFiles = suggestions.categories.reduce((sum, cat) => sum + cat.files.length, 0);
    const batchId = startBatch(`Sort ${totalFiles} files into ${suggestions.categories.length} folders`, currentDirectoryPath);

    try {
      const result: SortApplyResult = await window.electronAPI.applySuggestions(
        currentDirectoryPath,
        suggestions,
      );
      const errorsByFile = new Map((result.errors || []).map((item) => [item.file, item.error]));
      const movedByOriginal = new Map((result.movedFiles || []).map((item) => [item.original, item.new]));

      // Track individual operations
      suggestions.categories.forEach((category) => {
        category.files.forEach((file) => {
          const error = errorsByFile.get(file);
          const actualPath = movedByOriginal.get(file) || `${category.suggestedPath}/${file}`;
          addOperation(batchId, {
            type: 'move',
            originalPath: `${currentDirectoryPath}/${file}`,
            newPath: `${currentDirectoryPath}/${actualPath}`,
            originalName: file,
            newName: file,
            status: error ? 'failed' : 'completed',
            error,
            metadata: { 
              category: category.name,
              description: category.description 
            }
          });
        });
      });
      
      if (result.error && !result.partial) {
        failBatch(batchId, result.error);
        setError(result.error);
        showError(result.error, "Sort Failed");
      } else {
        completeBatch(batchId);
        await loadDirectory(currentDirectoryPath);
        setSortDialogOpen(false);
        setSelectedItems(new Set()); // Clear selections after sorting
        const movedCount = result.movedFiles?.length ?? 0;
        const errorCount = result.errors?.length ?? 0;
        if (errorCount > 0) {
          showWarning(
            `Organized ${movedCount} files; ${errorCount} failed`,
            'Organization Partially Complete',
            movedCount > 0 && canUndo ? { label: 'Undo', onClick: () => undo() } : undefined
          );
        } else {
          showSuccess(
            `Successfully organized ${movedCount} files into ${suggestions.categories.length} folders`,
            'Organization Complete',
            canUndo ? { label: 'Undo', onClick: () => undo() } : undefined
          );
        }
      }
    } catch (error) {
      failBatch(batchId, error instanceof Error ? error.message : 'Unknown error');
      setError("Failed to apply suggestions");
      showError("Failed to apply suggestions", "Operation Failed");
      console.error("Failed to apply suggestions:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileClick = async (
    file: FileInfo,
    isDoubleClick: boolean = false,
    event?: React.MouseEvent,
  ) => {
    if (isDoubleClick) {
      if (file.isDirectory) {
        setSelectedItems(new Set());
        addRecentFolder(file.path);
        setCurrentDirectoryPath(file.path);
      } else {
        await handleOpenPath(file.path);
      }
    } else {
      const isRangeSelect = Boolean(event?.shiftKey);
      const isToggle = Boolean(event?.ctrlKey || event?.metaKey);

      if (isRangeSelect) {
        const clickedIndex = filteredFiles.findIndex(
          (entry) => entry.path === file.path,
        );
        const anchorPath = lastSelectedPathRef.current;
        const anchorIndex = anchorPath
          ? filteredFiles.findIndex((entry) => entry.path === anchorPath)
          : -1;

        if (clickedIndex !== -1) {
          const startIndex = anchorIndex !== -1 ? anchorIndex : clickedIndex;
          const [from, to] =
            startIndex <= clickedIndex
              ? [startIndex, clickedIndex]
              : [clickedIndex, startIndex];

          setSelectedItems((prev) => {
            const next = new Set<string>(prev);
            for (let i = from; i <= to; i += 1) {
              next.add(filteredFiles[i].path);
            }
            return next;
          });
          lastSelectedPathRef.current = file.path;
          return;
        }
      }

      if (isToggle) {
        setSelectedItems((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(file.path)) {
            newSet.delete(file.path);
          } else {
            newSet.add(file.path);
          }
          return newSet;
        });
      } else {
        setSelectedItems(new Set([file.path]));
      }
      lastSelectedPathRef.current = file.path;
    }
  };

  const handleContextMenu = (event: React.MouseEvent, file: FileInfo) => {
    event.preventDefault();
    setContextFile(file);

    const menuItems = [
      {
        id: "open",
        label: "Open",
        icon: <OpenInNewIcon />,
        onClick: () => {
          void handleOpenPath(file.path);
          hideContextMenu();
          setContextFile(null);
        },
        shortcut: "Enter",
      },
      {
        id: "favorite",
        label: favoriteFolders.some((f) => f.path === file.path)
          ? "Remove from Favorites"
          : "Add to Favorites",
        icon: favoriteFolders.some((f) => f.path === file.path) ? (
          <StarIcon />
        ) : (
          <StarBorderIcon />
        ),
        onClick: () => {
          handleToggleFavorite(file.path, file.name);
          hideContextMenu();
          setContextFile(null);
        },
        shortcut: "Ctrl+F",
        disabled: !file.isDirectory,
      },
      {
        id: "divider",
        label: "",
        onClick: () => {},
        divider: true,
      },
      {
        id: "reveal",
        label: "Show in Explorer",
        icon: <FolderOpenIcon />,
        onClick: () => {
          void handleRevealPath(file.path);
          hideContextMenu();
          setContextFile(null);
        },
        shortcut: "Ctrl+Shift+R",
      },
    ];

    showContextMenu(event, menuItems);
  };

  const toggleFavoriteForSelected = useCallback(() => {
    const paths = Array.from(selectedItems);
    const byPath = new Map(files.map((f) => [f.path, f] as const));
    paths.forEach((p) => {
      const f = byPath.get(p);
      if (f && f.isDirectory) {
        handleToggleFavorite(f.path, f.name);
      }
    });
  }, [files, handleToggleFavorite, selectedItems]);

  const updateDragSelection = useCallback(
    (clientX: number, clientY: number) => {
      const state = dragStateRef.current;
      const container = containerRef.current;
      if (!state || !container) return;

      state.lastX = clientX;
      state.lastY = clientY;

      const left = Math.min(state.startX, clientX);
      const top = Math.min(state.startY, clientY);
      const right = Math.max(state.startX, clientX);
      const bottom = Math.max(state.startY, clientY);

      const containerRect = container.getBoundingClientRect();
      const overlayLeft = left - containerRect.left + container.scrollLeft;
      const overlayTop = top - containerRect.top + container.scrollTop;

      setDragBox({
        left: overlayLeft,
        top: overlayTop,
        width: right - left,
        height: bottom - top,
      });

      const items = Array.from(
        container.querySelectorAll<HTMLElement>("[data-file-path]"),
      );
      const nextSelected = new Set<string>(
        state.additive ? Array.from(state.baseSelection) : [],
      );
      items.forEach((el) => {
        const path = el.dataset.filePath;
        if (!path) return;
        const rect = el.getBoundingClientRect();
        const intersects =
          rect.right >= left &&
          rect.left <= right &&
          rect.bottom >= top &&
          rect.top <= bottom;
        if (intersects) nextSelected.add(path);
      });
      setSelectedItems(nextSelected);
    },
    [],
  );

  const handleContainerMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-file-path]")) return;
      if (!containerRef.current) return;

      event.preventDefault();
      hideContextMenu();
      setContextFile(null);

      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        additive,
        baseSelection: new Set(selectedItems),
      };

      if (!additive) {
        setSelectedItems(new Set());
      }

      updateDragSelection(event.clientX, event.clientY);
    },
    [hideContextMenu, selectedItems, updateDragSelection],
  );

  const handleContainerScroll = useCallback(() => {
    const state = dragStateRef.current;
    if (!state) return;
    updateDragSelection(state.lastX, state.lastY);
  }, [updateDragSelection]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleSelectDirectory();
      } else if (mod && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleRename();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSort();
      } else if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFavoriteForSelected();
      } else if (e.key === "1") {
        setViewMode("grid");
      } else if (e.key === "2") {
        setViewMode("list");
      } else if (e.key === "3") {
        setViewMode("table");
      } else if (e.key === "4") {
        setViewMode("tiles");
      } else if (e.key === "5") {
        setViewMode("compact");
      } else if (e.key === "6") {
        setViewMode("details");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleRename,
    handleSelectDirectory,
    handleSort,
    setViewMode,
    toggleFavoriteForSelected,
  ]);

  useEffect(() => {
    if (!isDragSelecting) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (event.buttons === 0) {
        dragStateRef.current = null;
        setDragBox(null);
        return;
      }
      updateDragSelection(event.clientX, event.clientY);
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      setDragBox(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleMouseUp);

    const autoScroll = () => {
      const state = dragStateRef.current;
      const container = containerRef.current;
      if (!state || !container) {
        autoScrollRef.current = null;
        return;
      }

      const rect = container.getBoundingClientRect();
      const threshold = 32;
      const maxSpeed = 18;
      let delta = 0;

      if (state.lastY < rect.top + threshold) {
        const intensity = (rect.top + threshold - state.lastY) / threshold;
        delta = -Math.ceil(maxSpeed * Math.min(1, intensity));
      } else if (state.lastY > rect.bottom - threshold) {
        const intensity = (state.lastY - (rect.bottom - threshold)) / threshold;
        delta = Math.ceil(maxSpeed * Math.min(1, intensity));
      }

      if (delta !== 0) {
        const maxScroll = container.scrollHeight - container.clientHeight;
        const nextScroll = Math.max(
          0,
          Math.min(maxScroll, container.scrollTop + delta),
        );
        if (nextScroll !== container.scrollTop) {
          container.scrollTop = nextScroll;
          updateDragSelection(state.lastX, state.lastY);
        }
      }

      autoScrollRef.current = window.requestAnimationFrame(autoScroll);
    };

    autoScrollRef.current = window.requestAnimationFrame(autoScroll);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleMouseUp);
      if (autoScrollRef.current !== null) {
        window.cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
    };
  }, [isDragSelecting, updateDragSelection]);

  const renderGridView = () => (
    <Grid container spacing={1}>
      {filteredFiles.map((file) => (
        <Grid item xs={6} sm={4} md={3} lg={2.4} xl={2} key={file.path}>
          <Box
            className="enhanced-card"
            data-file-path={file.path}
            sx={{
              p: 1.25,
              textAlign: "center",
              cursor: "pointer",
              height: 118,
              display: "grid",
              gridTemplateRows: "22px 40px 18px 14px",
              rowGap: 0.35,
              alignItems: "center",
              justifyItems: "center",
              "&:hover": {
                bgcolor: "action.hover",
                borderColor: "divider",
              },
              borderRadius: 2,
              bgcolor: selectedItems.has(file.path)
                ? "action.selected"
                : "transparent",
              border: "1px solid",
              borderColor: selectedItems.has(file.path)
                ? "primary.main"
                : "transparent",
              transition: "border-color 0.16s ease, background-color 0.16s ease",
              position: "relative",
              overflow: "hidden",
            }}
            onClick={(e) => handleFileClick(file, false, e)}
            onContextMenu={(e) => handleContextMenu(e, file)}
            onDoubleClick={() => handleFileClick(file, true)}
          >
            <Box
              sx={{
                width: "100%",
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              {file.isDirectory && (
                <IconButton
                  className="enhanced-icon-button"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite(file.path, file.name);
                  }}
                  sx={{
                    width: 22,
                    height: 22,
                    backgroundColor: "background.default",
                    boxShadow: "none",
                    border: "1px solid",
                    borderColor: "divider",
                    "&:hover": {
                      backgroundColor: "action.hover",
                      borderColor: favoriteFolders.some(
                        (f) => f.path === file.path,
                      )
                        ? "warning.main"
                        : "primary.main",
                    },
                  }}
                >
                  {favoriteFolders.some((f) => f.path === file.path) ? (
                    <StarIcon sx={{ color: "warning.main", fontSize: 14 }} />
                  ) : (
                    <StarBorderIcon
                      sx={{ color: "text.secondary", fontSize: 14 }}
                    />
                  )}
                </IconButton>
              )}
            </Box>
            <Box
              sx={{
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {file.isDirectory ? (
                <FolderIcon
                  sx={{
                    fontSize: 36,
                    color: "primary.main",
                  }}
                />
              ) : (
                <InsertDriveFileIcon
                  sx={{
                    fontSize: 36,
                    color: "text.secondary",
                  }}
                />
              )}
            </Box>
            <Typography
              noWrap
              variant="body2"
              className={file.isDirectory ? "directory-name" : "file-name"}
              sx={{
                width: "100%",
                fontFamily: "var(--font-body)",
                fontWeight: file.isDirectory ? 600 : 400,
                color: file.isDirectory ? "text.primary" : "text.secondary",
                fontSize: "0.8rem",
                lineHeight: 1.2,
              }}
              title={file.name}
            >
              {file.name}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              aria-hidden={file.isDirectory ? true : undefined}
              sx={{
                fontFamily: "var(--font-body)",
                fontSize: "0.7rem",
                lineHeight: 1.1,
                visibility: file.isDirectory ? "hidden" : "visible",
              }}
            >
              {file.isDirectory ? "Folder" : formatFileSize(file.size)}
            </Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
  );

  const renderListView = () => (
    <List>
      {filteredFiles.map((file) => (
        <ListItem
          key={file.path}
          data-file-path={file.path}
          onClick={(e) => handleFileClick(file, false, e)}
          onContextMenu={(e) => handleContextMenu(e, file)}
          onDoubleClick={() => handleFileClick(file, true)}
          sx={{
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
            bgcolor: selectedItems.has(file.path)
              ? "action.selected"
              : "transparent",
            transition: "background-color 0.2s",
            borderRadius: 1.5,
            mb: 0.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <ListItemIcon>
              {file.isDirectory ? (
                <FolderIcon color="primary" />
              ) : (
                <InsertDriveFileIcon />
              )}
            </ListItemIcon>
            {file.isDirectory && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFavorite(file.path, file.name);
                }}
              >
                {favoriteFolders.some((f) => f.path === file.path) ? (
                  <StarIcon color="primary" fontSize="small" />
                ) : (
                  <StarBorderIcon fontSize="small" />
                )}
              </IconButton>
            )}
          </Box>
          <ListItemText
            primary={
              <Typography
                className={file.isDirectory ? "directory-name" : "file-name"}
                sx={{ fontFamily: "var(--font-body)" }}
              >
                {file.name}
              </Typography>
            }
            secondary={
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontFamily: "var(--font-body)" }}
              >
                {file.isDirectory
                  ? new Date(file.modified).toLocaleString()
                  : `${formatFileSize(file.size)} • ${new Date(file.modified).toLocaleString()}`}
              </Typography>
            }
          />
        </ListItem>
      ))}
    </List>
  );

  const renderTableView = () => (
    <Box sx={{ width: "100%" }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "40px 1fr 100px 150px",
          gap: 1,
          p: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          fontWeight: "bold",
          bgcolor: "background.default",
          position: "sticky",
          top: 0,
          zIndex: 2,
        }}
      >
        <Box></Box>
        <Typography variant="body2" sx={{ fontFamily: "var(--font-header)" }}>
          Name
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: "var(--font-header)" }}>
          Size
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: "var(--font-header)" }}>
          Modified
        </Typography>
      </Box>
      {filteredFiles.map((file) => (
        <Box
          key={file.path}
          data-file-path={file.path}
          sx={{
            display: "grid",
            gridTemplateColumns: "40px 1fr 100px 150px",
            gap: 1,
            p: 1,
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
            bgcolor: selectedItems.has(file.path)
              ? "action.selected"
              : "transparent",
            borderBottom: "1px solid",
            borderColor: "divider",
            alignItems: "center",
          }}
          onClick={(e) => handleFileClick(file, false, e)}
          onContextMenu={(e) => handleContextMenu(e, file)}
          onDoubleClick={() => handleFileClick(file, true)}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {file.isDirectory ? (
              <FolderIcon color="primary" />
            ) : (
              <InsertDriveFileIcon />
            )}
          </Box>
          <Typography
            variant="body2"
            sx={{ fontFamily: "var(--font-body)" }}
            noWrap
          >
            {file.name}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: "var(--font-body)" }}
          >
            {file.isDirectory ? "-" : formatFileSize(file.size)}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: "var(--font-body)" }}
          >
            {new Date(file.modified).toLocaleDateString()}
          </Typography>
        </Box>
      ))}
    </Box>
  );

  const renderTilesView = () => (
    <Grid container spacing={2}>
      {filteredFiles.map((file) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={file.path}>
          <Box
            className="enhanced-card"
            data-file-path={file.path}
            sx={{
              p: 2,
              cursor: "pointer",
              height: 140,
              display: "flex",
              flexDirection: "column",
              "&:hover": {
                bgcolor: "action.hover",
                borderColor: "divider",
              },
              borderRadius: 2,
              bgcolor: selectedItems.has(file.path)
                ? "action.selected"
                : "transparent",
              border: "1px solid",
              borderColor: selectedItems.has(file.path)
                ? "primary.main"
                : "transparent",
              transition: "border-color 0.16s ease, background-color 0.16s ease",
            }}
            onClick={(e) => handleFileClick(file, false, e)}
            onContextMenu={(e) => handleContextMenu(e, file)}
            onDoubleClick={() => handleFileClick(file, true)}
          >
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              {file.isDirectory ? (
                <FolderIcon
                  sx={{ fontSize: 32, color: "primary.main", mr: 1 }}
                />
              ) : (
                <InsertDriveFileIcon
                  sx={{ fontSize: 32, color: "text.secondary", mr: 1 }}
                />
              )}
              {file.isDirectory && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite(file.path, file.name);
                  }}
                  sx={{ ml: "auto" }}
                >
                  {favoriteFolders.some((f) => f.path === file.path) ? (
                    <StarIcon color="primary" fontSize="small" />
                  ) : (
                    <StarBorderIcon fontSize="small" />
                  )}
                </IconButton>
              )}
            </Box>
            <Typography
              variant="body1"
              sx={{ fontFamily: "var(--font-body)", fontWeight: 500, mb: 0.5 }}
              noWrap
              title={file.name}
            >
              {file.name}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontFamily: "var(--font-body)" }}
            >
              {file.isDirectory
                ? new Date(file.modified).toLocaleDateString()
                : `${formatFileSize(file.size)} • ${new Date(file.modified).toLocaleDateString()}`}
            </Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
  );

  const renderCompactView = () => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {filteredFiles.map((file) => (
        <Box
          key={file.path}
          data-file-path={file.path}
          sx={{
            display: "flex",
            alignItems: "center",
            p: 0.5,
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
            bgcolor: selectedItems.has(file.path)
              ? "action.selected"
              : "transparent",
            borderRadius: 1.5,
            transition: "background-color 0.2s",
          }}
          onClick={(e) => handleFileClick(file, false, e)}
          onContextMenu={(e) => handleContextMenu(e, file)}
          onDoubleClick={() => handleFileClick(file, true)}
        >
          {file.isDirectory ? (
            <FolderIcon sx={{ fontSize: 20, color: "primary.main", mr: 1 }} />
          ) : (
            <InsertDriveFileIcon
              sx={{ fontSize: 20, color: "text.secondary", mr: 1 }}
            />
          )}
          <Typography
            variant="body2"
            sx={{ fontFamily: "var(--font-body)", flex: 1, minWidth: 0 }}
            noWrap
          >
            {file.name}
          </Typography>
          {!file.isDirectory && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontFamily: "var(--font-body)", ml: 1 }}
            >
              {formatFileSize(file.size)}
            </Typography>
          )}
          {file.isDirectory && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleFavorite(file.path, file.name);
              }}
            >
              {favoriteFolders.some((f) => f.path === file.path) ? (
                <StarIcon sx={{ fontSize: 16 }} color="primary" />
              ) : (
                <StarBorderIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          )}
        </Box>
      ))}
    </Box>
  );

  const renderDetailsView = () => (
    <Box sx={{ width: "100%" }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "40px 2fr 100px 150px 100px",
          gap: 1,
          p: 1,
          borderBottom: "2px solid",
          borderColor: "divider",
          fontWeight: "bold",
          bgcolor: "background.default",
          position: "sticky",
          top: 0,
          zIndex: 2,
        }}
      >
        <Box></Box>
        <Typography variant="body2" sx={{ fontFamily: "var(--font-header)" }}>
          Name
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: "var(--font-header)" }}>
          Size
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: "var(--font-header)" }}>
          Modified
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: "var(--font-header)" }}>
          Type
        </Typography>
      </Box>
      {filteredFiles.map((file) => (
        <Box
          key={file.path}
          data-file-path={file.path}
          sx={{
            display: "grid",
            gridTemplateColumns: "40px 2fr 100px 150px 100px",
            gap: 1,
            p: 1,
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
            bgcolor: selectedItems.has(file.path)
              ? "action.selected"
              : "transparent",
            borderBottom: "1px solid",
            borderColor: "divider",
            alignItems: "center",
          }}
          onClick={(e) => handleFileClick(file, false, e)}
          onContextMenu={(e) => handleContextMenu(e, file)}
          onDoubleClick={() => handleFileClick(file, true)}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {file.isDirectory ? (
              <FolderIcon color="primary" />
            ) : (
              <InsertDriveFileIcon />
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{ fontFamily: "var(--font-body)", flex: 1 }}
              noWrap
            >
              {file.name}
            </Typography>
            {file.isDirectory && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFavorite(file.path, file.name);
                }}
                sx={{ ml: 1 }}
              >
                {favoriteFolders.some((f) => f.path === file.path) ? (
                  <StarIcon sx={{ fontSize: 16 }} color="primary" />
                ) : (
                  <StarBorderIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            )}
          </Box>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: "var(--font-body)" }}
          >
            {file.isDirectory ? "-" : formatFileSize(file.size)}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: "var(--font-body)" }}
          >
            {new Date(file.modified).toLocaleString()}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: "var(--font-body)" }}
          >
            {file.isDirectory
              ? "Folder"
              : file.name.split(".").pop()?.toUpperCase() || "File"}
          </Typography>
        </Box>
      ))}
    </Box>
  );

  if (loading) {
    return (
      <Box
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <Typography
          variant="body2"
          sx={{ fontFamily: "var(--font-body)", color: "text.secondary", mb: 2 }}
        >
          Loading directory...
        </Typography>
        <DirectorySkeleton viewMode={viewMode} count={12} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Box
        data-testid="directory-toolbar"
        data-surface="plain-row"
        sx={{
          display: "flex",
          alignItems: { xs: "stretch", md: "center" },
          justifyContent: "space-between",
          gap: 1.5,
          flexShrink: 0,
          px: { xs: 1, sm: 1.5 },
          py: 1,
          mt: 0,
          mb: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "transparent",
          flexDirection: { xs: "column", lg: "row" },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            minWidth: 0,
            flex: 1,
          }}
        >
          <Button
            className="enhanced-button"
            variant="contained"
            onClick={handleSelectDirectory}
            sx={{
              fontFamily: "var(--font-header)",
              borderRadius: 1.5,
              px: 2.5,
              flexShrink: 0,
            }}
            size="small"
          >
            Select Directory
          </Button>
          <Box sx={{ minWidth: 0, display: { xs: "none", sm: "block" } }}>
            <Typography
              variant="body2"
              sx={{
                fontFamily: "var(--font-header)",
                fontWeight: 700,
                color: "text.primary",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {currentFolderName}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mt: 0.35,
                color: "text.secondary",
                fontFamily: "var(--font-body)",
              }}
            >
              {visibleFolderCount} folders · {visibleFileCount} files
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: { xs: "space-between", lg: "flex-end" },
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Box
            aria-label="View mode"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              p: 0,
              borderRadius: 1,
              bgcolor: "transparent",
            }}
          >
          <IconButton
            className="enhanced-icon-button"
            onClick={() => setViewMode("grid")}
            size="small"
            title="Grid View (1)"
            aria-pressed={viewMode === "grid"}
            aria-label="Grid view"
            sx={viewToggleSx(viewMode === "grid")}
          >
            <GridViewIcon />
          </IconButton>
          <IconButton
            className="enhanced-icon-button"
            onClick={() => setViewMode("list")}
            size="small"
            title="List View (2)"
            aria-pressed={viewMode === "list"}
            aria-label="List view"
            sx={viewToggleSx(viewMode === "list")}
          >
            <ListIcon />
          </IconButton>
          <IconButton
            className="enhanced-icon-button"
            onClick={() => setViewMode("table")}
            size="small"
            title="Table View (3)"
            aria-pressed={viewMode === "table"}
            aria-label="Table view"
            sx={viewToggleSx(viewMode === "table")}
          >
            <TableRowsIcon />
          </IconButton>
          <IconButton
            className="enhanced-icon-button"
            onClick={() => setViewMode("tiles")}
            size="small"
            title="Tiles View (4)"
            aria-pressed={viewMode === "tiles"}
            aria-label="Tiles view"
            sx={viewToggleSx(viewMode === "tiles")}
          >
            <ViewModuleIcon />
          </IconButton>
          <IconButton
            className="enhanced-icon-button"
            onClick={() => setViewMode("compact")}
            size="small"
            title="Compact View (5)"
            aria-pressed={viewMode === "compact"}
            aria-label="Compact view"
            sx={viewToggleSx(viewMode === "compact")}
          >
            <ViewCompactIcon />
          </IconButton>
          <IconButton
            className="enhanced-icon-button"
            onClick={() => setViewMode("details")}
            size="small"
            title="Details View (6)"
            aria-pressed={viewMode === "details"}
            aria-label="Details view"
            sx={viewToggleSx(viewMode === "details")}
          >
            <ViewListIcon />
          </IconButton>
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Button
            className="enhanced-button"
            variant="outlined"
            onClick={handleRename}
            disabled={!currentDirectoryPath}
            startIcon={<DriveFileRenameOutlineIcon />}
            sx={{
              fontFamily: "var(--font-header)",
              borderRadius: 1.5,
              px: 2,
            }}
            size="small"
          >
            Rename
          </Button>
          <Button
            className="enhanced-button"
            variant="outlined"
            onClick={handleSort}
            disabled={!currentDirectoryPath}
            startIcon={<SortIcon />}
            sx={{
              fontFamily: "var(--font-header)",
              borderRadius: 1.5,
              px: 2,
            }}
            size="small"
          >
            Sort
          </Button>
          <IconButton
            className="enhanced-icon-button"
            onClick={() => setWatchQueueOpen(true)}
            size="small"
            aria-label="Open watched rename queue"
            title="Watched Rename Queue"
          >
            <Badge badgeContent={watchedQueue.suggestions.length} color="primary">
              <NotificationsActiveIcon />
            </Badge>
          </IconButton>
        </Box>
      </Box>

      {selectedCount > 0 && (
        <Box
          sx={{
            mx: 0,
            mb: 0,
            px: 1.5,
            py: 0.85,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "action.selected",
            color: "text.primary",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <Chip
              label={`${selectedCount} selected`}
              size="small"
              sx={{
                bgcolor: "background.default",
                color: "text.primary",
                fontFamily: "var(--font-header)",
                fontWeight: 700,
              }}
            />
            <Typography
              variant="body2"
              sx={{
                fontFamily: "var(--font-body)",
                opacity: 0.9,
                display: { xs: "none", sm: "block" },
              }}
            >
              Review AI changes before anything is applied.
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Button
              size="small"
              variant="text"
              onClick={clearSelection}
              sx={{
                color: "inherit",
                fontFamily: "var(--font-header)",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              Clear selection
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleRename}
              sx={{
                fontFamily: "var(--font-header)",
                boxShadow: "none",
                "&:hover": { boxShadow: "none" },
              }}
            >
              Rename selected
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleSort}
              sx={{
                fontFamily: "var(--font-header)",
                boxShadow: "none",
                "&:hover": { boxShadow: "none" },
              }}
            >
              Sort selected
            </Button>
          </Box>
        </Box>
      )}

      {renderBreadcrumbs()}

      {filteredFiles.length > 0 ? (
        <Box
          className="hide-scrollbar"
          ref={containerRef}
          onMouseDown={handleContainerMouseDown}
          onScroll={handleContainerScroll}
          sx={{
            flex: 1,
            overflow: "auto",
            minHeight: 0,
            px: 1,
            position: "relative",
            userSelect: isDragSelecting ? "none" : "auto",
          }}
        >
          {dragBox && (
            <Box
              sx={{
                position: "absolute",
                left: dragBox.left,
                top: dragBox.top,
                width: dragBox.width,
                height: dragBox.height,
                border: "1px solid",
                borderColor: "primary.main",
                bgcolor: "primary.main",
                opacity: 0.15,
                pointerEvents: "none",
                zIndex: 2,
              }}
            />
          )}
          {viewMode === "grid" && renderGridView()}
          {viewMode === "list" && renderListView()}
          {viewMode === "table" && renderTableView()}
          {viewMode === "tiles" && renderTilesView()}
          {viewMode === "compact" && renderCompactView()}
          {viewMode === "details" && renderDetailsView()}
        </Box>
      ) : (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexGrow: 1,
            p: 3,
          }}
        >
          {currentDirectoryPath ? (
            <Box
              data-testid="directory-folder-empty-state"
              data-surface="canvas"
              sx={{
                textAlign: "center",
                maxWidth: 420,
                p: 0,
              }}
            >
              <FolderOpenIcon sx={{ fontSize: 42, color: "text.secondary", opacity: 0.8, mb: 1 }} />
              <Typography
                variant="h6"
                color="text.primary"
                align="center"
                sx={{ fontFamily: "var(--font-header)", fontWeight: 700 }}
              >
                {searchTerm ? "No matching files found" : "This folder is empty"}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.75, fontFamily: "var(--font-body)" }}
              >
                {searchTerm
                  ? "Try a different search term or clear filters to broaden the view."
                  : "Choose another folder or add files here, then refresh the directory."}
              </Typography>
            </Box>
          ) : (
            <Box
              data-testid="directory-empty-state"
              data-surface="canvas"
              sx={{
                textAlign: "center",
                maxWidth: 440,
                p: 0,
              }}
            >
              <FolderOpenIcon sx={{ fontSize: 48, color: "text.secondary", opacity: 0.85, mb: 1 }} />
              <Typography
                variant="h5"
                color="text.primary"
                fontWeight={800}
                sx={{ fontFamily: "var(--font-header)" }}
              >
                Select a directory
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.75, fontFamily: "var(--font-body)" }}
              >
                to view its contents
              </Typography>
            </Box>
          )}
        </Box>
      )}

      <SortSuggestions
        open={sortDialogOpen}
        onClose={() => setSortDialogOpen(false)}
        suggestions={suggestions}
        loading={analyzing}
        error={error}
        onApply={handleApplySuggestions}
        onRefresh={handleSortRefresh}
      />
      <RenameDialog
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        suggestions={renameSuggestions}
        loading={analyzing}
        error={error}
        onApply={handleApplyRenames}
        onRefresh={handleRenameRefresh}
        selectedFiles={Array.from(selectedItems).map(path => {
          // Extract filename from path
          const parts = path.split(/[\\/]/);
          return parts[parts.length - 1];
        })}
      />
      <WatchedRenameQueue
        workspaceId={currentWorkspace?.id || null}
        open={watchQueueOpen}
        onClose={() => setWatchQueueOpen(false)}
      />

      <ContextMenu
        open={contextMenu.isOpen}
        position={contextMenu.position}
        items={contextMenu.items}
        onItemClick={handleItemClick}
        onClose={() => {
          hideContextMenu();
          setContextFile(null);
        }}
      />
    </Box>
  );
};

export default DirectoryExplorer;
