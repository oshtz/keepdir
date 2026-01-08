import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Types for file operations
export type OperationType = 'rename' | 'move' | 'sort' | 'delete' | 'create';
export type OperationStatus = 'pending' | 'completed' | 'failed' | 'rolled_back' | 'cancelled' | 'paused';
export type BatchExecutionStatus = 'idle' | 'running' | 'paused' | 'cancelled';

export interface FileOperation {
  id: string;
  type: OperationType;
  originalPath: string;
  newPath: string;
  originalName?: string;
  newName?: string;
  timestamp: Date;
  status: OperationStatus;
  error?: string;
  metadata?: Record<string, any>;
}

export interface BatchOperation {
  id: string;
  name: string;
  operations: FileOperation[];
  timestamp: Date;
  status: OperationStatus;
  completedCount: number;
  failedCount: number;
  directory: string;
  pausedAt?: number; // Index where paused
  cancelledAt?: number; // Index where cancelled
}

// Batch execution state for cancel/pause functionality
export interface BatchExecutionState {
  batchId: string;
  status: BatchExecutionStatus;
  currentIndex: number;
  totalOperations: number;
  startTime: Date;
  pausedTime?: Date;
}

interface OperationHistoryContextType {
  // History state
  history: BatchOperation[];
  currentBatchIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  
  // Batch operations
  startBatch: (name: string, directory: string) => string;
  addOperation: (batchId: string, operation: Omit<FileOperation, 'id' | 'timestamp'>) => void;
  completeBatch: (batchId: string) => void;
  failBatch: (batchId: string, error: string) => void;
  
  // Cancel/Pause functionality
  batchExecutionState: BatchExecutionState | null;
  pauseBatch: (batchId: string) => void;
  resumeBatch: (batchId: string) => void;
  cancelBatch: (batchId: string) => void;
  isPaused: (batchId: string) => boolean;
  isCancelled: (batchId: string) => boolean;
  setBatchExecutionState: (state: BatchExecutionState | null) => void;
  
  // Undo/Redo
  undo: () => Promise<BatchOperation | null>;
  redo: () => Promise<BatchOperation | null>;
  undoSingle: (batchId: string, operationId: string) => Promise<boolean>;
  
  // History management
  clearHistory: () => void;
  getOperationsByDirectory: (directory: string) => BatchOperation[];
  getBatchById: (batchId: string) => BatchOperation | undefined;
  
  // Export history
  exportHistory: () => { history: BatchOperation[], exportedAt: string };
  exportHistoryAsJSON: () => string;
  exportHistoryAsCSV: () => string;
  exportPendingSuggestionsAsJSON: (suggestions: any) => string;
  downloadHistoryAsJSON: () => void;
  downloadHistoryAsCSV: () => void;
}

const OperationHistoryContext = createContext<OperationHistoryContextType | undefined>(undefined);

const MAX_HISTORY_SIZE = 100; // Maximum number of batch operations to keep

