import { useCallback } from "react"
import {
  saveAliases,
  savePluginSettings,
  aliasToVirtualMeta,
  type ProviderAlias,
  type PluginSettings,
} from "@/lib/settings"
import type { PluginMeta } from "@/lib/plugin-types"

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

// Keep pluginsMeta in sync when aliases change at runtime: every render path
// (overview cards, sidebar, settings list) looks an id up in pluginsMeta and
// drops ids with no entry. Bootstrap seeds these at startup; these helpers do
// it for create/edit/delete so a new alias appears immediately.
export function upsertAliasMeta(
  pluginsMeta: PluginMeta[],
  alias: ProviderAlias
): PluginMeta[] {
  const base = pluginsMeta.find((meta) => meta.id === alias.basePluginId)
  if (!base) return pluginsMeta
  const meta = aliasToVirtualMeta(alias, base)
  const idx = pluginsMeta.findIndex((m) => m.id === alias.id)
  if (idx === -1) return [...pluginsMeta, meta]
  const next = pluginsMeta.slice()
  next[idx] = meta
  return next
}

export function removeAliasMeta(
  pluginsMeta: PluginMeta[],
  id: string
): PluginMeta[] {
  return pluginsMeta.filter((meta) => meta.id !== id)
}

type UseAliasActionsArgs = {
  aliases: ProviderAlias[]
  setAliases: (value: ProviderAlias[]) => void
  pluginsMeta: PluginMeta[]
  setPluginsMeta: (value: PluginMeta[]) => void
  pluginSettings: PluginSettings | null
  setPluginSettings: (value: PluginSettings | null) => void
  setLoadingForPlugins: (ids: string[]) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
}

export function useAliasActions({
  aliases,
  setAliases,
  pluginsMeta,
  setPluginsMeta,
  pluginSettings,
  setPluginSettings,
  setLoadingForPlugins,
  startBatch,
}: UseAliasActionsArgs) {
  const saveAlias = useCallback(
    (alias: ProviderAlias) => {
      const nextAliases = upsertAlias(aliases, alias)
      setAliases(nextAliases)
      void saveAliases(nextAliases).catch((error) => {
        console.error("Failed to save alias:", error)
      })

      // Add/replace the alias's virtual meta so it renders immediately.
      setPluginsMeta(upsertAliasMeta(pluginsMeta, alias))

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
    [
      aliases,
      pluginsMeta,
      pluginSettings,
      setAliases,
      setPluginsMeta,
      setLoadingForPlugins,
      setPluginSettings,
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

      setPluginsMeta(removeAliasMeta(pluginsMeta, id))

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
    [aliases, pluginsMeta, pluginSettings, setAliases, setPluginsMeta, setPluginSettings]
  )

  return { saveAlias, deleteAlias }
}
