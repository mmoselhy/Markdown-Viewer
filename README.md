# MD Reader

A fast, minimal Markdown reader built with Electron. Designed for quick viewing and searching of Markdown documents with a clean, distraction-free interface.

## Features

- **Fast Startup**: Optimized for instant launch with minimal overhead
- **Drag & Drop**: Simply drag a `.md` file into the window to open it
- **File Dialog**: Use the built-in Open button to browse for files
- **Search Functionality**: Find text in your documents with Enter/Shift+Enter navigation between matches
- **Dark/Light Theme**: Toggle between themes with automatic system preference detection
- **CLI Support**: Open files directly from the command line
- **Single Instance**: Multiple file opens reuse the same window
- **Syntax Highlighting**: Full GitHub Flavored Markdown (GFM) support including tables, task lists, and strikethrough

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- npm (comes with Node.js)

## Installation

1. Clone the repository:
```sh
git clone <repository-url>
cd mdreader
```

2. Install dependencies:
```sh
npm install
```

## Usage

### Running in Development Mode

```sh
npm run dev
```

This launches the application in development mode with Electron.

### Opening Files

There are three ways to open Markdown files:

1. **Drag & Drop**: Drag a `.md` file into the application window
2. **Open Button**: Click the "Open" button in the toolbar and browse for a file
3. **Command Line**: Launch the app with a file path:
   ```sh
   MD Reader.exe path\to\file.md
   ```

### Search

- Type in the search box to find text in the current document
- Press **Enter** to jump to the next match
- Press **Shift+Enter** to jump to the previous match
- Clear the search box to remove highlighting

### Theme Toggle

- Click the theme toggle button (☀️/🌙) to switch between light and dark modes
- Your preference is saved automatically and persists between sessions
- The app respects your system's default theme preference on first launch

## Building

### Fast Unpacked Build

Creates an unpacked build with no compression for the fastest startup:

```sh
npm run build
```

This creates `dist/MD-Reader-fast.zip`. Extract and run `MD Reader.exe` from the extracted folder.

### Portable Executable

Creates a single portable `.exe` file:

```sh
npm run build:portable
```

The portable executable will be in the `dist/` folder.

### Development Build

To create an unpacked build for testing without compression:

```sh
npm run pack
```

## Startup Benchmarking

Run startup benchmarks in dev mode:

```sh
npm run perf:startup
```

Run startup benchmarks with GPU acceleration disabled:

```sh
npm run perf:startup:gpu-off
```

The benchmark runner reads structured `[perf]` events, prints `p50`, `p95`, `min`, and `max` timings, and warns when startup budgets are exceeded.

You can also benchmark a packaged executable directly:

```sh
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/benchmark-startup.ps1 -ExecutablePath "dist\\win-unpacked\\MD Reader.exe"
```

Default startup targets:

- Empty launch interactive: `<= 1000ms` p50, `<= 1300ms` p95
- Launch with small file (`<200KB`): `<= 1200ms` p50

## Project Structure

```
mdreader/
├── assets/          # Application assets (icons)
├── electron/        # Electron main and preload scripts
│   ├── main.js      # Main process (window management, IPC)
│   └── preload.js   # Preload script (secure IPC bridge)
├── frontend/        # Renderer process (UI)
│   ├── index.html   # Main HTML
│   ├── main.js      # Application logic
│   ├── styles.css   # Document styling
│   ├── shell.css    # UI shell styling
│   └── vendor/      # Third-party libraries
├── scripts/         # Build and deployment scripts
└── package.json     # Project configuration
```

## Technologies

- **Electron**: Cross-platform desktop application framework
- **marked**: Fast Markdown parser with GFM support
- **Vanilla JavaScript**: No framework dependencies for minimal footprint
- **electron-builder**: Application packaging and distribution

## Development Notes

- The app uses vanilla HTML/CSS/JS with no build step for the renderer
- Markdown parsing happens in the renderer using vendored `frontend/vendor/marked.min.js`
- Context isolation and sandboxing are enabled for security
- The application enforces single-instance behavior
- Non-critical startup work is deferred with idle callbacks
- Large markdown files render a fast plain-text preview before full markdown parsing completes
- The app emits structured startup events using `[perf]` logs

## Configuration

Build configuration is in `package.json` under the `build` section. Key settings:

- **appId**: `com.example.mdreader`
- **productName**: MD Reader
- **compression**: `store` (no compression for fast startup)
- **asar**: Enabled for bundling

Runtime startup flags:

- `MDREADER_DISABLE_GPU=1` disables GPU acceleration
- `MDREADER_PERF_FILE=<path>` writes JSONL perf events to a file for benchmarking
- `--perf-exit` exits shortly after startup milestones to support repeatable benchmarking

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
