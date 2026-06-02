export type AgentMode = 'ta' | 'general'

const LEGACY_ACTIVE_TAB_KEY = 'tagent-active-tab'
const LEGACY_OPEN_TABS_KEY = 'tagent-open-tabs'

export function getActiveTabStorageKey(agentMode: AgentMode): string {
  return `tagent-active-tab-${agentMode}`
}

export function getOpenTabsStorageKey(agentMode: AgentMode): string {
  return `tagent-open-tabs-${agentMode}`
}

export function loadStoredOpenTabs(agentMode: AgentMode): string[] {
  if (typeof localStorage === 'undefined') return []
  const raw = localStorage.getItem(getOpenTabsStorageKey(agentMode))
    || (agentMode === 'ta' ? localStorage.getItem(LEGACY_OPEN_TABS_KEY) : null)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function saveStoredOpenTabs(agentMode: AgentMode, tabIds: string[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(getOpenTabsStorageKey(agentMode), JSON.stringify(tabIds))
}

export function loadStoredActiveTab(agentMode: AgentMode): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(getActiveTabStorageKey(agentMode))
    || (agentMode === 'ta' ? localStorage.getItem(LEGACY_ACTIVE_TAB_KEY) : null)
}

export function saveStoredActiveTab(agentMode: AgentMode, tabId: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(getActiveTabStorageKey(agentMode), tabId)
}
