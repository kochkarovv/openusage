import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ALIAS_ICONS, resolveAliasIcon } from "@/components/provider-icon"
import { makeAliasId } from "@/hooks/app/use-alias-actions"
import { getAliasProvider, type AliasProviderDef } from "@/lib/alias-providers"
import type { ProviderAlias } from "@/lib/settings"

interface AliasDialogProps {
  existing?: ProviderAlias | null
  takenIds: string[]
  /** Alias-capable providers that are currently loaded (claude, codex, ...). */
  availableProviders: AliasProviderDef[]
  onSave: (alias: ProviderAlias) => void
  onClose: () => void
}

export function AliasDialog({
  existing,
  takenIds,
  availableProviders,
  onSave,
  onClose,
}: AliasDialogProps) {
  const fallback = availableProviders[0]
  const initialBaseId = existing?.basePluginId ?? fallback?.id ?? "claude"

  const [baseId, setBaseId] = useState(initialBaseId)
  const def =
    getAliasProvider(baseId) ?? availableProviders.find((p) => p.id === baseId) ?? fallback

  const [name, setName] = useState(existing?.name ?? "")
  const [value, setValue] = useState(
    existing ? (def ? existing.env[def.envVar] ?? "" : "") : def?.defaultValue ?? ""
  )
  const [icon, setIcon] = useState(existing?.icon ?? "Briefcase")
  const [color, setColor] = useState(existing?.iconColor ?? "")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  // Switching base provider only makes sense while creating; reset the value to
  // the new provider's default so we don't carry over the wrong account dir.
  const handleBaseChange = (id: string) => {
    if (existing) return
    setBaseId(id)
    const nextDef = getAliasProvider(id)
    if (nextDef) setValue(nextDef.defaultValue)
  }

  const canSave = !!def && name.trim().length > 0 && value.trim().length > 0

  const handleSave = () => {
    if (!def || !canSave) return
    const id = existing?.id ?? makeAliasId(baseId, name.trim(), takenIds)
    onSave({
      id,
      basePluginId: baseId,
      name: name.trim(),
      icon,
      iconColor: color || undefined,
      env: { [def.envVar]: value.trim() },
    })
    onClose()
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-card rounded-lg border shadow-xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
        <h2 className="text-lg font-semibold mb-3">
          {existing ? "Edit Alias" : "Add Alias"}
        </h2>

        <label className="block text-sm mb-1">Provider</label>
        <div className="flex gap-1 mb-3">
          {availableProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              disabled={!!existing}
              onClick={() => handleBaseChange(provider.id)}
              className={`flex-1 rounded-md border px-2 py-1 text-sm transition-colors ${
                baseId === provider.id
                  ? "border-primary bg-muted font-medium"
                  : "border-border text-muted-foreground"
              } ${existing ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {provider.name}
            </button>
          ))}
        </div>

        <label className="block text-sm mb-1">Name</label>
        <input
          className="w-full mb-3 rounded-md border bg-background px-2 py-1 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={def ? `${def.name} Work` : "Work"}
        />

        <label className="block text-sm mb-1">{def?.fieldLabel ?? "Config Directory"}</label>
        <input
          className="w-full mb-3 rounded-md border bg-background px-2 py-1 text-sm font-mono"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={def?.fieldPlaceholder ?? "~/.config-work"}
        />

        <label className="block text-sm mb-1">Icon</label>
        <div className="grid grid-cols-6 gap-1 mb-3">
          {Object.keys(ALIAS_ICONS).map((key) => {
            const Icon = resolveAliasIcon(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                aria-label={key}
                className={`flex items-center justify-center rounded-md p-1.5 border ${
                  icon === key ? "border-primary bg-muted" : "border-transparent"
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>

        <label className="block text-sm mb-1">Color (Optional)</label>
        <input
          type="color"
          className="mb-4 h-7 w-12 rounded border bg-background"
          value={color || "#888888"}
          onChange={(e) => setColor(e.target.value)}
        />

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
