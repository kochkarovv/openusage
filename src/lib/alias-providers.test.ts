import { describe, it, expect } from "vitest"
import { ALIAS_PROVIDERS, getAliasProvider } from "@/lib/alias-providers"

describe("alias providers", () => {
  it("includes claude and codex with whitelisted env vars", () => {
    expect(getAliasProvider("claude")?.envVar).toBe("CLAUDE_CONFIG_DIR")
    expect(getAliasProvider("codex")?.envVar).toBe("CODEX_HOME")
  })

  it("returns undefined for providers that are not alias-capable", () => {
    expect(getAliasProvider("cursor")).toBeUndefined()
  })

  it("every entry has a default value and a field label", () => {
    for (const def of ALIAS_PROVIDERS) {
      expect(def.defaultValue.length).toBeGreaterThan(0)
      expect(def.fieldLabel.length).toBeGreaterThan(0)
    }
  })
})
