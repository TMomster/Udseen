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

interface ElectronAPI {
  openFile: () => Promise<{ filePath: string; content: string } | null>
  saveFile: (content: string) => Promise<{ success: boolean; filePath?: string }>
  writeFile: (filePath: string, content: string) => Promise<boolean>

  readFile: (filePath: string) => Promise<string>
  readBinary: (filePath: string) => Promise<string>  // 返回 base64 data URL
  readDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean }[]>
  fileExists: (filePath: string) => Promise<boolean>
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
}

interface Window {
  electronAPI: ElectronAPI
}
