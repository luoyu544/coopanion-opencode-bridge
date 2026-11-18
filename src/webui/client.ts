import type { WebUiClientBundle, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

interface Status {
  listening: boolean;
  received: number;
  pushed: number;
  lastKind: string;
  lastAt: number;
  port: number;
  tokenRequired: boolean;
}

export default { panels: { status: { mount } } } satisfies WebUiClientBundle;

export function mount(ctx: WebUiPanelContext): void {
  const ui = ctx.ui;
  const zh = ctx.language.startsWith('zh');
  const say = (cn: string, en: string) => (zh ? cn : en);

  const card = ui.sheet({ title: say('接收端状态', 'Receiver status') });
  const heading = ui.h('h3', null, say('正在读取状态…', 'Reading status…'));
  heading.setAttribute('role', 'status');
  const detail = ui.h('p');
  const rows = ui.h('div');
  const actions = ui.actions();
  const message = ui.msgline();
  card.body.append(heading, detail, rows, actions, message);

  const testButton = ui.button(say('发送测试提醒', 'Send test reminder'), {
    variant: 'primary',
    onClick: () => void act('test'),
  });
  const restartButton = ui.button(say('重启接收端', 'Restart receiver'), {
    onClick: () => void act('restart-bridge'),
  });
  actions.append(testButton, restartButton);
  ctx.root.append(card.el);

  let busy = false;
  let current: Status | undefined;

  function render(status: Status): void {
    if (ctx.signal.aborted) return;
    current = status;
    heading.textContent = status.listening
      ? say('● 接收端正在运行', '● Receiver is running')
      : say('○ 接收端未启动', '○ Receiver is not running');
    detail.textContent = status.listening
      ? say('在下面的「配置」里改端口或令牌后，点「重启接收端」生效。', 'After changing port or token in Config below, click Restart receiver to apply.')
      : say('请先在 World 列表里启用「OpenCode 提醒桥」。', 'Enable the OpenCode Bridge World first.');
    rows.replaceChildren(ui.kv([
      { k: say('监听地址', 'Address'), v: `http://127.0.0.1:${status.port}/notify` },
      { k: say('访问令牌', 'Access token'), v: status.tokenRequired ? say('已设置', 'Set') : say('未设置', 'Not set') },
      { k: say('收到提醒', 'Received'), v: String(status.received) },
      { k: say('已推送给桌宠', 'Pushed'), v: String(status.pushed) },
      { k: say('最近类型', 'Last kind'), v: status.lastKind || '—' },
      { k: say('最近时间', 'Last time'), v: status.lastAt ? new Date(status.lastAt).toLocaleString() : '—' },
    ]));
    testButton.disabled = busy || !status.listening;
    restartButton.disabled = busy;
  }

  async function act(method: string): Promise<void> {
    if (busy) return;
    if (method === 'restart-bridge' && !await ui.confirm({
      title: say('重启接收端？', 'Restart the receiver?'),
      body: say('端口或令牌的改动会在重启后生效；重启期间 OpenCode 的提醒可能发送失败。', 'Port and token changes apply after restart; reminders arriving during the restart may fail.'),
    })) return;
    busy = true;
    message.textContent = '';
    if (current) render(current);
    try {
      render(await ctx.invoke<Status>(method));
      await ctx.refresh();
    } catch (error) {
      message.textContent = say('操作失败：', 'Action failed: ') + String(error);
      if (current) render(current);
    } finally {
      busy = false;
      if (current && !ctx.signal.aborted) render(current);
    }
  }

  async function refresh(): Promise<void> {
    try {
      const status = await ctx.invoke<Status>('status');
      if (!busy) render(status);
    } catch (error) {
      if (!ctx.signal.aborted) message.textContent = say('状态读取失败：', 'Status read failed: ') + String(error);
    }
  }

  void refresh();
  ctx.interval(() => void refresh(), 3000);
}
