export interface IndexerConfig {
  rootPath: string;
  includeExtensions: string[];
  excludePatterns: string[];
  maxFileSizeBytes: number;
  indexingFrequency: 'manual' | 'hourly' | 'daily';
  backgroundSync: boolean;
  lastIndexedAt?: string | null;
  indexedCount: number;
}

export interface IndexLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  path: string;
  reason: string;
}

export interface IndexStatus {
  running: boolean;
  phase: 'idle' | 'scanning' | 'indexing' | 'complete' | 'error';
  discovered: number;
  processed: number;
  indexed: number;
  skipped: number;
  velocity: number; // files per second
  currentDirectory: string;
  currentFile: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  logs: IndexLogEntry[];
}

export interface TestTargetResult {
  accessible: boolean;
  path: string;
  isUnc: boolean;
  normalizedPath: string;
  latencyMs: number;
  fileCount: number;
  error?: string;
  warning?: string;
}

export interface DocumentItem {
  id: string;
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  mimeType: string;
  snippet: string;
  uncPath: string;
  fileUrl: string;
}

export interface SearchQuery {
  q?: string;
  mode: 'content' | 'filename';
  extension?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  limit?: number;
}

export interface SearchResult {
  results: DocumentItem[];
  totalCount: number;
  queryDurationMs: number;
}

export interface DocumentStats {
  totalDocuments: number;
  totalBytes: number;
  typeCounts: { extension: string; count: number }[];
}

export interface DocumentPreview {
  id: string;
  name: string;
  relativePath: string;
  kind: 'text' | 'pdf' | 'docx' | 'unsupported';
  content?: string;
  dataUrl?: string;
  mimeType: string;
  uncPath: string;
  fileUrl: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface SmtpEmailParams {
  recipients: string[];
  subject: string;
  body: string;
  documentId: string;
  deliveryMode: 'attachment' | 'link';
  smtpConfig?: SmtpConfig;
}

export interface ElectronAPI {
  selectDirectory: () => Promise<string | null>;
  testTarget: (targetPath: string) => Promise<TestTargetResult>;
  getConfig: () => Promise<IndexerConfig | null>;
  saveConfig: (config: IndexerConfig) => Promise<IndexerConfig>;
  startIndex: () => Promise<{ success: boolean; message: string }>;
  stopIndex: () => Promise<void>;
  getIndexStatus: () => Promise<IndexStatus>;
  onIndexProgress: (callback: (status: IndexStatus) => void) => () => void;
  search: (query: SearchQuery) => Promise<SearchResult>;
  getStats: () => Promise<DocumentStats>;
  getDocument: (id: string) => Promise<DocumentItem | null>;
  getDocumentPreview: (id: string) => Promise<DocumentPreview>;
  showItemInFolder: (path: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  sendSmtpEmail: (params: SmtpEmailParams) => Promise<{ success: boolean; message: string }>;
  copyToClipboard: (text: string) => Promise<void>;
  getShareLinks: (id: string) => Promise<{ uncPath: string; fileUrl: string; markdownLink: string }>;
  isElectron: boolean;
}
