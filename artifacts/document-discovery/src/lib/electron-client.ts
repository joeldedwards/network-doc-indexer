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
} from '../../../../electron/types';

// Declare global window.electronAPI
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export const isElectron = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);

export function getElectronAPI(): ElectronAPI {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }

  // Fallback mock API for standalone browser development
  const mockConfig: IndexerConfig = {
    rootPath: './sample-data',
    includeExtensions: [
      '.pdf',
      '.docx',
      '.xlsx',
      '.xls',
      '.xlsm',
      '.ods',
      '.csv',
      '.tsv',
      '.txt',
      '.md',
      '.log',
      '.json',
    ],
    excludePatterns: ['node_modules', '.git', '~$*', '*.tmp'],
    maxFileSizeBytes: 52428800,
    indexingFrequency: 'manual',
    backgroundSync: true,
    lastIndexedAt: new Date().toISOString(),
    indexedCount: 9,
  };

  const mockDocuments: DocumentItem[] = [
    {
      id: 'doc-1',
      path: './sample-data/finance/approval-matrix.pdf',
      relativePath: 'finance/approval-matrix.pdf',
      name: 'approval-matrix.pdf',
      extension: '.pdf',
      sizeBytes: 803,
      modifiedAt: new Date().toISOString(),
      mimeType: 'application/pdf',
      snippet: 'Approval Matrix purchases above $5,000 require department lead <mark>approval</mark>.',
      uncPath: '\\\\Server\\Share\\finance\\approval-matrix.pdf',
      fileUrl: 'file:///sample-data/finance/approval-matrix.pdf',
    },
    {
      id: 'doc-2',
      path: './sample-data/operations/vendor-onboarding.docx',
      relativePath: 'operations/vendor-onboarding.docx',
      name: 'vendor-onboarding.docx',
      extension: '.docx',
      sizeBytes: 1506,
      modifiedAt: new Date().toISOString(),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      snippet: 'Vendor onboarding guide collect the <mark>approved</mark> supplier profile and contract review.',
      uncPath: '\\\\Server\\Share\\operations\\vendor-onboarding.docx',
      fileUrl: 'file:///sample-data/operations/vendor-onboarding.docx',
    },
    {
      id: 'doc-3',
      path: './sample-data/people-operations/benefits-overview.md',
      relativePath: 'people-operations/benefits-overview.md',
      name: 'benefits-overview.md',
      extension: '.md',
      sizeBytes: 406,
      modifiedAt: new Date().toISOString(),
      mimeType: 'text/markdown',
      snippet: 'Comprehensive health, retirement matching, and flexible PTO for full-time <mark>team</mark> members.',
      uncPath: '\\\\Server\\Share\\people-operations\\benefits-overview.md',
      fileUrl: 'file:///sample-data/people-operations/benefits-overview.md',
    },
    {
      id: 'doc-4',
      path: './sample-data/finance/travel-expenses.csv',
      relativePath: 'finance/travel-expenses.csv',
      name: 'travel-expenses.csv',
      extension: '.csv',
      sizeBytes: 155,
      modifiedAt: new Date().toISOString(),
      mimeType: 'text/csv',
      snippet: 'Quarterly travel budget breakdown, airfare, lodging, and client dining <mark>expenses</mark>.',
      uncPath: '\\\\Server\\Share\\finance\\travel-expenses.csv',
      fileUrl: 'file:///sample-data/finance/travel-expenses.csv',
    },
    {
      id: 'doc-5',
      path: './sample-data/operations/incident-response.md',
      relativePath: 'operations/incident-response.md',
      name: 'incident-response.md',
      extension: '.md',
      sizeBytes: 442,
      modifiedAt: new Date().toISOString(),
      mimeType: 'text/markdown',
      snippet: 'P1/P2 outage triage protocol, communications runbook, and post-mortem <mark>guidelines</mark>.',
      uncPath: '\\\\Server\\Share\\operations\\incident-response.md',
      fileUrl: 'file:///sample-data/operations/incident-response.md',
    },
  ];

  return {
    isElectron: false,
    selectDirectory: async () => './sample-data',
    testTarget: async (targetPath: string): Promise<TestTargetResult> => {
      const isUnc = targetPath.startsWith('\\\\') || targetPath.startsWith('//');
      return {
        accessible: true,
        path: targetPath,
        isUnc,
        normalizedPath: targetPath,
        latencyMs: 14,
        fileCount: 9,
      };
    },
    getConfig: async () => mockConfig,
    saveConfig: async (config) => config,
    startIndex: async () => ({ success: true, message: 'Indexing started.' }),
    stopIndex: async () => {},
    getIndexStatus: async (): Promise<IndexStatus> => ({
      running: false,
      phase: 'complete',
      discovered: 9,
      processed: 9,
      indexed: 9,
      skipped: 0,
      velocity: 0,
      currentDirectory: './sample-data',
      currentFile: null,
      startedAt: null,
      finishedAt: null,
      logs: [],
    }),
    onIndexProgress: () => () => {},
    search: async (query: SearchQuery): Promise<SearchResult> => {
      let filtered = [...mockDocuments];
      if (query.q) {
        const term = query.q.toLowerCase();
        filtered = filtered.filter(
          d => d.name.toLowerCase().includes(term) || d.snippet.toLowerCase().includes(term)
        );
      }
      if (query.extension) {
        filtered = filtered.filter(d => d.extension.toLowerCase() === query.extension?.toLowerCase());
      }
      return {
        results: filtered,
        totalCount: filtered.length,
        queryDurationMs: 4,
      };
    },
    getStats: async (): Promise<DocumentStats> => ({
      totalDocuments: 9,
      totalBytes: 5240,
      typeCounts: [
        { extension: '.pdf', count: 1 },
        { extension: '.docx', count: 1 },
        { extension: '.md', count: 2 },
        { extension: '.txt', count: 2 },
        { extension: '.csv', count: 1 },
        { extension: '.json', count: 1 },
        { extension: '.log', count: 1 },
      ],
    }),
    getDocument: async (id: string) => mockDocuments.find(d => d.id === id) || null,
    getDocumentPreview: async (id: string): Promise<DocumentPreview> => {
      const doc = mockDocuments.find(d => d.id === id) || mockDocuments[0];
      if (doc.extension === '.docx') {
        return {
          id: doc.id,
          name: doc.name,
          relativePath: doc.relativePath,
          kind: 'docx',
          content: '<h1>Vendor Onboarding Guide</h1><p>Collect the approved supplier profile, support contacts, and security review before issuing purchase orders.</p>',
          mimeType: doc.mimeType,
          uncPath: doc.uncPath,
          fileUrl: doc.fileUrl,
          sizeBytes: doc.sizeBytes,
          modifiedAt: doc.modifiedAt,
        };
      }
      return {
        id: doc.id,
        name: doc.name,
        relativePath: doc.relativePath,
        kind: 'text',
        content: `# ${doc.name}\n\nDocument contents loaded from ${doc.relativePath}.\nSample verified content for discovery.`,
        mimeType: doc.mimeType,
        uncPath: doc.uncPath,
        fileUrl: doc.fileUrl,
        sizeBytes: doc.sizeBytes,
        modifiedAt: doc.modifiedAt,
      };
    },
    showItemInFolder: async () => {},
    openExternal: async (url: string) => {
      window.open(url, '_blank');
    },
    sendSmtpEmail: async (params: SmtpEmailParams) => ({
      success: true,
      message: `Simulated email dispatched to ${params.recipients.join(', ')}.`,
    }),
    copyToClipboard: async (text: string) => {
      await navigator.clipboard.writeText(text);
    },
    getShareLinks: async (id: string) => {
      const doc = mockDocuments.find(d => d.id === id) || mockDocuments[0];
      return {
        uncPath: doc.uncPath,
        fileUrl: doc.fileUrl,
        markdownLink: `[${doc.name}](${doc.uncPath})`,
      };
    },
  };
}
