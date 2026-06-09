import { create } from 'zustand'

type ViewMode = 'editor' | 'template-settings'

interface ProjectState {
  /** 当前文件路径 */
  filePath: string | null
  /** 脚本内容 */
  content: string
  /** 是否有未保存的更改 */
  isDirty: boolean
  /** 默认脚本模板 */
  defaultContent: string
  /** 当前视图模式 */
  currentView: ViewMode
  /** 当前执行的脚本行号（编辑器行高亮用），null 表示未执行 */
  executionLine: number | null
  /** 执行错误信息（非 null 表示执行到某行时出错） */
  executionError: string | null

  // Actions
  setFilePath: (path: string | null) => void
  setContent: (content: string) => void
  markClean: () => void
  newFile: () => void
  setCurrentView: (view: ViewMode) => void
  setExecutionLine: (line: number | null) => void
  setExecutionError: (error: string | null) => void
}

const DEFAULT_CONTENT = 
`// Udseen Editor
// Developer: TMomster@github.com
// 剧本文件保存类型为 *.ykn
`

export const useProjectStore = create<ProjectState>((set) => ({
  filePath: null,
  content: DEFAULT_CONTENT,
  isDirty: false,
  defaultContent: DEFAULT_CONTENT,
  currentView: 'editor',
  executionLine: null,
  executionError: null,

  setFilePath: (filePath) => set({ filePath }),

  setContent: (content) => set({ content, isDirty: true }),

  markClean: () => set({ isDirty: false }),

  newFile: () =>
    set({
      filePath: null,
      content: DEFAULT_CONTENT,
      isDirty: false
    }),

  setCurrentView: (currentView) => set({ currentView }),

  setExecutionLine: (executionLine) => set({ executionLine }),

  setExecutionError: (executionError) => set({ executionError })
}))
