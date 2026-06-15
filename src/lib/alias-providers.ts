// Registry of providers that support aliases. A provider is alias-capable when
// the account it reads can be redirected via a whitelisted env var (see
// WHITELISTED_ENV_VARS in src-tauri/.../host_api.rs). Adding a new provider here
// (and ensuring its env var is whitelisted) is all the alias UI needs.
export type AliasProviderDef = {
  /** Base plugin id this alias clones. */
  id: string
  /** Display name in the base-provider picker. */
  name: string
  /** Whitelisted env var the alias overrides to select the account. */
  envVar: string
  /** Label for the value field in the dialog. */
  fieldLabel: string
  /** Placeholder shown in the value field. */
  fieldPlaceholder: string
  /** Default value pre-filled when creating a new alias. */
  defaultValue: string
}

export const ALIAS_PROVIDERS: AliasProviderDef[] = [
  {
    id: "claude",
    name: "Claude",
    envVar: "CLAUDE_CONFIG_DIR",
    fieldLabel: "Config Directory",
    fieldPlaceholder: "~/.claude-work",
    defaultValue: "~/.claude",
  },
  {
    id: "codex",
    name: "Codex",
    envVar: "CODEX_HOME",
    fieldLabel: "Config Directory",
    fieldPlaceholder: "~/.codex-work",
    defaultValue: "~/.codex",
  },
]

export function getAliasProvider(id: string): AliasProviderDef | undefined {
  return ALIAS_PROVIDERS.find((def) => def.id === id)
}
