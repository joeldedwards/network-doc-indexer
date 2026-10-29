import { contextBridge, ipcRenderer } from 'electron';
import type {
  ElectronAPI,
  IndexerConfig,
  IndexStatus,
  SearchQuery,
  SearchResult,
  DocumentStats,
  DocumentItem,
  DocumentPreview,
  SmtpEmailParams,
  TestTargetResult,
} from './types';

const electronAPI: ElectronAPI = {
  isElectron: true,

  selectDirectory: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:selectDirectory');
  },

  testTarget: (targetPath: string): Promise<TestTargetResult> => {
    return ipcRenderer.invoke('indexer:testTarget', targetPath);
  },

  getConfig: (): Promise<IndexerConfig | null> => {
    return ipcRenderer.invoke('indexer:getConfig');
  },

  saveConfig: (config: IndexerConfig): Promise<IndexerConfig> => {
    return ipcRenderer.invoke('indexer:saveConfig', config);
  },

  startIndex: (): Promise<{ success: boolean; message: string }> => {
    return ipcRenderer.invoke('indexer:startIndex');
  },

  stopIndex: (): Promise<void> => {
    return ipcRenderer.invoke('indexer:stopIndex');
  },

  getIndexStatus: (): Promise<IndexStatus> => {
    return ipcRenderer.invoke('indexer:getStatus');
  },

  onIndexProgress: (callback: (status: IndexStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: IndexStatus) => {
      callback(status);
    };
    ipcRenderer.on('indexer:progress', listener);
    return () => {
      ipcRenderer.removeListener('indexer:progress', listener);
    };
  },

  search: (query: SearchQuery): Promise<SearchResult> => {
    return ipcRenderer.invoke('search:query', query);
  },

  getStats: (): Promise<DocumentStats> => {
    return ipcRenderer.invoke('search:getStats');
  },

  getDocument: (id: string): Promise<DocumentItem | null> => {
    return ipcRenderer.invoke('documents:get', id);
  },

  getDocumentPreview: (id: string): Promise<DocumentPreview> => {
    return ipcRenderer.invoke('documents:preview', id);
  },

  showItemInFolder: (path: string): Promise<void> => {
    return ipcRenderer.invoke('shell:showItemInFolder', path);
  },

  openExternal: (url: string): Promise<void> => {
    return ipcRenderer.invoke('shell:openExternal', url);
  },

  sendSmtpEmail: (params: SmtpEmailParams): Promise<{ success: boolean; message: string }> => {
    return ipcRenderer.invoke('email:sendSmtp', params);
  },

  copyToClipboard: (text: string): Promise<void> => {
    return ipcRenderer.invoke('clipboard:writeText', text);
  },

  getShareLinks: (id: string): Promise<{ uncPath: string; fileUrl: string; markdownLink: string }> => {
    return ipcRenderer.invoke('documents:getShareLinks', id);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
