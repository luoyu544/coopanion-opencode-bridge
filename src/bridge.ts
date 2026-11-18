/**
 * Loopback webhook receiver. Turns the OpenCode companion plugin's POST into
 * a deferred event on Coopanion's WakeBus, so Coo speaks it in her bubble.
 */
import { createServer, type Server } from 'node:http';
import type { OpenCodeConfigSection } from './config.ts';

export interface Reminder {
  kind?: string;
  message?: string;
  sessionTitle?: string;
  title?: string;
  event?: string;
}

export interface BridgeStats {
  listening: boolean;
  received: number;
  pushed: number;
  lastKind: string;
  lastAt: number;
  port: number;
  tokenRequired: boolean;
}

export function reminderText(r: Reminder, cfg: OpenCodeConfigSection): string | null {
  const session = r.sessionTitle ? `会话「${r.sessionTitle}」` : '一个会话';
  const raw = typeof r.message === 'string' ? r.message.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
  switch (r.kind) {
    case 'question':
      if (!cfg.question) return null;
      return `[OpenCode 提醒] 用户正在用 OpenCode 编程。${session}正在等用户回答问题。问题：${raw || '（未提供内容）'}。请马上用气泡提醒用户回去回答，并简述问题。`;
    case 'permission':
      if (!cfg.permission) return null;
      return `[OpenCode 提醒] 用户正在用 OpenCode 编程。${session}需要用户确认一个操作。事项：${raw || '（未提供内容）'}。请马上用气泡提醒用户回去确认。`;
    case 'error':
      if (!cfg.error) return null;
      return `[OpenCode 提醒] 用户正在用 OpenCode 编程。${session}的任务执行失败了：${raw || '（未提供内容）'}。请用气泡提醒用户回去看看。`;
    case 'task_complete':
    default:
      if (!cfg.taskComplete) return null;
      return `[OpenCode 提醒] 用户正在用 OpenCode 编程。${session}刚完成了一次新的任务（这是新的一次提醒，不是上一条的重复）。请用你自己的话，在气泡里简短提醒用户回去查看结果。`;
  }
}

export class OpenCodeBridge {
  private server: Server | null = null;
  private readonly count = new Map<string, number>();
  private stats: BridgeStats;

  constructor(
    private readonly cfg: OpenCodeConfigSection,
    private readonly push: (text: string, kind: string) => void,
    private readonly log: (line: string) => void,
  ) {
    this.stats = {
      listening: false,
      received: 0,
      pushed: 0,
      lastKind: '',
      lastAt: 0,
      port: cfg.port,
      tokenRequired: !!cfg.token,
    };
  }

  get status(): BridgeStats {
    return { ...this.stats, port: this.cfg.port, tokenRequired: !!this.cfg.token };
  }

  /** Send a test reminder straight into the bus (from the settings panel). */
  test(): void {
    const text = reminderText({ kind: 'task_complete', sessionTitle: '测试会话' }, this.cfg)
      ?? '[OpenCode 提醒] 这是一条来自设置面板的测试提醒。请在气泡里回复一句，告诉用户提醒已经接通。';
    this.push(text, 'task_complete');
    this.stats.pushed++;
    this.stats.lastKind = 'test';
    this.stats.lastAt = Date.now();
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = createServer((req, res) => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(body));
      };
      if (req.method !== 'POST') return send(405, { ok: false, error: 'POST required' });
      const token = this.cfg.token.trim();
      if (token && req.headers['x-opencode-token'] !== token) return send(401, { ok: false, error: 'bad token' });

      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString('utf8');
        if (raw.length > 64_000) req.destroy();
      });
      req.on('end', () => {
        let payload: Reminder;
        try {
          payload = JSON.parse(raw) as Reminder;
        } catch {
          return send(400, { ok: false, error: 'invalid json' });
        }
        this.stats.received++;
        const kind = typeof payload.kind === 'string' ? payload.kind : 'task_complete';
        const key = `${kind}:${payload.sessionTitle ?? ''}`;
        const now = Date.now();
        if (now - (this.count.get(key) ?? 0) < this.cfg.cooldownMs) {
          return send(200, { ok: true, skipped: 'cooldown' });
        }
        const text = reminderText({ ...payload, kind }, this.cfg);
        if (text === null) return send(200, { ok: true, skipped: 'disabled' });
        this.count.set(key, now);
        this.push(text, kind);
        this.stats.pushed++;
        this.stats.lastKind = kind;
        this.stats.lastAt = now;
        if (this.cfg.verbose) this.log(`[opencode] ${kind}: ${text.slice(0, 100)}`);
        return send(200, { ok: true });
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.cfg.port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    server.on('error', (err) => this.log(`[opencode] server error: ${String(err)}`));
    this.server = server;
    this.stats.listening = true;
    this.log(`[opencode] listening on http://127.0.0.1:${this.cfg.port}/notify`);
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.stats.listening = false;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
