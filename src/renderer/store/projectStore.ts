import { create } from 'zustand'

export type ViewMode = 'editor' | 'template-settings' | 'help' | 'settings' | 'image-editor'
export type EditMode = 'code' | 'visual'

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
  /** 编辑模式：代码或可视化 */
  editMode: EditMode
  /** 当前执行的脚本行号（编辑器行高亮用），null 表示未执行 */
  executionLine: number | null
  /** 执行错误信息（非 null 表示执行到某行时出错） */
  executionError: string | null
  /** 可视化编辑模式下行号→块ID映射（运行时追踪卡片高亮用） */
  blockLineMap: Map<number, string> | null
  /** 当前正在执行的可视块ID（卡片高亮用），null 表示无 */
  executionBlockId: string | null
  /** 镜头偏移（全屏模式下决定画面显示区域） */
  cameraOffsetX: number
  cameraOffsetY: number
  /** 坐标系校准偏移（直接作用于坐标原点，用于校正全屏坐标） */
  calibrationOffsetX: number
  calibrationOffsetY: number
  /** 资源预览开关：鼠标悬停于脚本中的资源路径时显示预览气泡 */
  resourcePreview: boolean
  /** 图片编辑器：当前编辑的文件路径 */
  imageEditorPath: string | null
  /** 图片编辑器：当前编辑的文件名 */
  imageEditorName: string

  // Actions
  setFilePath: (path: string | null) => void
  setContent: (content: string) => void
  markClean: () => void
  newFile: () => void
  setCurrentView: (view: ViewMode) => void
  setEditMode: (mode: EditMode) => void
  toggleEditMode: () => void
  setExecutionLine: (line: number | null) => void
  setExecutionError: (error: string | null) => void
  setBlockLineMap: (map: Map<number, string> | null) => void
  setExecutionBlockId: (id: string | null) => void
  setCameraOffset: (x: number, y: number) => void
  setCalibrationOffset: (x: number, y: number) => void
  setResourcePreview: (enabled: boolean) => void
  openImageEditor: (path: string, name: string) => void
  closeImageEditor: () => void
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
  editMode: 'code',
  executionLine: null,
  executionError: null,
  blockLineMap: null,
  executionBlockId: null,
  cameraOffsetX: 0,
  cameraOffsetY: -60,
  calibrationOffsetX: 0,
  calibrationOffsetY: -55,
  resourcePreview: true,
  imageEditorPath: null,
  imageEditorName: '',

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

  setEditMode: (editMode) => set({ editMode }),

  toggleEditMode: () => set((state) => ({ editMode: state.editMode === 'code' ? 'visual' : 'code' })),

  setExecutionLine: (executionLine) => set({ executionLine }),

  setExecutionError: (executionError) => set({ executionError }),

  setBlockLineMap: (blockLineMap) => set({ blockLineMap }),

  setExecutionBlockId: (executionBlockId) => set({ executionBlockId }),

  setCameraOffset: (cameraOffsetX, cameraOffsetY) => set({ cameraOffsetX, cameraOffsetY }),

  setCalibrationOffset: (calibrationOffsetX, calibrationOffsetY) => set({ calibrationOffsetX, calibrationOffsetY }),

  setResourcePreview: (resourcePreview) => set({ resourcePreview }),

  openImageEditor: (imageEditorPath, imageEditorName) =>
    set({ imageEditorPath, imageEditorName, currentView: 'image-editor' }),

  closeImageEditor: () =>
    set({ imageEditorPath: null, imageEditorName: '', currentView: 'editor' })
}))

/** 根据当前 store 状态同步更新窗口标题 */
export function syncWindowTitle(): void {
  const { filePath, isDirty } = useProjectStore.getState()
  const name = filePath ? filePath.split(/[/\\]/).pop()! : '未命名脚本'
  const dirty = isDirty ? ' *' : ''
  document.title = `Udseen Editor - ${name}${dirty}`
}
