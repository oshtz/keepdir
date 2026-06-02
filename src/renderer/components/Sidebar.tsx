import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Drawer,
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  TextField,
  IconButton,
  Divider,
  Collapse,
  Popover,
} from "@mui/material";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Folder as FolderIcon,
  Star as StarIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandLess,
  ExpandMore,
  Settings as SettingsIcon,
  Edit as EditIcon,
  FileCopy as CopyIcon,
  Launch as OpenIcon,
  StarBorder as UnstarIcon,
  DragIndicator as DragIndicatorIcon,
} from "@mui/icons-material";
import { useWorkspace, Workspace } from "../contexts/WorkspaceContext";
import type { CustomSection, CustomSectionItem } from "../electron";
import Settings from "./Settings";
import AnimatedButton from "./AnimatedButton";
import AnimatedCard from "./AnimatedCard";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { useContextMenu, ContextMenuItem } from "../hooks/useContextMenu";
import ContextMenu from "./ContextMenu";
import LazySection from "./LazySection";
import VirtualList from "./VirtualList";
import ModelManagement from "./ModelManagement";

interface AppSettings {
  apiKeys: {
    openai?: string;
    anthropic?: string;
    google?: string;
  };
  selectedProvider: string;
  selectedModel: string;
  renameFiles: boolean;
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
};

