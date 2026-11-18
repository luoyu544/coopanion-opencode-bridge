import { fileURLToPath } from 'node:url';
import type {
  ConfigGroup,
  Language,
  ToolDef,
  World,
  WorldContext,
  WorldHost,
  WorldWebUiDecl,
} from 'cortico/core/types.ts';
import { OpenCodeBridge } from './bridge.ts';
import { opencodeConfigGroup, type OpenCodeConfigSection } from './config.ts';

const envPrompt = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export class OpenCodeWorld implements World {
  readonly id = 'opencode';
  private host: WorldHost | null = null;
  private bridge: OpenCodeBridge | null = null;

  constructor(private readonly ctx: WorldContext<OpenCodeConfigSection>) {}

  envPromptVars(): Record<string, string> {
    return {};
  }

  tools(): ToolDef[] {
    return [];
  }

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    const bridge = new OpenCodeBridge(
      this.ctx.cfg,
      (text) => {
        this.host?.pushDeferred(
          { type: 'opencode.notice', origin: 'internal', render: () => text },
          { trigger: 'debounce' },
        );
      },
      (line) => console.log(line),
    );
    this.bridge = bridge;
    await bridge.start();
  }

  async stop(): Promise<void> {
    await this.bridge?.stop();
    this.bridge = null;
    this.host = null;
  }

  webUi(language: Language = 'zh'): WorldWebUiDecl {
    const zh = language.startsWith('zh');
    const status = () => this.bridge?.status ?? {
      listening: false,
      received: 0,
      pushed: 0,
      lastKind: '',
      lastAt: 0,
      port: this.ctx.cfg.port,
      tokenRequired: !!this.ctx.cfg.token,
    };
    return {
      label: zh ? 'OpenCode 提醒桥' : 'OpenCode Bridge',
      lamps: [{
        label: zh ? 'Webhook' : 'Webhook',
        state: !this.ctx.cfg.enabled ? 'offline' : status().listening ? 'online' : 'error',
        hint: status().listening
          ? `127.0.0.1:${status().port}/notify`
          : zh ? '接收端未启动' : 'Receiver not running',
      }],
      config: [opencodeConfigGroup(language) as ConfigGroup],
      panels: [{ id: 'status', title: zh ? '运行状态' : 'Status', getMethods: ['status'] }],
      promptDocs: [{
        key: 'worlds.opencode.envPrompt',
        title: zh ? 'OpenCode 提醒 · 环境提示词' : 'OpenCode Bridge · Environment prompt',
        description: zh ? '收到 OpenCode 提醒时在气泡里转达。' : 'Relay OpenCode reminders in the bubble.',
        path: envPrompt(zh ? './ENV_PROMPT.md' : './ENV_PROMPT.en.md'),
        role: 'envPrompt',
      }],
      invoke: async (_panel: string, method: string): Promise<unknown> => {
        if (method === 'status') return status();
        if (method === 'test') {
          this.bridge?.test();
          return status();
        }
        if (method === 'restart-bridge') {
          await this.bridge?.stop();
          await this.bridge?.start();
          return status();
        }
        throw new Error(`Unknown method: ${method}`);
      },
    };
  }
}
