import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // 文件对话框
  openFile: (): Promise<{ filePath: string; content: string } | null> =>
    ipcRenderer.invoke('dialog:openFile'),

  saveFile: (content: string): Promise<{ success: boolean; filePath?: string }> =>
    ipcRenderer.invoke('dialog:saveFile', content),

  writeFile: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  exportHtml: (htmlContent: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:exportHtml', htmlContent),

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
    ipcRenderer.invoke('app:getPath')
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
