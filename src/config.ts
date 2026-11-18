import type { ConfigGroup } from 'cortico/core/types.ts';

export interface OpenCodeConfigSection {
  enabled: boolean;
  /** 本机 webhook 监听端口 */
  port: number;
  /** 可选：要求插件请求带 x-opencode-token */
  token: string;
  /** 同类提醒的最小间隔 */
  cooldownMs: number;
  /** 各类提醒开关 */
  taskComplete: boolean;
  question: boolean;
  permission: boolean;
  error: boolean;
  /** 控制台是否打印收到的提醒 */
  verbose: boolean;
}

export const OPENCODE_DEFAULTS: OpenCodeConfigSection = {
  enabled: false,
  port: 17321,
  token: '',
  cooldownMs: 10000,
  taskComplete: true,
  question: true,
  permission: true,
  error: false,
  verbose: false,
};

/** 设置页里的表单：端口/token/冷却/四类开关/日志。启用或停用走 World 自己的开关。 */
export function opencodeConfigGroup(language = 'zh'): ConfigGroup {
  const zh = language.startsWith('zh');
  const prop = (type: 'string' | 'integer' | 'boolean', title: string, en: string, extra: Record<string, unknown> = {}) => ({
    type,
    title: zh ? title : en,
    ...extra,
  });
  const restart = zh ? '修改后需重启本 World。' : 'Restart this World after changing.';
  return {
    id: 'world:opencode',
    owner: 'world:opencode',
    schema: {
      type: 'object',
      title: zh ? 'OpenCode 提醒桥' : 'OpenCode Bridge',
      properties: {
        'worlds.opencode.port': prop('integer', 'Webhook 端口', 'Webhook port', {
          minimum: 1024,
          maximum: 65535,
          description: (zh ? '监听 127.0.0.1 的这个端口，接收 OpenCode companion 插件的提醒。' : 'Loopback port that receives reminders from the OpenCode companion plugin. ') + restart,
        }),
        'worlds.opencode.token': prop('string', '访问令牌（可选）', 'Access token (optional)', {
          description: (zh ? '设置后，插件必须在请求头带 x-opencode-token。留空则不校验。' : 'When set, the plugin must send x-opencode-token. Empty disables the check. ') + restart,
        }),
        'worlds.opencode.cooldownMs': prop('integer', '提醒冷却（毫秒）', 'Reminder cooldown (ms)', {
          minimum: 0,
          maximum: 120000,
          'x-hot': true,
          description: zh ? '同类提醒之间的最小间隔，防止刷屏。默认 1200。' : 'Minimum gap between reminders of the same kind. Default 1200.',
        }),
        'worlds.opencode.taskComplete': prop('boolean', '任务完成时提醒', 'Notify on task complete', { 'x-hot': true }),
        'worlds.opencode.question': prop('boolean', '需要回答问题时提醒', 'Notify on question', { 'x-hot': true }),
        'worlds.opencode.permission': prop('boolean', '需要确认权限时提醒', 'Notify on permission request', { 'x-hot': true }),
        'worlds.opencode.error': prop('boolean', '任务失败时提醒', 'Notify on task failure', { 'x-hot': true }),
        'worlds.opencode.verbose': prop('boolean', '在控制台打印收到的提醒', 'Log received reminders', { 'x-hot': true }),
      },
    },
  };
}
