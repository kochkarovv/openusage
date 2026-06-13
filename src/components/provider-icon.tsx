import {
  Briefcase,
  User,
  Users,
  Building2,
  Home,
  Star,
  Heart,
  Rocket,
  Globe,
  Code,
  Terminal,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

// Curated icon set offered when creating an alias. Shared by the picker and the
// renderer so both stay in sync.
export const ALIAS_ICONS: Record<string, LucideIcon> = {
  Briefcase,
  User,
  Users,
  Building2,
  Home,
  Star,
  Heart,
  Rocket,
  Globe,
  Code,
  Terminal,
  Sparkles,
}

const DEFAULT_ICON: LucideIcon = User

export function resolveAliasIcon(name: string): LucideIcon {
  return ALIAS_ICONS[name] ?? DEFAULT_ICON
}

export function AliasIcon({
  name,
  color,
  sizePx,
}: {
  name: string
  color?: string
  sizePx: number
}) {
  const Icon = resolveAliasIcon(name)
  return (
    <Icon
      aria-hidden
      className="shrink-0"
      style={{ width: `${sizePx}px`, height: `${sizePx}px`, color }}
    />
  )
}
