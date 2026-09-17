import { create } from 'zustand';
import {
  WORKBENCH_HREF,
  normalizeWorkspaceHref,
  workspaceLabelForHref,
  type WorkspaceLabelKey,
} from '@/lib/workspace-nav';

export type WorkspaceTab = {
  id: string;
  href: string;
  labelKey: WorkspaceLabelKey;
  pinned: boolean;
};

const WORKBENCH_TAB: WorkspaceTab = {
  id: 'workbench',
  href: WORKBENCH_HREF,
  labelKey: 'workbench',
  pinned: true,
};

interface WorkspaceTabsState {
  tabs: WorkspaceTab[];
  activeHref: string;
  recentHrefs: string[];
  openTab: (href: string) => void;
  closeTab: (id: string) => string;
  setActive: (href: string) => void;
}

function tabFromHref(href: string): WorkspaceTab | null {
  const normalized = normalizeWorkspaceHref(href);
  const labelKey = workspaceLabelForHref(normalized);
  if (!labelKey) return null;
  if (normalized === WORKBENCH_HREF) return WORKBENCH_TAB;
  return { id: normalized, href: normalized, labelKey, pinned: false };
}

function rememberRecent(recentHrefs: string[], href: string): string[] {
  if (href === WORKBENCH_HREF) return recentHrefs;
  return [href, ...recentHrefs.filter((item) => item !== href)].slice(0, 8);
}

export const useWorkspaceTabs = create<WorkspaceTabsState>((set, get) => ({
  tabs: [WORKBENCH_TAB],
  activeHref: WORKBENCH_HREF,
  recentHrefs: [],
  openTab: (href) => {
    const tab = tabFromHref(href);
    if (!tab) return;
    set((state) => {
      const exists = state.tabs.some((item) => item.id === tab.id);
      return {
        tabs: exists ? state.tabs : [...state.tabs, tab],
        activeHref: tab.href,
        recentHrefs: rememberRecent(state.recentHrefs, tab.href),
      };
    });
  },
  closeTab: (id) => {
    const state = get();
    const closing = state.tabs.find((tab) => tab.id === id);
    if (!closing || closing.pinned) return state.activeHref;
    const remaining = state.tabs.filter((tab) => tab.id !== id);
    const nextHref = state.activeHref === closing.href
      ? remaining[remaining.length - 1]?.href ?? WORKBENCH_HREF
      : state.activeHref;
    set({ tabs: remaining, activeHref: nextHref });
    return nextHref;
  },
  setActive: (href) => {
    const normalized = normalizeWorkspaceHref(href);
    set({ activeHref: normalized });
  },
}));
