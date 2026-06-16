import { create } from 'zustand'

interface StatusState {
  /** 日志消息队列 */
  logs: string[]
  /** 推送一条日志（最多保留最后 50 条） */
  pushLog: (msg: string) => void
  /** 清空日志 */
  clearLogs: () => void
}

export const useStatusStore = create<StatusState>((set) => ({
  logs: [],
  pushLog: (msg) =>
    set((state) => ({
      logs: [...state.logs.slice(-49), msg]
    })),
  clearLogs: () => set({ logs: [] })
}))
