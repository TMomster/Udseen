import { create } from 'zustand'

interface VirtualPathEntry {
  path: string
  valid: boolean
  reason?: string
}

interface SettingsState {
  /** GPU 加速是否开启（需要重启应用才能生效） */
  gpuAcceleration: boolean
  /** 编辑器字体 */
  fontFamily: string
  /** 编辑器字号 */
  fontSize: number
  /** 自动保存间隔（秒），0=关闭 */
  autoSaveInterval: number
  /** 自动播放每3字符延迟（毫秒） */
  autoPlayCharDelay: number
  /** 自动播放最短延迟（毫秒） */
  autoPlayMinDelay: number
  /** 音频额外延时（毫秒） */
  audioExtraDelay: number
  /** 音频播放器音量 0~100 */
  audioVolume: number
  /** 帧率限制，0=与显示器同步 */
  fpsLimit: number
  /** 资源目录（相对于应用根目录） */
  resourceDir: string
  /** 虚拟资源路径列表 */
  virtualPaths: VirtualPathEntry[]
  /** 窗口分辨率宽 */
  resolutionWidth: number
  /** 窗口分辨率高 */
  resolutionHeight: number
  /** 开场动画速度 */
  openingSpeed: 'standard' | 'fast'
  /** 文本播放速度 */
  textSpeed: 'slow' | 'medium' | 'fast'

  /** 是否已加载配置 */
  loaded: boolean
  /** 用户修改 GPU 设置后标记需要重启 */
  needRestart: boolean

  /** 从主进程加载配置 */
  loadConfig: () => Promise<void>
  /** 更新 GPU 加速设置 */
  setGpuAcceleration: (enabled: boolean) => Promise<void>
  /** 更新通用设置 */
  updateSetting: <K extends keyof Omit<SettingsState, 'loaded' | 'needRestart' | 'loadConfig' | 'setGpuAcceleration' | 'updateSetting' | 'clearRestartFlag' | 'addVirtualPath' | 'removeVirtualPath' | 'validateVirtualPaths'>>(
    key: K,
    value: SettingsState[K]
  ) => Promise<void>
  /** 清除重启标记 */
  clearRestartFlag: () => void
  /** 添加虚拟路径 */
  addVirtualPath: (path: string) => Promise<void>
  /** 移除虚拟路径 */
  removeVirtualPath: (index: number) => Promise<void>
  /** 校验所有虚拟路径 */
  validateVirtualPaths: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  gpuAcceleration: false,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 14,
  autoSaveInterval: 0,
  autoPlayCharDelay: 1000,
  autoPlayMinDelay: 1000,
  audioExtraDelay: 1000,
  audioVolume: 80,
  fpsLimit: 0,
  resourceDir: 'assets/public',
  virtualPaths: [],
  resolutionWidth: 1400,
  resolutionHeight: 900,
  openingSpeed: 'standard',
  textSpeed: 'medium',
  loaded: false,
  needRestart: false,

  loadConfig: async () => {
    if (!window.electronAPI) return
    try {
      const config = await window.electronAPI.getConfig()
      set({
        gpuAcceleration: config.gpuAcceleration,
        fontFamily: config.fontFamily,
        fontSize: config.fontSize,
        autoSaveInterval: config.autoSaveInterval,
        autoPlayCharDelay: config.autoPlayCharDelay,
        autoPlayMinDelay: config.autoPlayMinDelay,
        audioExtraDelay: config.audioExtraDelay,
        audioVolume: config.audioVolume,
        fpsLimit: config.fpsLimit,
        resourceDir: config.resourceDir,
        virtualPaths: config.virtualPaths.map((p) => ({ path: p, valid: true })),
        resolutionWidth: config.resolutionWidth,
        resolutionHeight: config.resolutionHeight,
        openingSpeed: config.openingSpeed,
        textSpeed: config.textSpeed ?? 'medium',
        loaded: true
      })
    } catch (err) {
      console.error('[SettingsStore] 加载配置失败:', err)
      set({ loaded: true })
    }
  },

  setGpuAcceleration: async (enabled: boolean) => {
    if (!window.electronAPI) return
    const prev = get().gpuAcceleration
    if (prev === enabled) return
    const result = await window.electronAPI.setConfig({ gpuAcceleration: enabled })
    if (result.success) {
      set({ gpuAcceleration: enabled, needRestart: true })
    } else {
      console.error('[SettingsStore] 保存配置失败:', result.error)
    }
  },

  updateSetting: async (key, value) => {
    if (!window.electronAPI) return
    set({ [key]: value } as Partial<SettingsState>)
    const persistKey = key as keyof AppConfig
    const result = await window.electronAPI.setConfig({ [persistKey]: value } as Partial<AppConfig>)
    if (!result.success) {
      console.error('[SettingsStore] 保存配置失败:', result.error)
    }
  },

  clearRestartFlag: () => set({ needRestart: false }),

  addVirtualPath: async (path: string) => {
    const current = get().virtualPaths
    // 检查重复
    if (current.some((v) => v.path === path)) return
    const newEntry: VirtualPathEntry = { path, valid: true, reason: undefined }
    const updated = [...current, newEntry]
    set({ virtualPaths: updated })
    // 校验&持久化
    get().validateVirtualPaths()
    const paths = get().virtualPaths.filter((v) => v.valid).map((v) => v.path)
    if (window.electronAPI) {
      await window.electronAPI.setConfig({ virtualPaths: paths } as Partial<AppConfig>)
    }
  },

  removeVirtualPath: async (index: number) => {
    const current = get().virtualPaths
    const updated = current.filter((_, i) => i !== index)
    set({ virtualPaths: updated })
    const paths = updated.filter((v) => v.valid).map((v) => v.path)
    if (window.electronAPI) {
      await window.electronAPI.setConfig({ virtualPaths: paths } as Partial<AppConfig>)
    }
  },

  validateVirtualPaths: () => {
    const current = get().virtualPaths
    const updated = current.map((entry) => {
      // 检查是否为另一个路径的子路径
      for (const other of current) {
        if (other.path === entry.path) continue
        const normalizedEntry = entry.path.replace(/\\/g, '/').replace(/\/$/, '')
        const normalizedOther = other.path.replace(/\\/g, '/').replace(/\/$/, '')
        if (normalizedEntry.startsWith(normalizedOther + '/') || normalizedEntry === normalizedOther) {
          return { ...entry, valid: false, reason: '递归路径（是另一个目录的子路径）' }
        }
      }
      return { ...entry, valid: true, reason: undefined }
    })
    set({ virtualPaths: updated })
  }
}))
