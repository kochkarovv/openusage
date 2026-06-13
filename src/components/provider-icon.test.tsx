import { describe, it, expect } from "vitest"
import { ALIAS_ICONS, resolveAliasIcon } from "@/components/provider-icon"

describe("alias icons", () => {
  it("exposes a non-empty curated icon set", () => {
    expect(Object.keys(ALIAS_ICONS).length).toBeGreaterThan(3)
  })

  it("falls back to a default icon for unknown names", () => {
    expect(resolveAliasIcon("DoesNotExist")).toBe(resolveAliasIcon("__default__"))
  })

  it("resolves a known icon to its component", () => {
    expect(resolveAliasIcon("Briefcase")).toBe(ALIAS_ICONS.Briefcase)
  })
})
