import { useEffect, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { Workbench } from './components/Workbench'
import { TemplateSettings } from './components/TemplateSettings'
import { HelpPanel } from './components/HelpPanel/HelpPanel'
import { useProjectStore } from './store/projectStore'
import { usePreviewStore } from './store/previewStore'

function App(): JSX.Element {
  const { newFile, setContent, setFilePath, markClean, currentView, setCurrentView } = useProjectStore()
  const [isFullscreen, setIsFullscreen] = useState(false)

  // 跟踪全屏状态
  useEffect(() => {
    const handler = (): void => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Listen for menu events from Electron main process
  useEffect(() => {
    if (!window.electronAPI) return

    const cleanups: (() => void)[] = []

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:newFile', () => {
        newFile()
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:openFile', async () => {
        const result = await window.electronAPI.openFile()
        if (result) {
          setFilePath(result.filePath)
          setContent(result.content)
          markClean()
        }
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:saveFile', async () => {
        const { content, filePath } = useProjectStore.getState()
        if (filePath) {
          await window.electronAPI.writeFile(filePath, content)
          markClean()
        } else {
          const result = await window.electronAPI.saveFile(content)
          if (result.success && result.filePath) {
            setFilePath(result.filePath)
            markClean()
          }
        }
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:runScript', () => {
        const { isRunning } = usePreviewStore.getState()
        const key = isRunning ? '__udseenStop' : '__udseenRun'
        const fn = (window as unknown as Record<string, unknown>)[key] as
          | (() => void)
          | undefined
        fn?.()
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:stopScript', () => {
        const fn = (window as unknown as Record<string, unknown>).__udseenStop as
          | (() => void)
          | undefined
        fn?.()
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:openTemplateSettings', () => {
        setCurrentView('template-settings')
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:openHelp', () => {
        setCurrentView('help')
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:toggleCropPreview', () => {
        const { cropPreview, setCropPreview } = useProjectStore.getState()
        setCropPreview(!cropPreview)
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:toggleResourcePreview', () => {
        const { resourcePreview, setResourcePreview } = useProjectStore.getState()
        setResourcePreview(!resourcePreview)
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:toggleEditMode', () => {
        useProjectStore.getState().toggleEditMode()
      })
    )

    return () => cleanups.forEach((c) => c())
  }, [newFile, setContent, setFilePath, markClean, setCurrentView])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const { content, filePath } = useProjectStore.getState()
        if (window.electronAPI) {
          if (filePath) {
            window.electronAPI.writeFile(filePath, content).then(() => markClean())
          } else {
            window.electronAPI.saveFile(content).then((result) => {
              if (result.success && result.filePath) {
                setFilePath(result.filePath)
                markClean()
              }
            })
          }
        }
      }

      // Ctrl+E: toggle edit mode
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        useProjectStore.getState().toggleEditMode()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [markClean])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #18182a 0%, #1e1e30 50%, #1a1a2c 100%)',
        color: '#cdd6f4',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: 'hidden'
      }}
    >
      {currentView === 'template-settings' ? (
        <TemplateSettings onBack={() => setCurrentView('editor')} />
      ) : currentView === 'help' ? (
        <HelpPanel onBack={() => setCurrentView('editor')} />
      ) : (
        <>
          {/* Toolbar — 全屏时隐藏 */}
          <div style={{ display: isFullscreen ? 'none' : 'flex' }}>
            <Toolbar />
          </div>

          {/* Main Content — 使用 Workbench 三面板布局 */}
          <Workbench />
        </>
      )}
    </div>
  )
}

export default App
