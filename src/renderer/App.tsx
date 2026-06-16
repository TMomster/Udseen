import { useEffect, useCallback, useState, useRef } from 'react'
import { Toolbar } from './components/Toolbar'
import { Workbench } from './components/Workbench'
import { TemplateSettings } from './components/TemplateSettings'
import { HelpPanel } from './components/HelpPanel/HelpPanel'
import { Settings } from './components/Settings/Settings'
import { SplashScreen } from './components/SplashScreen/SplashScreen'
import { preloadErrorTextures } from './assets/ErrorImages'

import { useProjectStore, syncWindowTitle } from './store/projectStore'
import { usePreviewStore } from './store/previewStore'
import { useStatusStore } from './store/statusStore'
import { useSettingsStore } from './store/settingsStore'

/** 在应用启动时加载内置得意黑（Smiley Sans）字体 */
async function loadSmileySansFont(): Promise<void> {
  try {
    const assetsPath = await window.electronAPI?.getAssetsPath?.()
    if (!assetsPath) return
    const fontPath = `${assetsPath.replace(/\\/g, '/')}/template/font/SmileySans-Oblique.ttf`
    const dataUrl = await window.electronAPI?.readBinary?.(fontPath)
    if (!dataUrl) return
    const font = new FontFace('Smiley Sans', `url(${dataUrl})`)
    await font.load()
    document.fonts.add(font)
    console.log('[Font] 得意黑已加载')
  } catch (e) {
    console.warn('[Font] 得意黑加载失败:', e)
  }
}

