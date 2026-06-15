import { create } from "zustand"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings, ProviderAlias } from "@/lib/settings"

type AppPluginStore = {
  // Raw provider metas from the backend (`list_plugins`). Alias virtual metas are
  // derived from these + `aliases` reactively in App, never stored separately.
  baseMetas: PluginMeta[]
  pluginSettings: PluginSettings | null
  aliases: ProviderAlias[]
  setBaseMetas: (value: PluginMeta[]) => void
  setPluginSettings: (value: PluginSettings | null) => void
  setAliases: (value: ProviderAlias[]) => void
  resetState: () => void
}

const initialState = {
  baseMetas: [] as PluginMeta[],
  pluginSettings: null as PluginSettings | null,
  aliases: [] as ProviderAlias[],
}

export const useAppPluginStore = create<AppPluginStore>((set) => ({
  ...initialState,
  setBaseMetas: (value) => set({ baseMetas: value }),
  setPluginSettings: (value) => set({ pluginSettings: value }),
  setAliases: (value) => set({ aliases: value }),
  resetState: () => set(initialState),
}))
