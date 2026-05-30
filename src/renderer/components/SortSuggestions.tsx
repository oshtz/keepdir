import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import OrganizeIcon from '@mui/icons-material/FolderSpecial';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox';
import { SortSuggestions as SortSuggestionsType, Category } from '../electron';

interface SortSuggestionsProps {
  open: boolean;
  onClose: () => void;
  suggestions?: SortSuggestionsType;
  loading: boolean;
  error?: string;
  onApply: (suggestions: SortSuggestionsType) => void;
  onRefresh?: () => void;
}

interface GroupedCategory {
  name: string;
  descriptions: string[];
  suggestedPaths: string[];
  allFiles: string[];
  originalCategories: Category[];
}

interface DirectoryNode {
  name: string;
  path: string;
  files: string[];
  children: DirectoryNode[];
  isExpanded?: boolean;
}

const SortSuggestions: React.FC<SortSuggestionsProps> = ({
  open,
  onClose,
  suggestions,
  loading,
  error,
  onApply,
  onRefresh,
}) => {
  const theme = useTheme();
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    currentFile?: string;
    status?: string;
  }>({ current: 0, total: 0 });
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectiveMode, setSelectiveMode] = useState(false);

  // Initialize selected files when suggestions change
  useEffect(() => {
    if (suggestions) {
      const allFiles = new Set<string>();
      suggestions.categories.forEach(cat => {
        cat.files.forEach(file => allFiles.add(file));
      });
      setSelectedFiles(allFiles);
    }
  }, [suggestions]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onSortProgress((value: {
      current: number;
      total: number;
      currentFile?: string;
      status?: string;
    }) => {
      setProgress(value);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Group categories by name and create directory structure
  const { groupedCategories, directoryStructure } = useMemo(() => {
    if (!suggestions) return { groupedCategories: [], directoryStructure: [] };

    // Group categories by name
    const grouped = suggestions.categories.reduce((acc, category) => {
      const existing = acc.find(g => g.name === category.name);
      if (existing) {
        existing.descriptions.push(category.description);
        existing.suggestedPaths.push(category.suggestedPath);
        existing.allFiles.push(...category.files);
        existing.originalCategories.push(category);
      } else {
        acc.push({
          name: category.name,
          descriptions: [category.description],
          suggestedPaths: [category.suggestedPath],
          allFiles: [...category.files],
          originalCategories: [category]
        });
      }
      return acc;
    }, [] as GroupedCategory[]);

    // Create directory structure
    const structure: DirectoryNode[] = [];
    const pathMap = new Map<string, DirectoryNode>();

    suggestions.categories.forEach(category => {
      const pathParts = category.suggestedPath.split('/').filter(Boolean);
      let currentPath = '';
      let currentLevel = structure;

      pathParts.forEach((part, index) => {
        currentPath += (currentPath ? '/' : '') + part;
        
        let node = pathMap.get(currentPath);
        if (!node) {
          node = {
            name: part,
            path: currentPath,
            files: index === pathParts.length - 1 ? category.files : [],
            children: [],
            isExpanded: false
          };
          pathMap.set(currentPath, node);
          currentLevel.push(node);
        } else if (index === pathParts.length - 1) {
          node.files.push(...category.files);
        }
        
        currentLevel = node.children;
      });
    });

    return { groupedCategories: grouped, directoryStructure: structure };
  }, [suggestions]);

  // Get all files from suggestions
  const allFiles = useMemo(() => {
    if (!suggestions) return [];
    const files: string[] = [];
    suggestions.categories.forEach(cat => {
      cat.files.forEach(file => files.push(file));
    });
    return files;
  }, [suggestions]);

  // Toggle file selection
  const toggleFileSelection = useCallback((file: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(file)) {
        newSet.delete(file);
      } else {
        newSet.add(file);
      }
      return newSet;
    });
  }, []);

  // Toggle all files in a category
  const toggleCategorySelection = useCallback((files: string[]) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      const allSelected = files.every(file => newSet.has(file));
      if (allSelected) {
        files.forEach(file => newSet.delete(file));
      } else {
        files.forEach(file => newSet.add(file));
      }
      return newSet;
    });
  }, []);

  // Select/Deselect all
  const toggleSelectAll = useCallback(() => {
    if (selectedFiles.size === allFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(allFiles));
    }
  }, [selectedFiles.size, allFiles]);

  // Get selection state for a category
  const getCategorySelectionState = useCallback((files: string[]): 'all' | 'some' | 'none' => {
    const selectedCount = files.filter(file => selectedFiles.has(file)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === files.length) return 'all';
    return 'some';
  }, [selectedFiles]);

  const handleApply = () => {
    if (suggestions) {
      // Filter suggestions to only include selected files
      const filteredSuggestions: SortSuggestionsType = {
        categories: suggestions.categories
          .map(cat => ({
            ...cat,
            files: cat.files.filter(file => selectedFiles.has(file))
          }))
          .filter(cat => cat.files.length > 0)
      };
      
      const totalFiles = filteredSuggestions.categories.reduce((sum, cat) => sum + cat.files.length, 0);
      setProgress({ current: 0, total: totalFiles });
      onApply(filteredSuggestions);
    }
  };

  const toggleNodeExpansion = (path: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const renderProgress = () => {
    if (!progress.total) return null;

    const percentage = (progress.current / progress.total) * 100;
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
            {progress.status || `Processing file ${progress.current} of ${progress.total}`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
            {Math.round(percentage)}%
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={percentage} />
        {progress.currentFile && (
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ mt: 1, fontFamily: 'var(--font-body)' }}
          >
            Current file: {progress.currentFile}
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        tabIndex: -1,
        sx: {
          borderRadius: 1.5,
          background: theme.palette.background.default,
        }
      }}
    >
      <DialogTitle
        sx={{
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: theme.palette.primary.contrastText,
          borderRadius: 'var(--border-radius-medium) var(--border-radius-medium) 0 0',
        }}
      >
        <Box display="flex" alignItems="center">
          <AccountTreeIcon sx={{ mr: 1.5, fontSize: 28 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontFamily: 'var(--font-header)', fontWeight: 600 }}>
            Organization Suggestions
          </Typography>
          {onRefresh && (
            <IconButton
              onClick={onRefresh}
              size="small"
              sx={{
                color: 'inherit',
                mr: 1,
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                },
                animation: loading ? 'spin 1s linear infinite' : 'none',
                '@keyframes spin': {
                  '0%': {
                    transform: 'rotate(0deg)',
                  },
                  '100%': {
                    transform: 'rotate(360deg)',
                  },
                }
              }}
              disabled={loading}
              title={loading ? "Getting fresh suggestions..." : "Get new suggestions"}
            >
              <RefreshIcon />
            </IconButton>
          )}
          <IconButton onClick={onClose} size="small" sx={{ color: 'inherit' }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{
        maxHeight: '60vh',
        overflow: 'auto',
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: theme.palette.primary.main + '40',
          borderRadius: 'var(--border-radius-small)',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: theme.palette.primary.main + '60',
        },
        scrollbarWidth: 'thin',
        scrollbarColor: `${theme.palette.primary.main}40 transparent`,
      }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography sx={{ fontFamily: 'var(--font-body)' }}>
              {suggestions ? 'Generating fresh suggestions...' : 'Analyzing files...'}
            </Typography>
            {renderProgress()}
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 2, fontFamily: 'var(--font-body)' }}>
            {error}
          </Alert>
        ) : suggestions ? (
          <Box>
            {/* Header with Selection Controls */}
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 2,
              p: 1.5,
              backgroundColor: theme.palette.mode === 'dark'
                ? `${theme.palette.primary.main}15`
                : `${theme.palette.primary.main}10`,
              borderRadius: 1.5,
              border: `1px solid ${theme.palette.primary.main}30`
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <OrganizeIcon sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 20 }} />
                <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)', color: theme.palette.text.primary }}>
                  Proposed directory structure ({selectedFiles.size} of {allFiles.length} files selected)
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={selectiveMode}
                      onChange={(e) => setSelectiveMode(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="caption" sx={{ fontFamily: 'var(--font-body)' }}>
                      Selective Mode
                    </Typography>
                  }
                  sx={{ mr: 1 }}
                />
                {selectiveMode && (
                  <Tooltip title={selectedFiles.size === allFiles.length ? 'Deselect All' : 'Select All'}>
                    <IconButton
                      size="small"
                      onClick={toggleSelectAll}
                      sx={{ color: theme.palette.primary.main }}
                    >
                      {selectedFiles.size === allFiles.length ? (
                        <CheckBoxIcon fontSize="small" />
                      ) : selectedFiles.size === 0 ? (
                        <CheckBoxOutlineBlankIcon fontSize="small" />
                      ) : (
                        <IndeterminateCheckBoxIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>

            {/* Directory Structure Tree */}
            <Box sx={{
              maxHeight: '55vh',
              overflow: 'auto',
              border: `1px solid ${theme.palette.primary.main}20`,
              borderRadius: 1.5,
              backgroundColor: theme.palette.background.paper,
              '&::-webkit-scrollbar': {
                width: '6px',
              },
              '&::-webkit-scrollbar-track': {
                background: 'transparent',
              },
              '&::-webkit-scrollbar-thumb': {
                background: theme.palette.primary.main + '30',
                borderRadius: 'var(--border-radius-small)',
              },
              '&::-webkit-scrollbar-thumb:hover': {
                background: theme.palette.primary.main + '50',
              },
            }}>
              <List dense sx={{ py: 0 }}>
                {directoryStructure.map((node) => (
                  <DirectoryTreeNode
                    key={node.path}
                    node={node}
                    level={0}
                    expandedNodes={expandedNodes}
                    onToggle={toggleNodeExpansion}
                    theme={theme}
                    groupedCategories={groupedCategories}
                    selectiveMode={selectiveMode}
                    selectedFiles={selectedFiles}
                    onToggleFile={toggleFileSelection}
                    onToggleCategory={toggleCategorySelection}
                    getCategorySelectionState={getCategorySelectionState}
                  />
                ))}
              </List>
            </Box>

            {/* Summary */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)', mb: 1 }}>
                Summary: {groupedCategories.length} categories, {directoryStructure.length} root directories
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {groupedCategories.slice(0, 5).map((group, index) => (
                  <Chip
                    key={index}
                    label={`${group.name} (${group.allFiles.length})`}
                    size="small"
                    sx={{
                      backgroundColor: theme.palette.mode === 'dark'
                        ? `${theme.palette.primary.main}20`
                        : `${theme.palette.primary.main}15`,
                      color: theme.palette.primary.main,
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem'
                    }}
                  />
                ))}
                {groupedCategories.length > 5 && (
                  <Chip
                    label={`+${groupedCategories.length - 5} more`}
                    size="small"
                    sx={{
                      backgroundColor: theme.palette.action.hover,
                      color: theme.palette.text.secondary,
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem'
                    }}
                  />
                )}
              </Stack>
            </Box>

            {renderProgress()}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ fontFamily: 'var(--font-body)' }}>
              {loading ? 'Generating fresh suggestions...' : 'No suggestions available'}
            </Typography>
            {loading && (
              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                  Please wait while AI analyzes your files
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{
        p: 3,
        backgroundColor: theme.palette.mode === 'dark'
          ? theme.palette.background.paper
          : `${theme.palette.background.default}CC`
      }}>
        <Button
          onClick={onClose}
          sx={{
            fontFamily: 'var(--font-header)',
            color: theme.palette.text.secondary,
            '&:hover': {
              backgroundColor: theme.palette.action.hover
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={loading || !suggestions || selectedFiles.size === 0}
          startIcon={<OrganizeIcon />}
          sx={{
            fontFamily: 'var(--font-header)',
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            borderRadius: 1.5,
            px: 3,
            py: 1,
            '&:hover': {
              background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.dark} 100%)`,
              transform: 'translateY(-1px)',
              boxShadow: theme.shadows[8]
            },
            '&:disabled': {
              background: theme.palette.action.disabledBackground,
              color: theme.palette.action.disabled
            }
          }}
        >
          Apply Organization {selectiveMode && selectedFiles.size < allFiles.length ? `(${selectedFiles.size} files)` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Directory Tree Node Component
interface DirectoryTreeNodeProps {
  node: DirectoryNode;
  level: number;
  expandedNodes: Set<string>;
  onToggle: (path: string) => void;
  theme: any;
  groupedCategories: GroupedCategory[];
  selectiveMode: boolean;
  selectedFiles: Set<string>;
  onToggleFile: (file: string) => void;
  onToggleCategory: (files: string[]) => void;
  getCategorySelectionState: (files: string[]) => 'all' | 'some' | 'none';
}

const DirectoryTreeNode: React.FC<DirectoryTreeNodeProps> = ({
  node,
  level,
  expandedNodes,
  onToggle,
  theme,
  groupedCategories,
  selectiveMode,
  selectedFiles,
  onToggleFile,
  onToggleCategory,
  getCategorySelectionState
}) => {
  const isExpanded = expandedNodes.has(node.path);
  const hasChildren = node.children.length > 0;
  const hasFiles = node.files.length > 0;
  
  // Find the category description for this path
  const categoryInfo = groupedCategories.find(group =>
    group.suggestedPaths.some(path => path.endsWith(node.path))
  );

  // Get selection state for this folder's files
  const folderSelectionState = hasFiles ? getCategorySelectionState(node.files) : 'none';

  return (
    <>
      <ListItem
        sx={{
          pl: level * 2 + 1,
          py: 0.5,
          cursor: hasChildren || hasFiles ? 'pointer' : 'default',
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
          },
          borderLeft: level > 0 ? `1px solid ${theme.palette.primary.main}20` : 'none',
          ml: level > 0 ? 1 : 0,
        }}
        onClick={() => {
          if (hasChildren) onToggle(node.path);
          else if (hasFiles && !selectiveMode) onToggle(node.path);
        }}
      >
        {/* Checkbox for selective mode */}
        {selectiveMode && hasFiles && (
          <Checkbox
            size="small"
            checked={folderSelectionState === 'all'}
            indeterminate={folderSelectionState === 'some'}
            onChange={(e) => {
              e.stopPropagation();
              onToggleCategory(node.files);
            }}
            onClick={(e) => e.stopPropagation()}
            sx={{ p: 0.5, mr: 0.5 }}
          />
        )}
        <ListItemIcon sx={{ minWidth: 32 }}>
          {hasChildren ? (
            isExpanded ? (
              <ExpandLessIcon sx={{ fontSize: 16, color: theme.palette.primary.main }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: 16, color: theme.palette.primary.main }} />
            )
          ) : null}
          {hasChildren ? (
            isExpanded ? (
              <FolderOpenIcon sx={{ fontSize: 18, color: theme.palette.primary.main, ml: 0.5 }} />
            ) : (
              <FolderIcon sx={{ fontSize: 18, color: theme.palette.primary.main, ml: 0.5 }} />
            )
          ) : (
            <FolderIcon sx={{ fontSize: 18, color: theme.palette.primary.light, ml: selectiveMode ? 0 : 2 }} />
          )}
        </ListItemIcon>
        
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: hasFiles ? 600 : 500,
                  color: hasFiles ? theme.palette.text.primary : theme.palette.text.secondary,
                }}
              >
                {node.name}
              </Typography>
              {hasFiles && (
                <Chip
                  label={node.files.length}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.7rem',
                    backgroundColor: theme.palette.primary.main,
                    color: theme.palette.primary.contrastText,
                    '& .MuiChip-label': {
                      px: 0.5,
                    }
                  }}
                />
              )}
            </Box>
          }
          secondary={
            categoryInfo && hasFiles ? (
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'var(--font-body)',
                  color: theme.palette.text.secondary,
                  fontStyle: 'italic',
                  display: '-webkit-box',
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {categoryInfo.descriptions[0]}
              </Typography>
            ) : null
          }
          sx={{ my: 0 }}
        />
      </ListItem>

      {/* Files in this directory */}
      {hasFiles && isExpanded && (
        <Collapse in={isExpanded}>
          <Box sx={{ pl: level * 2 + 4, py: 0.5 }}>
            {node.files.slice(0, selectiveMode ? 10 : 5).map((file, index) => {
              const isSelected = selectedFiles.has(file);
              return (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.25,
                    pl: 1,
                    borderLeft: `1px solid ${theme.palette.primary.main}15`,
                    ml: 1,
                    opacity: selectiveMode && !isSelected ? 0.5 : 1,
                    cursor: selectiveMode ? 'pointer' : 'default',
                    '&:hover': selectiveMode ? {
                      backgroundColor: theme.palette.action.hover,
                      borderRadius: 0.5
                    } : {}
                  }}
                  onClick={selectiveMode ? () => onToggleFile(file) : undefined}
                >
                  {selectiveMode && (
                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onChange={() => onToggleFile(file)}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ p: 0, mr: 0.5 }}
                    />
                  )}
                  <InsertDriveFileIcon sx={{ 
                    fontSize: 14, 
                    color: selectiveMode && !isSelected 
                      ? theme.palette.text.disabled 
                      : theme.palette.text.secondary 
                  }} />
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'var(--font-body)',
                      color: selectiveMode && !isSelected 
                        ? theme.palette.text.disabled 
                        : theme.palette.text.secondary,
                      textDecoration: selectiveMode && !isSelected ? 'line-through' : 'none'
                    }}
                  >
                    {file}
                  </Typography>
                </Box>
              );
            })}
            {node.files.length > (selectiveMode ? 10 : 5) && (
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'var(--font-body)',
                  color: theme.palette.text.disabled,
                  pl: selectiveMode ? 4 : 3,
                  fontStyle: 'italic',
                }}
              >
                ... and {node.files.length - (selectiveMode ? 10 : 5)} more files
              </Typography>
            )}
          </Box>
        </Collapse>
      )}

      {/* Child directories */}
      {hasChildren && (
        <Collapse in={isExpanded}>
          {node.children.map((child) => (
            <DirectoryTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              theme={theme}
              groupedCategories={groupedCategories}
              selectiveMode={selectiveMode}
              selectedFiles={selectedFiles}
              onToggleFile={onToggleFile}
              onToggleCategory={onToggleCategory}
              getCategorySelectionState={getCategorySelectionState}
            />
          ))}
        </Collapse>
      )}
    </>
  );
};

export default SortSuggestions;
