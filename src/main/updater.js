const { app } = require('electron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const GITHUB_REPO = 'oshtz/keepdir';
const UPDATE_DIR_NAME = 'updates';

// Platform-specific asset patterns
// Windows: exact match for portable zip
// macOS: match any zip containing 'darwin' (Electron Forge naming convention)
const ASSET_PATTERNS = {
  win32: {
    exact: 'keepdir-portable-windows.zip',
    pattern: /\.zip$/i
  },
  darwin: {
    exact: null, // No exact match, use pattern
    pattern: /keepdir.*darwin.*\.zip$/i
  }
};

/**
 * Get the updates directory path
 */
function getUpdateDir() {
  return path.join(app.getPath('userData'), UPDATE_DIR_NAME);
}

/**
 * Normalize version string (strip 'v' prefix, handle pre-release tags)
 */
function normalizeVersion(version) {
  if (!version) return '';
  return version.trim().replace(/^v/i, '').split('-')[0];
}

/**
 * Compare two semantic versions
 * Returns: 1 if left > right, -1 if left < right, 0 if equal
 */
function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split('.').map(Number);
  const rightParts = normalizeVersion(right).split('.').map(Number);

  for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i++) {
    const leftPart = leftParts[i] || 0;
    const rightPart = rightParts[i] || 0;

    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

/**
 * Check for available updates
 * @param {BrowserWindow} mainWindow - Main window for sending progress events
 * @returns {Promise<{updateInfo?: object, error?: string}>}
 */
async function checkForUpdate(mainWindow) {
  // Don't check for updates in development
  if (!app.isPackaged) {
    return { error: 'Updates are disabled in development mode.' };
  }

  try {
    const currentVersion = app.getVersion();
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

    const response = await axios.get(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': `keepdir/${currentVersion}`
      },
      timeout: 10000
    });

    const release = response.data;
    const latestVersion = normalizeVersion(release.tag_name || '');

    if (!latestVersion) {
      return { error: 'Could not determine latest version.' };
    }

    // Check if update is available
    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return { updateInfo: null }; // Up to date
    }

    // Find the appropriate asset for this platform
    const assets = release.assets || [];
    const platformConfig = ASSET_PATTERNS[process.platform];

    if (!platformConfig) {
      return { error: `Auto-update is not supported on ${process.platform}.` };
    }

    let asset = null;

    // Try exact match first
    if (platformConfig.exact) {
      asset = assets.find(a => a.name === platformConfig.exact);
    }

    // Fall back to pattern match
    if (!asset && platformConfig.pattern) {
      asset = assets.find(a => platformConfig.pattern.test(a.name));
    }

    // Last resort: any zip file
    if (!asset) {
      asset = assets.find(a => a.name.toLowerCase().endsWith('.zip'));
    }

    if (!asset) {
      return { error: 'No compatible update asset found for this platform.' };
    }

    return {
      updateInfo: {
        version: latestVersion,
        notes: release.body || null,
        publishedAt: release.published_at || null,
        downloadUrl: asset.browser_download_url,
        assetName: asset.name,
        assetSize: asset.size
      }
    };
  } catch (error) {
    if (error.response) {
      if (error.response.status === 404) {
        return { error: 'No releases found.' };
      }
      if (error.response.status === 403) {
        return { error: 'GitHub API rate limit exceeded. Please try again later.' };
      }
    }
    console.error('Update check failed:', error.message);
    return { error: `Failed to check for updates: ${error.message}` };
  }
}

/**
 * Download an update
 * @param {object} updateInfo - Update info from checkForUpdate
 * @param {BrowserWindow} mainWindow - Main window for sending progress events
 * @returns {Promise<{updatePath?: string, error?: string}>}
 */
async function downloadUpdate(updateInfo, mainWindow) {
  if (!app.isPackaged) {
    return { error: 'Updates are disabled in development mode.' };
  }

  if (!updateInfo || !updateInfo.downloadUrl) {
    return { error: 'Invalid update info.' };
  }

  try {
    // Create updates directory
    const updateDir = getUpdateDir();
    if (!fs.existsSync(updateDir)) {
      fs.mkdirSync(updateDir, { recursive: true });
    }

    // Determine filename
    const fileName = updateInfo.assetName || `keepdir-${updateInfo.version}.zip`;
    const updatePath = path.join(updateDir, fileName);

    // Download with progress reporting
    const response = await axios({
      method: 'get',
      url: updateInfo.downloadUrl,
      responseType: 'stream',
      timeout: 300000, // 5 minute timeout for large files
      headers: {
        'User-Agent': `keepdir/${app.getVersion()}`
      }
    });

    const totalLength = parseInt(response.headers['content-length'], 10) || updateInfo.assetSize || 0;
    let downloaded = 0;

    const writer = fs.createWriteStream(updatePath);

    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      const percent = totalLength > 0 ? Math.round((downloaded / totalLength) * 100) : 0;

      // Send progress to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-download-progress', {
          percent,
          downloaded,
          total: totalLength
        });
      }
    });

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        resolve({ updatePath });
      });

      writer.on('error', (err) => {
        // Clean up partial download
        try {
          fs.unlinkSync(updatePath);
        } catch (e) {
          // Ignore cleanup errors
        }
        reject(err);
      });

      response.data.pipe(writer);
    });
  } catch (error) {
    console.error('Download failed:', error.message);
    return { error: `Failed to download update: ${error.message}` };
  }
}