export const OperationHistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [history, setHistory] = useState<BatchOperation[]>([]);
  const [currentBatchIndex, setCurrentBatchIndex] = useState<number>(-1);
  const [activeBatches, setActiveBatches] = useState<Map<string, BatchOperation>>(new Map());
  const [batchExecutionState, setBatchExecutionState] = useState<BatchExecutionState | null>(null);
  const [pausedBatches, setPausedBatches] = useState<Set<string>>(new Set());
  const [cancelledBatches, setCancelledBatches] = useState<Set<string>>(new Set());

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('operationHistory');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        // Convert date strings back to Date objects
        const historyWithDates = parsed.map((batch: any) => ({
          ...batch,
          timestamp: new Date(batch.timestamp),
          operations: batch.operations.map((op: any) => ({
            ...op,
            timestamp: new Date(op.timestamp)
          }))
        }));
        setHistory(historyWithDates);
        setCurrentBatchIndex(historyWithDates.length - 1);
      }
    } catch (error) {
      console.error('Failed to load operation history:', error);
    }
  }, []);

  // Save history to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('operationHistory', JSON.stringify(history));
    } catch (error) {
      console.error('Failed to save operation history:', error);
    }
  }, [history]);

  const canUndo = currentBatchIndex >= 0 && history.length > 0;
  const canRedo = currentBatchIndex < history.length - 1;

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const startBatch = useCallback((name: string, directory: string): string => {
    const batchId = generateId();
    const newBatch: BatchOperation = {
      id: batchId,
      name,
      operations: [],
      timestamp: new Date(),
      status: 'pending',
      completedCount: 0,
      failedCount: 0,
      directory
    };
    
    setActiveBatches(prev => new Map(prev).set(batchId, newBatch));
    return batchId;
  }, []);

  const addOperation = useCallback((batchId: string, operation: Omit<FileOperation, 'id' | 'timestamp'>) => {
    setActiveBatches(prev => {
      const batch = prev.get(batchId);
      if (!batch) {
        console.error(`Batch ${batchId} not found`);
        return prev;
      }
      
      const newOperation: FileOperation = {
        ...operation,
        id: generateId(),
        timestamp: new Date()
      };
      
      const updatedBatch = {
        ...batch,
        operations: [...batch.operations, newOperation],
        completedCount: operation.status === 'completed' ? batch.completedCount + 1 : batch.completedCount,
        failedCount: operation.status === 'failed' ? batch.failedCount + 1 : batch.failedCount
      };
      
      return new Map(prev).set(batchId, updatedBatch);
    });
  }, []);

  const completeBatch = useCallback((batchId: string) => {
    setActiveBatches(prev => {
      const batch = prev.get(batchId);
      if (!batch) return prev;
      
      const completedBatch: BatchOperation = {
        ...batch,
        status: batch.failedCount > 0 ? 'failed' : 'completed',
        timestamp: new Date()
      };
      
      // Add to history
      setHistory(prevHistory => {
        // If we're not at the end of history, truncate future operations
        const newHistory = currentBatchIndex < prevHistory.length - 1
          ? prevHistory.slice(0, currentBatchIndex + 1)
          : prevHistory;
        
        // Add new batch and limit size
        const updatedHistory = [...newHistory, completedBatch].slice(-MAX_HISTORY_SIZE);
        setCurrentBatchIndex(updatedHistory.length - 1);
        return updatedHistory;
      });
      
      // Remove from active batches
      const newMap = new Map(prev);
      newMap.delete(batchId);
      return newMap;
    });
  }, [currentBatchIndex]);

  const failBatch = useCallback((batchId: string, error: string) => {
    setActiveBatches(prev => {
      const batch = prev.get(batchId);
      if (!batch) return prev;
      
      const failedBatch: BatchOperation = {
        ...batch,
        status: 'failed',
        operations: batch.operations.map(op => ({
          ...op,
          status: op.status === 'pending' ? 'failed' : op.status,
          error: op.status === 'pending' ? error : op.error
        }))
      };
      
      // Add to history even if failed
      setHistory(prevHistory => {
        const newHistory = currentBatchIndex < prevHistory.length - 1
          ? prevHistory.slice(0, currentBatchIndex + 1)
          : prevHistory;
        const updatedHistory = [...newHistory, failedBatch].slice(-MAX_HISTORY_SIZE);
        setCurrentBatchIndex(updatedHistory.length - 1);
        return updatedHistory;
      });
      
      const newMap = new Map(prev);
      newMap.delete(batchId);
      return newMap;
    });
  }, [currentBatchIndex]);

  const undo = useCallback(async (): Promise<BatchOperation | null> => {
    if (!canUndo) return null;
    
    const batchToUndo = history[currentBatchIndex];
    if (!batchToUndo || batchToUndo.status !== 'completed') return null;
    
    try {
      // Reverse operations in reverse order
      const reversedOperations = [...batchToUndo.operations].reverse();
      
      for (const operation of reversedOperations) {
        if (operation.status !== 'completed') continue;
        
        // Call electron API to reverse the operation
        if (operation.type === 'rename' || operation.type === 'move') {
          // Swap original and new paths to reverse
          const result = await window.electronAPI.applyRenames(batchToUndo.directory, {
            categories: [{
              name: 'Undo',
              description: 'Undoing previous operation',
              suggestedPath: '',
              files: [operation.newPath],
              renames: [{
                originalName: operation.newName || '',
                suggestedName: operation.originalName || '',
                reason: 'Undo operation'
              }]
            }]
          });
          
          if (result.error) {
            throw new Error(result.error);
          }
        }
      }
      
      // Update batch status
      setHistory(prev => prev.map((batch, index) => 
        index === currentBatchIndex
          ? { ...batch, status: 'rolled_back' as OperationStatus }
          : batch
      ));
      
      setCurrentBatchIndex(prev => prev - 1);
      return batchToUndo;
    } catch (error) {
      console.error('Failed to undo batch:', error);
      return null;
    }
  }, [canUndo, history, currentBatchIndex]);

  const redo = useCallback(async (): Promise<BatchOperation | null> => {
    if (!canRedo) return null;
    
    const batchToRedo = history[currentBatchIndex + 1];
    if (!batchToRedo || batchToRedo.status !== 'rolled_back') return null;
    
    try {
      // Re-apply operations in original order
      for (const operation of batchToRedo.operations) {
        if (operation.type === 'rename' || operation.type === 'move') {
          const result = await window.electronAPI.applyRenames(batchToRedo.directory, {
            categories: [{
              name: 'Redo',
              description: 'Redoing previous operation',
              suggestedPath: '',
              files: [operation.originalPath],
              renames: [{
                originalName: operation.originalName || '',
                suggestedName: operation.newName || '',
                reason: 'Redo operation'
              }]
            }]
          });
          
          if (result.error) {
            throw new Error(result.error);
          }
        }
      }
      
      // Update batch status back to completed
      setHistory(prev => prev.map((batch, index) => 
        index === currentBatchIndex + 1
          ? { ...batch, status: 'completed' as OperationStatus }
          : batch
      ));
      
      setCurrentBatchIndex(prev => prev + 1);
      return batchToRedo;
    } catch (error) {
      console.error('Failed to redo batch:', error);
      return null;
    }
  }, [canRedo, history, currentBatchIndex]);

  const undoSingle = useCallback(async (batchId: string, operationId: string): Promise<boolean> => {
    const batch = history.find(b => b.id === batchId);
    if (!batch) return false;
    
    const operation = batch.operations.find(op => op.id === operationId);
    if (!operation || operation.status !== 'completed') return false;
    
    try {
      if (operation.type === 'rename' || operation.type === 'move') {
        const result = await window.electronAPI.applyRenames(batch.directory, {
          categories: [{
            name: 'Undo Single',
            description: 'Undoing single operation',
            suggestedPath: '',
            files: [operation.newPath],
            renames: [{
              originalName: operation.newName || '',
              suggestedName: operation.originalName || '',
              reason: 'Undo single operation'
            }]
          }]
        });
        
        if (result.error) {
          throw new Error(result.error);
        }
      }
      
      // Update operation status
      setHistory(prev => prev.map(b => 
        b.id === batchId
          ? {
              ...b,
              operations: b.operations.map(op =>
                op.id === operationId
                  ? { ...op, status: 'rolled_back' as OperationStatus }
                  : op
              )
            }
          : b
      ));
      
      return true;
    } catch (error) {
      console.error('Failed to undo single operation:', error);
      return false;
    }
  }, [history]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentBatchIndex(-1);
    localStorage.removeItem('operationHistory');
  }, []);

  // Cancel/Pause functionality
  const pauseBatch = useCallback((batchId: string) => {
    setPausedBatches(prev => {
      const newSet = new Set(prev);
      newSet.add(batchId);
      return newSet;
    });
    
    // Update batch execution state
    setBatchExecutionState(prev => {
      if (prev && prev.batchId === batchId) {
        return {
          ...prev,
          status: 'paused',
          pausedTime: new Date()
        };
      }
      return prev;
    });
    
    // Update active batch status
    setActiveBatches(prev => {
      const batch = prev.get(batchId);
      if (!batch) return prev;
      
      const updatedBatch = {
        ...batch,
        status: 'paused' as OperationStatus,
        pausedAt: batch.operations.filter(op => op.status === 'completed').length
      };
      
      return new Map(prev).set(batchId, updatedBatch);
    });
  }, []);

  const resumeBatch = useCallback((batchId: string) => {
    setPausedBatches(prev => {
      const newSet = new Set(prev);
      newSet.delete(batchId);
      return newSet;
    });
    
    // Update batch execution state
    setBatchExecutionState(prev => {
      if (prev && prev.batchId === batchId) {
        return {
          ...prev,
          status: 'running',
          pausedTime: undefined
        };
      }
      return prev;
    });
    
    // Update active batch status
    setActiveBatches(prev => {
      const batch = prev.get(batchId);
      if (!batch) return prev;
      
      const updatedBatch = {
        ...batch,
        status: 'pending' as OperationStatus
      };
      
      return new Map(prev).set(batchId, updatedBatch);
    });
  }, []);

  const cancelBatch = useCallback((batchId: string) => {
    setCancelledBatches(prev => {
      const newSet = new Set(prev);
      newSet.add(batchId);
      return newSet;
    });
    
    // Update batch execution state
    setBatchExecutionState(prev => {
      if (prev && prev.batchId === batchId) {
        return {
          ...prev,
          status: 'cancelled'
        };
      }
      return prev;
    });
    
    // Update active batch and move to history
    setActiveBatches(prev => {
      const batch = prev.get(batchId);
      if (!batch) return prev;
      
      const cancelledBatch: BatchOperation = {
        ...batch,
        status: 'cancelled' as OperationStatus,
        cancelledAt: batch.operations.filter(op => op.status === 'completed').length,
        operations: batch.operations.map((op) => {
          // Mark pending operations as cancelled
          if (op.status === 'pending') {
            return { ...op, status: 'cancelled' as OperationStatus };
          }
          return op;
        })
      };
      
      // Add to history
      setHistory(prevHistory => {
        const newHistory = currentBatchIndex < prevHistory.length - 1
          ? prevHistory.slice(0, currentBatchIndex + 1)
          : prevHistory;
        const updatedHistory = [...newHistory, cancelledBatch].slice(-MAX_HISTORY_SIZE);
        setCurrentBatchIndex(updatedHistory.length - 1);
        return updatedHistory;
      });
      
      // Remove from active batches
      const newMap = new Map(prev);
      newMap.delete(batchId);
      return newMap;
    });
    
    // Clear paused state if it was paused
    setPausedBatches(prev => {
      const newSet = new Set(prev);
      newSet.delete(batchId);
      return newSet;
    });
  }, [currentBatchIndex]);

  const isPaused = useCallback((batchId: string): boolean => {
    return pausedBatches.has(batchId);
  }, [pausedBatches]);

  const isCancelled = useCallback((batchId: string): boolean => {
    return cancelledBatches.has(batchId);
  }, [cancelledBatches]);

  const getOperationsByDirectory = useCallback((directory: string): BatchOperation[] => {
    return history.filter(batch => batch.directory === directory);
  }, [history]);

  const getBatchById = useCallback((batchId: string): BatchOperation | undefined => {
    return history.find(batch => batch.id === batchId) || activeBatches.get(batchId);
  }, [history, activeBatches]);

  const exportHistory = useCallback(() => {
    return {
      history,
      exportedAt: new Date().toISOString()
    };
  }, [history]);

  // Export history as JSON
  const exportHistoryAsJSON = useCallback((): string => {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      totalBatches: history.length,
      batches: history.map(batch => ({
        id: batch.id,
        name: batch.name,
        directory: batch.directory,
        timestamp: batch.timestamp.toISOString(),
        status: batch.status,
        completedCount: batch.completedCount,
        failedCount: batch.failedCount,
        operations: batch.operations.map(op => ({
          id: op.id,
          type: op.type,
          originalPath: op.originalPath,
          newPath: op.newPath,
          originalName: op.originalName,
          newName: op.newName,
          timestamp: op.timestamp.toISOString(),
          status: op.status,
          error: op.error
        }))
      }))
    };
    return JSON.stringify(exportData, null, 2);
  }, [history]);

  // Export history as CSV
  const exportHistoryAsCSV = useCallback((): string => {
    const headers = [
      'Batch ID',
      'Batch Name',
      'Directory',
      'Batch Timestamp',
      'Batch Status',
      'Operation ID',
      'Operation Type',
      'Original Path',
      'New Path',
      'Original Name',
      'New Name',
      'Operation Timestamp',
      'Operation Status',
      'Error'
    ];

    const rows: string[][] = [];
    
    history.forEach(batch => {
      batch.operations.forEach(op => {
        rows.push([
          batch.id,
          batch.name,
          batch.directory,
          batch.timestamp.toISOString(),
          batch.status,
          op.id,
          op.type,
          op.originalPath,
          op.newPath,
          op.originalName || '',
          op.newName || '',
          op.timestamp.toISOString(),
          op.status,
          op.error || ''
        ]);
      });
    });

    // Escape CSV fields
    const escapeCSV = (field: string): string => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    return csvContent;
  }, [history]);

  // Export pending suggestions (for pre-apply export)
  const exportPendingSuggestionsAsJSON = useCallback((suggestions: any): string => {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      type: 'pending_suggestions',
      suggestions
    };
    return JSON.stringify(exportData, null, 2);
  }, []);

  // Download helper
  const downloadExport = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Export and download as JSON
  const downloadHistoryAsJSON = useCallback(() => {
    const content = exportHistoryAsJSON();
    const date = new Date().toISOString().split('T')[0];
    downloadExport(content, `keepdir-history-${date}.json`, 'application/json');
  }, [exportHistoryAsJSON, downloadExport]);

  // Export and download as CSV
  const downloadHistoryAsCSV = useCallback(() => {
    const content = exportHistoryAsCSV();
    const date = new Date().toISOString().split('T')[0];
    downloadExport(content, `keepdir-history-${date}.csv`, 'text/csv');
  }, [exportHistoryAsCSV, downloadExport]);

  return (
    <OperationHistoryContext.Provider
      value={{
        history,
        currentBatchIndex,
        canUndo,
        canRedo,
        startBatch,
        addOperation,
        completeBatch,
        failBatch,
        // Cancel/Pause functionality
        batchExecutionState,
        pauseBatch,
        resumeBatch,
        cancelBatch,
        isPaused,
        isCancelled,
        setBatchExecutionState,
        // Undo/Redo
        undo,
        redo,
        undoSingle,
        clearHistory,
        getOperationsByDirectory,
        getBatchById,
        exportHistory,
        exportHistoryAsJSON,
        exportHistoryAsCSV,
        exportPendingSuggestionsAsJSON,
        downloadHistoryAsJSON,
        downloadHistoryAsCSV
      }}
    >
      {children}
    </OperationHistoryContext.Provider>
  );
};

export const useOperationHistory = () => {
  const context = useContext(OperationHistoryContext);
  if (context === undefined) {
    throw new Error('useOperationHistory must be used within an OperationHistoryProvider');
  }
  return context;
};
