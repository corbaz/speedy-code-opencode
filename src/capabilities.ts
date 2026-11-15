export const capabilityNames = [
  "global-plugin-discovery",
  "persistent-settings",
  "session-events",
  "composer-draft-insertion",
] as const

export type CapabilityName = (typeof capabilityNames)[number]
export type CapabilityStatus = "native" | "unavailable"

const capabilities: Readonly<Record<CapabilityName, CapabilityStatus>> = {
  "global-plugin-discovery": "native",
  "persistent-settings": "native",
  "session-events": "native",
  "composer-draft-insertion": "unavailable",
}

export function capability(name: CapabilityName): CapabilityStatus {
  return capabilities[name]
}

export function portStrategy(name: CapabilityName): {
  capability: CapabilityStatus
  strategy: "native" | "platform-adapter"
} {
  const status = capability(name)
  return {
    capability: status,
    strategy: status === "native" ? "native" : "platform-adapter",
  }
}
