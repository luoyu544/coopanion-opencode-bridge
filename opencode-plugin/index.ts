import { appendFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { Plugin } from "@opencode/plugin"

/**
 * Companion —— OpenCode 桌宠提醒插件
 *
 * 监听 OpenCode 的事件流，在以下场景主动通知桌面宠物：
 *   - 任务完成（session.idle）
 *   - 需要你回答问题（form.created，即 question / AskUserQuestion 类工具）
 *   - 需要你确认权限（permission.asked）
 *   - 任务失败（session.execution.failed，默认关闭）
 *
 * 通知通过可配置的渠道发出：HTTP webhook（默认）+ 本地 JSONL 文件（可选）。
 * 桌宠只要跑一个本地 HTTP 服务或监听一个文件即可收到提醒。
 */

type AnyEvent = {
  type: string
  id?: string
  created?: number
  data?: Record<string, any>
  location?: unknown
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

type Kind = "task_complete" | "question" | "permission" | "error"

export interface CompanionOptions {
  /** 接收提醒的 HTTP 地址，可以是单个地址或地址数组。默认 http://127.0.0.1:17321/notify */
  webhook?: string | string[]
  /** webhook 附加请求头，例如 { "x-pet-token": "xxx" } */
  headers?: Record<string, string>
  /** 同时把提醒追加到该 JSONL 文件，适合用文件监听的桌宠。默认不开启 */
  file?: string
  /** 各类提醒开关 */
  events?: {
    taskComplete?: boolean
    question?: boolean
    permission?: boolean
    error?: boolean
  }
  /** session.idle 后的去抖时间（毫秒），用来等待 question/permission 事件先到达 */
  debounceMs?: number
  /** 同一会话同类提醒的最小间隔（毫秒），防止重复打扰 */
  cooldownMs?: number
  /** 是否在消息里附带会话标题（需要额外读取 session） */
  sessionTitle?: boolean
  /** 是否在控制台打印提醒，便于调试 */
  log?: boolean
  /** webhook 超时（毫秒） */
  timeoutMs?: number
  /** 没有 session.idle 时，最后活动后静默多久算任务结束（毫秒） */
  quietMs?: number
  /** 同一会话「任务完成」的最小间隔（毫秒），避免连续打断桌宠 */
  completeCooldownMs?: number
  /** 这一轮至少持续多久，或至少调用过一次工具，才算值得提醒（毫秒） */
  minTurnMs?: number
}

const DEFAULTS = {
  webhook: "http://127.0.0.1:17321/notify",
  headers: {},
  events: { taskComplete: true, question: true, permission: true, error: false },
  debounceMs: 450,
  cooldownMs: 3000,
  sessionTitle: true,
  log: true,
  timeoutMs: 3000,
  quietMs: 8000,
  completeCooldownMs: 60000,
  minTurnMs: 10000,
}

const TITLES: Record<Kind, string> = {
  task_complete: "✅ 任务完成",
  question: "❓ 需要你回答问题",
  permission: "🔐 需要你确认",
  error: "⚠️ 任务失败",
}

export default Plugin.define({
  id: "companion",
  async setup(ctx) {
    const opt = {
      ...DEFAULTS,
      ...((ctx.options ?? {}) as Partial<CompanionOptions>),
      events: { ...DEFAULTS.events, ...((ctx.options as any)?.events ?? {}) },
    } as CompanionOptions & typeof DEFAULTS

    // sessionID -> 待处理的问答/权限标识集合
    const pending = new Map<string, Set<string>>()
    // `${kind}:${sessionID}` -> 上次发送时间
    const lastSent = new Map<string, number>()
    const timers = new Set<ReturnType<typeof setTimeout>>()
    // 静默计时器（没有 session.idle 的环境用）
    const quietTimers = new Map<string, ReturnType<typeof setTimeout>>()
    // 本轮已经报过“任务完成”的会话，防止重复提醒
    const notified = new Set<string>()
    // 会话本轮的开始时间与是否调用过工具；只有“像干活”的一轮才提醒
    const turns = new Map<string, { start: number; tools: boolean }>()
    // 会话上次“任务完成”提醒的时间
    const lastComplete = new Map<string, number>()

    function markActivity(sessionID: string, turnStart = false) {
      if (turnStart) {
        const prev = turns.get(sessionID)
        turns.set(sessionID, { start: Date.now(), tools: prev?.tools ?? false })
      } else if (!turns.has(sessionID)) {
        turns.set(sessionID, { start: Date.now(), tools: false })
      }
      const prev = quietTimers.get(sessionID)
      if (prev) {
        clearTimeout(prev)
        timers.delete(prev)
      }
      const timer = setTimeout(() => {
        quietTimers.delete(sessionID)
        timers.delete(timer)
        if (notified.has(sessionID)) return
        if (pending.get(sessionID)?.size) return
        const turn = turns.get(sessionID)
        // 只聊一句、没调用工具、也没持续够久的一轮，不打扰。
        if (turn && !turn.tools && Date.now() - turn.start < opt.minTurnMs) return
        const last = lastComplete.get(sessionID) ?? 0
        if (Date.now() - last < opt.completeCooldownMs) return
        lastComplete.set(sessionID, Date.now())
        notified.add(sessionID)
        fire("task_complete", { type: "session.quiet", data: { sessionID } } as AnyEvent)
      }, opt.quietMs)
      timers.add(timer)
      quietTimers.set(sessionID, timer)
    }

    function addPending(sessionID: string, key: string) {
      if (!sessionID) return
      let set = pending.get(sessionID)
      if (!set) pending.set(sessionID, (set = new Set()))
      set.add(key)
    }

    function removePending(sessionID: string, key: string) {
      const set = pending.get(sessionID)
      if (!set) return
      set.delete(key)
      if (set.size === 0) pending.delete(sessionID)
    }

    function later(fn: () => void, ms: number) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        try {
          fn()
        } catch (err) {
          console.error("[companion] timer error:", err)
        }
      }, ms)
      timers.add(timer)
    }

    async function getSessionTitle(sessionID?: string): Promise<string | undefined> {
      if (!opt.sessionTitle || !sessionID) return undefined
      try {
        const session = await ctx.session.get({ sessionID })
        return (session as any)?.title || undefined
      } catch {
        return undefined
      }
    }

    function extractQuestion(form: any): string {
      const title = form?.title || "OpenCode 提问"
      const fields: any[] = Array.isArray(form?.fields) ? form.fields : []
      const lines = fields.map((f) => {
        const name = f?.title || f?.key || "问题"
        const desc = f?.description ? ` — ${f.description}` : ""
        const options = Array.isArray(f?.options) && f.options.length
          ? `（${f.options.map((o: any) => o?.label ?? o?.value ?? o).join(" / ")}）`
          : ""
        return `• ${name}${desc}${options}`
      })
      return [title, ...lines].filter(Boolean).join("\n")
    }

    function buildMessage(kind: Kind, event: AnyEvent, sessionTitle?: string): string {
      const d = event.data ?? {}
      const prefix = sessionTitle ? `【${sessionTitle}】` : ""
      switch (kind) {
        case "task_complete":
          return `${prefix}会话刚完成了一次任务（新的一次，不是刚才的重复），可以回来查看结果了。`
        case "question":
          return `${prefix}${extractQuestion(d.form)}`
        case "permission":
          return `${prefix}${d.message || `${d.action} ${(d.resources ?? []).join(", ")}`}`
        case "error": {
          const err = d.error
          const text = typeof err === "string" ? err : err?.message || JSON.stringify(err ?? "")
          return `${prefix}任务执行失败：${text}`
        }
      }
    }

    async function publish(payload: Record<string, Json>) {
      const body = JSON.stringify(payload)
      if (opt.log) {
        console.log(`[companion] ${payload.kind}: ${payload.title} — ${String(payload.message).replace(/\n/g, " / ")}`)
      }

      if (opt.file) {
        try {
          await mkdir(dirname(opt.file), { recursive: true })
          await appendFile(opt.file, body + "\n", "utf8")
        } catch (err) {
          console.error("[companion] failed to write file:", err)
        }
      }

      const urls = Array.isArray(opt.webhook) ? opt.webhook : opt.webhook ? [opt.webhook] : []
      await Promise.allSettled(
        urls.map(async (url) => {
          const ac = new AbortController()
          const timer = setTimeout(() => ac.abort(), opt.timeoutMs)
          try {
            const res = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json", ...(opt.headers ?? {}) },
              body,
              signal: ac.signal,
            })
            if (!res.ok) console.error(`[companion] webhook ${url} -> HTTP ${res.status}`)
          } catch (err) {
            console.error(`[companion] webhook ${url} failed:`, err)
          } finally {
            clearTimeout(timer)
          }
        }),
      )
    }

    function shouldSend(kind: Kind, sessionID?: string): boolean {
      const key = `${kind}:${sessionID ?? ""}`
      const now = Date.now()
      if (now - (lastSent.get(key) ?? 0) < opt.cooldownMs) return false
      lastSent.set(key, now)
      return true
    }

    function fire(kind: Kind, event: AnyEvent) {
      const enabled =
        kind === "task_complete" ? opt.events.taskComplete
        : kind === "question" ? opt.events.question
        : kind === "permission" ? opt.events.permission
        : opt.events.error
      if (!enabled) return

      const sessionID: string | undefined =
        event.data?.sessionID ?? event.data?.form?.sessionID ?? undefined
      if (!shouldSend(kind, sessionID)) return

      void (async () => {
        try {
          const sessionTitle = await getSessionTitle(sessionID)
          await publish({
            id: event.id ?? `${kind}-${Date.now()}`,
            kind,
            event: event.type,
            title: TITLES[kind],
            message: buildMessage(kind, event, sessionTitle),
            sessionID: sessionID ?? null,
            sessionTitle: sessionTitle ?? null,
            timestamp: event.created ?? Date.now() / 1000,
          })
        } catch (err) {
          console.error("[companion] notify error:", err)
        }
      })()
    }

    console.log(
      `[companion] ready — webhook=${JSON.stringify(opt.webhook)} file=${opt.file ?? "off"} events=${JSON.stringify(opt.events)}`,
    )

    const controller = new AbortController()

    // 事件路由保持同步，先更新 pending 状态；耗时通知放到异步任务里，避免阻塞事件流。
    function route(event: AnyEvent) {
      const d = event.data ?? {}
      const sid = d.sessionID ?? d.form?.sessionID
      // 只要这个会话还在动，就把“静默即完成”的计时器往后推。
      if (typeof sid === "string" && event.type.startsWith("session.")) {
        if (event.type === "session.tool.called") {
          const turn = turns.get(sid)
          if (turn) turn.tools = true
        }
        markActivity(sid, event.type === "session.step.started" || event.type === "session.inbox.delivered")
      }
      switch (event.type) {
        case "form.created": {
          const form = d.form
          if (form?.sessionID) addPending(form.sessionID, `form:${form.id}`)
          fire("question", event)
          break
        }
        case "form.replied":
        case "form.cancelled":
          removePending(d.sessionID, `form:${d.id}`)
          break
        case "permission.asked":
          addPending(d.sessionID, `perm:${d.id}`)
          // question 工具本身也会申请权限，但 form.created 的信息更有用，避免重复提醒。
          if (d.action === "question") break
          fire("permission", event)
          break
        case "permission.replied":
          removePending(d.sessionID, `perm:${d.requestID}`)
          break
        case "session.idle": {
          const sessionID = d.sessionID
          // 去抖：如果这轮 turn 末尾紧接着弹出了问答/权限，不要误报“任务完成”。
          later(() => {
            if (sessionID && pending.get(sessionID)?.size) return
            if (sessionID && notified.has(sessionID)) return
            if (sessionID) notified.add(sessionID)
            fire("task_complete", event)
          }, opt.debounceMs)
          break
        }
        case "session.execution.failed":
          fire("error", event)
          break
      }
    }

    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          try {
            route(event as AnyEvent)
          } catch (err) {
            console.error("[companion] route error:", err)
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") console.error("[companion] event stream error:", err)
      }
    })()

    return () => {
      controller.abort()
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      quietTimers.clear()
      console.log("[companion] unloaded")
    }
  },
})
