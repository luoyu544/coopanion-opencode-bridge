import type { WorldDefinition } from 'cortico/world.ts';
import { OPENCODE_DEFAULTS, type OpenCodeConfigSection } from './config.ts';
import { OpenCodeWorld } from './world.ts';

export const OPENCODE: WorldDefinition<OpenCodeConfigSection> = {
  id: 'opencode',
  label: 'OpenCode 提醒桥',
  defaults: () => structuredClone(OPENCODE_DEFAULTS),
  create: (ctx) => new OpenCodeWorld(ctx),
  describe: {
    tools: [],
    events: [
      {
        type: 'opencode.notice',
        description: {
          zh: 'OpenCode 端有任务完成、提问或需要确认的事，Coo 据此在气泡里提醒用户。',
          en: 'An OpenCode task finished or needs the user; Coo reminds them in a bubble.',
        },
        trigger: 'flush',
      },
    ],
  },
};
