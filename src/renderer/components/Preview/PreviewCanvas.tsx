import { useEffect, useRef, useCallback, useState } from 'react'
import * as PIXI from 'pixi.js'
import { PixiRenderer, VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../../engine/render/PixiRenderer'
import { DialogBox } from '../../engine/render/DialogBox'
import { ChoicePanel, ChoiceStyle } from '../../engine/render/ChoicePanel'
import { Runtime } from '../../engine/runtime/Runtime'
import { parseScript } from '../../engine/parser/index'
import { useProjectStore } from '../../store/projectStore'
import { usePreviewStore } from '../../store/previewStore'

/** 全屏模式下画面与屏幕边缘的间距（设为 0 即无间距，完全填充屏幕） */
const FULLSCREEN_MARGIN = 0

interface CanvasRect {
  width: number
  height: number
}

/**
 * 根据容器尺寸计算 Canvas 等比例缩放后的实际 CSS 尺寸（contain 模式）
 */
function computeCanvasRect(containerW: number, containerH: number): CanvasRect {
  const scale = Math.min(containerW / VIRTUAL_WIDTH, containerH / VIRTUAL_HEIGHT)
  return {
    width: Math.round(VIRTUAL_WIDTH * scale),
    height: Math.round(VIRTUAL_HEIGHT * scale)
  }
}

/**
 * 从文件加载 JSON 样式配置
 * 支持 style.json 中的 // 注释
 */
async function loadStyleFile(relativePath: string): Promise<Record<string, unknown> | undefined> {
  if (!window.electronAPI) return undefined
  try {
    const appPath = await window.electronAPI.getAppPath()
    const stylePath = `${appPath}/${relativePath}`
    const content = await window.electronAPI.readFile(stylePath)
    // 去掉 // 注释后再解析
    const cleaned = content.replace(/\/\/.*$/gm, '')
    return JSON.parse(cleaned)
  } catch {
    return undefined
  }
}

function loadDialogStyle(): Promise<Record<string, unknown> | undefined> {
  return loadStyleFile('assets/template/dialog/style.json')
}

function loadChoiceStyle(): Promise<Record<string, unknown> | undefined> {
  return loadStyleFile('assets/template/choice/style.json')
}

/**
 * PixiJS 预览画布组件
 * 所有演出相关 UI（对话框、选项）直接在 PixiJS 舞台上绘制，不使用 React DOM 覆盖层
 */
export function PreviewCanvas({ isFullscreen: propIsFullscreen }: { isFullscreen?: boolean }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PixiRenderer | null>(null)
  const runtimeRef = useRef<Runtime | null>(null)
  const dialogBoxRef = useRef<DialogBox | null>(null)
  const choicePanelRef = useRef<ChoicePanel | null>(null)
  /** 是否在对话框中按下方向键（防止与 pointerdown 竞争） */
  const navigateBackRef = useRef(false)
  const stageClickHandlerRef = useRef<(() => void) | null>(null)
  const keydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null)
  /** 演出区域是否获得焦点（仅有焦点时才响应键盘/鼠标事件，避免干扰编辑器输入） */
  const previewFocusedRef = useRef(false)
  const { content } = useProjectStore()
  const { isRunning, autoMode, setRunning, addLog, clearLogs, setAutoMode } = usePreviewStore()

  const [mouseCoords, setMouseCoords] = useState<{ x: number; y: number } | null>(null)
  const [, setCanvasRect] = useState<CanvasRect>({ width: 1920, height: 1080 })

  // 全屏状态变化时自动隐藏/显示原生菜单栏和演出区域边界
  useEffect(() => {
    const fs = !!document.fullscreenElement
    if (window.electronAPI) {
      window.electronAPI.setMenuBarVisible(!fs)
    }
    rendererRef.current?.setBorderVisible(!fs)
  }, [propIsFullscreen])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const isFs = !!document.fullscreenElement
    const m = isFs ? FULLSCREEN_MARGIN : 0
    const useW = rect.width - m * 2
    const useH = rect.height - m * 2

    // 使用和 resize 一致的尺寸计算 Canvas Rect
    const cr = computeCanvasRect(useW, useH)
    const scale = cr.width / VIRTUAL_WIDTH

    // Canvas 左上角相对于 container 的偏移（canvas 居中）
    const canvasLeft = rect.left + (useW - cr.width) / 2 + m
    const canvasTop = rect.top + (useH - cr.height) / 2 + m

    // Mouse position within canvas (pixel coords)
    const relX = (e.clientX - canvasLeft) / scale
    const relY = (e.clientY - canvasTop) / scale

    // Convert to world coordinates (center origin, y-up)
    const worldX = Math.round(relX - VIRTUAL_WIDTH / 2)
    const worldY = Math.round(VIRTUAL_HEIGHT / 2 - relY)

    setMouseCoords({ x: worldX, y: worldY })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setMouseCoords(null)
  }, [])

  // Initialize PixiJS + 对话框 + 选项面板
  useEffect(() => {
    if (!containerRef.current) return

    // 防止 StrictMode 双次挂载导致的异步竞态问题
    let cancelled = false
    const renderer = new PixiRenderer()
    rendererRef.current = renderer

    renderer
      .init(containerRef.current)
      .then(async () => {
        if (cancelled) return

        // Adjust CSS scale to match actual container dimensions
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect()
          const m = !!document.fullscreenElement ? FULLSCREEN_MARGIN : 0
          renderer.resize(rect.width - m * 2, rect.height - m * 2)
          setCanvasRect(computeCanvasRect(rect.width - m * 2, rect.height - m * 2))
        }

        // 非全屏编辑模式显示16:9演出区域边界
        renderer.setBorderVisible(true)

        const app = renderer.getApp()
        const sceneContainer = renderer.getSceneContainer()
        const runtime = new Runtime(app, sceneContainer)
        runtimeRef.current = runtime

        runtime.onLog = (msg) => addLog(msg)
        runtime.onError = (err) => addLog(err, 'error')
        runtime.onStateChange = (running) => setRunning(running)

        // 加载对话框样式
        const dialogStyle = await loadDialogStyle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dialogBox = new DialogBox(app, dialogStyle as any)
        dialogBoxRef.current = dialogBox

        // 加载选项样式
        const choiceStyle = await loadChoiceStyle()
        const choicePanel = new ChoicePanel(app, choiceStyle as Partial<ChoiceStyle>)
        choicePanelRef.current = choicePanel

        // 警告回调
        runtime.onWarning = (msg) => addLog(msg, 'warning')

        // 对话回调：使用 PixiJS 对话框代替 React DOM 覆盖层，支持 auto 模式自动推进
        runtime.onDialogue = async (speaker, text, avator) => {
          const state = usePreviewStore.getState()
          if (state.autoMode) {
            // auto 模式：根据文本长度计算自动推进延迟
            const delay = 2000 + Math.max(500, text.length * 40)
            await dialogBox.show(speaker, text, avator, delay)
          } else {
            await dialogBox.show(speaker, text, avator)
          }
        }

        // 选项回调：使用 PixiJS 选项面板代替 React DOM 覆盖层
        runtime.onChoice = async (choices) => {
          await choicePanel.show(choices)
        }

        // 对话框显隐
        runtime.onSpeechVisibility = (visible) => {
          dialogBox.setVisible(visible)
        }

        // 统一舞台点击交互：对话框推进优先，其次 pause() 放行
        app.stage.eventMode = 'static'
        // 设置 hitArea 覆盖整个虚拟舞台，确保空白区域也能响应鼠标点击
        app.stage.hitArea = new PIXI.Rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
        const stageClickHandler = (): void => {
          // 点击舞台时自动让演出容器获得焦点，确保后续键盘事件能被正确处理
          if (containerRef.current && !previewFocusedRef.current) {
            containerRef.current.focus()
          }
          // 方向键导航处理过的不重复处理
          if (navigateBackRef.current) {
            navigateBackRef.current = false
            return
          }
          if (dialogBox.isDialogShowing()) {
            dialogBox.advance()
          } else {
            runtime.userClickResolve?.()
            runtime.userClickResolve = null
          }
        }
        stageClickHandlerRef.current = stageClickHandler
        app.stage.on('pointerdown', stageClickHandler)

        // 键盘交互：Space / 下方向 → 推进；上方向 → 回到上一步
        // 仅在演出区域拥有焦点时生效，防止干扰编辑器输入
        const handleKeyDown = (e: KeyboardEvent): void => {
          if (!previewFocusedRef.current && !document.fullscreenElement) return
          if (e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault()
            if (dialogBox.isDialogShowing()) {
              dialogBox.advance()
            } else {
              runtime.userClickResolve?.()
              runtime.userClickResolve = null
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (dialogBox.isDialogShowing()) {
              navigateBackRef.current = true  // 阻止紧随的 pointerdown
              dialogBox.goBack()
            }
          }
        }
        keydownHandlerRef.current = handleKeyDown
        window.addEventListener('keydown', handleKeyDown)

        // 鼠标滚轮交互（视觉小说标准：向上回看历史，向下前进浏览）
        // 仅在演出区域拥有焦点或全屏时生效
        const handleWheel = (e: WheelEvent): void => {
          if (!previewFocusedRef.current && !document.fullscreenElement) return
          if (!dialogBox.isDialogShowing()) return
          if (e.deltaY < 0) {
            // 滚轮向上 → 回退到上一条对话
            navigateBackRef.current = true  // 阻止紧随的 pointerdown
            dialogBox.goBack()
          } else if (e.deltaY > 0 && dialogBox.isBrowsingHistory()) {
            // 滚轮向下 → 仅在历史浏览中前进，不 resolve Promise
            dialogBox.advanceHistory()
          }
        }
        wheelHandlerRef.current = handleWheel
        if (containerRef.current) {
          containerRef.current.addEventListener('wheel', handleWheel, { passive: true })
        }

        // 脚本结束/中断时自动重置 UI（隐藏对话框和选项面板）
        // 使用 dialogBox.hide()（而非 setVisible(false)）确保清理挂起的对话 Promise、
        // autoClickTimer 和 pointerdown 交互状态，防止下次执行时出现状态残留
        runtime.onResetUI = () => {
          dialogBox.hide()
          choicePanel.hide()
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        addLog(`渲染引擎初始化失败: ${msg}`, 'error')
        addLog('请确保 Electron 环境支持 PixiJS 运行', 'error')
      })

    return () => {
      cancelled = true
      // 先停止 Runtime 释放所有资源（音频、GSAP、场景对象），再销毁 PIXI
      runtimeRef.current?.destroy()
      dialogBoxRef.current?.destroy()
      choicePanelRef.current?.destroy()
      const app = rendererRef.current?.getApp()
      if (app && stageClickHandlerRef.current) {
        app.stage.off('pointerdown', stageClickHandlerRef.current)
        stageClickHandlerRef.current = null
      }
      if (keydownHandlerRef.current) {
        window.removeEventListener('keydown', keydownHandlerRef.current)
        keydownHandlerRef.current = null
      }
      if (wheelHandlerRef.current && containerRef.current) {
        containerRef.current.removeEventListener('wheel', wheelHandlerRef.current)
        wheelHandlerRef.current = null
      }
      renderer.destroy()
      rendererRef.current = null
      runtimeRef.current = null
      dialogBoxRef.current = null
      choicePanelRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle resize (窗口大小变化 + 全屏切换)
  useEffect(() => {
    const doResize = (): void => {
      if (!rendererRef.current || !containerRef.current) return
      // 始终读取容器的实际边界，兼容全屏/非全屏两种模式
      const rect = containerRef.current.getBoundingClientRect()
      const isFs = !!document.fullscreenElement
      const m = isFs ? FULLSCREEN_MARGIN : 0
      rendererRef.current.resize(rect.width - m * 2, rect.height - m * 2)
      setCanvasRect(computeCanvasRect(rect.width - m * 2, rect.height - m * 2))
    }

    window.addEventListener('resize', doResize)
    document.addEventListener('fullscreenchange', doResize)
    return () => {
      window.removeEventListener('resize', doResize)
      document.removeEventListener('fullscreenchange', doResize)
    }
  }, [])

  // F11 切换全屏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault()
        if (document.fullscreenElement) {
          document.exitFullscreen()
        } else {
          document.documentElement.requestFullscreen()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleRun = useCallback(async () => {
    if (!runtimeRef.current) return

    // 清除上次执行的错误状态
    useProjectStore.getState().setExecutionError(null)
    clearLogs()
    addLog('解析脚本...')

    const result = parseScript(content)
    if (!result.success) {
      addLog(`解析失败: ${result.error}`, 'error')
      // 标记解析错误行为编辑器红色高亮
      if (result.errorLine > 0) {
        useProjectStore.getState().setExecutionLine(result.errorLine)
        useProjectStore.getState().setExecutionError(result.error)
      }
      return
    }

    addLog('开始执行...')

    const runtime = runtimeRef.current
    // 设置执行位置回调 → 写入 store 供编辑器行高亮使用
    runtime.onExecutionPosition = (line) => {
      useProjectStore.getState().setExecutionLine(line)
    }
    // 设置执行错误回调 → 记录错误信息并转为红色高亮
    runtime.onExecutionError = (line, msg) => {
      useProjectStore.getState().setExecutionError(msg)
      addLog(`[错误] (第 ${line} 行): ${msg}`, 'error')
      // executionLine 已在 onExecutionPosition 中设为 line，保持红色高亮
    }

    // 传入 lineMap 以便执行时能获知每条语句的行号
    await runtime.execute(result.ast, result.lineMap)

    // 执行结束后判断：有错误时保留错误行高亮，无错误时清除高亮
    const state = useProjectStore.getState()
    if (state.executionError) {
      // 错误已由 onExecutionError 记录，行高亮保留在错误行
    } else {
      state.setExecutionLine(null)
      addLog('执行完毕')
    }
  }, [content, clearLogs, addLog])

  const handleStop = useCallback(() => {
    if (runtimeRef.current) {
      runtimeRef.current.stop()
      // 清除编辑器行高亮和错误状态
      useProjectStore.getState().setExecutionLine(null)
      useProjectStore.getState().setExecutionError(null)
    }
  }, [])

  // Expose run/stop handlers to parent
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__udseenRun = handleRun
    ;(window as unknown as Record<string, unknown>).__udseenStop = handleStop
    return () => {
      delete (window as unknown as Record<string, unknown>).__udseenRun
      delete (window as unknown as Record<string, unknown>).__udseenStop
    }
  }, [handleRun, handleStop])

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', background: '#1a1a2e', overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* PixiJS 舞台容器——对话框和选项按钮直接在 PixiJS Canvas 上绘制 */}
      {/* tabIndex + focus/blur 确保仅在演出区域获得焦点时才响应键盘/滚轮事件，避免干扰编辑器输入 */}
      <div
        ref={containerRef}
        tabIndex={-1}
        style={{ position: 'relative', width: '100%', height: '100%', outline: 'none' }}
        onFocus={() => { previewFocusedRef.current = true }}
        onBlur={() => { previewFocusedRef.current = false }}
      >
        {/* PixiJS Canvas 由 PixiRenderer.init() 在此 div 内创建 */}

        {/* 注意：对话框(DialogBox)和选项按钮(ChoicePanel)不再使用 React DOM 覆盖层，
            而是在 PixiJS 的 app.stage 上直接绘制 PIXI Graphics + PIXI Text，
            和其他角色/背景精灵一样作为舞台资产渲染。 */}
      </div>

      {/* Mouse coordinates display (全屏时隐藏) */}
      {!propIsFullscreen && mouseCoords && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            padding: '4px 10px',
            background: 'rgba(0,0,0,0.7)',
            color: '#aaa',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
            zIndex: 50,
            pointerEvents: 'none'
          }}
        >
          (x={mouseCoords.x}, y={mouseCoords.y})
        </div>
      )}

      {/* Auto mode button (全屏时隐藏) */}
      {!propIsFullscreen && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setAutoMode(!autoMode)
          }}
          style={{
            position: 'absolute',
            top: 4,
            right: 28,
            padding: '4px 8px',
            background: autoMode ? 'rgba(255, 204, 0, 0.7)' : 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: autoMode ? '#000' : '#ccc',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            zIndex: 50,
            lineHeight: 1,
            fontWeight: autoMode ? 'bold' : 'normal'
          }}
          title={autoMode ? '关闭自动播放' : '自动播放'}
        >
          AUTO{autoMode ? ' ON' : ''}
        </button>
      )}

      {/* Fullscreen button (全屏时隐藏，按 F11 退出) */}
      {!propIsFullscreen && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (document.fullscreenElement) {
              document.exitFullscreen()
            } else {
              document.documentElement.requestFullscreen()
            }
          }}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#ccc',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            zIndex: 50,
            lineHeight: 1
          }}
          title="全屏播放"
        >
          ⛶
        </button>
      )}

      {/* Running Indicator (全屏时隐藏) */}
      {!propIsFullscreen && isRunning && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '4px 12px',
            background: 'rgba(0,200,0,0.5)',
            color: '#fff',
            borderRadius: 4,
            fontSize: 12,
            zIndex: 100
          }}
        >
          ● 运行中
        </div>
      )}
    </div>
  )
}
