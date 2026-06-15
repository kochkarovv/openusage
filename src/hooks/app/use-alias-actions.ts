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

type UseAliasActionsArgs = {
  aliases: ProviderAlias[]
  setAliases: (value: ProviderAlias[]) => void
  pluginSettings: PluginSettings | null
  setPluginSettings: (value: PluginSettings | null) => void
  setLoadingForPlugins: (ids: string[]) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
}

export function useAliasActions({
  aliases,
  setAliases,
  pluginSettings,
  setPluginSettings,
  setLoadingForPlugins,
  startBatch,
}: UseAliasActionsArgs) {
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
        const next: PluginSettings = {
          order: [...pluginSettings.order, alias.id],
          disabled: pluginSettings.disabled.filter((id) => id !== alias.id),
        }
        setPluginSettings(next)
        void savePluginSettings(next).catch((error) => {
          console.error("Failed to save plugin settings for alias:", error)
        })
      }

      setLoadingForPlugins([alias.id])
      startBatch([alias.id]).catch((error) => {
        console.error("Failed to start probe for alias:", error)
      })
    },
    [aliases, pluginSettings, setAliases, setLoadingForPlugins, setPluginSettings, startBatch]
  )

  const deleteAlias = useCallback(
    (id: string) => {
      const nextAliases = removeAlias(aliases, id)
      setAliases(nextAliases)
      void saveAliases(nextAliases).catch((error) => {
        console.error("Failed to save aliases after delete:", error)
      })

      if (pluginSettings) {
        const next: PluginSettings = {
          order: pluginSettings.order.filter((x) => x !== id),
          disabled: pluginSettings.disabled.filter((x) => x !== id),
        }
        setPluginSettings(next)
        void savePluginSettings(next).catch((error) => {
          console.error("Failed to save plugin settings after alias delete:", error)
        })
      }
    },
    [aliases, pluginSettings, setAliases, setPluginSettings]
  )

  return { saveAlias, deleteAlias }
}
