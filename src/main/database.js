const sqlite3 = require('sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

class Database {
  constructor() {
    // Create db in user's app data directory
    const dbPath = path.join(process.env.APPDATA || process.env.HOME, '.keepdir', 'cache.db');

    // Ensure directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    this.db = new sqlite3.Database(dbPath);
    this.maintenanceInterval = null;

    // Enable WAL mode for better performance and concurrent access
    this.db.run('PRAGMA journal_mode = WAL');
    // Optimize memory usage
    this.db.run('PRAGMA cache_size = -64000'); // 64MB cache
    this.db.run('PRAGMA temp_store = MEMORY');
    this.db.run('PRAGMA mmap_size = 268435456'); // 256MB memory map
    // Enable foreign key constraints
    this.db.run('PRAGMA foreign_keys = ON');
    // Optimize synchronization for better performance
    this.db.run('PRAGMA synchronous = NORMAL');

    // Create tables if they don't exist
    this.db.serialize(() => {
      // Table for caching file contents (mainly images)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS files_cache (
          file_path TEXT PRIMARY KEY,
          file_hash TEXT NOT NULL,
          content TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Table for tracking renamed files with optimized indexes
      this.db.run(`
        CREATE TABLE IF NOT EXISTS processed_renames (
          file_path TEXT PRIMARY KEY,
          original_name TEXT NOT NULL,
          suggested_name TEXT,
          reason TEXT,
          status TEXT CHECK(status IN ('suggested', 'renamed', 'skipped')) NOT NULL,
          processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          applied_at DATETIME
        )
      `);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_renames_status ON processed_renames(status)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_renames_processed ON processed_renames(processed_at)');

      // Table for tracking sorted files with optimized indexes
      this.db.run(`
        CREATE TABLE IF NOT EXISTS processed_sorts (
          file_path TEXT PRIMARY KEY,
          original_path TEXT NOT NULL,
          suggested_path TEXT,
          category TEXT,
          status TEXT CHECK(status IN ('suggested', 'sorted', 'skipped')) NOT NULL,
          processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          applied_at DATETIME
        )
      `);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_sorts_status ON processed_sorts(status)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_sorts_category ON processed_sorts(category)');

      // Create settings table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create workspaces table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          emoji TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create workspace settings table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS workspace_settings (
          workspace_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (workspace_id, key)
        )
      `);

      // Create custom sections table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS custom_sections (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          name TEXT NOT NULL,
          icon TEXT,
          color TEXT,
          items TEXT NOT NULL DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )
      `);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_custom_sections_workspace ON custom_sections(workspace_id)');

      // Additional performance indexes
      this.db.run('CREATE INDEX IF NOT EXISTS idx_files_cache_hash ON files_cache(file_hash)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_files_cache_updated ON files_cache(updated_at)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_workspace_settings_updated ON workspace_settings(updated_at)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_settings_updated ON settings(updated_at)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_workspaces_updated ON workspaces(updated_at)');

      // Migrate data from old table if it exists
      this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='processed_files'", (err, row) => {
        if (row) {
          // Old table exists, migrate data
          this.db.run(`
            INSERT OR IGNORE INTO processed_renames 
            SELECT * FROM processed_files
          `);

          // Drop old table after migration
          this.db.run(`DROP TABLE processed_files`);
        }
      });

      // Start maintenance scheduler
      this.startMaintenanceScheduler();
    });
  }

  /**
   * Start automatic database maintenance
   */
  startMaintenanceScheduler() {
    // Run maintenance every 6 hours
    this.maintenanceInterval = setInterval(async () => {
      try {
        console.log('Running database maintenance...');
        await this.cleanupCache(168); // Clean cache older than 7 days

        // Run full optimization once per day (check if it's been 24 hours)
        const lastOptimization = await this.getSetting('lastOptimization');
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        if (!lastOptimization || (now - parseInt(lastOptimization)) > oneDayMs) {
          console.log('Running database optimization...');
          await this.optimizeDatabase();
          await this.saveSetting('lastOptimization', now.toString());
        }

        console.log('Database maintenance completed');
      } catch (error) {
        console.error('Database maintenance failed:', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    // Run initial cleanup after 30 seconds
    setTimeout(async () => {
      try {
        await this.cleanupCache(168);
      } catch (error) {
        console.error('Initial database cleanup failed:', error);
      }
    }, 30000);
  }

  /**
   * Stop maintenance scheduler
   */
  stopMaintenanceScheduler() {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }
  }

  /**
   * Normalize file path and name for consistent storage
   */
  _normalizePath(filePath) {
    try {
      if (!filePath) {
        console.error('Received null/undefined path');
        throw new Error('Invalid path: null or undefined');
      }

      const normalized = Buffer.from(filePath.replace(/\\/g, '/'), 'utf8')
        .toString()
        .normalize('NFC');

      console.log('Normalized path:', {
        original: filePath,
        normalized: normalized,
        hex: Buffer.from(normalized).toString('hex')
      });

      return normalized;
    } catch (err) {
      console.error('Path normalization failed:', err);
      throw err;
    }
  }

  _normalizeFilename(filename) {
    try {
      if (!filename) {
        console.error('Received null/undefined filename');
        throw new Error('Invalid filename: null or undefined');
      }

      const withoutPrefix = filename.replace(/^תמונה של /, '');
      const normalized = Buffer.from(withoutPrefix, 'utf8')
        .toString()
        .normalize('NFC');

      console.log('Normalized filename:', {
        original: filename,
        withoutPrefix: withoutPrefix,
        normalized: normalized,
        hex: Buffer.from(normalized).toString('hex')
      });

      return normalized;
    } catch (err) {
      console.error('Filename normalization failed:', err);
      throw err;
    }
  }

  /**
   * Get file hash to detect changes
   */
  async getFileHash(filePath) {
    const fileBuffer = await fs.promises.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  /**
   * Check if file exists in cache and hash matches
   */
  async isFileCached(filePath, fileHash) {
    const normalizedPath = this._normalizePath(filePath);
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM files_cache WHERE file_path = ? AND file_hash = ?',
        [normalizedPath, fileHash],
        (err, row) => {
          if (err) reject(err);
          resolve(!!row);
        }
      );
    });
  }

  /**
   * Get cached content for file
   */
  async getCachedContent(filePath) {
    const normalizedPath = this._normalizePath(filePath);
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT content FROM files_cache WHERE file_path = ?',
        [normalizedPath],
        (err, row) => {
          if (err) reject(err);
          resolve(row ? row.content : null);
        }
      );
    });
  }

  /**
   * Cache file content
   */
  async cacheFile(filePath, fileHash, content) {
    const normalizedPath = this._normalizePath(filePath);
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO files_cache (file_path, file_hash, content) 
         VALUES (?, ?, ?)
         ON CONFLICT(file_path) DO UPDATE SET
           file_hash = excluded.file_hash,
           content = excluded.content,
           updated_at = CURRENT_TIMESTAMP`,
        [normalizedPath, fileHash, content],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Remove cache entries older than maxAgeHours
   */
  async cleanupCache(maxAgeHours = 168) { // Default 7 days
    // Validate maxAgeHours is a positive integer to prevent injection
    const hours = Math.max(1, Math.floor(Number(maxAgeHours) || 168));
    
    return new Promise((resolve, reject) => {
      // Use parameterized approach - SQLite doesn't support parameters in datetime offset,
      // so we calculate the cutoff timestamp in JavaScript instead
      const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      
      this.db.run(
        `DELETE FROM files_cache WHERE updated_at < ?`,
        [cutoffDate],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT
           COUNT(*) as total_entries,
           SUM(LENGTH(content)) as total_size_bytes,
           MIN(updated_at) as oldest_entry,
           MAX(updated_at) as newest_entry
         FROM files_cache`,
        (err, row) => {
          if (err) reject(err);
          resolve({
            totalEntries: row.total_entries || 0,
            totalSizeBytes: row.total_size_bytes || 0,
            totalSizeMB: Math.round((row.total_size_bytes || 0) / 1024 / 1024 * 100) / 100,
            oldestEntry: row.oldest_entry,
            newestEntry: row.newest_entry
          });
        }
      );
    });
  }

  /**
   * Optimize database by running VACUUM and ANALYZE
   */
  async optimizeDatabase() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Run ANALYZE to update query planner statistics
        this.db.run('ANALYZE', (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Run VACUUM to reclaim space and defragment
          this.db.run('VACUUM', (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    });
  }

  /**
   * Get database size information
   */
  async getDatabaseStats() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT
           page_count * page_size as size_bytes,
           page_count,
           page_size,
           freelist_count
         FROM pragma_page_count(), pragma_page_size(), pragma_freelist_count()`,
        (err, row) => {
          if (err) reject(err);
          resolve({
            sizeBytes: row.size_bytes || 0,
            sizeMB: Math.round((row.size_bytes || 0) / 1024 / 1024 * 100) / 100,
            pageCount: row.page_count || 0,
            pageSize: row.page_size || 0,
            freelistCount: row.freelist_count || 0
          });
        }
      );
    });
  }

  /**
   * Check if file has been processed for renaming
   */
  async isFileRenamed(filePath) {
    const normalizedPath = this._normalizePath(filePath);
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM processed_renames WHERE file_path = ?',
        [normalizedPath],
        (err, row) => {
          if (err) reject(err);
          resolve(!!row);
        }
      );
    });
  }

  /**
   * Check if file has been processed for sorting
   */
  async isFileSorted(filePath) {
    const normalizedPath = this._normalizePath(filePath);
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM processed_sorts WHERE file_path = ?',
        [normalizedPath],
        (err, row) => {
          if (err) reject(err);
          resolve(!!row);
        }
      );
    });
  }

  /**
   * Get processed rename details
   */
  async getProcessedRename(filePath) {
    const normalizedPath = this._normalizePath(filePath);
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM processed_renames WHERE file_path = ?',
        [normalizedPath],
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });
  }

  /**
   * Get processed sort details
   */
  async getProcessedSort(filePath) {
    const normalizedPath = this._normalizePath(filePath);
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM processed_sorts WHERE file_path = ?',
        [normalizedPath],
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });
  }

  /**
   * Cache rename suggestion for file
   */
  async cacheRenameSuggestion(filePath, originalName, suggestedName, reason) {
    const normalizedPath = this._normalizePath(filePath);
    const normalizedOriginal = this._normalizeFilename(originalName);

    console.log('Caching rename suggestion:', {
      path: normalizedPath,
      original: normalizedOriginal,
      suggested: suggestedName
    });

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO processed_renames 
         (file_path, original_name, suggested_name, reason, status) 
         VALUES (?, ?, ?, ?, 'suggested')
         ON CONFLICT(file_path) DO UPDATE SET
           suggested_name = excluded.suggested_name,
           reason = excluded.reason,
           status = 'suggested',
           processed_at = CURRENT_TIMESTAMP`,
        [normalizedPath, normalizedOriginal, suggestedName, reason],
        (err) => {
          if (err) {
            console.error('Failed to cache rename suggestion:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Cache sort suggestion for file
   */
  async cacheSortSuggestion(filePath, originalPath, suggestedPath, category) {
    const normalizedPath = this._normalizePath(filePath);
    const normalizedOriginal = this._normalizePath(originalPath);

    console.log('Caching sort suggestion:', {
      path: normalizedPath,
      original: normalizedOriginal,
      suggested: suggestedPath,
      category: category
    });

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO processed_sorts 
         (file_path, original_path, suggested_path, category, status) 
         VALUES (?, ?, ?, ?, 'suggested')
         ON CONFLICT(file_path) DO UPDATE SET
           suggested_path = excluded.suggested_path,
           category = excluded.category,
           status = 'suggested',
           processed_at = CURRENT_TIMESTAMP`,
        [normalizedPath, normalizedOriginal, suggestedPath, category],
        (err) => {
          if (err) {
            console.error('Failed to cache sort suggestion:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Mark file as renamed
   */
  async markFileRenamed(oldPath, newPath) {
    const normalizedOldPath = this._normalizePath(oldPath);
    const normalizedNewPath = this._normalizePath(newPath);

    console.log('Marking file as renamed:', {
      from: normalizedOldPath,
      to: normalizedNewPath
    });

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE processed_renames 
         SET status = 'renamed', 
             applied_at = CURRENT_TIMESTAMP,
             file_path = ?
         WHERE file_path = ?`,
        [normalizedNewPath, normalizedOldPath],
        (err) => {
          if (err) {
            console.error('Failed to mark file as renamed:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Mark file as sorted
   */
  async markFileSorted(oldPath, newPath) {
    const normalizedOldPath = this._normalizePath(oldPath);
    const normalizedNewPath = this._normalizePath(newPath);

    console.log('Marking file as sorted:', {
      from: normalizedOldPath,
      to: normalizedNewPath
    });

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE processed_sorts 
         SET status = 'sorted', 
             applied_at = CURRENT_TIMESTAMP,
             file_path = ?
         WHERE file_path = ?`,
        [normalizedNewPath, normalizedOldPath],
        (err) => {
          if (err) {
            console.error('Failed to mark file as sorted:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Mark file as skipped for renaming
   */
  async markRenameSkipped(filePath) {
    const normalizedPath = this._normalizePath(filePath);
    const normalizedName = this._normalizeFilename(path.basename(filePath));

    console.log('Marking file as rename skipped:', normalizedPath);

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO processed_renames 
         (file_path, original_name, status) 
         VALUES (?, ?, 'skipped')
         ON CONFLICT(file_path) DO UPDATE SET
           status = 'skipped',
           processed_at = CURRENT_TIMESTAMP`,
        [normalizedPath, normalizedName],
        (err) => {
          if (err) {
            console.error('Failed to mark file as rename skipped:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Mark file as skipped for sorting
   */
  async markSortSkipped(filePath) {
    const normalizedPath = this._normalizePath(filePath);

    console.log('Marking file as sort skipped:', normalizedPath);

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO processed_sorts 
         (file_path, original_path, status) 
         VALUES (?, ?, 'skipped')
         ON CONFLICT(file_path) DO UPDATE SET
           status = 'skipped',
           processed_at = CURRENT_TIMESTAMP`,
        [normalizedPath, normalizedPath],
        (err) => {
          if (err) {
            console.error('Failed to mark file as sort skipped:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Get all files not processed for renaming with optimized batch processing
   */
  async getUnprocessedRenames(filePaths) {
    console.log('Getting unprocessed renames from:', filePaths);

    // Process paths in batches of 500 for better performance
    const BATCH_SIZE = 500;
    const normalizedPaths = filePaths.map(p => this._normalizePath(p));
    const results = [];

    for (let i = 0; i < normalizedPaths.length; i += BATCH_SIZE) {
      const batch = normalizedPaths.slice(i, i + BATCH_SIZE);

      await new Promise((resolve, reject) => {
        if (batch.length === 0) {
          resolve();
          return;
        }

        const placeholders = batch.map(() => '?').join(',');
        const query = `
          SELECT file_path 
          FROM processed_renames 
          WHERE file_path IN (${placeholders})
          AND status != 'skipped'
        `;

        this.db.all(query, batch, (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          const processedPaths = new Set(rows.map(row => row.file_path));
          const unprocessedBatch = batch.filter(path => !processedPaths.has(path));
          results.push(...unprocessedBatch);
          resolve();
        });
      });
    }

    console.log('Total unprocessed paths for renaming:', results.length);
    return results;
  }

  /**
   * Get all files not processed for sorting with optimized batch processing
   */
  async getUnprocessedSorts(filePaths) {
    console.log('Getting unprocessed sorts from:', filePaths);

    // Process paths in batches of 500 for better performance
    const BATCH_SIZE = 500;
    const normalizedPaths = filePaths.map(p => this._normalizePath(p));
    const results = [];

    for (let i = 0; i < normalizedPaths.length; i += BATCH_SIZE) {
      const batch = normalizedPaths.slice(i, i + BATCH_SIZE);

      await new Promise((resolve, reject) => {
        if (batch.length === 0) {
          resolve();
          return;
        }

        const placeholders = batch.map(() => '?').join(',');
        const query = `
          SELECT file_path 
          FROM processed_sorts 
          WHERE file_path IN (${placeholders})
          AND status != 'skipped'
        `;

        this.db.all(query, batch, (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          const processedPaths = new Set(rows.map(row => row.file_path));
          const unprocessedBatch = batch.filter(path => !processedPaths.has(path));
          results.push(...unprocessedBatch);
          resolve();
        });
      });
    }

    console.log('Total unprocessed paths for sorting:', results.length);
    return results;
  }

  /**
   * Bulk cache rename suggestions for better performance
   */
  async bulkCacheRenameSuggestions(suggestions) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO processed_renames 
        (file_path, original_name, suggested_name, reason, status) 
        VALUES (?, ?, ?, ?, 'suggested')
        ON CONFLICT(file_path) DO UPDATE SET
          suggested_name = excluded.suggested_name,
          reason = excluded.reason,
          status = 'suggested',
          processed_at = CURRENT_TIMESTAMP
      `);

      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        for (const { filePath, originalName, suggestedName, reason } of suggestions) {
          const normalizedPath = this._normalizePath(filePath);
          const normalizedOriginal = this._normalizeFilename(originalName);
          stmt.run([normalizedPath, normalizedOriginal, suggestedName, reason]);
        }

        this.db.run('COMMIT', (err) => {
          if (err) {
            console.error('Failed to bulk cache rename suggestions:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      stmt.finalize();
    });
  }

  /**
   * Bulk cache sort suggestions for better performance
   */
  async bulkCacheSortSuggestions(suggestions) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO processed_sorts 
        (file_path, original_path, suggested_path, category, status) 
        VALUES (?, ?, ?, ?, 'suggested')
        ON CONFLICT(file_path) DO UPDATE SET
          suggested_path = excluded.suggested_path,
          category = excluded.category,
          status = 'suggested',
          processed_at = CURRENT_TIMESTAMP
      `);

      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        for (const { filePath, originalPath, suggestedPath, category } of suggestions) {
          const normalizedPath = this._normalizePath(filePath);
          const normalizedOriginal = this._normalizePath(originalPath);
          stmt.run([normalizedPath, normalizedOriginal, suggestedPath, category]);
        }

        this.db.run('COMMIT', (err) => {
          if (err) {
            console.error('Failed to bulk cache sort suggestions:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      stmt.finalize();
    });
  }

  /**
   * Get a setting value by key
   */
  async getSetting(key) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT value FROM settings WHERE key = ?',
        [key],
        (err, row) => {
          if (err) reject(err);
          resolve(row ? row.value : null);
        }
      );
    });
  }

  /**
   * Get all settings
   */
  async getAllSettings() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT key, value FROM settings', (err, rows) => {
        if (err) reject(err);
        const settings = {};
        rows.forEach(row => {
          try {
            settings[row.key] = JSON.parse(row.value);
          } catch (e) {
            settings[row.key] = row.value;
          }
        });
        resolve(settings);
      });
    });
  }

  /**
   * Save a setting
   */
  async saveSetting(key, value) {
    const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO settings (key, value, updated_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = CURRENT_TIMESTAMP`,
        [key, serializedValue],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Save multiple settings at once
   */
  async saveSettings(settings) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO settings (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `);

      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        for (const [key, value] of Object.entries(settings)) {
          const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
          stmt.run([key, serializedValue]);
        }

        this.db.run('COMMIT', (err) => {
          if (err) {
            console.error('Failed to save settings:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      stmt.finalize();
    });
  }

  /**
   * Get a workspace setting value
   */
  async getWorkspaceSetting(workspaceId, key) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT value FROM workspace_settings WHERE workspace_id = ? AND key = ?',
        [workspaceId, key],
        (err, row) => {
          if (err) reject(err);
          try {
            resolve(row ? JSON.parse(row.value) : null);
          } catch (e) {
            resolve(row ? row.value : null);
          }
        }
      );
    });
  }

  /**
   * Get all settings for a workspace
   */
  async getWorkspaceSettings(workspaceId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT key, value FROM workspace_settings WHERE workspace_id = ?',
        [workspaceId],
        (err, rows) => {
          if (err) reject(err);
          const settings = {};
          rows.forEach(row => {
            try {
              settings[row.key] = JSON.parse(row.value);
            } catch (e) {
              settings[row.key] = row.value;
            }
          });
          resolve(settings);
        }
      );
    });
  }

  /**
   * Save a workspace setting
   */
  async saveWorkspaceSetting(workspaceId, key, value) {
    const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO workspace_settings (workspace_id, key, value, updated_at) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(workspace_id, key) DO UPDATE SET
           value = excluded.value,
           updated_at = CURRENT_TIMESTAMP`,
        [workspaceId, key, serializedValue],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Get all workspaces
   */
  async getWorkspaces() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM workspaces ORDER BY created_at ASC', (err, rows) => {
        if (err) reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Save a workspace
   */
  async saveWorkspace(workspace) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO workspaces (id, name, emoji) 
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           emoji = excluded.emoji,
           updated_at = CURRENT_TIMESTAMP`,
        [workspace.id, workspace.name, workspace.emoji],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Delete a workspace and its settings
   */
  async deleteWorkspace(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM workspaces WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        resolve();
      });
    });
  }

  /**
   * Export workspace data including settings
   */
  async exportWorkspace(workspaceId) {
    return new Promise((resolve, reject) => {
      // Get workspace details
      this.db.get('SELECT * FROM workspaces WHERE id = ?', [workspaceId], (err, workspace) => {
        if (err) {
          reject(err);
          return;
        }
        if (!workspace) {
          reject(new Error('Workspace not found'));
          return;
        }

        // Get workspace settings
        this.db.all('SELECT key, value FROM workspace_settings WHERE workspace_id = ?', [workspaceId], (err, settings) => {
          if (err) {
            reject(err);
            return;
          }

          const settingsObj = {};
          settings.forEach(row => {
            try {
              settingsObj[row.key] = JSON.parse(row.value);
            } catch (e) {
              settingsObj[row.key] = row.value;
            }
          });

          resolve({
            workspace: {
              id: workspace.id,
              name: workspace.name,
              emoji: workspace.emoji,
              created_at: workspace.created_at,
              updated_at: workspace.updated_at
            },
            settings: settingsObj,
            exportedAt: new Date().toISOString(),
            version: '1.0'
          });
        });
      });
    });
  }

  /**
   * Import workspace data
   */
  async importWorkspace(workspaceData, options = {}) {
    const { generateNewId = false, overwriteExisting = false } = options;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        try {
          let workspaceId = workspaceData.workspace.id;

          // Generate new ID if requested
          if (generateNewId) {
            workspaceId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          }

          // Check if workspace already exists
          this.db.get('SELECT id FROM workspaces WHERE id = ?', [workspaceId], (err, existing) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }

            if (existing && !overwriteExisting) {
              this.db.run('ROLLBACK');
              reject(new Error('Workspace already exists. Use overwriteExisting option to replace it.'));
              return;
            }

            // Insert or update workspace
            const workspaceQuery = overwriteExisting && existing
              ? `UPDATE workspaces SET name = ?, emoji = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
              : `INSERT INTO workspaces (id, name, emoji) VALUES (?, ?, ?)`;

            const workspaceParams = overwriteExisting && existing
              ? [workspaceData.workspace.name, workspaceData.workspace.emoji, workspaceId]
              : [workspaceId, workspaceData.workspace.name, workspaceData.workspace.emoji];

            this.db.run(workspaceQuery, workspaceParams, (err) => {
              if (err) {
                this.db.run('ROLLBACK');
                reject(err);
                return;
              }

              // Clear existing settings if overwriting
              if (overwriteExisting && existing) {
                this.db.run('DELETE FROM workspace_settings WHERE workspace_id = ?', [workspaceId], (err) => {
                  if (err) {
                    this.db.run('ROLLBACK');
                    reject(err);
                    return;
                  }
                  insertSettings();
                });
              } else {
                insertSettings();
              }

              function insertSettings() {
                // Insert settings
                const settingsStmt = this.db.prepare(`
                  INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
                  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                `);

                for (const [key, value] of Object.entries(workspaceData.settings || {})) {
                  const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
                  settingsStmt.run([workspaceId, key, serializedValue]);
                }

                settingsStmt.finalize((err) => {
                  if (err) {
                    this.db.run('ROLLBACK');
                    reject(err);
                    return;
                  }

                  this.db.run('COMMIT', (err) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve({
                        success: true,
                        workspaceId: workspaceId,
                        imported: {
                          workspace: workspaceData.workspace.name,
                          settings: Object.keys(workspaceData.settings || {}).length
                        }
                      });
                    }
                  });
                });
              }
            });
          });
        } catch (error) {
          this.db.run('ROLLBACK');
          reject(error);
        }
      });
    });
  }

  /**
   * Export all application data for backup
   */
  async exportAllData() {
    return new Promise((resolve, reject) => {
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        workspaces: [],
        settings: {}
      };

      // Get all workspaces
      this.db.all('SELECT * FROM workspaces ORDER BY created_at ASC', (err, workspaces) => {
        if (err) {
          reject(err);
          return;
        }

        // Get all workspace settings
        this.db.all('SELECT * FROM workspace_settings', (err, workspaceSettings) => {
          if (err) {
            reject(err);
            return;
          }

          // Group settings by workspace
          const settingsByWorkspace = {};
          workspaceSettings.forEach(setting => {
            if (!settingsByWorkspace[setting.workspace_id]) {
              settingsByWorkspace[setting.workspace_id] = {};
            }
            try {
              settingsByWorkspace[setting.workspace_id][setting.key] = JSON.parse(setting.value);
            } catch (e) {
              settingsByWorkspace[setting.workspace_id][setting.key] = setting.value;
            }
          });

          // Combine workspaces with their settings
          exportData.workspaces = workspaces.map(workspace => ({
            workspace: workspace,
            settings: settingsByWorkspace[workspace.id] || {}
          }));

          // Get global settings
          this.db.all('SELECT key, value FROM settings', (err, settings) => {
            if (err) {
              reject(err);
              return;
            }

            settings.forEach(row => {
              try {
                exportData.settings[row.key] = JSON.parse(row.value);
              } catch (e) {
                exportData.settings[row.key] = row.value;
              }
            });

            resolve(exportData);
          });
        });
      });
    });
  }

  /**
   * Import all application data from backup
   */
  async importAllData(backupData, options = {}) {
    const { overwriteExisting = false } = options;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        try {
          const results = {
            success: true,
            imported: {
              workspaces: 0,
              settings: 0
            },
            errors: []
          };

          // Import global settings
          if (backupData.settings && Object.keys(backupData.settings).length > 0) {
            if (overwriteExisting) {
              this.db.run('DELETE FROM settings');
            }

            const settingsStmt = this.db.prepare(`
              INSERT OR ${overwriteExisting ? 'REPLACE' : 'IGNORE'} INTO settings (key, value, updated_at)
              VALUES (?, ?, CURRENT_TIMESTAMP)
            `);

            for (const [key, value] of Object.entries(backupData.settings)) {
              const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
              settingsStmt.run([key, serializedValue]);
              results.imported.settings++;
            }
            settingsStmt.finalize();
          }

          // Import workspaces
          if (backupData.workspaces && backupData.workspaces.length > 0) {
            for (const workspaceData of backupData.workspaces) {
              try {
                // Check if workspace exists
                const existing = this.db.get('SELECT id FROM workspaces WHERE id = ?', [workspaceData.workspace.id]);

                if (existing && !overwriteExisting) {
                  results.errors.push(`Workspace '${workspaceData.workspace.name}' already exists and was skipped`);
                  continue;
                }

                // Insert or replace workspace
                const workspaceQuery = overwriteExisting
                  ? `INSERT OR REPLACE INTO workspaces (id, name, emoji) VALUES (?, ?, ?)`
                  : `INSERT OR IGNORE INTO workspaces (id, name, emoji) VALUES (?, ?, ?)`;

                this.db.run(workspaceQuery, [
                  workspaceData.workspace.id,
                  workspaceData.workspace.name,
                  workspaceData.workspace.emoji
                ]);

                // Clear existing workspace settings if overwriting
                if (overwriteExisting) {
                  this.db.run('DELETE FROM workspace_settings WHERE workspace_id = ?', [workspaceData.workspace.id]);
                }

                // Insert workspace settings
                const wsSettingsStmt = this.db.prepare(`
                  INSERT OR IGNORE INTO workspace_settings (workspace_id, key, value, updated_at)
                  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                `);

                for (const [key, value] of Object.entries(workspaceData.settings || {})) {
                  const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
                  wsSettingsStmt.run([workspaceData.workspace.id, key, serializedValue]);
                }
                wsSettingsStmt.finalize();

                results.imported.workspaces++;
              } catch (error) {
                results.errors.push(`Failed to import workspace '${workspaceData.workspace.name}': ${error.message}`);
              }
            }
          }

          this.db.run('COMMIT', (err) => {
            if (err) {
              reject(err);
            } else {
              resolve(results);
            }
          });
        } catch (error) {
          this.db.run('ROLLBACK');
          reject(error);
        }
      });
    });
  }

  /**
   * Get custom sections for a workspace
   */
  async getCustomSections(workspaceId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM custom_sections WHERE workspace_id = ? ORDER BY created_at ASC',
        [workspaceId],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          const sections = rows.map(row => ({
            ...row,
            items: JSON.parse(row.items || '[]')
          }));
          resolve(sections);
        }
      );
    });
  }

  /**
   * Create a custom section
   */
  async createCustomSection(workspaceId, sectionData) {
    const { name, icon = '📁', color = '#FF5733', items = [] } = sectionData;
    const id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO custom_sections (id, workspace_id, name, icon, color, items, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, workspaceId, name, icon, color, JSON.stringify(items)],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              id,
              workspace_id: workspaceId,
              name,
              icon,
              color,
              items,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
        }
      );
    });
  }

  /**
   * Update a custom section
   */
  async updateCustomSection(sectionId, updates) {
    const { name, icon, color, items } = updates;
    const setClause = [];
    const params = [];

    if (name !== undefined) {
      setClause.push('name = ?');
      params.push(name);
    }
    if (icon !== undefined) {
      setClause.push('icon = ?');
      params.push(icon);
    }
    if (color !== undefined) {
      setClause.push('color = ?');
      params.push(color);
    }
    if (items !== undefined) {
      setClause.push('items = ?');
      params.push(JSON.stringify(items));
    }

    if (setClause.length === 0) {
      return Promise.resolve();
    }

    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(sectionId);

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE custom_sections SET ${setClause.join(', ')} WHERE id = ?`,
        params,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Delete a custom section
   */
  async deleteCustomSection(sectionId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM custom_sections WHERE id = ?',
        [sectionId],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Add item to custom section
   */
  async addItemToCustomSection(sectionId, item) {
    return new Promise((resolve, reject) => {
      // First get current items
      this.db.get(
        'SELECT items FROM custom_sections WHERE id = ?',
        [sectionId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            reject(new Error('Custom section not found'));
            return;
          }

          const currentItems = JSON.parse(row.items || '[]');
          const newItems = [...currentItems, { ...item, id: Date.now().toString() }];

          this.db.run(
            'UPDATE custom_sections SET items = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(newItems), sectionId],
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve(newItems);
              }
            }
          );
        }
      );
    });
  }

  /**
   * Remove item from custom section
   */
  async removeItemFromCustomSection(sectionId, itemId) {
    return new Promise((resolve, reject) => {
      // First get current items
      this.db.get(
        'SELECT items FROM custom_sections WHERE id = ?',
        [sectionId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            reject(new Error('Custom section not found'));
            return;
          }

          const currentItems = JSON.parse(row.items || '[]');
          const newItems = currentItems.filter(item => item.id !== itemId);

          this.db.run(
            'UPDATE custom_sections SET items = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(newItems), sectionId],
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve(newItems);
              }
            }
          );
        }
      );
    });
  }

  close() {
    console.log('Closing database connection');
    this.db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed successfully');
      }
    });
  }
}

module.exports = Database;
