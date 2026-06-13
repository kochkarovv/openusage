import { describe, it, expect } from "vitest"
import {
  upsertAlias,
  removeAlias,
  makeAliasId,
  upsertAliasMeta,
  removeAliasMeta,
} from "@/hooks/app/use-alias-actions"
import type { ProviderAlias } from "@/lib/settings"
import type { PluginMeta } from "@/lib/plugin-types"

const a: ProviderAlias = {
  id: "claude-work",
  basePluginId: "claude",
  name: "Claude Work",
  icon: "Briefcase",
  env: { CLAUDE_CONFIG_DIR: "~/.claude-work" },
}

const baseMeta: PluginMeta = {
  id: "claude",
  name: "Claude",
  iconUrl: "data:base",
  lines: [],
  primaryCandidates: ["Session"],
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

describe("alias meta sync", () => {
  it("adds a virtual meta for a new alias, derived from its base", () => {
    const next = upsertAliasMeta([baseMeta], a)
    expect(next).toHaveLength(2)
    const meta = next.find((m) => m.id === "claude-work")
    expect(meta?.name).toBe("Claude Work")
    expect(meta?.primaryCandidates).toEqual(["Session"])
  })

  it("replaces the meta when editing an existing alias", () => {
    const withAlias = upsertAliasMeta([baseMeta], a)
    const edited = upsertAliasMeta(withAlias, { ...a, name: "Renamed" })
    expect(edited).toHaveLength(2)
    expect(edited.find((m) => m.id === "claude-work")?.name).toBe("Renamed")
  })

  it("leaves metas unchanged when the base plugin is missing", () => {
    expect(upsertAliasMeta([], a)).toEqual([])
  })

  it("removes the alias meta by id", () => {
    const withAlias = upsertAliasMeta([baseMeta], a)
    expect(removeAliasMeta(withAlias, "claude-work")).toHaveLength(1)
  })
})
