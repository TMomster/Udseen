import { useEffect, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { ScriptEditor } from './components/Editor'
import { PreviewCanvas } from './components/Preview'
import { TimelinePanel } from './components/Timeline'
import { TemplateSettings } from './components/TemplateSettings'
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
      window.electronAPI.onMenuEvent('menu:exportHtml', async () => {
        const { content } = useProjectStore.getState()
        await window.electronAPI.exportHtml(content)
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
        background: '#1e1e2e',
        color: '#cdd6f4',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: 'hidden'
      }}
    >
      {currentView === 'template-settings' ? (
        <TemplateSettings onBack={() => setCurrentView('editor')} />
      ) : (
        <>
          {/* Toolbar — 全屏时隐藏 */}
          <div style={{ display: isFullscreen ? 'none' : 'flex' }}>
            <Toolbar />
          </div>

          {/* Main Content */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            {/* Left: Script Editor — 全屏时移除 DOM 以释放空间 */}
            {!isFullscreen && (
              <div
                style={{
                  flex: 1,
                  minWidth: 400,
                  borderRight: '1px solid #333'
                }}
              >
                <ScriptEditor />
              </div>
            )}

            {/* Right: Preview + Timeline — 全屏时扩展至全宽 */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                ...(isFullscreen
                  ? { flex: 1 } // 全屏时填满整个主区域
                  : {
                      width: 480,
                      borderLeft: '1px solid #333'
                    })
              }}
            >
              {/* Preview — 始终挂载，保证 PixiJS 不重置 */}
              <div style={{ flex: 1, minHeight: 300 }}>
                <PreviewCanvas isFullscreen={isFullscreen} />
              </div>

              {/* Timeline / Logs — 全屏时隐藏 */}
              {!isFullscreen && (
                <div style={{ height: 200, borderTop: '1px solid #333' }}>
                  <TimelinePanel />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App
