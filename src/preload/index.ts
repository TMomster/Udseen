import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // 文件对话框
  openFile: (): Promise<{ filePath: string; content: string } | null> =>
    ipcRenderer.invoke('dialog:openFile'),

  saveFile: (content: string): Promise<{ success: boolean; filePath?: string }> =>
    ipcRenderer.invoke('dialog:saveFile', content),

  writeFile: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),



  // 文件系统
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  readBinary: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readBinary', filePath),

  readDir: (dirPath: string): Promise<{ name: string; isDirectory: boolean }[]> =>
    ipcRenderer.invoke('fs:readDir', dirPath),

  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:fileExists', filePath),

  // 菜单事件监听
  onMenuEvent: (channel: string, callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // 窗口控制
  setMenuBarVisible: (visible: boolean): Promise<void> =>
    ipcRenderer.invoke('window:setMenuBarVisible', visible),

  // 退出动画
  onBeforeClose: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('app:beforeClose', handler)
    return () => ipcRenderer.removeListener('app:beforeClose', handler)
  },
  confirmClose: (): Promise<void> => ipcRenderer.invoke('app:confirmClose'),

  // 应用路径
  getAppPath: (): Promise<string> =>
    ipcRenderer.invoke('app:getPath'),

  // 打开公共资源目录
  openPublicDir: (): Promise<void> =>
    ipcRenderer.invoke('shell:openPublicDir'),

  // 文件系统操作（资源管理器）
  copyFile: (src: string, dest: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:copyFile', src, dest),

  moveFile: (src: string, dest: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:moveFile', src, dest),

  deleteFile: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:deleteFile', filePath),

  deleteDir: (dirPath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:deleteDir', dirPath),

  rename: (oldPath: string, newPath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),

  mkdir: (dirPath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:mkdir', dirPath),

  getPublicDir: (): Promise<string> =>
    ipcRenderer.invoke('app:getPublicDir'),

  getAssetsPath: (): Promise<string> =>
    ipcRenderer.invoke('app:getAssetsPath'),

  // 系统资源（CPU + 内存）
  getResourceUsage: (): Promise<{ cpuPercent: number; memoryMB: number }> =>
    ipcRenderer.invoke('system:resourceUsage'),

  // GPU 信息（型号 + 实时利用率）
  getGpuInfo: (): Promise<{
    name: string
    utilizationPercent: number | null
    memoryUsedMB: number | null
    memoryTotalMB: number | null
    temperature: number | null
  }> => ipcRenderer.invoke('system:gpuInfo'),

  // 窗口控制（无边框窗口自定义标题栏按钮）
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),

  // 全屏
  enterFullscreen: (): Promise<void> => ipcRenderer.invoke('window:enterFullscreen'),
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isFullscreen: boolean) => callback(isFullscreen)
    ipcRenderer.on('app:fullscreenChanged', handler)
    return () => ipcRenderer.removeListener('app:fullscreenChanged', handler)
  },

  // 设置
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('settings:getConfig'),
  setConfig: (config: Partial<AppConfig>): Promise<SetConfigResult> =>
    ipcRenderer.invoke('settings:setConfig', config),

  // 目录选择
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory'),

  // 列出子目录
  listSubdirs: (dirPath: string): Promise<string[]> =>
    ipcRenderer.invoke('fs:listSubdirs', dirPath),

  // 设置窗口尺寸
  setWindowSize: (width: number, height: number): Promise<void> =>
    ipcRenderer.invoke('window:setSize', width, height),

  // 获取配置目录路径
  getConfigDir: (): Promise<string> =>
    ipcRenderer.invoke('app:getConfigDir'),

  // 系统字体枚举
  getSystemFonts: (): Promise<string[]> =>
    ipcRenderer.invoke('system:getFonts')
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
