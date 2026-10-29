"use strict";

// electron/preload.ts
var import_electron = require("electron");
var electronAPI = {
  isElectron: true,
  selectDirectory: () => {
    return import_electron.ipcRenderer.invoke("dialog:selectDirectory");
  },
  testTarget: (targetPath) => {
    return import_electron.ipcRenderer.invoke("indexer:testTarget", targetPath);
  },
  getConfig: () => {
    return import_electron.ipcRenderer.invoke("indexer:getConfig");
  },
  saveConfig: (config) => {
    return import_electron.ipcRenderer.invoke("indexer:saveConfig", config);
  },
  startIndex: () => {
    return import_electron.ipcRenderer.invoke("indexer:startIndex");
  },
  stopIndex: () => {
    return import_electron.ipcRenderer.invoke("indexer:stopIndex");
  },
  getIndexStatus: () => {
    return import_electron.ipcRenderer.invoke("indexer:getStatus");
  },
  onIndexProgress: (callback) => {
    const listener = (_event, status) => {
      callback(status);
    };
    import_electron.ipcRenderer.on("indexer:progress", listener);
    return () => {
      import_electron.ipcRenderer.removeListener("indexer:progress", listener);
    };
  },
  search: (query) => {
    return import_electron.ipcRenderer.invoke("search:query", query);
  },
  getStats: () => {
    return import_electron.ipcRenderer.invoke("search:getStats");
  },
  getDocument: (id) => {
    return import_electron.ipcRenderer.invoke("documents:get", id);
  },
  getDocumentPreview: (id) => {
    return import_electron.ipcRenderer.invoke("documents:preview", id);
  },
  showItemInFolder: (path) => {
    return import_electron.ipcRenderer.invoke("shell:showItemInFolder", path);
  },
  openExternal: (url) => {
    return import_electron.ipcRenderer.invoke("shell:openExternal", url);
  },
  sendSmtpEmail: (params) => {
    return import_electron.ipcRenderer.invoke("email:sendSmtp", params);
  },
  copyToClipboard: (text) => {
    return import_electron.ipcRenderer.invoke("clipboard:writeText", text);
  },
  getShareLinks: (id) => {
    return import_electron.ipcRenderer.invoke("documents:getShareLinks", id);
  }
};
import_electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
//# sourceMappingURL=preload.js.map
