interface SystemResources {
  cpuPercent: number
  memoryMB: number
}

interface GpuInfo {
  name: string
  utilizationPercent: number | null
  memoryUsedMB: number | null
  memoryTotalMB: number | null
  temperature: number | null
}

interface AppConfig {
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
  /** 音频播放器音量 0~100（BGM / SFX 统一） */
  audioVolume: number
  /** 帧率限制，0=与显示器同步 */
  fpsLimit: number
  /** 资源目录（相对于应用根目录，默认 "assets/public"） */
  resourceDir: string
  /** 虚拟资源路径列表 */
  virtualPaths: string[]
  /** 窗口分辨率宽 */
  resolutionWidth: number
  /** 窗口分辨率高 */
  resolutionHeight: number
  /** 开场动画速度：standard（标准）| fast（快速） */
  openingSpeed: 'standard' | 'fast'
  /** 文本播放速度：slow（慢）| medium（中）| fast（快） */
  textSpeed: 'slow' | 'medium' | 'fast'
}

interface SetConfigResult {
  success: boolean
  error?: string
}

interface VirtualPathStatus {
  path: string
  valid: boolean
  reason?: string
}

interface ElectronAPI {
  openFile: () => Promise<{ filePath: string; content: string } | null>
  saveFile: (content: string) => Promise<{ success: boolean; filePath?: string }>
  writeFile: (filePath: string, content: string) => Promise<boolean>

  readFile: (filePath: string) => Promise<string>
  readBinary: (filePath: string) => Promise<string>  // 返回 base64 data URL
  writeBinary: (filePath: string, dataUrl: string) => Promise<boolean>  // 写入 base64 data URL
  readDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean }[]>
  fileExists: (filePath: string) => Promise<boolean>
  showItemInFolder: (fullPath: string) => Promise<void>
  onMenuEvent: (channel: string, callback: () => void) => () => void
  setMenuBarVisible: (visible: boolean) => Promise<void>
  getAppPath: () => Promise<string>
  openPublicDir: () => Promise<void>
  copyFile: (src: string, dest: string) => Promise<boolean>
  moveFile: (src: string, dest: string) => Promise<boolean>
  deleteFile: (filePath: string) => Promise<boolean>
  deleteDir: (dirPath: string) => Promise<boolean>
  rename: (oldPath: string, newPath: string) => Promise<boolean>
  mkdir: (dirPath: string) => Promise<boolean>
  getPublicDir: () => Promise<string>
  getResourceUsage: () => Promise<SystemResources>
  getGpuInfo: () => Promise<GpuInfo>
  getConfig: () => Promise<AppConfig>
  setConfig: (config: Partial<AppConfig>) => Promise<SetConfigResult>
  /** 打开目录选择对话框 */
  selectDirectory: () => Promise<string | null>
  /** 获取指定目录下的子目录列表 */
  listSubdirs: (dirPath: string) => Promise<string[]>
  /** 设置窗口尺寸 */
  setWindowSize: (width: number, height: number) => Promise<void>
}

interface Window {
  electronAPI: ElectronAPI
}
