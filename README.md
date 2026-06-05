# keepdir 🗂️

> **⚠️ Learning Project**: This is an open source learning project for educational purposes. **NOT production-ready** - use at your own risk and always backup your files.

A GenAI-powered desktop application for intelligent file organization, built to practice testing coverage, native desktop development, AI integration, and UX/UI design.

keepdir is local-first. Workspaces, settings, history, cache data, and custom sidebar sections are stored locally in SQLite; there is no app account, login, logout, or hosted user profile layer. Cloud AI providers require their own API keys, and local providers such as Ollama and LM Studio can run without provider API keys.

## Features

### AI-Powered Organization

- **Multi-Provider Support**: OpenAI, Anthropic (Claude), Google Gemini, OpenRouter, Ollama, and LM Studio (local)
- **Dynamic Model Discovery**: Models are fetched directly from provider APIs, always up-to-date
- **Smart File Sorting**: Automatically categorizes files into folders based on content and context
- **Intelligent Renaming**: AI-generated descriptive filenames with batch processing
- **Vision Support**: Image analysis for rename/sort suggestions (OpenAI, Anthropic, Gemini, Ollama, LM Studio)
- **Image Optimization**: Automatic compression and caching for vision API calls

### Workspace Management

- **Multiple Workspaces**: Create, rename, and delete workspaces with per-workspace settings
- **Export/Import**: Save and load workspace configurations as JSON
- **Workspace Transfer**: Move workspace configurations between devices using exported JSON files
- **Full Backup/Restore**: Complete workspace data backup functionality
- **Settings Export/Import**: Backup and restore all settings including templates, AI rules, and preferences

### File Browser

- **Directory Explorer**: Breadcrumb navigation with search and filtering
- **Multiple View Modes**: Grid, list, table, tiles, compact, and details views
- **Favorites**: Drag-and-drop reorderable favorite folders
- **Recent Folders**: Quick access to recently visited directories
- **Custom Sidebar Sections**: Organize your navigation with custom sections

### UI/UX

- **Themes**: Dark/light mode with customizable accent colors
- **Per-Workspace Themes**: Custom colors and gradients per workspace
- **Keyboard Shortcuts**: Ctrl+1-5 (workspaces), Ctrl+Tab, F5 (refresh), Ctrl+O, ? (help)
- **Keyboard Shortcuts Panel**: Press ? to open shortcuts reference, also available in Settings
- **Context Menus**: Right-click actions throughout the app
- **Toast Notifications**: Non-blocking success, error, warning, and info messages with action buttons
- **Loading Skeletons**: Improved loading states with skeleton placeholders for directory views
- **Scrollable Settings Panel**: Settings sidebar with smooth scrolling for easy navigation

### Safety & Recovery

- **Undo/Redo System**: Full operation stack to reverse rename/move tasks with batch rollback support
- **Selective Rollback**: Undo individual operations or entire batches
- **Conflict Resolution**: Dedicated UI for filename conflicts (rename, skip, auto-increment, merge)
- **Error Recovery**: Retry failed operations, skip errors, or rollback successful changes
- **Operation Summary**: Before/after summary modal showing renamed, moved, skipped, and failed counts

### Batch Operations

- **Cancel/Pause Long Batches**: Interrupt long-running operations with pause/resume support
- **Progress Tracking**: Real-time progress bar with elapsed time and estimated time remaining
- **Partial Completion**: Cancelled operations preserve completed changes with option to undo
- **Selective Apply**: Checkbox UI to approve/decline individual rename/move suggestions

### Database & Caching

- **SQLite Storage**: Local database for settings and workspace data
- **Analysis Caching**: Cached file analysis results for faster repeat operations
- **Database Optimization**: WAL mode and indexing for performance

### Power Tools

- **Rename Templates**: 14+ deterministic text transformations (date prefix, case normalization, snake_case, kebab-case, etc.)
- **Template UI in Rename Dialog**: Switch between AI suggestions and template-based renaming with live preview
- **Export Changes**: Export pending suggestions or operation history as JSON/CSV for audit and review

### Operation History

- **Persistent History Panel**: View all rename/sort operations in Settings
- **Batch & Individual Undo**: Undo entire batches or individual file operations
- **History Export**: Download history as JSON or CSV for audit
- **Timeline View**: Expandable operation details with timestamps
- **Directory Filtering**: View operations filtered by directory

### AI Customization

- **Date Format Presets**: Choose preferred date format (YYYY-MM-DD, DD-MM-YYYY, etc.)
- **Grouping Logic**: Configure how AI groups files (by type, date, project, size, or custom)
- **Naming Conventions**: Set preferred naming style (kebab-case, snake_case, camelCase, Title Case)
- **Exclusion Patterns**: Ignore specific files/folders from AI analysis
- **Custom Prompt Instructions**: Add custom instructions for all AI prompts

## Tech Stack

- **Frontend**: React 18, TypeScript, Material-UI 5, Framer Motion, Emotion
- **Backend**: Electron 42, Node.js, SQLite3
- **AI Integration**: OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama, LM Studio APIs
- **Drag & Drop**: @dnd-kit (sortable favorites, custom sections)
- **Image Processing**: Sharp (compression for vision APIs)
- **Testing**: Jest 30, React Testing Library (70% coverage threshold)
- **Build**: Webpack 5, Electron Forge 7

## Getting Started

```bash
# Clone and install
git clone https://github.com/oshtz/keepdir.git
cd keepdir
npm install

# Development
npm run dev

# Testing
npm test
npm run test:e2e
npm run check

# Build
npm run build
npm run package
```

## AI Providers

| Provider          | Models                     | Vision Support | Notes                                |
| ----------------- | -------------------------- | -------------- | ------------------------------------ |
| **OpenAI**        | Dynamic (fetched from API) | ✅ Yes         | Up to 85 images/request              |
| **Anthropic**     | Dynamic (fetched from API) | ✅ Yes         | Up to 100 images/request             |
| **Google Gemini** | Dynamic (fetched from API) | ✅ Yes         | Up to 3,600 images/request           |
| **OpenRouter**    | Dynamic (fetched from API) | ✅ Yes         | Access 100+ models via single API    |
| **Ollama**        | Dynamic (local models)     | ✅ Yes         | No API key required, local inference |
| **LM Studio**     | Dynamic (local models)     | ✅ Yes         | No API key required, local inference |

All providers dynamically fetch available models from their respective APIs when you enter a valid API key, ensuring you always have access to the latest models.

## Learning Focus

This project explores:

- Modern React 18 patterns with TypeScript strict mode
- Electron main/renderer process architecture with IPC
- Multi-provider AI API integration with vision support
- Dynamic model discovery via provider API endpoints
- Comprehensive testing with Jest and React Testing Library
- Electron smoke testing with Playwright
- SQLite database operations with WAL mode optimization
- Image processing and compression with Sharp
- Drag-and-drop interfaces with @dnd-kit

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the current process, storage, IPC, and testing boundaries.

## Contributions welcome

## License

MIT License - Learning project only, not for production use.