interface SidebarProps {
  width?: number;
  darkMode: boolean;
  effectiveDarkMode: boolean; // Computed dark mode that respects workspace theme override
  onDarkModeChange: (mode: boolean) => void;
  accentColor: string;
  onAccentColorChange: (accentColor: string) => void;
  isOllamaAvailable: boolean;
  selectedProvider: string;
  setSelectedProvider: (provider: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  models: Array<{ name: string; status?: string; description?: string }>;
  onModelsLoaded: (
    models: Array<{ name: string; status?: string; description?: string }>,
  ) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  width = 280,
  darkMode,
  effectiveDarkMode,
  onDarkModeChange,
  accentColor,
  onAccentColorChange,
  isOllamaAvailable,
  selectedProvider,
  setSelectedProvider,
  selectedModel,
  setSelectedModel,
  models: _models,
  onModelsLoaded,
}) => {
  void _models; // Suppress unused warning
  const {
    workspaces,
    currentWorkspace,
    recentFolders,
    favoriteFolders,
    customSections,
    sectionOrder,
    sectionVisibility,
    clearRecentFolders,
    addWorkspace,
    removeWorkspace,
    setCurrentWorkspace,
    renameWorkspace,
    updateWorkspaceEmoji,
    removeFavoriteFolder,
    reorderFavoriteFolders,
    reorderSections,
    setCurrentDirectoryPath,
    deleteCustomSection,
    removeItemFromCustomSection,
  } = useWorkspace();

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    // Responsive default width based on screen size
    if (typeof window !== "undefined") {
      if (window.innerWidth < 768)
        return Math.min(240, window.innerWidth * 0.8);
      if (window.innerWidth < 1024) return 260;
      return width;
    }
    return width;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [emojiPickerAnchor, setEmojiPickerAnchor] =
    useState<null | HTMLElement>(null);
  const [activeWorkspaceForEmoji, setActiveWorkspaceForEmoji] = useState<
    string | null
  >(null);
  const { contextMenu, showContextMenu, hideContextMenu, handleItemClick } =
    useContextMenu();

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = e.clientX;
    const minWidth = window.innerWidth < 768 ? 180 : 200;
    const maxWidth = Math.min(600, window.innerWidth * 0.5);
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      setSidebarWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleFolderClick = async (path: string) => {
    try {
      await setCurrentDirectoryPath(path);
    } catch (error) {
      console.error("Failed to load directory:", error);
    }
  };

  const handleAddWorkspace = () => {
    const id = Date.now().toString();
    const name = `Workspace ${workspaces.length + 1}`;
    addWorkspace({ id, name, emoji: "" }); // emoji will be set by addWorkspace with random emoji
  };

  const handleWorkspaceClick = (workspace: Workspace) => {
    setCurrentWorkspace(workspace);
  };

  const handleWorkspaceDoubleClick = (
    workspace: Workspace,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setEditingWorkspace(workspace.id);
    setEditName(workspace.name);
  };

  const handleRenameComplete = (id: string) => {
    if (editName.trim()) {
      renameWorkspace(id, editName.trim());
    }
    setEditingWorkspace(null);
    setEditName("");
  };

  const handleEmojiClick = (
    workspace: Workspace,
    event: React.MouseEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    setActiveWorkspaceForEmoji(workspace.id);
    setEmojiPickerAnchor(event.currentTarget);
  };

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    if (activeWorkspaceForEmoji) {
      updateWorkspaceEmoji(activeWorkspaceForEmoji, emojiData.emoji);
    }
    setEmojiPickerAnchor(null);
    setActiveWorkspaceForEmoji(null);
  };

  const handleEmojiPickerClose = () => {
    setEmojiPickerAnchor(null);
    setActiveWorkspaceForEmoji(null);
  };

  const handleRemoveWorkspace = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeWorkspace(id);
  };

  const handleRemoveFavorite = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    removeFavoriteFolder(path);
  };

  const handleOpenSettings = () => {
    setSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
  };

  // Context menu handlers
  const handleWorkspaceContextMenu = (
    event: React.MouseEvent,
    workspace: Workspace,
  ) => {
    const items: ContextMenuItem[] = [
      {
        id: "rename",
        label: "Rename Workspace",
        icon: <EditIcon fontSize="small" />,
        onClick: () => {
          setEditingWorkspace(workspace.id);
          setEditName(workspace.name);
        },
        shortcut: "F2",
      },
      {
        id: "change-emoji",
        label: "Change Emoji",
        icon: <span style={{ fontSize: "16px" }}>😀</span>,
        onClick: () => handleEmojiClick(workspace, event as any),
      },
      {
        id: "divider1",
        label: "",
        divider: true,
        onClick: () => {},
      },
      {
        id: "delete",
        label: "Delete Workspace",
        icon: <DeleteIcon fontSize="small" />,
        onClick: () => handleRemoveWorkspace(event, workspace.id),
        disabled: workspaces.length <= 1,
      },
    ];
    showContextMenu(event, items);
  };

  const handleFavoriteContextMenu = (event: React.MouseEvent, folder: any) => {
    const items: ContextMenuItem[] = [
      {
        id: "open",
        label: "Open Folder",
        icon: <OpenIcon fontSize="small" />,
        onClick: () => handleFolderClick(folder.path),
        shortcut: "Enter",
      },
      {
        id: "copy-path",
        label: "Copy Path",
        icon: <CopyIcon fontSize="small" />,
        onClick: () => {
          navigator.clipboard.writeText(folder.path);
        },
        shortcut: "Ctrl+C",
      },
      {
        id: "divider1",
        label: "",
        divider: true,
        onClick: () => {},
      },
      {
        id: "remove",
        label: "Remove from Favorites",
        icon: <UnstarIcon fontSize="small" />,
        onClick: () => handleRemoveFavorite(event, folder.path),
      },
    ];
    showContextMenu(event, items);
  };

  const handleRecentContextMenu = (event: React.MouseEvent, folder: string) => {
    const items: ContextMenuItem[] = [
      {
        id: "open",
        label: "Open Folder",
        icon: <OpenIcon fontSize="small" />,
        onClick: () => handleFolderClick(folder),
        shortcut: "Enter",
      },
      {
        id: "copy-path",
        label: "Copy Path",
        icon: <CopyIcon fontSize="small" />,
        onClick: () => {
          navigator.clipboard.writeText(folder);
        },
        shortcut: "Ctrl+C",
      },
      {
        id: "add-favorite",
        label: "Add to Favorites",
        icon: <StarIcon fontSize="small" />,
        onClick: () => {
          // Add to favorites (assuming addFavoriteFolder exists)
          // const parts = folder.split(/[/\\]/);
          // const name = parts[parts.length - 1];
          // addFavoriteFolder({ name, path: folder });
        },
      },
    ];
    showContextMenu(event, items);
  };

  // Sortable favorite item component with enhanced animations
  const SortableFavoriteItem = React.memo(
    React.forwardRef<HTMLDivElement, { folder: any; index: number }>(
      ({ folder, index: folderIndex }, ref) => {
        const {
          attributes,
          listeners,
          setNodeRef,
          transform,
          transition,
          isDragging,
        } = useSortable({ id: `fav-${folder.path}-${folderIndex}` });

        const style = {
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
        };

        return (
          <div
            ref={(node) => {
              setNodeRef(node);
              if (typeof ref === "function") {
                ref(node);
              } else if (ref) {
                ref.current = node;
              }
            }}
            style={style}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: folderIndex * 0.05 }}
              whileHover={{
                scale: 1.05,
                y: -2,
                transition: { duration: 0.2 },
              }}
              whileTap={{ scale: 0.95 }}
            >
              <AnimatedCard
                animationType="hover"
                delay={folderIndex * 0.05}
                sx={{
                  position: "relative",
                  p: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.5,
                  cursor: "pointer",
                  "&:hover": {
                    "& .delete-button": {
                      opacity: 1,
                    },
                  },
                }}
                onClick={() => handleFolderClick(folder.path)}
                onContextMenu={(e) => handleFavoriteContextMenu(e, folder)}
              >
                <Box
                  {...listeners}
                  {...attributes}
                  sx={{
                    cursor: "grab",
                    "&:active": { cursor: "grabbing" },
                  }}
                >
                  <motion.div
                    whileHover={{ rotate: 5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Typography
                      variant="h5"
                      component="div"
                      sx={{ userSelect: "none" }}
                    >
                      📁
                    </Typography>
                  </motion.div>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: "var(--font-body)",
                    textAlign: "center",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    width: "100%",
                    whiteSpace: "nowrap",
                  }}
                >
                  {folder.name}
                </Typography>
                <motion.div
                  className="delete-button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ opacity: 1, scale: 1 }}
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={(e) => handleRemoveFavorite(e, folder.path)}
                    sx={{
                      bgcolor: "background.paper",
                      border: "1px solid",
                      borderColor: "divider",
                      p: 0.5,
                      "&:hover": {
                        bgcolor: "error.main",
                        color: "white",
                      },
                    }}
                  >
                    <DeleteIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </motion.div>
              </AnimatedCard>
            </motion.div>
          </div>
        );
      },
    ),
  );

  SortableFavoriteItem.displayName = "SortableFavoriteItem";

  // Sortable workspace section component
  const SortableWorkspaceSection = () => {
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: "workspaces" });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <Box ref={setNodeRef} style={style}>
        <Box sx={{ p: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Box
              onClick={() => setWorkspacesOpen(!workspacesOpen)}
              sx={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ fontFamily: "var(--font-header)" }}
              >
                WORKSPACES
              </Typography>
              {workspacesOpen ? <ExpandLess /> : <ExpandMore />}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <IconButton
                size="small"
                {...listeners}
                {...attributes}
                sx={{
                  cursor: "grab",
                  "&:active": { cursor: "grabbing" },
                }}
                aria-label="Reorder workspaces section"
              >
                <DragIndicatorIcon fontSize="small" />
              </IconButton>
              <AnimatedButton
                size="small"
                variant="text"
                animationType="bounce"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddWorkspace();
                }}
                sx={{ minWidth: "auto", p: 0.5 }}
              >
                <AddIcon fontSize="small" />
              </AnimatedButton>
            </Box>
          </Box>
          <Collapse
            in={workspacesOpen}
            timeout="auto"
            unmountOnExit
            sx={{ overflow: "visible" }}
          >
            <List dense disablePadding>
              {workspaces.map((workspace) => (
                <ListItem
                  key={workspace.id}
                  button
                  selected={workspace.id === currentWorkspace?.id}
                  onClick={() => handleWorkspaceClick(workspace)}
                  onDoubleClick={(e) =>
                    handleWorkspaceDoubleClick(workspace, e)
                  }
                  onContextMenu={(e) =>
                    handleWorkspaceContextMenu(e, workspace)
                  }
                  secondaryAction={
                    workspaces.length > 1 && (
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => handleRemoveWorkspace(e, workspace.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )
                  }
                >
                  <Box
                    onClick={(e) => handleEmojiClick(workspace, e)}
                    sx={{
                      minWidth: 36,
                      display: "flex",
                      alignItems: "center",
                      cursor: "pointer",
                      "&:hover": {
                        opacity: 0.7,
                      },
                    }}
                  >
                    <Typography sx={{ fontSize: "1.2rem" }}>
                      {workspace.emoji}
                    </Typography>
                  </Box>
                  {editingWorkspace === workspace.id ? (
                    <ClickAwayListener
                      onClickAway={() => handleRenameComplete(workspace.id)}
                    >
                      <TextField
                        size="small"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleRenameComplete(workspace.id);
                          } else if (e.key === "Escape") {
                            setEditingWorkspace(null);
                            setEditName("");
                          }
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        sx={{
                          "& .MuiInputBase-input": {
                            fontFamily: "var(--font-body)",
                            py: 0,
                          },
                        }}
                      />
                    </ClickAwayListener>
                  ) : (
                    <ListItemText
                      primary={workspace.name}
                      primaryTypographyProps={{
                        sx: { fontFamily: "var(--font-body)" },
                      }}
                    />
                  )}
                </ListItem>
              ))}
            </List>
          </Collapse>
        </Box>
        <Divider />
      </Box>
    );
  };

  // Sortable recent section component
  const SortableRecentSection = () => {
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: "recent" });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <Box ref={setNodeRef} style={style}>
        <Box sx={{ p: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Box
              onClick={() => setRecentOpen(!recentOpen)}
              sx={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ fontFamily: "var(--font-header)" }}
              >
                RECENT FOLDERS
              </Typography>
              {recentOpen ? <ExpandLess /> : <ExpandMore />}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <IconButton
                size="small"
                {...listeners}
                {...attributes}
                sx={{
                  cursor: "grab",
                  "&:active": { cursor: "grabbing" },
                }}
                aria-label="Reorder recent section"
              >
                <DragIndicatorIcon fontSize="small" />
              </IconButton>
              <AnimatedButton
                size="small"
                variant="text"
                animationType="scale"
                disabled={recentFolders.length === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  clearRecentFolders();
                }}
                sx={{ minWidth: "auto", p: 0.5 }}
              >
                <DeleteIcon fontSize="small" />
              </AnimatedButton>
            </Box>
          </Box>
          <Collapse
            in={recentOpen}
            timeout="auto"
            unmountOnExit
            sx={{ overflow: "visible" }}
          >
            {recentFolders.length === 0 ? (
              <List dense disablePadding>
                <ListItem>
                  <ListItemText
                    secondary="No recent folders"
                    secondaryTypographyProps={{
                      sx: { fontFamily: "var(--font-body)" },
                    }}
                  />
                </ListItem>
              </List>
            ) : recentFolders.length > 10 ? (
              <VirtualList
                items={recentFolders.slice(0, 20)} // Limit to 20 recent folders
                itemHeight={48}
                containerHeight={Math.min(300, recentFolders.length * 48)}
                renderItem={(folder, index) => {
                  const parts = folder.split(/[/\\]/);
                  const recentDir = parts[parts.length - 1];
                  const parentDir = parts[parts.length - 2] || "";

                  return (
                    <ListItem
                      key={index}
                      button
                      onClick={() => handleFolderClick(folder)}
                      onContextMenu={(e) => handleRecentContextMenu(e, folder)}
                      sx={{
                        "& .MuiListItemText-root": {
                          overflow: "hidden",
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <FolderIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography
                            sx={{
                              fontFamily: "var(--font-body)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {parentDir && `${parentDir}/`}
                            <Box component="span" sx={{ fontWeight: "bold" }}>
                              {recentDir}
                            </Box>
                          </Typography>
                        }
                      />
                    </ListItem>
                  );
                }}
              />
            ) : (
              <List dense disablePadding>
                {recentFolders.slice(0, 3).map((folder, index) => {
                  const parts = folder.split(/[/\\]/);
                  const recentDir = parts[parts.length - 1];
                  const parentDir = parts[parts.length - 2] || "";

                  return (
                    <ListItem
                      key={index}
                      button
                      onClick={() => handleFolderClick(folder)}
                      onContextMenu={(e) => handleRecentContextMenu(e, folder)}
                      sx={{
                        "& .MuiListItemText-root": {
                          overflow: "hidden",
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <FolderIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography
                            sx={{
                              fontFamily: "var(--font-body)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {parentDir && `${parentDir}/`}
                            <Box component="span" sx={{ fontWeight: "bold" }}>
                              {recentDir}
                            </Box>
                          </Typography>
                        }
                      />
                    </ListItem>
                  );
                })}
              </List>
            )}
          </Collapse>
        </Box>
        <Divider />
      </Box>
    );
  };

  // Sortable favorites section component
  const SortableFavoritesSection = () => {
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: "favorites" });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <Box ref={setNodeRef} style={style}>
        <Box sx={{ p: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Box
              onClick={() => setFavoritesOpen(!favoritesOpen)}
              sx={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ fontFamily: "var(--font-header)" }}
              >
                FAVORITES
              </Typography>
              {favoritesOpen ? <ExpandLess /> : <ExpandMore />}
            </Box>
            <IconButton
              size="small"
              {...listeners}
              {...attributes}
              sx={{
                cursor: "grab",
                "&:active": { cursor: "grabbing" },
              }}
              aria-label="Reorder favorites section"
            >
              <DragIndicatorIcon fontSize="small" />
            </IconButton>
          </Box>
          <Collapse
            in={favoritesOpen}
            timeout="auto"
            unmountOnExit
            sx={{ overflow: "visible" }}
          >
            <SortableContext
              items={favoriteFolders.map(
                (folder, index) => `fav-${folder.path}-${index}`,
              )}
              strategy={rectSortingStrategy}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 1,
                  minHeight: "auto",
                  position: "relative",
                  overflow: "visible",
                  padding: "12px 8px", // Add padding on all sides to prevent cropping
                  margin: "-4px", // Negative margin to compensate for padding
                }}
              >
                {favoriteFolders.length === 0 ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontFamily: "var(--font-body)",
                      p: 1,
                      textAlign: "center",
                      gridColumn: "1 / -1",
                    }}
                  >
                    No favorite folders
                  </Typography>
                ) : (
                  favoriteFolders.map((folder, index) => (
                    <SortableFavoriteItem
                      key={`fav-${folder.path}-${index}`}
                      folder={folder}
                      index={index}
                    />
                  ))
                )}
              </Box>
            </SortableContext>
          </Collapse>
        </Box>
        <Divider />
      </Box>
    );
  };

  // Sortable custom section component
  const SortableCustomSection = ({ section }: { section: CustomSection }) => {
    const [isOpen, setIsOpen] = useState(true);
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: section.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <Box ref={setNodeRef} style={style}>
        <Box sx={{ p: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Box
              onClick={() => setIsOpen(!isOpen)}
              sx={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ fontFamily: "var(--font-header)" }}
              >
                {section.name.toUpperCase()}
              </Typography>
              {isOpen ? <ExpandLess /> : <ExpandMore />}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <IconButton
                size="small"
                {...listeners}
                {...attributes}
                sx={{
                  cursor: "grab",
                  "&:active": { cursor: "grabbing" },
                }}
                aria-label="Reorder custom section"
              >
                <DragIndicatorIcon fontSize="small" />
              </IconButton>
              <AnimatedButton
                size="small"
                variant="text"
                animationType="scale"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCustomSection(section.id);
                }}
                sx={{ minWidth: "auto", p: 0.5 }}
              >
                <DeleteIcon fontSize="small" />
              </AnimatedButton>
            </Box>
          </Box>
          <Collapse
            in={isOpen}
            timeout="auto"
            unmountOnExit
            sx={{ overflow: "visible" }}
          >
            {section.items && section.items.length === 0 ? (
              <List dense disablePadding>
                <ListItem>
                  <ListItemText
                    secondary="No items in this section"
                    secondaryTypographyProps={{
                      sx: { fontFamily: "var(--font-body)" },
                    }}
                  />
                </ListItem>
              </List>
            ) : section.items && section.items.length > 15 ? (
              <VirtualList
                items={section.items}
                itemHeight={48}
                containerHeight={Math.min(300, section.items.length * 48)}
                renderItem={(item: CustomSectionItem, index: number) => (
                  <ListItem
                    key={index}
                    button
                    onClick={() => {
                      if (item.path) {
                        handleFolderClick(item.path);
                      }
                    }}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItemFromCustomSection(section.id, item.id);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <FolderIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.name}
                      primaryTypographyProps={{
                        sx: { fontFamily: "var(--font-body)" },
                      }}
                    />
                  </ListItem>
                )}
              />
            ) : (
              <List dense disablePadding>
                {section.items?.map((item: CustomSectionItem, index: number) => (
                  <ListItem
                    key={index}
                    button
                    onClick={() => {
                      if (item.path) {
                        handleFolderClick(item.path);
                      }
                    }}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItemFromCustomSection(section.id, item.id);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <FolderIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.name}
                      primaryTypographyProps={{
                        sx: { fontFamily: "var(--font-body)" },
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Collapse>
        </Box>
        <Divider />
      </Box>
    );
  };

  // Set up sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    if (active.id !== over.id) {
      const activeId = active.id as string;
      const overId = over.id as string;

      // Handle section reordering
      if (sectionOrder.includes(activeId) && sectionOrder.includes(overId)) {
        const oldIndex = sectionOrder.indexOf(activeId);
        const newIndex = sectionOrder.indexOf(overId);
        reorderSections(oldIndex, newIndex);
      }
      // Handle favorites reordering
      else if (activeId.startsWith("fav-") && overId.startsWith("fav-")) {
        // Extract index from the new key format: fav-{path}-{index}
        const oldIndex = parseInt(activeId.split("-").pop() || "0");
        const newIndex = parseInt(overId.split("-").pop() || "0");
        reorderFavoriteFolders(oldIndex, newIndex);
      }
    }
  };

  const TITLE_BAR_HEIGHT = 32;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: {
          xs: Math.min(sidebarWidth, window.innerWidth * 0.8),

          sm: sidebarWidth,
        },

        flexShrink: 0,

        position: "relative",

        "& .MuiDrawer-paper": {
          width: {
            xs: Math.min(sidebarWidth, window.innerWidth * 0.8),

            sm: sidebarWidth,
          },

          boxSizing: "border-box",

          borderRight: "1px solid rgba(0, 0, 0, 0.12)",

          background: (theme) =>
            theme.palette.mode === "dark"
              ? "rgba(45, 45, 45, 0.9)"
              : "rgba(255, 255, 255, 0.9)",

          backdropFilter: "blur(8px)",

          overflow: "hidden",

          display: "flex",

          flexDirection: "column",

          minWidth: { xs: 180, sm: 200 },

          maxWidth: { xs: "80vw", sm: "50vw" },

          top: TITLE_BAR_HEIGHT,
          height: `calc(100vh - ${TITLE_BAR_HEIGHT}px)`,
        },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          right: -4,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: "ew-resize",
          zIndex: 1200,
          "&:hover": {
            backgroundColor: "primary.main",
            opacity: 0.2,
          },
          ...(isResizing && {
            backgroundColor: "primary.main",
            opacity: 0.2,
          }),
        }}
        onMouseDown={handleMouseDown}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sectionOrder.filter((s) => sectionVisibility[s] !== false)}
          strategy={verticalListSortingStrategy}
        >
          <Box
            sx={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box
              className="hide-scrollbar"
              sx={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
              }}
            >
              {sectionOrder
                .filter((s) => sectionVisibility[s] !== false)
                .map((sectionType) => {
                  if (sectionType === "workspaces") {
                    return (
                      <LazySection key={sectionType} enabled={true}>
                        <SortableWorkspaceSection />
                      </LazySection>
                    );
                  } else if (sectionType === "recent") {
                    return (
                      <LazySection key={sectionType} enabled={true}>
                        <SortableRecentSection />
                      </LazySection>
                    );
                  } else if (sectionType === "favorites") {
                    return (
                      <LazySection key={sectionType} enabled={true}>
                        <SortableFavoritesSection />
                      </LazySection>
                    );
                  } else {
                    // Check if this is a custom section
                    const customSection = customSections.find(
                      (section) => section.id === sectionType,
                    );
                    if (customSection) {
                      return (
                        <LazySection key={sectionType} enabled={true}>
                          <SortableCustomSection section={customSection} />
                        </LazySection>
                      );
                    }
                  }
                  return null;
                })}
            </Box>
          </Box>
        </SortableContext>
      </DndContext>

      <Divider />

      {/* Model Management Section */}
      <Box sx={{ p: { xs: 1, sm: 1.5 }, flexShrink: 0 }}>
        <Box
          sx={{
            p: { xs: 1, sm: 1.5 },
            borderRadius: 1.5,
            backgroundColor: effectiveDarkMode
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.02)",
            border: "1px solid",
            borderColor: effectiveDarkMode
              ? "rgba(255,255,255,0.1)"
              : "rgba(0,0,0,0.08)",
            mb: { xs: 1, sm: 1.5 },
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              mb: 1,
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                width: { xs: 4, sm: 6 },
                height: { xs: 4, sm: 6 },
                borderRadius: "50%",
                backgroundColor: "primary.main",
                boxShadow: "0 0 6px rgba(255,87,51,0.4)",
                flexShrink: 0,
              }}
            />
            <Typography
              variant="caption"
              sx={{
                fontSize: { xs: "0.6rem", sm: "0.7rem" },
                fontWeight: 600,
                color: "text.secondary",
                fontFamily: "var(--font-header)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Selected Model
            </Typography>
          </Box>
          <ModelManagement
            selectedProvider={selectedProvider || ""}
            selectedModel={selectedModel || ""}
            onModelsLoaded={onModelsLoaded}
            searchTerm=""
            compact={true}
          />
        </Box>
      </Box>

      <Divider />

      {/* Settings and Keyboard Shortcuts */}
      <Box sx={{ p: { xs: 1, sm: 1.5 }, flexShrink: 0 }}>
        <ListItem
          button
          onClick={handleOpenSettings}
          sx={{
            borderRadius: 1.5,
            mx: { xs: 0.25, sm: 0.5 },
            transition: "all 0.2s ease",
            py: { xs: 0.5, sm: 1 },
            "&:hover": {
              backgroundColor: "primary.light",
              transform: "translateX(4px)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            },
          }}
        >
          <ListItemIcon sx={{ minWidth: { xs: 28, sm: 36 } }}>
            <SettingsIcon fontSize="small" sx={{ color: "primary.main" }} />
          </ListItemIcon>
          <ListItemText
            primary="Settings"
            primaryTypographyProps={{
              sx: {
                fontFamily: "var(--font-body)",
                fontWeight: 500,
                fontSize: { xs: "0.875rem", sm: "1rem" },
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            }}
          />
        </ListItem>
      </Box>

      <Settings
        open={settingsOpen}
        onClose={async () => {
          handleCloseSettings();
          const result =
            (await window.electronAPI.loadSettings()) as SettingsResponse;
          const settings = result.settings || defaultSettings;
          setSelectedProvider(settings.selectedProvider);
          setSelectedModel(settings.selectedModel);
        }}
        darkMode={darkMode}
        onDarkModeChange={onDarkModeChange}
        accentColor={accentColor}
        onAccentColorChange={onAccentColorChange}
        isOllamaAvailable={isOllamaAvailable}
      />

      <Popover
        open={Boolean(emojiPickerAnchor)}
        anchorEl={emojiPickerAnchor}
        onClose={handleEmojiPickerClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
      >
        <EmojiPicker onEmojiClick={handleEmojiSelect} />
      </Popover>

      <ContextMenu
        open={contextMenu.isOpen}
        position={contextMenu.position}
        items={contextMenu.items}
        onItemClick={handleItemClick}
        onClose={hideContextMenu}
      />
    </Drawer>
  );
};

export default Sidebar;
