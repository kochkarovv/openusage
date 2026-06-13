import { useCallback, useEffect, useRef } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import type { PluginOutput } from "@/lib/plugin-types"
import { useAppPluginStore } from "@/stores/app-plugin-store"

type ProbeResult = {
  batchId: string
  output: PluginOutput
}

type ProbeBatchComplete = {
  batchId: string
}

type ProbeBatchStarted = {
  batchId: string
  pluginIds: string[]
}

type UseProbeEventsOptions = {
  onResult: (output: PluginOutput) => void
  onBatchComplete: () => void
}

export function useProbeEvents({ onResult, onBatchComplete }: UseProbeEventsOptions) {
  const activeBatchIds = useRef<Set<string>>(new Set())
  const unlisteners = useRef<UnlistenFn[]>([])
  const listenersReadyRef = useRef<Promise<void> | null>(null)
  const listenersReadyResolveRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false

    // Create the promise that will resolve when listeners are ready
    listenersReadyRef.current = new Promise<void>((resolve) => {
      listenersReadyResolveRef.current = resolve
    })

    const setup = async () => {
      const resultUnlisten = await listen<ProbeResult>("probe:result", (event) => {
        if (activeBatchIds.current.has(event.payload.batchId)) {
          onResult(event.payload.output)
        }
      })

      if (cancelled) {
        resultUnlisten()
        return
      }

      const completeUnlisten = await listen<ProbeBatchComplete>(
        "probe:batch-complete",
        (event) => {
          if (activeBatchIds.current.delete(event.payload.batchId)) {
            onBatchComplete()
          }
        }
      )

      if (cancelled) {
        resultUnlisten()
        completeUnlisten()
        return
      }

      unlisteners.current.push(resultUnlisten, completeUnlisten)

      // Signal that listeners are ready
      listenersReadyResolveRef.current?.()
    }

    void setup()

    return () => {
      cancelled = true
      unlisteners.current.forEach((unlisten) => unlisten())
      unlisteners.current = []
      listenersReadyRef.current = null
      listenersReadyResolveRef.current = null
    }
  }, [onBatchComplete, onResult])

  const startBatch = useCallback(async (pluginIds?: string[]) => {
    // Wait for listeners to be ready before starting the batch
    if (listenersReadyRef.current) {
      await listenersReadyRef.current
    }

    const batchId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `batch-${Date.now()}-${Math.random().toString(16).slice(2)}`

    activeBatchIds.current.add(batchId)
    // Send alias specs so the backend can build virtual alias instances for any
    // alias ids in this batch. Read from the store at call time.
    const aliases = useAppPluginStore.getState().aliases.map((alias) => ({
      id: alias.id,
      basePluginId: alias.basePluginId,
      name: alias.name,
      env: alias.env,
    }))
    const args = pluginIds
      ? { batchId, pluginIds, aliases }
      : { batchId, aliases }
    try {
      const result = await invoke<ProbeBatchStarted>("start_probe_batch", args)
      return result.pluginIds
    } catch (error) {
      activeBatchIds.current.delete(batchId)
      throw error
    }
  }, [])

  return { startBatch }
}
