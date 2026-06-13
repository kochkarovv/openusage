import { create } from "zustand"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings, ProviderAlias } from "@/lib/settings"

type AppPluginStore = {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  aliases: ProviderAlias[]
  setPluginsMeta: (value: PluginMeta[]) => void
  setPluginSettings: (value: PluginSettings | null) => void
  setAliases: (value: ProviderAlias[]) => void
  resetState: () => void
}

const initialState = {
  pluginsMeta: [] as PluginMeta[],
  pluginSettings: null as PluginSettings | null,
  aliases: [] as ProviderAlias[],
}

export const useAppPluginStore = create<AppPluginStore>((set) => ({
  ...initialState,
  setPluginsMeta: (value) => set({ pluginsMeta: value }),
  setPluginSettings: (value) => set({ pluginSettings: value }),
  setAliases: (value) => set({ aliases: value }),
  resetState: () => set(initialState),
}))