/**
 * Apply an update (Windows)
 * @param {string} updatePath - Path to downloaded update file
 * @returns {Promise<{success?: boolean, error?: string}>}
 */
async function installUpdate(updatePath) {
  if (!app.isPackaged) {
    return { error: 'Updates are disabled in development mode.' };
  }

  if (!updatePath || !fs.existsSync(updatePath)) {
    return { error: 'Update file not found.' };
  }

  try {
    const currentExe = process.execPath;
    const currentDir = path.dirname(currentExe);
    const pid = process.pid;

    if (process.platform === 'win32') {
      // Windows: Use PowerShell to wait for exit, extract, and restart
      const script = `
        $ErrorActionPreference = 'Stop'
        $procId = ${pid}
        $zipPath = '${updatePath.replace(/'/g, "''")}'
        $targetDir = '${currentDir.replace(/'/g, "''")}'

        # Wait for app to exit
        while (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
            Start-Sleep -Milliseconds 200
        }

        # Small delay to ensure file handles are released
        Start-Sleep -Seconds 1

        # Extract zip (overwrite existing files)
        Expand-Archive -Path $zipPath -DestinationPath $targetDir -Force

        # Find and start the new executable
        $exePath = Join-Path $targetDir 'keepdir.exe'
        if (Test-Path $exePath) {
            Start-Process $exePath
        } else {
            # Try to find it in a subdirectory (in case zip has folder structure)
            $exePath = Get-ChildItem -Path $targetDir -Name 'keepdir.exe' -Recurse | Select-Object -First 1
            if ($exePath) {
                Start-Process (Join-Path $targetDir $exePath)
            }
        }

        # Cleanup
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
      `;

      spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();

      // Exit the app
      setTimeout(() => {
        app.exit(0);
      }, 500);

      return { success: true };
    } else if (process.platform === 'darwin') {
      // macOS: Use bash script
      // currentExe is inside: AppName.app/Contents/MacOS/AppName
      const appBundle = path.resolve(currentExe, '..', '..', '..');
      const appBundleName = path.basename(appBundle);
      const appBundleDir = path.dirname(appBundle);

      const script = `
        pid=${pid}
        zipPath='${updatePath.replace(/'/g, "'\\''")}'
        appBundleDir='${appBundleDir.replace(/'/g, "'\\''")}'
        appBundleName='${appBundleName.replace(/'/g, "'\\''")}'
        appBundlePath='${appBundle.replace(/'/g, "'\\''")}'

        # Wait for app to exit
        while kill -0 $pid 2>/dev/null; do sleep 0.2; done

        # Small delay to ensure file handles are released
        sleep 1

        # Create temp directory for extraction
        tempDir=$(mktemp -d)

        # Extract zip to temp directory
        ditto -xk "$zipPath" "$tempDir"

        # Find the .app bundle in extracted contents (handles nested folder structures)
        extractedApp=$(find "$tempDir" -name "*.app" -type d -maxdepth 2 | head -1)

        if [ -n "$extractedApp" ]; then
          # Remove old app bundle
          rm -rf "$appBundlePath"

          # Move new app bundle to target location
          mv "$extractedApp" "$appBundlePath"

          # Launch new version
          open "$appBundlePath"
        fi

        # Cleanup
        rm -rf "$tempDir"
        rm -f "$zipPath"
      `;

      spawn('bash', ['-c', script], {
        detached: true,
        stdio: 'ignore'
      }).unref();

      setTimeout(() => {
        app.exit(0);
      }, 500);

      return { success: true };
    } else {
      return { error: 'Auto-update is not supported on this platform.' };
    }
  } catch (error) {
    console.error('Install failed:', error.message);
    return { error: `Failed to install update: ${error.message}` };
  }
}

/**
 * Clean up old update files
 */
function cleanupUpdates() {
  try {
    const updateDir = getUpdateDir();
    if (fs.existsSync(updateDir)) {
      const files = fs.readdirSync(updateDir);
      for (const file of files) {
        const filePath = path.join(updateDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // Ignore errors
        }
      }
    }
  } catch (error) {
    console.error('Cleanup failed:', error.message);
  }
}

module.exports = {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  cleanupUpdates,
  compareVersions,
  normalizeVersion
};
