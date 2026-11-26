import type { HookStream, ProcessSpawnChunk, ProcessSpawnResult, Register } from 'claude-code'

type Child = HookStream<ProcessSpawnChunk, ProcessSpawnResult>
const KILLED: ProcessSpawnResult = { code: null, signal: 'SIGTERM' } as ProcessSpawnResult

// the mac stays awake while any of these is true:
// - the main loop is mid-turn
// - a subagent or teammate is running ($.agent.list)
// - a background shell command or Monitor this session started hasn't
//   reported back yet. tracked from the tool results and cleared by the
//   task's completion notification or a TaskStop. (classic.Stop's
//   background_tasks would be simpler, but an org plugin above us
//   answers that event so our hook never runs.)
export const register: Register = on => {
  let mainBusy = false
  const background = new Set<string>()
  let child: Child | undefined
  let sync = () => {}

  const ACTIVE = new Set(['pending', 'running', 'waiting'])

  on('session.start', async ($, e, next) => {
    let running = false
    sync = () => {
      if (running) return
      running = true
      void (async () => {
        try {
          const agents = await $.agent.list().catch(() => [])
          const busy = mainBusy || background.size > 0 || agents.some(a => ACTIVE.has(a.status))
          if (busy && !child) {
            const env = (await $.process.hookEnv().catch(() => ({}))) as Record<string, string>
            // -d display sleep, -i idle sleep (works on battery), -m disk idle sleep.
            // no -s on purpose. it only applies on AC and -i already holds on battery.
            // there's no network flag. network stays up as long as the system doesn't sleep.
            // -w ties caffeinate to claude's pid as a backstop
            const flags = ['-d', '-i', '-m']
            const argv = env.CLAUDE_PID ? ['caffeinate', ...flags, '-w', env.CLAUDE_PID] : ['caffeinate', ...flags]
            const stream = $.process.spawn({ argv })
            child = stream
            $.ui.status('☕ awake')
            void (async () => {
              try {
                for await (const _ of stream) {}
              } catch {}
              if (child === stream) {
                child = undefined
                $.ui.status(undefined)
              }
            })()
          } else if (!busy && child) {
            const c = child
            child = undefined
            void c.return(KILLED)
            $.ui.status(undefined)
          }
        } finally {
          running = false
        }
      })()
    }
    $.clock.every(20_000, sync)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) mainBusy = true
    sync()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) mainBusy = false
    sync()
    return r
  })

  // background shell commands and Monitors report their task id in the result
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (e.tool === 'Bash' || e.tool === 'Monitor' || e.tool === 'TaskStop') {
      const out = r.result as { backgroundTaskId?: string; taskId?: string } | undefined
      const input = e as unknown as { task_id?: string; shell_id?: string }
      if (e.tool === 'TaskStop') {
        const id = input.task_id ?? input.shell_id
        if (id && r.isError !== true) background.delete(id)
      } else {
        const id = e.tool === 'Bash' ? out?.backgroundTaskId : out?.taskId
        if (id) background.add(id)
      }
      sync()
    }
    return r
  })

  // a finished task wakes the session with a <task-notification> naming its
  // id and final status. a Monitor's per-event notifications carry no final
  // status, so they don't clear it.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') {
      const id = /<task-id>([^<]+)<\/task-id>/.exec(e.text)?.[1]
      const done = /<status>(completed|failed|killed|stopped|timed?[ _-]?out)<\/status>/i.test(e.text)
      if (id && done) {
        background.delete(id.trim())
        sync()
      }
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    mainBusy = false
    background.clear()
    const c = child
    child = undefined
    void c?.return(KILLED)
    return next(e)
  })
}
