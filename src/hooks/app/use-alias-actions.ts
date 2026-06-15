import { useCallback } from "react"
import {
  saveAliases,
  savePluginSettings,
  type ProviderAlias,
  type PluginSettings,
} from "@/lib/settings"

export function makeAliasId(
  basePluginId: string,
  name: string,
  taken: string[]
): string {
  const slug = `${basePluginId}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (!taken.includes(slug)) return slug
  let n = 2
  while (taken.includes(`${slug}-${n}`)) n += 1
  return `${slug}-${n}`
}

export function upsertAlias(
  aliases: ProviderAlias[],
  alias: ProviderAlias
): ProviderAlias[] {
  const idx = aliases.findIndex((a) => a.id === alias.id)
  if (idx === -1) return [...aliases, alias]
  const next = aliases.slice()
  next[idx] = alias
  return next
}

export function removeAlias(
  aliases: ProviderAlias[],
  id: string
): ProviderAlias[] {
  return aliases.filter((a) => a.id !== id)
}

const TRAY_SETTINGS_DEBOUNCE_MS = 2000

type ScheduleTrayIconUpdate = (
  reason: "probe" | "settings" | "init",
  delayMs?: number
) => void

type UseAliasActionsArgs = {
  aliases: ProviderAlias[]
  setAliases: (value: ProviderAlias[]) => void
  pluginSettings: PluginSettings | null
  setPluginSettings: (value: PluginSettings | null) => void
  setLoadingForPlugins: (ids: string[]) => void
  clearPluginStates: (ids: string[]) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
  scheduleTrayIconUpdate: ScheduleTrayIconUpdate
}

export function useAliasActions({
  aliases,
  setAliases,
  pluginSettings,
  setPluginSettings,
  setLoadingForPlugins,
  clearPluginStates,
  startBatch,
  scheduleTrayIconUpdate,
}: UseAliasActionsArgs) {
  // Persist plugin order/disabled the same way other settings mutations do, so the
  // tray icon refreshes consistently.
  const persistPluginSettings = useCallback(
    (next: PluginSettings) => {
      setPluginSettings(next)
      scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS)
      void savePluginSettings(next).catch((error) => {
        console.error("Failed to save plugin settings for alias:", error)
      })
    },
    [scheduleTrayIconUpdate, setPluginSettings]
  )

  // The alias's virtual meta and its card are derived reactively from `aliases`
  // (see App), so saving/deleting only needs to update `aliases` + plugin order.
  const saveAlias = useCallback(
    (alias: ProviderAlias) => {
      const nextAliases = upsertAlias(aliases, alias)
      setAliases(nextAliases)
      void saveAliases(nextAliases).catch((error) => {
        console.error("Failed to save alias:", error)
      })

      if (pluginSettings && !pluginSettings.order.includes(alias.id)) {
        persistPluginSettings({
          order: [...pluginSettings.order, alias.id],
          disabled: pluginSettings.disabled.filter((id) => id !== alias.id),
        })
      } else {
        scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS)
      }

      setLoadingForPlugins([alias.id])
      startBatch([alias.id]).catch((error) => {
        console.error("Failed to start probe for alias:", error)
      })
    },
    [
      aliases,
      pluginSettings,
      persistPluginSettings,
      scheduleTrayIconUpdate,
      setAliases,
      setLoadingForPlugins,
      startBatch,
    ]
  )

  const deleteAlias = useCallback(
    (id: string) => {
      const nextAliases = removeAlias(aliases, id)
      setAliases(nextAliases)
      void saveAliases(nextAliases).catch((error) => {
        console.error("Failed to save aliases after delete:", error)
      })

      // Drop any cached probe state so a future alias reusing this id can't show
      // the deleted account's stale usage.
      clearPluginStates([id])

      if (pluginSettings) {
        persistPluginSettings({
          order: pluginSettings.order.filter((x) => x !== id),
          disabled: pluginSettings.disabled.filter((x) => x !== id),
        })
      }
    },
    [aliases, clearPluginStates, persistPluginSettings, pluginSettings, setAliases]
  )

  return { saveAlias, deleteAlias }
}