function App(): JSX.Element {
  const { newFile, setContent, setFilePath, markClean, currentView, setCurrentView } = useProjectStore()
  const pushLog = useStatusStore((s) => s.pushLog)
  const openingSpeed = useSettingsStore((s) => s.openingSpeed)
  const loadConfig = useSettingsStore((s) => s.loadConfig)
  const [bootState, setBootState] = useState<'loading' | 'splash' | 'ready'>('loading')
  const [showSplash, setShowSplash] = useState(false)
  const [stageFullscreen, setStageFullscreen] = useState(false)
  const [exiting, setExiting] = useState(false)
  const exitingRef = useRef(false)
  const showSplashRef = useRef(true)

  // 同步全屏状态 — 通过 Fullscreen API 退出时自动恢复
  useEffect(() => {
    const handler = (): void => {
      if (!document.fullscreenElement) {
        setStageFullscreen(false)
      }
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // App 启动时先加载持久化配置，确保 openingSpeed 等设置正确
  useEffect(() => {
    const init = async () => {
      if (!useSettingsStore.getState().loaded) {
        await loadConfig()
      }
      // 并行加载：内置得意黑字体 + 错误纹理预加载
      await Promise.all([
        loadSmileySansFont(),
        preloadErrorTextures(),
      ])
      setBootState('splash')
      setShowSplash(true)
    }
    init()
  }, [loadConfig])

  // 初始化预览焦点标记
  useEffect(() => {
    ;(window as unknown as Record<string, boolean>).__udseenPreviewFocused = false
  }, [])

  // Listen for menu events from Electron main process
  useEffect(() => {
    if (!window.electronAPI) return

    const cleanups: (() => void)[] = []

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:newFile', () => {
        newFile()
        pushLog('新建脚本')
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:openFile', async () => {
        const result = await window.electronAPI.openFile()
        if (result) {
          setFilePath(result.filePath)
          setContent(result.content)
          markClean()
          const name = result.filePath.split(/[/\\]/).pop()!
          pushLog(`打开文件 ${name}`)
        }
      })
    )

    cleanups.push(
      window.electronAPI.onMenuEvent('menu:saveFile', async () => {
        const { content, filePath } = useProjectStore.getState()
        if (filePath) {
          await window.electronAPI.writeFile(filePath, content)
          markClean()
          const name = filePath.split(/[/\\]/).pop()!
          pushLog(`已保存 ${name}`)
        } else {
          const result = await window.electronAPI.saveFile(content)
          if (result.success && result.filePath) {
            setFilePath(result.filePath)
            markClean()
            const name = result.filePath.split(/[/\\]/).pop()!
            pushLog(`已保存 ${name}`)
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
      window.electronAPI.onMenuEvent('menu:openSettings', () => {
        setCurrentView('settings')
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

    // F11 在 Windows 上会被拦截，由主进程 before-input-event 直接处理 OS 全屏
    return () => cleanups.forEach((c) => c())
  }, [newFile, setContent, setFilePath, markClean, setCurrentView, setStageFullscreen])

  // 退出动画：监听 main 进程的 beforeClose 事件
  useEffect(() => {
    if (!window.electronAPI) return
    const unsub = window.electronAPI.onBeforeClose(() => {
      exitingRef.current = true
      setExiting(true)
      // 动画 1s 后确认关闭
      setTimeout(() => {
        window.electronAPI?.confirmClose()
      }, 1000)
    })
    return unsub
  }, [])

  // F11 进入/退出 OS 全屏时同步 stageFullscreen 状态以隐藏/显示工具栏等
  useEffect(() => {
    if (!window.electronAPI) return
    const unsub = window.electronAPI.onFullscreenChanged((isFullscreen) => {
      setStageFullscreen(isFullscreen)
    })
    return unsub
  }, [])

  // 窗口标题同步：动态显示 "Udseen Editor - {脚本名}"
  useEffect(() => {
    syncWindowTitle() // 初始化
    const unsubscribe = useProjectStore.subscribe(() => syncWindowTitle())
    return unsubscribe
  }, [])

  // 弹出 Ctrl+F 查找：暴露全局函数让 Toolbar/ScriptEditor 调用
  const triggerFind = useCallback(() => {
    const fn = (window as unknown as Record<string, unknown>).__udseenFind as
      | (() => void)
      | undefined
    fn?.()
  }, [])

  const triggerFindReplace = useCallback(() => {
    const fn = (window as unknown as Record<string, unknown>).__udseenFindReplace as
      | (() => void)
      | undefined
    fn?.()
  }, [])

  // 以 ref 同步 splash 状态，让 keydown handler 能读取最新值
  useEffect(() => {
    showSplashRef.current = showSplash
  }, [showSplash])

  // 全局键盘拦截：阻止 Electron/浏览器默认行为，让应用层统一处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 开屏期间不响应任何按键
      if (showSplashRef.current) return

      // 阻止浏览器默认的查找（Ctrl+F/F3）和帮助（F1）
      // F3 由 PreviewCanvas 处理，F10/F11 由本组件统一处理

      // Ctrl+S: 保存文件
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const { content, filePath } = useProjectStore.getState()
        if (window.electronAPI) {
          if (filePath) {
            window.electronAPI.writeFile(filePath, content).then(() => {
              markClean()
              const name = filePath.split(/[/\\]/).pop()!
              pushLog(`已保存 ${name}`)
            })
          } else {
            window.electronAPI.saveFile(content).then((result) => {
              if (result.success && result.filePath) {
                setFilePath(result.filePath)
                markClean()
                const name = result.filePath.split(/[/\\]/).pop()!
                pushLog(`已保存 ${name}`)
              }
            })
          }
        }
        return
      }

      // Ctrl+E: 切换编辑模式
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        useProjectStore.getState().toggleEditMode()
        return
      }

      // Ctrl+F: 查找（禁止浏览器查找栏，改由应用层处理）
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        e.stopPropagation()
        triggerFind()
        return
      }

      // Ctrl+H: 查找并替换
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        e.stopPropagation()
        triggerFindReplace()
        return
      }

      // F1: 打开内置帮助
      if (e.key === 'F1') {
        e.preventDefault()
        setCurrentView('help')
        return
      }

      // F3: 调试层 — PreviewCanvas 已处理，这里仅 preventDefault 防止浏览器查找
      if (e.key === 'F3') {
        e.preventDefault()
        return
      }

      // Ctrl+N: 新建脚本
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        newFile()
        pushLog('新建脚本')
        return
      }

      // Ctrl+O: 打开脚本
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        if (window.electronAPI) {
          window.electronAPI.openFile().then((result) => {
            if (result) {
              setFilePath(result.filePath)
              setContent(result.content)
              markClean()
              const name = result.filePath.split(/[/\\]/).pop()!
              pushLog(`打开文件 ${name}`)
            }
          })
        }
        return
      }

      // Ctrl+B: 运行/停止
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        const { isRunning } = usePreviewStore.getState()
        const key = isRunning ? '__udseenStop' : '__udseenRun'
        const fn = (window as unknown as Record<string, unknown>)[key] as
          | (() => void)
          | undefined
        fn?.()
        return
      }

      // F5: 运行/停止
      if (e.key === 'F5') {
        e.preventDefault()
        const { isRunning } = usePreviewStore.getState()
        const key = isRunning ? '__udseenStop' : '__udseenRun'
        const fn = (window as unknown as Record<string, unknown>)[key] as
          | (() => void)
          | undefined
        fn?.()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [markClean, newFile, setFilePath, setContent, setCurrentView, triggerFind, triggerFindReplace])

  return (
    <>
      {/* 主界面始终渲染，开屏动画作为覆盖层层叠在上方，避免闪烁 */}
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
          color: 'var(--text)',
          overflow: 'hidden',
          transition: 'background 0.3s ease'
        }}
      >
        {currentView === 'template-settings' ? (
          <TemplateSettings onBack={() => setCurrentView('editor')} />
        ) : currentView === 'help' ? (
          <HelpPanel onBack={() => setCurrentView('editor')} />
        ) : currentView === 'settings' ? (
          <Settings onBack={() => setCurrentView('editor')} />
        ) : (
          <>
            {!stageFullscreen && <Toolbar />}

            {/* Main Content — 使用 Workbench 三面板布局 */}
            <Workbench stageFullscreen={stageFullscreen} />
          </>
        )}
      </div>

      {/* 启动加载覆盖层 — 配置加载完成后才进入 splash */}
      {bootState === 'loading' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: '#000'
          }}
        />
      )}

      {/* 开屏覆盖层 — 结束后淡出 */}
      {showSplash && bootState === 'splash' && (
        <SplashScreen
          speed={openingSpeed}
          onComplete={() => {
            setBootState('ready')
            setShowSplash(false)
          }}
        />
      )}

      {/* 退出覆盖层 — 整个界面渐变为黑色 */}
      {exiting && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: '#000',
            opacity: 0,
            animation: 'exitFadeIn 1s ease forwards',
            pointerEvents: 'none'
          }}
        />
      )}
      <style>{`
        @keyframes exitFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  )
}

export default App
