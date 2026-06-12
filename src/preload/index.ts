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
  }> => ipcRenderer.invoke('system:gpuInfo')
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
