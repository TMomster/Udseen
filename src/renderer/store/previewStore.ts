import { create } from 'zustand'

interface LogEntry {
  timestamp: number
  message: string
  type: 'info' | 'error' | 'warning'
}

interface DialogueState {
  /** 说话角色名（null 表示旁白） */
  speaker: string | null
  /** 对话文本 */
  text: string
  /** 用户点击后调用以继续执行 */
  resolve: () => void
}

interface PreviewState {
  /** 是否正在运行脚本 */
  isRunning: boolean
  /** 运行时日志 */
  logs: LogEntry[]
  /** 鼠标悬停的对象 ID */
  hoveredObject: string | null
  /** 选择项（choice） */
  currentChoices: { text: string; action: () => void }[] | null
  /** 当前对话（null 表示无对话） */
  dialogue: DialogueState | null
  /** 对话框是否可见（speech() 控制） */
  dialogueVisible: boolean
  /** 自动播放模式 */
  autoMode: boolean

  // Actions
  setRunning: (running: boolean) => void
  addLog: (message: string, type?: 'info' | 'error' | 'warning') => void
  clearLogs: () => void
  setHoveredObject: (id: string | null) => void
  setCurrentChoices: (choices: { text: string; action: () => void }[] | null) => void
  setDialogue: (dialogue: DialogueState | null) => void
  setDialogueVisible: (visible: boolean) => void
  setAutoMode: (auto: boolean) => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  isRunning: false,
  logs: [],
  hoveredObject: null,
  currentChoices: null,
  dialogue: null,
  dialogueVisible: true,
  autoMode: false,

  setRunning: (isRunning) => set({ isRunning, currentChoices: null, dialogue: null, dialogueVisible: true }),

  addLog: (message, type = 'info') =>
    set((state) => ({
      logs: [
        ...state.logs,
        { timestamp: Date.now(), message, type }
      ].slice(-100) // keep last 100 lines
    })),

  clearLogs: () => set({ logs: [] }),

  setHoveredObject: (hoveredObject) => set({ hoveredObject }),

  setCurrentChoices: (currentChoices) => set({ currentChoices }),

  setDialogue: (dialogue) => set({ dialogue }),

  setDialogueVisible: (dialogueVisible) => set({ dialogueVisible }),

  setAutoMode: (autoMode) => set({ autoMode })
}))
