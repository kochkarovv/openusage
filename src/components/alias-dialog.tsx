import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ALIAS_ICONS, resolveAliasIcon } from "@/components/provider-icon"
import { makeAliasId } from "@/hooks/app/use-alias-actions"
import type { ProviderAlias } from "@/lib/settings"

interface AliasDialogProps {
  existing?: ProviderAlias | null
  takenIds: string[]
  onSave: (alias: ProviderAlias) => void
  onClose: () => void
}

export function AliasDialog({ existing, takenIds, onSave, onClose }: AliasDialogProps) {
  const [name, setName] = useState(existing?.name ?? "")
  const [dir, setDir] = useState(existing?.env.CLAUDE_CONFIG_DIR ?? "~/.claude")
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

  const canSave = name.trim().length > 0 && dir.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    const id = existing?.id ?? makeAliasId("claude", name.trim(), takenIds)
    onSave({
      id,
      basePluginId: "claude",
      name: name.trim(),
      icon,
      iconColor: color || undefined,
      env: { CLAUDE_CONFIG_DIR: dir.trim() },
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

        <label className="block text-sm mb-1">Name</label>
        <input
          className="w-full mb-3 rounded-md border bg-background px-2 py-1 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Claude Work"
        />

        <label className="block text-sm mb-1">Config Directory</label>
        <input
          className="w-full mb-3 rounded-md border bg-background px-2 py-1 text-sm font-mono"
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          placeholder="~/.claude-work"
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
