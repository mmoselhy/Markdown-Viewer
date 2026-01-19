const { app, BrowserWindow, dialog, ipcMain, shell, clipboard } = require("electron");
const fs = require("fs");
const path = require("path");

const startTime = Date.now();

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

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
  isRendererReady = false;
  mainWindow = new BrowserWindow({
    title: "MD Reader",
    width: 980,
    height: 720,
    resizable: true,
    icon: path.join(__dirname, "..", "assets", "icon.ico"),
    show: true,
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

  mainWindow.loadFile(path.join(__dirname, "..", "frontend", "index.html"));

  mainWindow.webContents.on("did-finish-load", () => {
    isRendererReady = true;
    if (pendingOpenPath) {
      sendOpenFile(pendingOpenPath);
      pendingOpenPath = null;
    }
  });

  mainWindow.webContents.on("dom-ready", () => {
    const elapsedMs = Date.now() - startTime;
    console.log(`Startup dom-ready in ${elapsedMs}ms`);
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
