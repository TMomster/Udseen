import { create } from 'zustand'

export type PanelId = 'resource' | 'editor' | 'preview'

interface WorkbenchState {
  /** 各面板是否可见 */
  panelVisibility: Record<PanelId, boolean>
  /** 各面板宽度/高度（像素），resource=左, preview=右 */
  resourcePanelWidth: number
  previewPanelWidth: number
  /** 切换面板显隐 */
  togglePanel: (panel: PanelId) => void
  /** 设置面板显隐 */
  setPanelVisibility: (panel: PanelId, visible: boolean) => void
  /** 设置资源面板宽度 */
  setResourcePanelWidth: (w: number) => void
  /** 设置预览面板宽度 */
  setPreviewPanelWidth: (w: number) => void
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  panelVisibility: {
    resource: true,
    editor: true,
    preview: true
  },
  resourcePanelWidth: 260,
  previewPanelWidth: 480,

  togglePanel: (panel) =>
    set((state) => {
      const newVisibility = { ...state.panelVisibility }
      // 至少保留一个面板
      const visibleCount = Object.values(newVisibility).filter(Boolean).length
      if (visibleCount <= 1 && newVisibility[panel]) {
        return state
      }
      newVisibility[panel] = !newVisibility[panel]
      return { panelVisibility: newVisibility }
    }),

  setPanelVisibility: (panel, visible) =>
    set((state) => {
      const newVisibility = { ...state.panelVisibility }
      if (!visible) {
        const visibleCount = Object.values(newVisibility).filter(Boolean).length
        if (visibleCount <= 1) return state
      }
      newVisibility[panel] = visible
      return { panelVisibility: newVisibility }
    }),

  setResourcePanelWidth: (w) => set({ resourcePanelWidth: Math.max(180, Math.min(500, w)) }),
  setPreviewPanelWidth: (w) => set({ previewPanelWidth: Math.max(300, Math.min(800, w)) })
}))
