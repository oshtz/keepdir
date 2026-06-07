import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';

interface ModelManagementProps {
  selectedProvider: string;
  selectedModel: string;
  onModelsLoaded: (models: Model[]) => void;
  compact?: boolean;
  searchTerm?: string;
}

interface Model {
  name: string;
  size?: string;
  modified?: string;
  status?: 'ready' | 'downloading' | 'error';
  description?: string;
}

const ModelManagement: React.FC<ModelManagementProps> = ({ selectedProvider, selectedModel, onModelsLoaded, compact, searchTerm: _searchTerm }) => {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [defaultModel, setDefaultModel] = useState('');

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDefaultModel('');
    try {
      if (selectedProvider === 'ollama') {
        const response = await axios.get('http://localhost:11434/api/tags');
        if (response.data && response.data.models) {
          const mappedModels = response.data.models.map((model: any) => ({
            name: model.name,
            size: model.size,
            modified: model.modified,
            status: 'ready'
          }));
          setModels(mappedModels);
          onModelsLoaded(mappedModels);
        }
      } else {
        const result = await window.electronAPI.getProviderModels(selectedProvider);
        if (result.error) {
          setError(result.error);
          setModels([]);
          onModelsLoaded([]);
          return;
        }

        const mappedModels: Model[] = (result.models || []).map((name) => ({
          name,
          status: 'ready'
        }));
        setDefaultModel(result.defaultModel || '');
        setModels(mappedModels);
        onModelsLoaded(mappedModels);
      }
    } catch (error) {
      setError('Failed to fetch models. Is the provider service running?');
      console.error('Failed to fetch models:', error);
    } finally {
      setLoading(false);
    }
  }, [onModelsLoaded, selectedProvider]);

  useEffect(() => {
    if (!selectedProvider) {
      setModels([]);
      onModelsLoaded([]);
      setLoading(false);
      return;
    }

    fetchModels();
  }, [fetchModels, onModelsLoaded, selectedModel, selectedProvider]); // Refresh after model changes.

  const handlePullModel = async () => {
    if (!newModelName) return;
    
    setPulling(true);
    setError(null);
    try {
      let response;
      const result = await window.electronAPI.loadSettings();
      const settings = result.settings || { apiKeys: {}, renameFiles: false };
      
      if (selectedProvider === 'ollama') {
        response = await axios.post('http://localhost:11434/api/pull', {
          model: newModelName,
        });
      } else if (selectedProvider === 'openai' && settings?.apiKeys?.openai) {
        setError('OpenAI models are available automatically with your API key');
        return;
      } else {
        setError('Model pulling is only supported for Ollama');
        return;
      }
      if (response.data && response.data.status === 'success') {
        await fetchModels();
        setNewModelName('');
      } else {
        setError('Failed to pull model');
      }
    } catch (error) {
      setError('Failed to pull model. Check the model name and try again.');
      console.error('Failed to pull model:', error);
    } finally {
      setPulling(false);
    }
  };

  if (loading) {
    if (compact) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25, color: 'text.secondary' }}>
          <CircularProgress size={14} />
          <Typography variant="caption" sx={{ fontFamily: 'var(--font-body)' }}>
            Loading model
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (compact) {
    const modelToShow = selectedModel || defaultModel || models[0]?.name;
    const model = models.find(m => m.name === modelToShow);
    if (model) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            noWrap
            sx={{
              minWidth: 0,
              flex: 1,
              fontFamily: 'var(--font-header)',
              fontWeight: 700,
              color: 'text.primary',
            }}
          >
            {model.name}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              flexShrink: 0,
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              color: model.status === 'ready' ? 'success.main' : 'warning.main',
            }}
          >
            {model.status}
          </Typography>
        </Box>
      );
    }
    return null;
  }

  return (
    <Box>
      {error && (
        <Alert 
          severity="error" 
          sx={{ 
            mb: 3,
            borderRadius: 1.5,
            backgroundColor: 'error.light',
            color: 'error.dark',
            '& .MuiAlert-icon': { color: 'error.main' },
            '& .MuiAlert-message': { fontFamily: 'var(--font-body)' }
          }}
        >
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField
          placeholder="Enter model name to pull"
          value={newModelName}
          onChange={(e) => setNewModelName(e.target.value)}
          size="small"
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 1.5,
              backgroundColor: 'background.default',
              '&:hover': {
                backgroundColor: 'background.paper'
              }
            },
            '& .MuiInputBase-input': {
              fontFamily: 'var(--font-body)'
            }
          }}
        />
        <Button
          variant="contained"
          onClick={handlePullModel}
          disabled={pulling || !newModelName}
          sx={{
            minWidth: 120,
            px: 3,
            borderRadius: 1.5,
            boxShadow: 'none',
            fontFamily: 'var(--font-header)',
            '&:hover': {
              boxShadow: 'none'
            }
          }}
        >
          {pulling ? <CircularProgress size={24} /> : 'Pull Model'}
        </Button>
      </Box>
    </Box>
  );
};

export default ModelManagement;
