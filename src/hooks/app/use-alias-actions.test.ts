import { describe, it, expect } from "vitest"
import { upsertAlias, removeAlias, makeAliasId } from "@/hooks/app/use-alias-actions"
import type { ProviderAlias } from "@/lib/settings"

const a: ProviderAlias = {
  id: "claude-work",
  basePluginId: "claude",
  name: "Claude Work",
  icon: "Briefcase",
  env: { CLAUDE_CONFIG_DIR: "~/.claude-work" },
}

describe("alias reducers", () => {
  it("generates a unique slug id from base + name", () => {
    const id = makeAliasId("claude", "Claude Work", ["claude"])
    expect(id).toBe("claude-claude-work")
    const id2 = makeAliasId("claude", "Claude Work", ["claude", "claude-claude-work"])
    expect(id2).toBe("claude-claude-work-2")
  })

  it("upserts by id", () => {
    const next = upsertAlias([], a)
    expect(next).toHaveLength(1)
    const updated = upsertAlias(next, { ...a, name: "Renamed" })
    expect(updated).toHaveLength(1)
    expect(updated[0].name).toBe("Renamed")
  })

  it("removes by id", () => {
    expect(removeAlias([a], "claude-work")).toHaveLength(0)
  })
})
