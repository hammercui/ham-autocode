/**
 * v4.2 Minimal LSP stdio client (no deps).
 *
 * Spawns typescript-language-server, handshakes, runs requests, shuts down.
 * JSON-RPC 2.0 framing: `Content-Length: N\r\n\r\n<body>`.
 *
 * Designed for one-shot batch use (build tree context), not long-running editor sessions.
 */

import { spawn, ChildProcess } from 'child_process';
import { pathToFileURL } from 'url';

// ─── Types (LSP subset) ────────────────────────────────────

export interface Position { line: number; character: number }
export interface Range { start: Position; end: Position }
export interface Location { uri: string; range: Range }

/** https://microsoft.github.io/language-server-protocol/specification#symbolKind */
export enum SymbolKind {
  File = 1, Module = 2, Namespace = 3, Package = 4, Class = 5, Method = 6,
  Property = 7, Field = 8, Constructor = 9, Enum = 10, Interface = 11,
  Function = 12, Variable = 13, Constant = 14, String = 15, Number = 16,
  Boolean = 17, Array = 18, Object = 19, Key = 20, Null = 21,
  EnumMember = 22, Struct = 23, Event = 24, Operator = 25, TypeParameter = 26,
}

export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
}

/** Hierarchical DocumentSymbol (what typescript-language-server actually returns for documentSymbol). */
export interface DocumentSymbol {
  name: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
  detail?: string;
}

// ─── Client ────────────────────────────────────────────────

interface PendingRequest {
  resolve(value: unknown): void;
  reject(err: Error): void;
}

export class LspClient {
  private proc: ChildProcess | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private stderrBuf = '';

  /** Spawn typescript-language-server and initialize on the given workspace. */
  async start(workspaceDir: string, serverCmd = 'typescript-language-server'): Promise<void> {
    this.proc = spawn(serverCmd, ['--stdio'], {
      cwd: workspaceDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',  // Windows needs shell for .cmd shims
    });

    this.proc.stdout?.on('data', (chunk: Buffer) => this.onData(chunk));
    this.proc.stderr?.on('data', (chunk: Buffer) => {
      this.stderrBuf += chunk.toString();
      if (this.stderrBuf.length > 10000) this.stderrBuf = this.stderrBuf.slice(-5000);
    });

    this.proc.on('error', (err) => {
      for (const [, p] of this.pending) p.reject(new Error(`LSP proc error: ${err.message}`));
      this.pending.clear();
    });

    // initialize handshake
    const rootUri = pathToFileURL(workspaceDir).href;
    await this.request('initialize', {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: 'root' }],
      capabilities: {
        workspace: { symbol: { dynamicRegistration: false } },
        textDocument: { documentSymbol: { hierarchicalDocumentSymbolSupport: true } },
      },
    });
    this.notify('initialized', {});
  }

  /** Query all workspace symbols matching `query` (empty = all).
   * Note: typescript-language-server requires at least one file opened via openFile()
   * before this returns results — otherwise throws "No Project". */
  async workspaceSymbol(query: string): Promise<SymbolInformation[]> {
    const result = await this.request('workspace/symbol', { query });
    return (result as SymbolInformation[] | null) || [];
  }

  /** Open a file in LSP server (required before documentSymbol / workspaceSymbol). */
  async openFile(filePath: string, languageId: string, text: string): Promise<void> {
    const uri = pathToFileURL(filePath).href;
    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text },
    });
  }

  /** Get hierarchical symbols for an opened file. */
  async documentSymbol(filePath: string): Promise<DocumentSymbol[]> {
    const uri = pathToFileURL(filePath).href;
    const result = await this.request('textDocument/documentSymbol', {
      textDocument: { uri },
    });
    return (result as DocumentSymbol[] | null) || [];
  }

  async shutdown(): Promise<void> {
    if (!this.proc) return;
    try {
      await this.request('shutdown', null, 5000);
      this.notify('exit', null);
    } catch { /* ignore */ }
    try {
      if (!this.proc.killed) this.proc.kill();
    } catch { /* ignore */ }
    this.proc = null;
  }

  /** Last ~5K of stderr output, useful for debugging startup failures. */
  getStderr(): string { return this.stderrBuf; }

  // ─── internals ──────────────────────────────────────

  private request(method: string, params: unknown, timeoutMs = 30000): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      if (!this.proc || !this.proc.stdin) return reject(new Error('LSP not started'));
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`LSP ${method} timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      // wrap resolve/reject to clear timer
      const entry = this.pending.get(id)!;
      entry.resolve = (v) => { clearTimeout(timer); resolve(v); };
      entry.reject = (e) => { clearTimeout(timer); reject(e); };
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.proc || !this.proc.stdin) return;
    this.send({ jsonrpc: '2.0', method, params });
  }

  private send(msg: unknown): void {
    const body = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n`;
    this.proc?.stdin?.write(header + body, 'utf-8');
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // Parse as many complete messages as available
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd).toString('utf-8');
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) {
        // malformed, discard up to header end and keep going
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const len = parseInt(m[1], 10);
      const totalLen = headerEnd + 4 + len;
      if (this.buffer.length < totalLen) return;  // wait for more
      const body = this.buffer.slice(headerEnd + 4, totalLen).toString('utf-8');
      this.buffer = this.buffer.slice(totalLen);
      try {
        this.dispatch(JSON.parse(body));
      } catch { /* skip malformed */ }
    }
  }

  private dispatch(msg: { id?: number; result?: unknown; error?: { message: string }; method?: string }): void {
    if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
      const entry = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(`LSP error: ${msg.error.message}`));
      else entry.resolve(msg.result);
    }
    // notifications (msg.method) are ignored — we don't subscribe
  }
}
