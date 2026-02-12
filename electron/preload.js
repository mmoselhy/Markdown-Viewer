const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mdreader", {
  openDialog: () => ipcRenderer.invoke("open-dialog"),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  revealInFolder: (filePath) => ipcRenderer.invoke("reveal-in-folder", filePath),
  copyPath: (filePath) => ipcRenderer.invoke("copy-path", filePath),
  reportPerf: (name, meta) => {
    if (typeof name !== "string" || !name) {
      return;
    }
    ipcRenderer.send("perf:event", { name, meta });
  },
  onOpenFile: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on("open-file", handler);
    return () => ipcRenderer.removeListener("open-file", handler);
  },
});
