const { app, BrowserWindow, dialog, ipcMain, shell, clipboard } = require("electron");
const fs = require("fs");
const path = require("path");

const perfOriginMs = Date.now();
const perfExitRequested = process.argv.includes("--perf-exit");
const perfFilePath = process.env.MDREADER_PERF_FILE ? path.resolve(process.env.MDREADER_PERF_FILE) : null;

function elapsedMs() {
  return Date.now() - perfOriginMs;
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return {};
  }
  const clean = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      clean[key] = value;
    }
  }
  return clean;
}

function logPerf(name, meta) {
  const payload = {
    name,
    ms: elapsedMs(),
    ...normalizeMeta(meta),
  };
  console.log(`[perf] ${JSON.stringify(payload)}`);
  if (perfFilePath) {
    try {
      fs.appendFileSync(perfFilePath, `${JSON.stringify(payload)}\n`, "utf8");
    } catch (_err) {
      // Ignore perf file write failures in normal app flow.
    }
  }
}

if (process.env.MDREADER_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
  logPerf("gpu-disabled", { reason: "MDREADER_DISABLE_GPU=1" });
}
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
logPerf("main-process-start");

let mainWindow = null;
let pendingOpenPath = null;
let isRendererReady = false;

async function extractFilePath(argv) {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith("-")) {
      continue;
    }
    try {
      const stat = await fs.promises.stat(arg);
      if (stat.isFile()) {
        return arg;
      }
    } catch (_err) {
      continue;
    }
  }
  return null;
}

function sendOpenFile(filePath) {
  if (!filePath) {
    return;
  }
  if (!mainWindow || !isRendererReady) {
    pendingOpenPath = filePath;
    return;
  }
  mainWindow.webContents.send("open-file", filePath);
}

function createWindow() {
  logPerf("create-window:start");
  isRendererReady = false;
  mainWindow = new BrowserWindow({
    title: "MD Reader",
    width: 980,
    height: 720,
    resizable: true,
    icon: path.join(__dirname, "..", "assets", "icon.ico"),
    show: false,
    backgroundColor: "#f7f4ef",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  logPerf("create-window:done");

  mainWindow.loadFile(path.join(__dirname, "..", "frontend", "index.html"));

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) {
      return;
    }
    mainWindow.show();
    logPerf("window-shown");
  });

  mainWindow.webContents.on("did-finish-load", () => {
    logPerf("did-finish-load");
    isRendererReady = true;
    if (pendingOpenPath) {
      sendOpenFile(pendingOpenPath);
      pendingOpenPath = null;
    }
  });

  mainWindow.webContents.on("dom-ready", () => {
    logPerf("dom-ready");
    if (perfExitRequested) {
      setTimeout(() => app.quit(), 120);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    isRendererReady = false;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
    extractFilePath(argv)
      .then((filePath) => {
        if (filePath) {
          sendOpenFile(filePath);
        }
      })
      .catch(() => {});
  });
}

app.setAppUserModelId("com.example.mdreader");

app.on("ready", () => {
  logPerf("app-ready");
  createWindow();
  extractFilePath(process.argv)
    .then((filePath) => {
      if (filePath) {
        sendOpenFile(filePath);
      }
    })
    .catch(() => {});
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  sendOpenFile(filePath);
});

ipcMain.on("perf:event", (_event, payload) => {
  if (!payload || typeof payload.name !== "string") {
    return;
  }
  logPerf(`renderer:${payload.name}`, payload.meta);
});

ipcMain.handle("open-dialog", async () => {
  if (!mainWindow) {
    return null;
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("read-file", async (_event, filePath) => {
  const bytes = await fs.promises.readFile(filePath);
  return bytes.toString("utf8");
});

ipcMain.handle("reveal-in-folder", async (_event, filePath) => {
  if (!filePath) {
    return;
  }
  shell.showItemInFolder(filePath);
});

ipcMain.handle("copy-path", async (_event, filePath) => {
  if (!filePath) {
    return;
  }
  clipboard.writeText(filePath);
});
