# caffeinate

a claude code mod that keeps your mac awake (`caffeinate -dim`) while a session has anything in flight, and lets go as soon as it's idle. that blocks display sleep, idle sleep and disk sleep, on battery too, so the network stays up.

counts as in flight:
- the main agent mid-turn
- a subagent or teammate that's pending, running or waiting
- a background shell command or Monitor that hasn't reported back yet

caffeinate runs with `-w <claude pid>`, so it dies with the session even if the mod doesn't get a chance to stop it. the status line shows `☕ awake` while it's on.

macOS only.

## install

from a shell:

```
claude plugin install caffeinate --marketplace varunkvv/caffeinate
```

or at a terminal session's prompt:

```
/plugin install caffeinate --marketplace varunkvv/caffeinate
```

answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

in the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `varunkvv/caffeinate`, then Add plugin.

## keep in mind

- caffeinate has no network flag. the network stays up because the system stays awake
- closing the lid on battery still sleeps the mac, caffeinate can't stop that

- recurring crons and `/loop` don't keep the mac awake, they'd hold it up forever
- background tasks are tracked from their tool results and cleared by their completion notification or `TaskStop`. a task that ends without notifying the session keeps the mac awake until the session ends
