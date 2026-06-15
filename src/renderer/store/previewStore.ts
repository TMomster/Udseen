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
  /** 自动播放计时配置 */
  autoPlayConfig: {
    /** 每3个字符多少毫秒（无音频时） */
    charDelay: number
    /** 最短延迟（ms） */
    minDelay: number
    /** 音频延时附加量（ms） */
    audioExtraDelay: number
  }

  // Actions
  setRunning: (running: boolean) => void
  addLog: (message: string, type?: 'info' | 'error' | 'warning') => void
  clearLogs: () => void
  setHoveredObject: (id: string | null) => void
  setCurrentChoices: (choices: { text: string; action: () => void }[] | null) => void
  setDialogue: (dialogue: DialogueState | null) => void
  setDialogueVisible: (visible: boolean) => void
  setAutoMode: (auto: boolean) => void
  setAutoPlayConfig: (config: Partial<PreviewState['autoPlayConfig']>) => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  isRunning: false,
  logs: [],
  hoveredObject: null,
  currentChoices: null,
  dialogue: null,
  dialogueVisible: true,
  autoMode: false,
  autoPlayConfig: {
    charDelay: 1000,
    minDelay: 1000,
    audioExtraDelay: 1000,
  },

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

  setAutoMode: (autoMode) => set({ autoMode }),

  setAutoPlayConfig: (config) => set((s) => ({ autoPlayConfig: { ...s.autoPlayConfig, ...config } })),
}))
