import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp,
  CircleHelp, Copy, Clock3, ExternalLink, File, FileArchive, FileImage, FileSpreadsheet, FileText,
  Folder, FolderClosed, FolderSearch, Gauge, HardDrive, Mail, Moon, RefreshCw,
  Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Sun, X, Zap,
  AlertTriangle, CheckCircle2, ChevronLeft
} from 'lucide-react';
import { getElectronAPI, isElectron } from '@/lib/electron-client';
import type {
  DocumentItem,
  DocumentPreview,
  DocumentStats,
  IndexerConfig,
  IndexLogEntry,
  IndexStatus,
  SearchQuery,
  SmtpEmailParams,
  TestTargetResult,
} from '../../../electron/types';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const api = getElectronAPI();

const defaultExtensions = [
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
];
const defaultExcludes = ['node_modules', '.git', '~$*', '*.tmp'];

const emptyConfig: IndexerConfig = {
  rootPath: './sample-data',
  includeExtensions: defaultExtensions,
  excludePatterns: defaultExcludes,
  maxFileSizeBytes: 52428800, // 50 MB
  indexingFrequency: 'manual',
  backgroundSync: true,
  lastIndexedAt: null,
  indexedCount: 0,
};

const cx = (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(' ');

const formatBytes = (bytes: number) => {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const readableDate = (date?: string | null) => {
  if (!date) return 'Not indexed yet';
  try {
    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Invalid date';
  }
};

function IconFile({ ext, size = 18 }: { ext: string; size?: number }) {
  const e = (ext || '').toLowerCase().replace('.', '');
  let Icon = File;
  if (e === 'pdf') Icon = FileText;
  else if (['xlsx', 'xls', 'xlsm', 'ods', 'csv', 'tsv'].includes(e)) Icon = FileSpreadsheet;
  else if (['png', 'jpg', 'jpeg'].includes(e)) Icon = FileImage;
  else if (['zip', 'gz', 'tar'].includes(e)) Icon = FileArchive;
  else if (['docx', 'doc'].includes(e)) Icon = FileText;
  return (
    <span className={`file-mark mark-${e}`}>
      <Icon size={size} strokeWidth={1.8} />
    </span>
  );
}

function HighlightSnippet({ text, query }: { text: string; query: string }) {
  if (!text) return null;

  // Handle SQLite FTS5 <mark> tags
  const hasMarks = text.includes('<mark>');
  if (hasMarks) {
    const parts = text.split(/(<mark>[\s\S]*?<\/mark>)/gi);
    return (
      <>
        {parts.map((part, i) =>
          /^<mark>/i.test(part) ? (
            <mark key={i}>{part.replace(/<\/?mark>/gi, '')}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  }

  // Fallback client-side highlight
  const terms = (query || '').replace(/['"*]/g, '').split(/\s+/).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const escapeRegex = (val: string) => val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`(${terms.sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})`, 'gi');
  return (
    <>
      {text.split(matcher).map((part, i) =>
        terms.some(t => t.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i}>{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [path] = useLocation();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const preference = window.localStorage.getItem('folio-color-mode');
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
    const applyMode = (isDark: boolean) => {
      document.documentElement.classList.toggle('dark', isDark);
      setDarkMode(isDark);
    };
    applyMode(preference ? preference === 'dark' : systemPreference.matches);
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (!window.localStorage.getItem('folio-color-mode')) applyMode(event.matches);
    };
    systemPreference.addEventListener('change', onSystemChange);
    return () => systemPreference.removeEventListener('change', onSystemChange);
  }, []);

  const toggleMode = () => {
    const nextMode = !darkMode;
    window.localStorage.setItem('folio-color-mode', nextMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', nextMode);
    setDarkMode(nextMode);
  };

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <FolderClosed size={19} />
          </span>
          <span>
            folio<span className="brand-dot">.</span>
            <small>DESKTOP DISCOVERY</small>
          </span>
        </Link>
        <div className="side-label">WORKSPACE</div>
        <Link href="/" className={cx('nav-item', path === '/' && 'active')}>
          <Search size={17} />
          Find a document
        </Link>
        <Link href="/settings" className={cx('nav-item', path === '/settings' && 'active')}>
          <Settings2 size={17} />
          Index settings
        </Link>
        <div className="side-divider" />
        <div className="side-label">INDEX TARGET</div>
        <div className="side-status">
          <span className={cx('pulse-dot', config?.rootPath && 'online')} />
          <div className="truncate">
            <b className="truncate block" title={config?.rootPath || 'Not configured'}>
              {config?.rootPath ? config.rootPath.split(/[\\/]/).pop() || config.rootPath : 'No drive set'}
            </b>
            <small>{config?.backgroundSync ? 'Live sync enabled' : 'Manual scan mode'}</small>
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="trust-note">
            <ShieldCheck size={16} />
            <span>
              Local SQLite index.<br />Data never leaves your machine.
            </span>
          </div>
          <span className="version-tag">{isElectron ? 'ELECTRON · NATIVE' : 'BROWSER PREVIEW'}</span>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="crumb">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <b>
              {path === '/settings'
                ? 'Index settings'
                : path === '/setup'
                ? 'First-run setup wizard'
                : path.startsWith('/view/')
                ? 'Document view'
                : 'Search & discovery'}
            </b>
          </div>
          <div className="top-actions">
            <span className="secure-label">
              <span className="mini-lock">●</span> SQLITE FTS5
            </span>
            <button
              className="theme-toggle"
              type="button"
              onClick={toggleMode}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              data-testid="button-theme-toggle"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <span className="user-chip">FD</span>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-stack">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <i />
          <span>
            <b />
            <small />
          </span>
        </div>
      ))}
    </div>
  );
}

function SearchPage() {
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [mode, setMode] = useState<'content' | 'filename'>('content');
  const [extension, setExtension] = useState('');
  const [modifiedAfter, setModifiedAfter] = useState('');
  const [modifiedBefore, setModifiedBefore] = useState('');
  const [minSizeMb, setMinSizeMb] = useState('');
  const [maxSizeMb, setMaxSizeMb] = useState('');
  const [selected, setSelected] = useState<DocumentItem | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [leftWidthPercent, setLeftWidthPercent] = useState(55); // Resizable pane split
  const isResizingRef = useRef(false);

  const [, navigate] = useLocation();
  const qc = useQueryClient();

  // Debounce search input (200ms per spec)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTerm(term.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [term]);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  });

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
  });

  const searchParams: SearchQuery = useMemo(
    () => ({
      q: debouncedTerm || undefined,
      mode,
      extension: extension || undefined,
      modifiedAfter: modifiedAfter || undefined,
      modifiedBefore: modifiedBefore || undefined,
      minSizeBytes: minSizeMb ? Math.round(Number(minSizeMb) * 1024 * 1024) : undefined,
      maxSizeBytes: maxSizeMb ? Math.round(Number(maxSizeMb) * 1024 * 1024) : undefined,
      limit: 60,
    }),
    [debouncedTerm, mode, extension, modifiedAfter, modifiedBefore, minSizeMb, maxSizeMb]
  );

  const { data: searchResult, isLoading: searchLoading, isError: searchError, refetch: refetchSearch } = useQuery({
    queryKey: ['search', searchParams],
    queryFn: () => api.search(searchParams),
    enabled: Boolean(config?.rootPath),
  });

  // Keep selected document in sync
  useEffect(() => {
    if (searchResult?.results?.length && !selected) {
      setSelected(searchResult.results[0]);
    }
  }, [searchResult, selected]);

  // Handle pane resizing
  const onMouseDownResizer = () => {
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const totalWidth = window.innerWidth - 205; // subtracting sidebar
      const newPercent = Math.min(Math.max((e.clientX - 205) / totalWidth * 100, 30), 75);
      setLeftWidthPercent(newPercent);
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  if (configLoading) {
    return (
      <div className="page-loading">
        <div className="loading-kicker">INITIALIZING EMBEDDED ENGINE</div>
        <Skeleton rows={6} />
      </div>
    );
  }

  // If no network target or configuration detected, prompt first-run wizard
  if (!config?.rootPath) {
    return <SetupPrompt />;
  }

  return (
    <div
      className="workspace"
      style={{
        display: 'grid',
        gridTemplateColumns: `${leftWidthPercent}% 6px ${100 - leftWidthPercent}%`,
      }}
    >
      {/* LEFT PANE: Search & Results List */}
      <section className="search-column overflow-y-auto">
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-rule" /> NETWORK DRIVE DISCOVERY
            </div>
            <h1>
              Find documents<br />
              <em>instantly.</em>
            </h1>
            <p className="truncate" title={config.rootPath}>
              Target: <span className="font-mono text-xs opacity-90">{config.rootPath}</span>
            </p>
          </div>
          <Link className="text-link settings-shortcut" href="/settings">
            <SlidersHorizontal size={15} /> Settings <ArrowRight size={14} />
          </Link>
        </div>

        {/* Search Header Panel */}
        <div className="search-panel">
          <div className="search-input-wrap">
            <Search size={19} />
            <input
              aria-label="Search documents"
              data-testid="input-search-documents"
              value={term}
              onChange={e => setTerm(e.target.value)}
              placeholder="Search file names or full text content…"
              autoFocus
            />
            {term && (
              <button
                type="button"
                className="opacity-60 hover:opacity-100 p-1 mr-2"
                onClick={() => setTerm('')}
              >
                <X size={15} />
              </button>
            )}
            <kbd>200MS</kbd>
          </div>

          <div className="search-controls">
            {/* Toggle Full Content vs Filename Only */}
            <div className="segmented">
              <button
                data-testid="button-search-content"
                className={mode === 'content' ? 'chosen' : ''}
                onClick={() => setMode('content')}
              >
                Full Content (FTS5)
              </button>
              <button
                data-testid="button-search-filename"
                className={mode === 'filename' ? 'chosen' : ''}
                onClick={() => setMode('filename')}
              >
                Filename Only (LIKE)
              </button>
            </div>

            {/* Quick Filter Toggle */}
            <button
              className={cx('filter-button', filterOpen && 'chosen')}
              onClick={() => setFilterOpen(!filterOpen)}
              data-testid="button-toggle-filters"
            >
              <SlidersHorizontal size={15} /> Quick filters <ChevronDown size={14} />
            </button>

            {searchResult && (
              <span className="search-tip font-mono text-xs">
                {searchResult.queryDurationMs} ms
              </span>
            )}
          </div>

          {/* Quick Filter Drawer */}
          {filterOpen && (
            <div className="filter-drawer">
              <label>
                FILE TYPE
                <select value={extension} onChange={e => setExtension(e.target.value)}>
                  <option value="">All file types</option>
                  {(stats?.typeCounts || []).map(item => (
                    <option key={item.extension} value={item.extension}>
                      {item.extension.toUpperCase()} ({item.count})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                MODIFIED AFTER
                <input
                  type="date"
                  value={modifiedAfter}
                  onChange={e => setModifiedAfter(e.target.value)}
                />
              </label>
              <label>
                MODIFIED BEFORE
                <input
                  type="date"
                  value={modifiedBefore}
                  onChange={e => setModifiedBefore(e.target.value)}
                />
              </label>
              <label>
                MIN SIZE (MB)
                <input
                  type="number"
                  min="0"
                  placeholder="Any"
                  value={minSizeMb}
                  onChange={e => setMinSizeMb(e.target.value)}
                />
              </label>
              <label>
                MAX SIZE (MB)
                <input
                  type="number"
                  min="0"
                  placeholder="Any"
                  value={maxSizeMb}
                  onChange={e => setMaxSizeMb(e.target.value)}
                />
              </label>
              <button
                className="clear-filter"
                onClick={() => {
                  setExtension('');
                  setModifiedAfter('');
                  setModifiedBefore('');
                  setMinSizeMb('');
                  setMaxSizeMb('');
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>

        {/* Library Summary Strip */}
        <div className="library-summary">
          <div className="summary-stat">
            <span className="summary-icon">
              <FileText size={16} />
            </span>
            <span>
              <b>{stats?.totalDocuments.toLocaleString() ?? '0'}</b>
              <small>indexed documents</small>
            </span>
          </div>
          <span className="summary-sep" />
          <div className="summary-stat">
            <span className="summary-icon coral">
              <HardDrive size={16} />
            </span>
            <span>
              <b>{formatBytes(stats?.totalBytes || 0)}</b>
              <small>total indexed size</small>
            </span>
          </div>
          <div className="summary-updated">
            <span className="tiny-status" />
            Updated {readableDate(config.lastIndexedAt)}
          </div>
        </div>

        {/* Results Header */}
        <div className="results-header">
          <div>
            <span className="results-title">Matches</span>
            {searchResult && (
              <span className="result-count">
                {searchResult.totalCount} {searchResult.totalCount === 1 ? 'file' : 'files'}
              </span>
            )}
          </div>
          <span className="sort-label">FTS5 RELEVANCE / MTIME</span>
        </div>

        {/* Results Cards List */}
        {searchLoading && debouncedTerm ? (
          <Skeleton rows={5} />
        ) : searchError ? (
          <div className="inline-error">
            <Activity size={18} />
            <span>Search error occurred.</span>
            <button onClick={() => refetchSearch()}>Retry</button>
          </div>
        ) : !searchResult?.results?.length ? (
          <div className="empty-state">
            <span className="empty-illustration">
              <Search size={25} />
            </span>
            <b>{debouncedTerm ? 'No matching documents found' : 'Ready to search network files'}</b>
            <p>
              {debouncedTerm
                ? 'Try searching with alternate keywords or clearing your filters.'
                : 'Enter a phrase, term, or filename to discover documents across your mapped share.'}
            </p>
          </div>
        ) : (
          <div className="result-list">
            {searchResult.results.map((doc, i) => (
              <button
                key={doc.id}
                data-testid={`document-result-${doc.id}`}
                className={cx('result-row', selected?.id === doc.id && 'selected')}
                onClick={() => setSelected(doc)}
              >
                <span className="result-index">{String(i + 1).padStart(2, '0')}</span>
                <IconFile ext={doc.extension} size={20} />
                <span className="result-main">
                  <b>{doc.name}</b>
                  <small className="font-mono text-[11px] opacity-80">{doc.relativePath}</small>
                  <span className="result-snippet">
                    <HighlightSnippet text={doc.snippet} query={debouncedTerm} />
                  </span>
                </span>
                <span className="result-meta">
                  <span>{formatBytes(doc.sizeBytes)}</span>
                  <small>{readableDate(doc.modifiedAt)}</small>
                </span>
                <ArrowRight className="row-arrow" size={15} />
              </button>
            ))}
          </div>
        )}

        <div className="search-footer">
          <span>
            <ShieldCheck size={14} /> Local embedded SQLite FTS5 index
          </span>
          <span>{config.includeExtensions.join(' · ')}</span>
        </div>
      </section>

      {/* DRAGGABLE RESIZER */}
      <div className="pane-resizer" onMouseDown={onMouseDownResizer} />

      {/* RIGHT PANE: Document Preview & Actions */}
      <aside className="preview-column overflow-y-auto">
        {selected ? (
          <PreviewPane
            document={selected}
            onEmail={() => setEmailOpen(true)}
            onOpen={() => navigate(`/view/${selected.id}`)}
          />
        ) : (
          <div className="preview-empty">
            <div className="preview-empty-mark">
              <FileText size={30} />
            </div>
            <div className="eyebrow">DOCUMENT PREVIEW</div>
            <h2>
              Select a file<br />
              to preview.
            </h2>
            <p>Choose any search result on the left to read its content, find text, or copy its UNC path.</p>
            <div className="preview-decoration">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </aside>

      {/* EMAIL MODAL */}
      {emailOpen && selected && (
        <EmailDialog document={selected} onClose={() => setEmailOpen(false)} />
      )}
    </div>
  );
}

function PreviewPane({
  document,
  onEmail,
  onOpen,
}: {
  document: DocumentItem;
  onEmail: () => void;
  onOpen: () => void;
}) {
  const { data: preview, isLoading, isError, refetch } = useQuery({
    queryKey: ['preview', document.id],
    queryFn: () => api.getDocumentPreview(document.id),
    staleTime: 60_000,
  });

  const [copiedMode, setCopiedMode] = useState<string | null>(null);
  const [findTerm, setFindTerm] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // Clear copy status on document change
  useEffect(() => {
    setCopiedMode(null);
    setFindTerm('');
    setActiveMatchIndex(0);
  }, [document.id]);

  const copyUncPath = async () => {
    await api.copyToClipboard(document.uncPath);
    setCopiedMode('unc');
    setTimeout(() => setCopiedMode(null), 2000);
  };

  const copyFileUrl = async () => {
    await api.copyToClipboard(document.fileUrl);
    setCopiedMode('url');
    setTimeout(() => setCopiedMode(null), 2000);
  };

  const copyMarkdownLink = async () => {
    const md = `[${document.name}](${document.uncPath})`;
    await api.copyToClipboard(md);
    setCopiedMode('md');
    setTimeout(() => setCopiedMode(null), 2000);
  };

  const showInFolder = async () => {
    try {
      await api.showItemInFolder(document.path);
    } catch {
      alert('Could not open folder. File may have been moved or drive disconnected.');
    }
  };

  // Find in Preview matches calculation for text previews
  const previewMatches = useMemo(() => {
    if (!findTerm.trim() || !preview?.content || preview.kind !== 'text') return [];
    const term = findTerm.toLowerCase();
    const content = preview.content.toLowerCase();
    const indices: number[] = [];
    let pos = 0;
    while ((pos = content.indexOf(term, pos)) !== -1) {
      indices.push(pos);
      pos += term.length;
    }
    return indices;
  }, [findTerm, preview]);

  const onNextMatch = () => {
    if (!previewMatches.length) return;
    setActiveMatchIndex((activeMatchIndex + 1) % previewMatches.length);
  };

  const onPrevMatch = () => {
    if (!previewMatches.length) return;
    setActiveMatchIndex((activeMatchIndex - 1 + previewMatches.length) % previewMatches.length);
  };

  return (
    <div className="preview-panel">
      {/* Topline & Full View Shortcut */}
      <div className="preview-topline">
        <span className="eyebrow">INLINE PREVIEW & ACTIONS</span>
        <button className="icon-button" title="Open full document view" onClick={onOpen}>
          <ExternalLink size={16} />
        </button>
      </div>

      {/* File Title & Icon */}
      <div className="preview-file">
        <IconFile ext={document.extension} size={28} />
        <div className="truncate">
          <h2 className="truncate" title={document.name}>
            {document.name}
          </h2>
          <p className="font-mono text-xs opacity-75 truncate" title={document.uncPath}>
            {document.uncPath}
          </p>
        </div>
      </div>

      {/* Main Actions Row */}
      <div className="preview-actions flex-wrap gap-2">
        <button className="primary-button text-xs py-2 px-3" onClick={showInFolder} title="Reveal file in Windows Explorer / macOS Finder">
          <Folder size={14} /> Show in Folder
        </button>
        <button className="outline-button text-xs py-2 px-3" onClick={onEmail} title="Email document or send internal link">
          <Mail size={14} /> Email File
        </button>
      </div>

      {/* Sharing & Links Dropdown/Group */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Copy Links
        </div>
        <div className="share-actions-group">
          <button
            className={cx('share-action-btn', copiedMode === 'unc' && 'active')}
            onClick={copyUncPath}
            title="Copy normalized UNC path (\\Server\Share\file.pdf)"
          >
            {copiedMode === 'unc' ? <Check size={13} /> : <Copy size={13} />}
            UNC Path
          </button>
          <button
            className={cx('share-action-btn', copiedMode === 'url' && 'active')}
            onClick={copyFileUrl}
            title="Copy file:// URL"
          >
            {copiedMode === 'url' ? <Check size={13} /> : <Copy size={13} />}
            file:// URL
          </button>
          <button
            className={cx('share-action-btn', copiedMode === 'md' && 'active')}
            onClick={copyMarkdownLink}
            title="Copy Markdown Link [Name](\\Server\Share\file.pdf)"
          >
            {copiedMode === 'md' ? <Check size={13} /> : <Copy size={13} />}
            Markdown
          </button>
        </div>
      </div>

      {/* Document Facts / Metadata Header */}
      <div className="document-facts mt-4">
        <div>
          <span>FILE TYPE</span>
          <b>{document.extension.toUpperCase().replace('.', '')} Document</b>
        </div>
        <div>
          <span>FILE SIZE</span>
          <b>{formatBytes(document.sizeBytes)}</b>
        </div>
        <div>
          <span>LAST MODIFIED</span>
          <b>{readableDate(document.modifiedAt)}</b>
        </div>
        <div>
          <span>MIME TYPE</span>
          <b className="truncate" title={document.mimeType}>
            {document.mimeType || 'application/octet-stream'}
          </b>
        </div>
      </div>

      {/* Preview Section Header */}
      <div className="preview-section-label mt-5 mb-2 flex items-center justify-between">
        <span>DOCUMENT CONTENT</span>
        <span className="live-mark">
          <i /> {preview?.kind ? preview.kind.toUpperCase() : 'PREVIEW'}
        </span>
      </div>

      {/* Preview Content Area */}
      <div className="preview-content">
        {isLoading ? (
          <div className="preview-skeleton">
            <i />
            <i />
            <i />
            <i />
          </div>
        ) : isError ? (
          <div className="preview-unavailable">
            <AlertTriangle size={20} className="text-amber-500" />
            <span>Network drive disconnected or unreachable.</span>
            <button onClick={() => refetch()} className="outline-button mt-2 text-xs">
              <RefreshCw size={13} /> Click to retry
            </button>
          </div>
        ) : preview?.kind === 'pdf' && preview.dataUrl ? (
          <div className="flex flex-col gap-2">
            <iframe
              className="inline-pdf-frame"
              title={`Preview of ${document.name}`}
              src={preview.dataUrl}
            />
            <div className="flex justify-between items-center text-xs opacity-70 px-1">
              <span>Embedded PDF viewer</span>
              <button onClick={showInFolder} className="text-link text-xs">
                Open natively
              </button>
            </div>
          </div>
        ) : preview?.kind === 'docx' && preview.content ? (
          <div
            className="document-copy docx-content prose dark:prose-invert max-w-none text-sm p-4 bg-card rounded-md border border-border"
            dangerouslySetInnerHTML={{ __html: preview.content }}
          />
        ) : preview?.kind === 'text' && preview.content ? (
          <div>
            {/* Quick "Find in Preview" Bar */}
            <div className="find-in-preview">
              <Search size={14} className="opacity-60" />
              <input
                value={findTerm}
                onChange={e => {
                  setFindTerm(e.target.value);
                  setActiveMatchIndex(0);
                }}
                placeholder="Find in preview…"
              />
              {findTerm && (
                <>
                  <span className="find-match-counter">
                    {previewMatches.length > 0
                      ? `${activeMatchIndex + 1} of ${previewMatches.length}`
                      : 'No matches'}
                  </span>
                  <button className="find-btn" onClick={onPrevMatch} title="Previous match">
                    <ChevronUp size={14} />
                  </button>
                  <button className="find-btn" onClick={onNextMatch} title="Next match">
                    <ChevronDown size={14} />
                  </button>
                  <button className="find-btn" onClick={() => setFindTerm('')} title="Clear">
                    <X size={14} />
                  </button>
                </>
              )}
            </div>

            <div className="document-copy whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-[460px] overflow-y-auto p-3 bg-card border border-border rounded-md">
              {findTerm.trim() ? (
                <FindHighlightedText
                  text={preview.content}
                  query={findTerm}
                  activeIndex={activeMatchIndex}
                />
              ) : (
                preview.content
              )}
            </div>
          </div>
        ) : (
          <div className="preview-placeholder">
            <FileText size={24} />
            <p>Inline preview not supported for this file format.</p>
            <button className="outline-button mt-2 text-xs" onClick={showInFolder}>
              <Folder size={14} /> Open file location
            </button>
          </div>
        )}
      </div>

      <Link href={`/view/${document.id}`} className="open-full-link mt-4 inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline">
        Open full-page reader <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function FindHighlightedText({
  text,
  query,
  activeIndex,
}: {
  text: string;
  query: string;
  activeIndex: number;
}) {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  let matchCount = -1;

  return (
    <>
      {parts.map((part, i) => {
        if (part.toLowerCase() === query.toLowerCase()) {
          matchCount++;
          const isActive = matchCount === activeIndex;
          return (
            <mark
              key={i}
              className={cx('find-highlight', isActive && 'find-highlight-active')}
            >
              {part}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function EmailDialog({ document, onClose }: { document: DocumentItem; onClose: () => void }) {
  const [recipients, setRecipients] = useState('');
  const [subject, setSubject] = useState(`Document: ${document.name}`);
  const [note, setNote] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'attachment' | 'link'>('attachment');
  const [sentMessage, setSentMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // SMTP Settings Toggle
  const [smtpOpen, setSmtpOpen] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');

  const isOversized = document.sizeBytes > 25 * 1024 * 1024; // > 25 MB safeguard

  const openNativeMailto = () => {
    const list = recipients.split(/[,\n;]/).map(x => x.trim()).filter(Boolean);
    const bodyContent = `${note ? `${note}\n\n` : ''}Document Network Path (UNC):\n${document.uncPath}\n\nFile URL:\n${document.fileUrl}`;
    const mailto = `mailto:${list.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyContent)}`;
    api.openExternal(mailto);
    onClose();
  };

  const submitSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (deliveryMode === 'attachment' && isOversized) {
      setErrorMessage('Attachment exceeds the 25 MB limit. Please switch to "Internal UNC Link" mode.');
      return;
    }

    const list = recipients.split(/[,\n;]/).map(x => x.trim()).filter(Boolean);
    if (!list.length) {
      setErrorMessage('Please enter at least one recipient email address.');
      return;
    }

    setIsSending(true);
    try {
      const smtpConfig = smtpHost && smtpUser ? {
        host: smtpHost,
        port: Number(smtpPort) || 587,
        secure: smtpPort === '465',
        user: smtpUser,
        pass: smtpPass,
        from: smtpFrom || smtpUser,
      } : undefined;

      const result = await api.sendSmtpEmail({
        recipients: list,
        subject,
        body: note,
        documentId: document.id,
        deliveryMode,
        smtpConfig,
      });

      setSentMessage(result.message || 'Email sent successfully via SMTP.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send email.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <section className="email-dialog max-w-lg">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <span className="dialog-icon">
          <Mail size={20} />
        </span>
        <div className="eyebrow">SHARE DOCUMENT</div>
        <h2>Email {document.name}</h2>
        <p className="dialog-description">
          Send directly via built-in SMTP or launch your default desktop email client.
        </p>

        {sentMessage ? (
          <div className="success-callout">
            <Check size={18} />
            <span>{sentMessage}</span>
            <button className="primary-button ml-auto text-xs" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submitSmtp} className="space-y-3">
            <label className="field-label">
              RECIPIENTS <span>Comma or newline separated</span>
              <textarea
                required
                value={recipients}
                onChange={e => setRecipients(e.target.value)}
                placeholder="colleague@company.com, team@company.com"
                rows={2}
                data-testid="input-email-recipients"
              />
            </label>

            <label className="field-label">
              SUBJECT
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Document Subject"
              />
            </label>

            <label className="field-label">
              NOTE <span>Optional contextual message</span>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Here is the referenced file from our network share…"
                rows={2}
                data-testid="input-email-note"
              />
            </label>

            {/* Delivery Choices */}
            <div className="delivery-choices">
              <button
                type="button"
                className={deliveryMode === 'attachment' ? 'chosen' : ''}
                onClick={() => setDeliveryMode('attachment')}
              >
                <span className="choice-radio" />
                File Attachment
                <small>Send file copy ({formatBytes(document.sizeBytes)})</small>
              </button>
              <button
                type="button"
                className={deliveryMode === 'link' ? 'chosen' : ''}
                onClick={() => setDeliveryMode('link')}
              >
                <span className="choice-radio" />
                Internal UNC Link
                <small>Paste link pointing to network share</small>
              </button>
            </div>

            {/* > 25MB Safeguard Warning */}
            {deliveryMode === 'attachment' && isOversized && (
              <div className="attachment-warning" role="alert">
                <AlertTriangle size={16} />
                <span>
                  <b>Safeguard warning:</b> File is {formatBytes(document.sizeBytes)} (exceeds 25 MB email limit). Please select "Internal UNC Link".
                </span>
              </div>
            )}

            {/* Optional Custom SMTP Accordion */}
            <div className="pt-1">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                onClick={() => setSmtpOpen(!smtpOpen)}
              >
                <Settings2 size={13} />
                {smtpOpen ? 'Hide custom SMTP settings' : 'Configure custom SMTP server'}
              </button>

              {smtpOpen && (
                <div className="p-3 mt-2 bg-card border border-border rounded-md text-xs space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      SMTP HOST
                      <input
                        className="w-full text-xs p-1.5 border rounded"
                        placeholder="smtp.example.com"
                        value={smtpHost}
                        onChange={e => setSmtpHost(e.target.value)}
                      />
                    </label>
                    <label>
                      PORT
                      <input
                        className="w-full text-xs p-1.5 border rounded"
                        placeholder="587"
                        value={smtpPort}
                        onChange={e => setSmtpPort(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      USERNAME
                      <input
                        className="w-full text-xs p-1.5 border rounded"
                        placeholder="user@example.com"
                        value={smtpUser}
                        onChange={e => setSmtpUser(e.target.value)}
                      />
                    </label>
                    <label>
                      PASSWORD
                      <input
                        type="password"
                        className="w-full text-xs p-1.5 border rounded"
                        placeholder="••••••••"
                        value={smtpPass}
                        onChange={e => setSmtpPass(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {errorMessage && <p className="form-error">{errorMessage}</p>}

            {/* Actions: Send via SMTP vs Native Mailto */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="outline-button flex-1"
                onClick={openNativeMailto}
                title="Open system default email client (Outlook, Mail.app, Thunderbird)"
              >
                <ExternalLink size={14} /> Open in Mail App
              </button>
              <button
                type="submit"
                className="primary-button flex-1"
                disabled={isSending || (deliveryMode === 'attachment' && isOversized)}
              >
                {isSending ? (
                  <>
                    <Activity size={14} className="animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Send size={14} /> Send via SMTP
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function SetupPrompt() {
  return (
    <div className="first-run">
      <span className="big-file-mark">
        <FolderSearch size={30} />
      </span>
      <div className="eyebrow">FIRST-RUN CONFIGURATION</div>
      <h1>
        Connect your<br />
        <em>network drive.</em>
      </h1>
      <p>
        Mount a shared directory or UNC network path, configure indexing rules, and launch your local full-text search engine.
      </p>
      <Link href="/setup" className="primary-button mt-4">
        Start guided setup <ArrowRight size={16} />
      </Link>
    </div>
  );
}

function SetupPage() {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<IndexerConfig>(emptyConfig);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [testResult, setTestResult] = useState<TestTargetResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [logDrawerOpen, setLogDrawerOpen] = useState(true);

  const qc = useQueryClient();
  const [, navigate] = useLocation();

  // Load existing config if available
  useEffect(() => {
    api.getConfig().then(c => {
      if (c?.rootPath) setConfig(c);
    });
  }, []);

  // Listen to Worker indexing progress in Step 3
  useEffect(() => {
    if (step !== 2) return;
    const unsubscribe = api.onIndexProgress(newStatus => {
      setStatus(newStatus);
    });
    return () => unsubscribe();
  }, [step]);

  // Browse Directory Native Dialog
  const onBrowseDirectory = async () => {
    const selected = await api.selectDirectory();
    if (selected) {
      setConfig(prev => ({ ...prev, rootPath: selected }));
      runTest(selected);
    }
  };

  // Test target path
  const runTest = async (target = config.rootPath) => {
    if (!target) return;
    setIsTesting(true);
    try {
      const res = await api.testTarget(target);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  // Extension toggle
  const toggleExtension = (ext: string) => {
    setConfig(prev => {
      const current = new Set(prev.includeExtensions);
      if (current.has(ext)) {
        if (current.size > 1) current.delete(ext);
      } else {
        current.add(ext);
      }
      return { ...prev, includeExtensions: Array.from(current) };
    });
  };

  // Launch crawl in Worker
  const startCrawl = async () => {
    await api.saveConfig(config);
    qc.invalidateQueries({ queryKey: ['config'] });
    setStep(2);
    await api.startIndex();
  };

  return (
    <div className="setup-layout">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> Back to search
      </Link>
      <div className="setup-intro">
        <div className="eyebrow">
          <span className="eyebrow-rule" /> FIRST-RUN SETUP WIZARD
        </div>
        <h1>
          Set up your<br />
          <em>document search engine.</em>
        </h1>
        <p>Three guided steps to index your shared files and mapped network drives.</p>
      </div>

      <div className="wizard-card">
        {/* Wizard Step Navigation */}
        <div className="wizard-steps">
          {['Network Target', 'Filters & Rules', 'Initial Crawl'].map((label, i) => (
            <div
              key={label}
              className={cx('wizard-step', step === i && 'current', step > i && 'done')}
            >
              <span>{step > i ? <Check size={13} /> : `0${i + 1}`}</span>
              {label}
            </div>
          ))}
        </div>

        {/* STEP 1: Network Target Selection */}
        {step === 0 && (
          <div className="wizard-content">
            <div className="wizard-kicker">01 / TARGET SELECTION</div>
            <h2>Where is your network drive?</h2>
            <p>
              Choose a mapped drive letter (e.g., <code className="font-mono text-xs">Z:\Documents</code>), standard Windows UNC path (e.g., <code className="font-mono text-xs">\\Server\Share\Folder</code>), or local directory.
            </p>

            <div className="space-y-3">
              <label className="field-label">
                DIRECTORY OR UNC NETWORK PATH
                <div className="flex gap-2 mt-1">
                  <input
                    value={config.rootPath}
                    onChange={e => {
                      setConfig(c => ({ ...c, rootPath: e.target.value }));
                      setTestResult(null);
                    }}
                    placeholder="e.g. \\ServerName\ShareName\Folder or ./sample-data"
                    data-testid="input-root-path"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    className="outline-button whitespace-nowrap"
                    onClick={onBrowseDirectory}
                  >
                    <Folder size={14} /> Browse Folder…
                  </button>
                </div>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="outline-button text-xs py-1.5"
                  onClick={() => runTest()}
                  disabled={!config.rootPath || isTesting}
                >
                  <Activity size={13} className={isTesting ? 'animate-spin' : ''} />
                  {isTesting ? 'Pinging target…' : 'Validate connectivity'}
                </button>
                <span className="text-xs text-muted-foreground">
                  Checks read permissions and network availability
                </span>
              </div>

              {/* Status Ping Indicator */}
              {testResult && (
                <div className={cx('target-ping-card', testResult.accessible ? 'online' : 'offline')}>
                  <span className={cx('ping-pulse', !testResult.accessible && 'offline')} />
                  <div className="text-xs">
                    <b>
                      {testResult.accessible
                        ? 'Network share is connected and readable'
                        : 'Connection failed or path unreachable'}
                    </b>
                    <p className="opacity-80">
                      {testResult.accessible
                        ? `Latency: ${testResult.latencyMs} ms · Found ${testResult.fileCount.toLocaleString()} top-level files`
                        : testResult.error}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="wizard-actions pt-4">
              <button
                className="primary-button wizard-next"
                disabled={!config.rootPath || (testResult ? !testResult.accessible : false)}
                onClick={() => setStep(1)}
              >
                Continue <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Indexing Filters & Rules */}
        {step === 1 && (
          <div className="wizard-content">
            <div className="wizard-kicker">02 / INDEXING FILTERS & RULES</div>
            <h2>Configure file filters</h2>
            <p>Control which file extensions are parsed and exclude temporary system locks.</p>

            {/* Extension Toggles */}
            <div className="space-y-3">
              <label className="field-label">
                FILE EXTENSION TOGGLES <span>Click to toggle</span>
                <div className="extension-chips">
                  {defaultExtensions.map(ext => {
                    const active = config.includeExtensions.includes(ext);
                    return (
                      <button
                        key={ext}
                        type="button"
                        className={cx('extension-chip', active && 'active')}
                        onClick={() => toggleExtension(ext)}
                      >
                        {active ? <Check size={11} className="inline mr-1" /> : null}
                        {ext}
                      </button>
                    );
                  })}
                </div>
              </label>

              {/* Exclusion Patterns */}
              <label className="field-label">
                EXCLUSION PATTERNS <span>Comma separated · handles ~$* lock files</span>
                <input
                  value={config.excludePatterns.join(', ')}
                  onChange={e =>
                    setConfig(c => ({
                      ...c,
                      excludePatterns: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                    }))
                  }
                  data-testid="input-excludes"
                />
              </label>

              {/* Size Threshold & Sync Mode */}
              <div className="rule-row">
                <label className="field-label">
                  MAX FILE SIZE LIMIT
                  <select
                    value={config.maxFileSizeBytes}
                    onChange={e =>
                      setConfig(c => ({ ...c, maxFileSizeBytes: Number(e.target.value) }))
                    }
                  >
                    <option value={10485760}>10 MB</option>
                    <option value={26214400}>25 MB</option>
                    <option value={52428800}>50 MB (Recommended)</option>
                    <option value={104857600}>100 MB</option>
                  </select>
                </label>

                <label className="field-label">
                  REAL-TIME SYNC (CHOKIDAR)
                  <select
                    value={config.backgroundSync ? 'true' : 'false'}
                    onChange={e =>
                      setConfig(c => ({ ...c, backgroundSync: e.target.value === 'true' }))
                    }
                  >
                    <option value="true">Live Sync (Chokidar watcher)</option>
                    <option value="false">Manual Re-scan Only</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="wizard-actions pt-4">
              <button className="text-button" onClick={() => setStep(0)}>
                <ChevronLeft size={14} /> Back
              </button>
              <button className="primary-button" onClick={startCrawl}>
                Save & Start Indexing <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Initial Crawl & Indexing Worker */}
        {step === 2 && (
          <div className="wizard-content crawl-content">
            <span className={cx('crawl-symbol', status?.running && 'spinning')}>
              <Activity size={25} />
            </span>
            <div className="wizard-kicker">03 / NODE.JS WORKER CRAWL</div>
            <h2>
              {status?.running
                ? 'Indexing documents in background worker…'
                : status?.phase === 'complete'
                ? 'Your local search engine is ready!'
                : status?.phase === 'error'
                ? 'Indexing encountered an issue.'
                : 'Preparing crawler…'}
            </h2>

            {/* Current File and Velocity Badge */}
            <div className="flex items-center justify-between gap-2 mt-2">
              <p className="truncate font-mono text-xs opacity-80 flex-1">
                {status?.currentFile || status?.currentDirectory || 'Scanning target directory…'}
              </p>
              {status?.running && (
                <span className="velocity-pill">
                  <Zap size={12} /> {status.velocity || '0.0'} files/sec
                </span>
              )}
            </div>

            {/* Progress Track */}
            <div className="progress-track mt-3">
              <i
                style={{
                  width: `${
                    status?.discovered
                      ? Math.min(100, (status.processed / status.discovered) * 100)
                      : status?.running
                      ? 15
                      : status?.phase === 'complete'
                      ? 100
                      : 0
                  }%`,
                }}
              />
            </div>

            {/* Crawl Metrics */}
            <div className="crawl-numbers mt-4">
              <span>
                <b>{status?.discovered ?? 0}</b>
                <small>SCANNED</small>
              </span>
              <span>
                <b>{status?.indexed ?? 0}</b>
                <small>INDEXED (FTS5)</small>
              </span>
              <span>
                <b>{status?.skipped ?? 0}</b>
                <small>SKIPPED / LOCKED</small>
              </span>
            </div>

            {/* Expandable Log Drawer for Skipped/Locked Files */}
            <div className="log-drawer">
              <div
                className="log-drawer-header"
                onClick={() => setLogDrawerOpen(!logDrawerOpen)}
              >
                <span>Live Worker Activity & Log Drawer ({status?.logs?.length || 0})</span>
                {logDrawerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
              {logDrawerOpen && (
                <div className="log-drawer-body">
                  {!status?.logs?.length ? (
                    <div className="opacity-50 py-2 text-center">No skip or lock warnings recorded.</div>
                  ) : (
                    status.logs.map(log => (
                      <div key={log.id} className={cx('log-entry', log.level)}>
                        <span className="log-time">{log.timestamp}</span>
                        <span className="font-semibold uppercase text-[10px]">[{log.level}]</span>
                        <span className="truncate flex-1" title={log.path}>
                          {log.path}
                        </span>
                        <span className="opacity-90">{log.reason}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="wizard-actions pt-4">
              <button
                className="primary-button wizard-next"
                onClick={() => {
                  qc.invalidateQueries();
                  navigate('/');
                }}
              >
                {status?.running ? 'Go to Search (indexing in background)' : 'Launch Document Search'}{' '}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const [config, setConfig] = useState<IndexerConfig>(emptyConfig);
  const [flash, setFlash] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestTargetResult | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  });

  const { data: status } = useQuery({
    queryKey: ['indexStatus'],
    queryFn: () => api.getIndexStatus(),
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (data?.rootPath) setConfig(data);
  }, [data]);

  const onBrowse = async () => {
    const selected = await api.selectDirectory();
    if (selected) {
      setConfig(c => ({ ...c, rootPath: selected }));
      runTest(selected);
    }
  };

  const runTest = async (target = config.rootPath) => {
    setIsTesting(true);
    try {
      const res = await api.testTarget(target);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const onSave = async () => {
    await api.saveConfig(config);
    qc.invalidateQueries({ queryKey: ['config'] });
    setFlash('Settings successfully saved and synchronized.');
    setTimeout(() => setFlash(''), 3000);
  };

  const onReindex = async () => {
    await onSave();
    await api.startIndex();
    setFlash('A full background re-scan has started.');
    setTimeout(() => setFlash(''), 3000);
  };

  if (isLoading) {
    return (
      <div className="narrow-page">
        <Skeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="narrow-page">
      <div className="eyebrow">
        <span className="eyebrow-rule" /> CLIENT CONFIGURATION
      </div>
      <h1>
        Search engine <em>settings.</em>
      </h1>
      <p className="settings-lede">
        Configure the mapped network target, parsing filetypes, and SQLite FTS background sync rules.
      </p>

      {/* Target Card */}
      <div className="settings-card">
        <div className="settings-card-heading">
          <span className="settings-icon">
            <FolderClosed size={18} />
          </span>
          <div>
            <h2>Network Drive Target</h2>
            <p>Mapped drive letter, UNC network share, or local directory.</p>
          </div>
        </div>

        <label className="field-label">
          ROOT DIRECTORY PATH
          <div className="flex gap-2 mt-1">
            <input
              value={config.rootPath}
              onChange={e => setConfig(c => ({ ...c, rootPath: e.target.value }))}
              data-testid="input-settings-root-path"
              className="flex-1"
            />
            <button className="outline-button" onClick={onBrowse}>
              <Folder size={14} /> Browse…
            </button>
            <button className="outline-button" onClick={() => runTest()} disabled={isTesting}>
              <Activity size={14} /> {isTesting ? 'Testing…' : 'Test'}
            </button>
          </div>
        </label>

        {testResult && (
          <div className={cx('target-ping-card', testResult.accessible ? 'online' : 'offline')}>
            <span className={cx('ping-pulse', !testResult.accessible && 'offline')} />
            <div className="text-xs">
              <b>{testResult.accessible ? 'Connected & readable' : 'Drive unreachable'}</b>
              <p>
                {testResult.accessible
                  ? `Latency: ${testResult.latencyMs} ms · ${testResult.fileCount} files discovered`
                  : testResult.error}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Rules Card */}
      <div className="settings-card">
        <div className="settings-card-heading">
          <span className="settings-icon coral">
            <SlidersHorizontal size={18} />
          </span>
          <div>
            <h2>Indexing Rules & Filters</h2>
            <p>File extensions, exclusions, and real-time monitoring preference.</p>
          </div>
        </div>

        <label className="field-label">
          EXTENSIONS (COMMA SEPARATED)
          <input
            value={config.includeExtensions.join(', ')}
            onChange={e =>
              setConfig(c => ({
                ...c,
                includeExtensions: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
              }))
            }
          />
        </label>

        <label className="field-label">
          EXCLUSION PATTERNS
          <input
            value={config.excludePatterns.join(', ')}
            onChange={e =>
              setConfig(c => ({
                ...c,
                excludePatterns: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
              }))
            }
          />
        </label>

        <div className="rule-row">
          <label className="field-label">
            MAX FILE SIZE
            <select
              value={config.maxFileSizeBytes}
              onChange={e =>
                setConfig(c => ({ ...c, maxFileSizeBytes: Number(e.target.value) }))
              }
            >
              <option value={10485760}>10 MB</option>
              <option value={26214400}>25 MB</option>
              <option value={52428800}>50 MB</option>
              <option value={104857600}>100 MB</option>
            </select>
          </label>

          <label className="field-label">
            REAL-TIME CHOKIDAR SYNC
            <select
              value={config.backgroundSync ? 'true' : 'false'}
              onChange={e =>
                setConfig(c => ({ ...c, backgroundSync: e.target.value === 'true' }))
              }
            >
              <option value="true">Enabled (Real-time)</option>
              <option value="false">Manual Re-scan only</option>
            </select>
          </label>
        </div>
      </div>

      {/* Index Status Card */}
      <div className="settings-card index-status-card">
        <div>
          <div className="settings-card-heading">
            <span className="settings-icon">
              <Gauge size={18} />
            </span>
            <div>
              <h2>Index Status</h2>
              <p>
                {status?.running
                  ? 'Indexing in background…'
                  : `Last completed ${readableDate(config.lastIndexedAt)}`}
              </p>
            </div>
          </div>
        </div>
        <div className="index-count">
          <b>{config.indexedCount.toLocaleString()}</b>
          <small>DOCUMENTS IN FTS</small>
        </div>
      </div>

      {flash && (
        <div className="saved-banner">
          <Check size={16} />
          {flash}
        </div>
      )}

      <div className="settings-bottom">
        <span>
          <Clock3 size={14} /> Database saved locally in user application data.
        </span>
        <div className="flex gap-2">
          <button className="outline-button" onClick={onReindex} disabled={status?.running}>
            <RefreshCw size={14} /> Re-scan Drive Now
          </button>
          <button className="primary-button" onClick={onSave}>
            <Check size={14} /> Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentView({ id }: { id: string }) {
  const { data: document, isLoading: docLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.getDocument(id),
  });

  const { data: preview, isLoading: prevLoading } = useQuery({
    queryKey: ['preview', id],
    queryFn: () => api.getDocumentPreview(id),
  });

  if (docLoading || prevLoading) {
    return (
      <div className="document-view">
        <Skeleton rows={6} />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="document-view">
        <div className="inline-error">
          Document could not be located in index.
          <Link href="/" className="text-link">
            Return to search
          </Link>
        </div>
      </div>
    );
  }

  const showInFolder = () => api.showItemInFolder(document.path);

  return (
    <div className="document-view">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> Back to search
      </Link>
      <div className="view-head">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-rule" /> FULL DOCUMENT VIEWER
          </div>
          <div className="view-title">
            <IconFile ext={document.extension} size={28} />
            <div>
              <h1>{document.name}</h1>
              <p className="font-mono text-xs">{document.uncPath}</p>
            </div>
          </div>
        </div>
        <button className="primary-button" onClick={showInFolder}>
          <Folder size={15} /> Show in Native Folder
        </button>
      </div>

      <div className="view-meta">
        <span>
          <b>TYPE</b>
          {document.extension.toUpperCase()}
        </span>
        <span>
          <b>SIZE</b>
          {formatBytes(document.sizeBytes)}
        </span>
        <span>
          <b>MODIFIED</b>
          {readableDate(document.modifiedAt)}
        </span>
        <span>
          <b>KIND</b>
          {preview?.kind?.toUpperCase() || 'PREVIEW'}
        </span>
      </div>

      <div className="full-document">
        <div className="full-document-top">
          <span>{document.name}</span>
          <span>FOLIO DESKTOP DISCOVERY</span>
        </div>
        {preview?.kind === 'pdf' && preview.dataUrl ? (
          <iframe
            className="w-full h-[650px] border-none"
            title={document.name}
            src={preview.dataUrl}
          />
        ) : preview?.kind === 'docx' && preview.content ? (
          <article
            className="docx-content prose dark:prose-invert max-w-none p-6"
            dangerouslySetInnerHTML={{ __html: preview.content }}
          />
        ) : preview?.kind === 'text' && preview.content ? (
          <article className="p-6 whitespace-pre-wrap font-mono text-xs">
            {preview.content}
          </article>
        ) : (
          <div className="preview-placeholder">
            <FileText size={28} />
            <p>Preview format not supported inline.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={() => <Shell><SearchPage /></Shell>} />
      <Route path="/setup" component={() => <Shell><SetupPage /></Shell>} />
      <Route path="/settings" component={() => <Shell><SettingsPage /></Shell>} />
      <Route path="/view/:id" component={props => <Shell><DocumentView id={props.params.id} /></Shell>} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <AppRoutes />
      </Router>
    </QueryClientProvider>
  );
}
