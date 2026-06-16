import { useEffect, useRef, useCallback, useState } from 'react'
import * as PIXI from 'pixi.js'
import { PixiRenderer, VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../../engine/render/PixiRenderer'
import { StageSettingsPanel } from '../StageSettings/StageSettingsPanel'
import { DialogueHistoryPanel } from '../DialogueHistory/DialogueHistoryPanel'
import { DialogBox, HistoryEntry } from '../../engine/render/DialogBox'
import { ChoicePanel, ChoiceStyle } from '../../engine/render/ChoicePanel'
import { ControlBar, ControlBarStyle } from '../../engine/render/ControlBar'
import { Runtime } from '../../engine/runtime/Runtime'
import { parseScript } from '../../engine/parser/index'
import { useProjectStore } from '../../store/projectStore'
import { usePreviewStore } from '../../store/previewStore'
import { useSettingsStore } from '../../store/settingsStore'

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

function loadControlBarStyle(): Promise<Record<string, unknown> | undefined> {
  return loadStyleFile('assets/template/controlbar/style.json')
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
  const controlBarRef = useRef<ControlBar | null>(null)
  /** 是否在对话框中按下方向键（防止与 pointerdown 竞争） */
  const navigateBackRef = useRef(false)
  const stageClickHandlerRef = useRef<((e: PIXI.FederatedPointerEvent) => void) | null>(null)
  const stageRightClickHandlerRef = useRef<(() => void) | null>(null)
  /** 设置面板是否已打开（用于键盘事件屏蔽） */
  const stageSettingsOpenRef = useRef(false)
  /** 对话历史面板是否已打开（用于键盘事件屏蔽） */
  const showDialogueHistoryRef = useRef(false)
  const keydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  const keyupHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null)
  const contextMenuHandlerRef = useRef<((e: Event) => void) | null>(null)
  /** 演出区域是否获得焦点（仅有焦点时才响应键盘/鼠标事件，避免干扰编辑器输入） */
  const previewFocusedRef = useRef(false)
  /** 焦点状态用于触发重渲染（边界高亮） */
  const [previewFocused, setPreviewFocused] = useState(false)
  const { content, cameraOffsetX, cameraOffsetY, calibrationOffsetX, calibrationOffsetY } = useProjectStore()
  // 精确 selector：每个字段独立订阅，避免 logs 变化时无关字段触发重渲染
  const isRunning = usePreviewStore(s => s.isRunning)
  const autoMode = usePreviewStore(s => s.autoMode)
  const logs = usePreviewStore(s => s.logs)
  const setRunning = usePreviewStore(s => s.setRunning)
  const addLog = usePreviewStore(s => s.addLog)
  const clearLogs = usePreviewStore(s => s.clearLogs)
  const textSpeed = useSettingsStore(s => s.textSpeed)
  const uiVisible = usePreviewStore(s => s.uiVisible)
  const setUiVisible = usePreviewStore(s => s.setUiVisible)

  // mouseCoords 使用 useRef 存储最新值 + rAF 节流 setState，避免 mousemove 高频 setState 触发重渲染
  const mouseCoordsRef = useRef({ x: 0, y: 0, isInside: false })
  const [mouseCoords, setMouseCoords] = useState<{ x: number; y: number; isInside: boolean }>({ x: 0, y: 0, isInside: false })
  const mouseRafRef = useRef<number | null>(null)
  const [, setCanvasRect] = useState<CanvasRect>({ width: 1920, height: 1080 })
  const sceneContainerRef = useRef<PIXI.Container | null>(null)
  /** 调试覆盖层 canvas 位置跟踪，确保调试面板始终在画布范围内 */
  const debugOverlayRef = useRef<HTMLDivElement>(null)

  /** F3 调试覆盖层开关 */
  const [showDebug, setShowDebug] = useState(false)
  /** 舞台设置面板开关（Esc 切换，全屏下使用） */
  const [showStageSettings, setShowStageSettings] = useState(false)
  const [settingsLeaving, setSettingsLeaving] = useState(false)
  /** 对话历史面板开关（鼠标滚轮上滑打开） */
  const [showDialogueHistory, setShowDialogueHistory] = useState(false)
  const [historyLeaving, setHistoryLeaving] = useState(false)
  /** 调试覆盖层 FPS 计数器（3秒滑动平均，每秒刷新） */
  const [debugFps, setDebugFps] = useState(0)
  /** 调试覆盖层 FPS 计数器（10秒平均，每10秒刷新） */
  const [debugFps10, setDebugFps10] = useState(0)
  /** 调试覆盖层活跃资源信息 */
  const [activeResources, setActiveResources] = useState<{ sceneObjects: string[]; audioObjects: string[]; filterObjects: string[] }>({ sceneObjects: [], audioObjects: [], filterObjects: [] })
  /** 系统资源（CPU + 内存），仅 debug 开启时轮询 */
  const [systemResources, setSystemResources] = useState<SystemResources | null>(null)
  /** GPU 信息，仅 debug 开启时轮询 */
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null)
  /** 底部控制栏展开状态（鼠标移动到底部时展开） */
  const [controlBarExpanded, setControlBarExpanded] = useState(false)

  // 全屏状态变化时自动隐藏/显示原生菜单栏和演出区域边界
  useEffect(() => {
    const fs = !!document.fullscreenElement
    const adjust = async (): Promise<void> => {
      if (window.electronAPI) {
        await window.electronAPI.setMenuBarVisible(!fs)
      }
      rendererRef.current?.setBorderVisible(!fs)
      // 使用双 rAF 延迟触发 resize，确保菜单栏显隐后的浏览器布局已稳定
      // 避免在过渡状态下读取错误的容器尺寸导致 Canvas 偏移
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'))
        })
      })
    }
    adjust()
  }, [propIsFullscreen])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return
    // 直接从 Canvas DOM 元素读取真实位置，避免计算值与 CSS 实际定位的偏差
    const canvasEl = containerRef.current.querySelector('canvas')
    if (!canvasEl) return
    const canvasRect = canvasEl.getBoundingClientRect()
    const r = rendererRef.current
    if (!r) return

    // 从 renderer 实例获取当前实际虚拟尺寸（而非重新计算 vh），
    // 确保鼠标坐标换算与渲染器内部状态严格一致
    const vw = r.getVirtualWidth()
    const vh = r.getVirtualHeight()
    const scale = canvasRect.width / vw

    // Mouse position within canvas (pixel coords, 相对于 canvas 左上角)
    const relX = (e.clientX - canvasRect.left) / scale
    const relY = (e.clientY - canvasRect.top) / scale

    // 判断是否在 Canvas 范围内
    const isInside = relX >= 0 && relX <= vw && relY >= 0 && relY <= vh

    // Convert to world coordinates (center origin, y-up)
    const worldX = Math.round(relX - vw / 2)
    const worldY = Math.round(vh / 2 - relY)

    // 写入 ref（即时更新最新值），再通过 rAF 节流同步到 React state（最多每帧一次）
    mouseCoordsRef.current = { x: worldX, y: worldY, isInside }
    if (mouseRafRef.current === null) {
      mouseRafRef.current = requestAnimationFrame(() => {
        mouseRafRef.current = null
        const { x, y, isInside } = mouseCoordsRef.current
        setMouseCoords({ x, y, isInside })
      })
    }

    // 底部控制栏展开检测：鼠标在虚拟舞台底部 80px 内时展开
    if (isInside) {
      const bottomThreshold = vh - 80
      setControlBarExpanded(relY >= bottomThreshold)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    mouseCoordsRef.current = { x: 0, y: 0, isInside: false }
    setMouseCoords({ x: 0, y: 0, isInside: false })
    setControlBarExpanded(false)
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
          const isFs = !!document.fullscreenElement
          const m = isFs ? FULLSCREEN_MARGIN : 0
          const containerW = rect.width - m * 2
          const containerH = rect.height - m * 2
          const st = useProjectStore.getState()
          // 校准偏移在 resize 前存入，resize 内部会通过 _applyCalibrationTransform 应用
          renderer.setCalibrationOffset(st.calibrationOffsetX, st.calibrationOffsetY)
          if (isFs) {
            renderer.resizeFullscreen(containerW, containerH)
          } else {
            renderer.resize(containerW, containerH)
          }
          setCanvasRect(computeCanvasRect(containerW, containerH))
        }

        // 非全屏编辑模式显示16:9演出区域边界
        renderer.setBorderVisible(true)

        const app = renderer.getApp()
        const sceneContainer = renderer.getSceneContainer()
        sceneContainerRef.current = sceneContainer

        // 从设置同步 FPS 限制
        const settingsState = useSettingsStore.getState()
        if (settingsState.fpsLimit > 0) {
          app.ticker.maxFPS = settingsState.fpsLimit
        }

        // 同步自动播放配置
        usePreviewStore.getState().setAutoPlayConfig({
          charDelay: settingsState.autoPlayCharDelay,
          minDelay: settingsState.autoPlayMinDelay,
          audioExtraDelay: settingsState.audioExtraDelay
        })

        const runtime = new Runtime(app, sceneContainer)
        runtimeRef.current = runtime

        // 配置资源解析器：传递公共目录与虚拟路径
        try {
          const publicDir = await window.electronAPI?.getPublicDir?.()
          const virtualPaths = settingsState.virtualPaths
            .filter((v) => v.valid)
            .map((v) => v.path.replace(/\\/g, '/'))
          if (publicDir) {
            runtime.assetResolver.configure(publicDir.replace(/\\/g, '/'), virtualPaths)
          }
        } catch {
          // 配置失败时使用默认路径
        }

        runtime.onLog = (msg) => addLog(msg)
        runtime.onError = (err) => addLog(err, 'error')

        // 加载对话框样式
        const dialogStyle = await loadDialogStyle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dialogBox = new DialogBox(app, dialogStyle as any)
        dialogBox.setTypingSpeed(settingsState.textSpeed)
        dialogBoxRef.current = dialogBox

        // 加载选项样式
        const choiceStyle = await loadChoiceStyle()
        const choicePanel = new ChoicePanel(app, choiceStyle as Partial<ChoiceStyle>)
        choicePanelRef.current = choicePanel

        // 加载控制栏样式
        const controlBarStyle = await loadControlBarStyle()
        // 底部控制栏（PIXI 舞台内渲染，全屏下也可点击）
        // 作为模板组件，仅剧本执行时显示
        const controlBar = new ControlBar(app, controlBarStyle as Partial<ControlBarStyle>)
        controlBarRef.current = controlBar
        // 自动播放切换回调：开启时立即推进当前对话开始倒计时
        controlBar.onAutoToggle = (auto) => {
          if (auto && dialogBox.isDialogShowing()) {
            dialogBox.advance()
          }
        }

        // 运行态变化：确保 controlBar 已初始化后再注册（防止 StrictMode 下异步间隙卸载时访问 TDZ）
        runtime.onStateChange = (running) => {
          setRunning(running)
          // 控制栏不再随运行自动显示，由鼠标移动到舞台底部展开
          if (!running) {
            controlBar.hide()
          }
        }

        // 警告回调
        runtime.onWarning = (msg) => addLog(msg, 'warning')

        // 对话回调：使用 PixiJS 对话框代替 React DOM 覆盖层，支持 auto 模式自动推进和跳过模式
        runtime.onDialogue = async (speaker, text, avator, audioDurationMs, audioPath) => {
          const canShow = !runtime.speechDisabled

          const state = usePreviewStore.getState()
          if (runtime.skipMode) {
            // 跳过模式：极短延迟即可
            await dialogBox.show(speaker, text, avator, 1, undefined, canShow, audioPath)
          } else if (state.autoMode) {
            const cfg = state.autoPlayConfig
            // auto 模式：有音频则延迟 = 音频时长 + audioExtraDelay，否则每3个字符 = charDelay（最少 minDelay）
            const delay = audioDurationMs && audioDurationMs > 0
              ? audioDurationMs + cfg.audioExtraDelay
              : Math.max(cfg.minDelay, Math.ceil(text.length / 3) * cfg.charDelay)
            // 进度环仍以音频时长驱动，不受 extraDelay 影响
            await dialogBox.show(speaker, text, avator, delay, audioDurationMs, canShow, audioPath)
          } else {
            // 非 auto 模式：有音频时显示进度环同步音频，无音频时不显示
            await dialogBox.show(speaker, text, avator, undefined, audioDurationMs, canShow, audioPath)
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
        const stageClickHandler = (e: PIXI.FederatedPointerEvent): void => {
          // 仅响应左键（button 0），避免右键触发对话推进
          if (e.button !== 0) return
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

        // 右键仅控制 UI 显隐（不推进对话、不打开系统菜单）
        const stageRightClickHandler = (): void => {
          const st = usePreviewStore.getState()
          st.setUiVisible(!st.uiVisible)
        }
        stageRightClickHandlerRef.current = stageRightClickHandler
        app.stage.on('rightdown', stageRightClickHandler)

        // 键盘交互：Ctrl（按住）→ 跳过模式；Space / 下方向 → 推进；上方向 → 回到上一步
        // Esc → 打开/关闭舞台设置（再次 Esc 返回游戏）；设置打开时屏蔽游戏按键
        // 仅在演出区域拥有焦点时生效，防止干扰编辑器输入
        const handleKeyDown = (e: KeyboardEvent): void => {
          if (!previewFocusedRef.current && !document.fullscreenElement && !showDialogueHistoryRef.current && !stageSettingsOpenRef.current) return

          // 对话历史面板打开时，Esc 关闭面板（带退出动画）
          if (e.key === 'Escape') {
            if (showDialogueHistoryRef.current) {
              e.preventDefault()
              if (!historyLeavingRef.current) {
                historyLeavingRef.current = true
                setHistoryLeaving(true)
                setTimeout(() => {
                  showDialogueHistoryRef.current = false
                  historyLeavingRef.current = false
                  setShowDialogueHistory(false)
                  setHistoryLeaving(false)
                }, 200)
              }
              return
            }
            if (stageSettingsOpenRef.current) {
              e.preventDefault()
              if (!settingsLeaving) {
                setSettingsLeaving(true)
                setTimeout(() => {
                  stageSettingsOpenRef.current = false
                  setShowStageSettings(false)
                  setSettingsLeaving(false)
                }, 200)
              }
              return
            }
            e.preventDefault()
            stageSettingsOpenRef.current = true
            setShowStageSettings(true)
            return
          }

          // 设置面板打开时，屏蔽所有游戏按键
          if (stageSettingsOpenRef.current) return

          // Ctrl 按住 → 跳过模式（忽略等待，快速执行）
          if (e.key === 'Control') {
            e.preventDefault()
            runtime.skipMode = true
            return
          }
          if (e.key.toLowerCase() === 'a') {
            // A 键切换自动播放模式
            e.preventDefault()
            const st = usePreviewStore.getState()
            const newAuto = !st.autoMode
            st.setAutoMode(newAuto)
            // 开启时立即推进当前对话
            if (newAuto && dialogBox.isDialogShowing()) {
              dialogBox.advance()
            }
            return
          }
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
          } else if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') || (e.ctrlKey && e.key === 'F5')) {
            // Ctrl+Shift+B / Ctrl+F5 → 快速重启（停止+重新执行）
            e.preventDefault()
            ;(window as unknown as Record<string, (() => void) | undefined>).__udseenRestart?.()
          }
        }
        keydownHandlerRef.current = handleKeyDown
        window.addEventListener('keydown', handleKeyDown)

        // Ctrl 松开时退出跳过模式
        const handleKeyUp = (e: KeyboardEvent): void => {
          if ((!previewFocusedRef.current && !document.fullscreenElement) || !runtimeRef.current) return
          // 菜单打开时忽略按键
          if (stageSettingsOpenRef.current || showDialogueHistoryRef.current) return
          if (e.key === 'Control') {
            runtimeRef.current.skipMode = false
          }
        }
        keyupHandlerRef.current = handleKeyUp
        window.addEventListener('keyup', handleKeyUp)

        // 鼠标滚轮交互：滚轮上滑打开对话历史面板
        // 仅在演出区域拥有焦点或全屏时生效
        const handleWheel = (e: WheelEvent): void => {
          if (!previewFocusedRef.current && !document.fullscreenElement) return
          if (e.deltaY < 0) {
            // 滚轮向上 → 打开对话历史面板（如果尚未打开）
            if (!showDialogueHistoryRef.current) {
              historyLeavingRef.current = false
              showDialogueHistoryRef.current = true
              setShowDialogueHistory(true)
            }
          }
        }
        wheelHandlerRef.current = handleWheel
        if (containerRef.current) {
          containerRef.current.addEventListener('wheel', handleWheel, { passive: true })
        }

        // 阻止舞台上的浏览器默认右键菜单，统一由 rightdown 处理
        const preventCtx = (e: Event): void => { e.preventDefault() }
        contextMenuHandlerRef.current = preventCtx
        if (containerRef.current) {
          containerRef.current.addEventListener('contextmenu', preventCtx)
        }

        // 脚本结束/中断时自动重置 UI（隐藏对话框和选项面板）
        // 使用 dialogBox.hide()（而非 setVisible(false)）确保清理挂起的对话 Promise、
        // autoClickTimer 和 pointerdown 交互状态，防止下次执行时出现状态残留
        runtime.onResetUI = () => {
          dialogBox.hide()
          choicePanel.hide()
          controlBar.hide()
          usePreviewStore.getState().setUiVisible(true)
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
      controlBarRef.current?.destroy()
      const app = rendererRef.current?.getApp()
      if (app && stageClickHandlerRef.current) {
        app.stage.off('pointerdown', stageClickHandlerRef.current)
        stageClickHandlerRef.current = null
      }
      if (app && stageRightClickHandlerRef.current) {
        app.stage.off('rightdown', stageRightClickHandlerRef.current)
        stageRightClickHandlerRef.current = null
      }
      if (keydownHandlerRef.current) {
        window.removeEventListener('keydown', keydownHandlerRef.current)
        keydownHandlerRef.current = null
      }
      if (keyupHandlerRef.current) {
        window.removeEventListener('keyup', keyupHandlerRef.current)
        keyupHandlerRef.current = null
      }
      if (wheelHandlerRef.current && containerRef.current) {
        containerRef.current.removeEventListener('wheel', wheelHandlerRef.current)
        wheelHandlerRef.current = null
      }
      if (contextMenuHandlerRef.current && containerRef.current) {
        containerRef.current.removeEventListener('contextmenu', contextMenuHandlerRef.current)
        contextMenuHandlerRef.current = null
      }
      if (mouseRafRef.current !== null) {
        cancelAnimationFrame(mouseRafRef.current)
        mouseRafRef.current = null
      }
      renderer.destroy()
      rendererRef.current = null
      runtimeRef.current = null
      dialogBoxRef.current = null
      choicePanelRef.current = null
      sceneContainerRef.current = null
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
      const containerW = rect.width - m * 2
      const containerH = rect.height - m * 2
      const st = useProjectStore.getState()
      // 坐标系校准偏移通过 CSS transform 作用在 canvas 元素上，不依赖 sceneContainer
      rendererRef.current.setCalibrationOffset(st.calibrationOffsetX, st.calibrationOffsetY)

      if (isFs) {
        rendererRef.current.resizeFullscreen(containerW, containerH)
      } else {
        rendererRef.current.resize(containerW, containerH)
      }

      // 调试：输出实际渲染状态
      const canvasEl = containerRef.current.querySelector('canvas')
      const cr = canvasEl?.getBoundingClientRect()
      console.debug('[PreviewCanvas] doResize:', {
        isFs,
        containerW: Math.round(containerW),
        containerH: Math.round(containerH),
        cssW: cr?.width,
        cssH: cr?.height,
        vh: rendererRef.current.getVirtualHeight(),
        vw: rendererRef.current.getVirtualWidth()
      })

      setCanvasRect(computeCanvasRect(containerW, containerH))
    }

    window.addEventListener('resize', doResize)
    doResize()  // 立即执行一次，确保 cameraHeight 变化时即时更新
    return () => {
      window.removeEventListener('resize', doResize)
    }
  }, [cameraOffsetX, cameraOffsetY, calibrationOffsetX, calibrationOffsetY])

  // 调试覆盖层 canvas 位置同步：使所有调试面板始终位于 canvas 边界内部，
  // 避免在 canvas 居中留空（letterbox）时面板出现在空白区域
  useEffect(() => {
    const syncDebugOverlay = (): void => {
      const overlay = debugOverlayRef.current
      if (!overlay) return
      const canvas = containerRef.current?.querySelector('canvas')
      if (!canvas) return
      const parent = overlay.parentElement
      if (!parent) return
      const canvasRect = canvas.getBoundingClientRect()
      const parentRect = parent.getBoundingClientRect()
      overlay.style.left = `${canvasRect.left - parentRect.left}px`
      overlay.style.top = `${canvasRect.top - parentRect.top}px`
      overlay.style.width = `${canvasRect.width}px`
      overlay.style.height = `${canvasRect.height}px`
    }
    if (!showDebug) return
    // 等待一帧确保布局已完成
    requestAnimationFrame(() => requestAnimationFrame(syncDebugOverlay))
    window.addEventListener('resize', syncDebugOverlay)
    return () => window.removeEventListener('resize', syncDebugOverlay)
  }, [showDebug, cameraOffsetX, cameraOffsetY, calibrationOffsetX, calibrationOffsetY])

  // 自动播放开启时，如果当前有对话正在等待，立即推进到下一句
  // 这样 auto 模式一开启就开始倒计时播放，而不是等待用户手动点击第一下
  useEffect(() => {
    if (autoMode && dialogBoxRef.current?.isDialogShowing()) {
      dialogBoxRef.current.advance()
    }
  }, [autoMode])

  // 同步 showStageSettings / showDialogueHistory 状态到 ref
  useEffect(() => {
    stageSettingsOpenRef.current = showStageSettings
  }, [showStageSettings])
  useEffect(() => {
    showDialogueHistoryRef.current = showDialogueHistory
  }, [showDialogueHistory])

  // leaving refs 用于键盘事件屏蔽
  const historyLeavingRef = useRef(false)

  // UI 显隐变动时的同步 effect（右键或 store 外部修改后生效）
  useEffect(() => {
    const db = dialogBoxRef.current
    const cp = choicePanelRef.current
    const cb = controlBarRef.current
    if (!db && !cp && !cb) return
    const st = usePreviewStore.getState()
    if (uiVisible) {
      db?.setVisible(st.dialogueVisible)
      cp?.setVisible(!!st.currentChoices)
      cb?.show()
    } else {
      db?.setVisible(false)
      cp?.setVisible(false)
      cb?.hide()
    }
  }, [uiVisible])

  // 底部控制栏展开/收起：鼠标移动到舞台底部时展开，移出底部区域时收起
  useEffect(() => {
    const cb = controlBarRef.current
    if (!cb) return
    if (controlBarExpanded && isRunning) {
      cb.show()
    } else if (!controlBarExpanded) {
      cb.hide()
    }
  }, [controlBarExpanded, isRunning])

  // F3 调试覆盖层开关（全局生效，不依赖焦点）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault()
        setShowDebug(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 调试覆盖层：约每秒采样一次 FPS，3 秒 / 10 秒滑动平均，同时采集活跃资源信息（仅开启时运行，节省性能）
  useEffect(() => {
    if (!showDebug) return
    let rafId: number | null = null
    let lastSampleTime = 0
    /** { fps, timestamp } 样本队列 */
    const samples: { fps: number; t: number }[] = []
    const SAMPLE_INTERVAL = 1000 // 每秒采样一次
    const WINDOW_3S = 3000
    const WINDOW_10S = 10000
    let last10sRefresh = 0

    const update = (): void => {
      const app = rendererRef.current?.getApp()
      if (app) {
        const now = performance.now()
        // 约每秒采集一个样本
        if (now - lastSampleTime >= SAMPLE_INTERVAL) {
          lastSampleTime = now
          samples.push({ fps: app.ticker.FPS, t: now })

          // 清理 3 秒窗口之外的样本
          const cutoff3 = now - WINDOW_3S
          while (samples.length > 0 && samples[0].t < cutoff3) {
            samples.shift()
          }
          // 3 秒平均（每秒更新）
          const sum3 = samples.reduce((a, s) => a + s.fps, 0)
          setDebugFps(Math.round(sum3 / samples.length))

          // 10 秒平均（每 10 秒更新一次显示值）
          if (now - last10sRefresh >= WINDOW_10S) {
            last10sRefresh = now
            // 用全量样本中处于 10 秒窗口内的数据计算
            const cutoff10 = now - WINDOW_10S
            const s10 = samples.filter(s => s.t >= cutoff10)
            // 如果不足 3 个样本则用全部
            if (s10.length >= 3) {
              setDebugFps10(Math.round(s10.reduce((a, b) => a + b.fps, 0) / s10.length))
            }
          }

          // 每秒同步采集活跃资源信息 + 系统资源（CPU/内存/GPU）
          const rt = runtimeRef.current
          if (rt) {
            setActiveResources(rt.getResourceInfo())
          }
          if (window.electronAPI?.getResourceUsage) {
            window.electronAPI.getResourceUsage().then(setSystemResources).catch(() => {})
          }
          if (window.electronAPI?.getGpuInfo) {
            window.electronAPI.getGpuInfo().then(setGpuInfo).catch(() => {})
          }
        }
      }
      rafId = requestAnimationFrame(update)
    }
    rafId = requestAnimationFrame(update)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [showDebug])

  // 全屏由 App.tsx 统一管理（F10=舞台全屏，F11=编辑器全屏）

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
    // 设置执行位置回调 → 写入 store 供编辑器行高亮使用，同时更新可视化卡片高亮
    runtime.onExecutionPosition = (line) => {
      const store = useProjectStore.getState()
      store.setExecutionLine(line)
      // 行号→块ID映射：如果存在 blockLineMap，取出对应的块ID用于卡片高亮
      const blockLineMap = store.blockLineMap
      if (blockLineMap) {
        const blockId = blockLineMap.get(line)
        store.setExecutionBlockId(blockId ?? null)
      }
    }
    // 设置执行错误回调 → 记录错误信息并转为红色高亮
    runtime.onExecutionError = (line, msg) => {
      useProjectStore.getState().setExecutionError(msg)
      addLog(`[错误] (第 ${line} 行): ${msg}`, 'error')
      // executionLine 已在 onExecutionPosition 中设为 line，保持红色高亮
    }

    // 传入 lineMap 以便执行时能获知每条语句的行号
    try {
      await runtime.execute(result.ast, result.lineMap)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`执行异常: ${msg}`, 'error')
    }

    // 执行结束后判断：有错误时保留错误行高亮，无错误时清除高亮
    const state = useProjectStore.getState()
    if (state.executionError) {
      // 错误已由 onExecutionError 记录，行高亮保留在错误行
    } else {
      state.setExecutionLine(null)
      state.setExecutionBlockId(null)
      addLog('执行完毕')
    }
  }, [content, clearLogs, addLog])

  const handleStop = useCallback(() => {
    if (runtimeRef.current) {
      runtimeRef.current.stop()
      // 清除对话历史
      dialogBoxRef.current?.clearHistory()
      // 清除编辑器行高亮、卡片高亮和错误状态
      useProjectStore.getState().setExecutionLine(null)
      useProjectStore.getState().setExecutionBlockId(null)
      useProjectStore.getState().setExecutionError(null)
    }
  }, [])

  /** 快速重启：停止当前执行后立即重新开始 */
  const handleRestart = useCallback(() => {
    handleStop()
    // 小延迟等待清理完成，再重新执行
    setTimeout(() => {
      ;(window as unknown as Record<string, (() => void) | undefined>).__udseenRun?.()
    }, 60)
  }, [handleStop])

  // Expose run/stop/restart handlers to parent
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__udseenRun = handleRun
    ;(window as unknown as Record<string, unknown>).__udseenStop = handleStop
    ;(window as unknown as Record<string, unknown>).__udseenRestart = handleRestart
    return () => {
      delete (window as unknown as Record<string, unknown>).__udseenRun
      delete (window as unknown as Record<string, unknown>).__udseenStop
      delete (window as unknown as Record<string, unknown>).__udseenRestart
    }
  }, [handleRun, handleStop, handleRestart])

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* 常驻坐标（左）+ 运行状态（右）：常驻显示，全屏时隐藏 */}
      {!propIsFullscreen && (
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '2px 12px',
          background: 'var(--header-bg)',
          borderBottom: '1px solid var(--border)',
          fontSize: 11,
          fontFamily: 'monospace',
          lineHeight: '22px',
          zIndex: 50,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <span style={{ color: mouseCoords.isInside ? 'var(--text-secondary)' : 'var(--warning)' }}>
          {mouseCoords.isInside
            ? `舞台坐标: (x=${mouseCoords.x}, y=${mouseCoords.y})`
            : `舞台坐标: (N, N)`}
        </span>
        <span style={{ color: isRunning ? 'var(--success)' : 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.5 }}>
          {isRunning ? `● 运行中${autoMode ? ' (自动)' : ''}` : '■ 就绪'}
        </span>
      </div>
      )}

      {/* PixiJS 舞台容器——对话框和选项按钮直接在 PixiJS Canvas 上绘制 */}
      {/* tabIndex + focus/blur 确保仅在演出区域获得焦点时才响应键盘/滚轮事件，避免干扰编辑器输入 */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--bg)',
          outline: propIsFullscreen ? 'none' : (previewFocused ? '2px solid var(--border-focus)' : 'none'),
          outlineOffset: -2,
          transition: 'outline 0.15s, background 0.3s',
          padding: propIsFullscreen ? 0 : 12 // 全屏时无间距，填满窗口
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
      <div
        ref={containerRef}
        tabIndex={-1}
        style={{ position: 'relative', width: '100%', height: '100%', outline: 'none', overflow: 'hidden' }}
        onFocus={() => {
          previewFocusedRef.current = true
          setPreviewFocused(true)
          ;(window as unknown as Record<string, unknown>).__udseenPreviewFocused = true
        }}
        onBlur={() => {
          previewFocusedRef.current = false
          setPreviewFocused(false)
          ;(window as unknown as Record<string, unknown>).__udseenPreviewFocused = false
        }}
      >
          {/* PixiJS Canvas 由 PixiRenderer.init() 在此 div 内创建 */}

          {/* 注意：对话框(DialogBox)和选项按钮(ChoicePanel)不再使用 React DOM 覆盖层，
              而是在 PixiJS 的 app.stage 上直接绘制 PIXI Graphics + PIXI Text，
              和其他角色/背景精灵一样作为舞台资产渲染。 */}
        </div>

      {/* === 对话历史面板（鼠标滚轮上滑打开） === */}
      {(showDialogueHistory || historyLeaving) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 400,
            animation: historyLeaving ? 'overlayFadeOut 0.2s ease forwards' : 'overlayFadeIn 0.2s ease',
          }}
        >
          <DialogueHistoryPanel
            history={dialogBoxRef.current?.getHistory() ?? []}
            currentIndex={dialogBoxRef.current?.getHistoryIndex() ?? -1}
            onSelect={(index) => {
              showDialogueHistoryRef.current = false
              historyLeavingRef.current = false
              setShowDialogueHistory(false)
              setHistoryLeaving(false)
              dialogBoxRef.current?.goToHistory(index)
            }}
            onClose={() => {
              if (!historyLeavingRef.current) {
                historyLeavingRef.current = true
                setHistoryLeaving(true)
                setTimeout(() => {
                  showDialogueHistoryRef.current = false
                  historyLeavingRef.current = false
                  setShowDialogueHistory(false)
                  setHistoryLeaving(false)
                }, 200)
              }
            }}
            onPlayAudio={(audioPath) => {
              // 使用简单 HTML5 Audio 播放历史音频片段
              const audio = new Audio(audioPath)
              audio.play().catch(() => {})
            }}
          />
        </div>
      )}

      {/* === ESC 全页面菜单（Esc 切换） === */}
      {(showStageSettings || settingsLeaving) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 300,
            animation: settingsLeaving ? 'overlayFadeOut 0.2s ease forwards' : 'overlayFadeIn 0.2s ease',
          }}
        >
          <StageSettingsPanel
            currentSpeed={textSpeed}
            onSpeedChange={async (speed) => {
              const settingsStore = useSettingsStore.getState()
              await settingsStore.updateSetting('textSpeed', speed)
              dialogBoxRef.current?.setTypingSpeed(speed)
            }}
            onClose={() => {
              if (!settingsLeaving) {
                setSettingsLeaving(true)
                setTimeout(() => {
                  stageSettingsOpenRef.current = false
                  setShowStageSettings(false)
                  setSettingsLeaving(false)
                }, 200)
              }
            }}
            fullPage
          />
        </div>
      )}

      {/* === F3 调试覆盖层 === */}
      {showDebug && (
        <div
          ref={debugOverlayRef}
          style={{
            position: 'absolute',
            overflow: 'hidden',
            zIndex: 200,
            top: 0,
            left: 0,
            pointerEvents: 'none',
          }}
        >
          {/* ── 左上角：坐标 + 播放器状态面板 ── */}
          <div
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '6px 10px',
              background: 'rgba(0,0,0,0.78)',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: 'monospace',
              lineHeight: 1.7,
              color: '#aac',
              zIndex: 200,
              pointerEvents: 'none',
              whiteSpace: 'pre',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {(() => {
              const rc = rendererRef.current
              const rt = runtimeRef.current
              const db = dialogBoxRef.current
              const vw = rc?.getVirtualWidth() ?? VIRTUAL_WIDTH
              const vh = rc?.getVirtualHeight() ?? VIRTUAL_HEIGHT
              const fs = !!document.fullscreenElement
              return [
                `FPS(3s): ${debugFps}  |  FPS(10s): ${debugFps10}`,
                mouseCoords && mouseCoords.isInside
                  ? `坐标: (x=${mouseCoords.x}, y=${mouseCoords.y})`
                  : mouseCoords
                    ? `坐标: ((x=${mouseCoords.x}, y=${mouseCoords.y}))`
                    : '坐标: --',
                `镜头: (${cameraOffsetX}, ${cameraOffsetY})`,
                `校准: (${calibrationOffsetX}, ${calibrationOffsetY})`,
                `运行: ${isRunning ? '是' : '否'}  |  Auto: ${autoMode ? '开' : '关'}`,
                `跳过: ${rt?.skipMode ? '开' : '关'}  |  对话: ${db?.isDialogShowing() ? '等待' : '无'}`,
                `全屏: ${fs ? '是' : '否'}  |  虚拟: ${vw}×${vh}`,
              ].join('\n')
            })()}
          </div>

          {/* ── 右上角：运行状态 + 活跃资源面板 ── */}
          {isRunning && (
            <div
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                minWidth: 160,
                maxWidth: 260,
                maxHeight: 240,
                padding: '6px 10px',
                background: 'rgba(0,0,0,0.82)',
                border: '1px solid rgba(76,175,80,0.35)',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'monospace',
                lineHeight: 1.5,
                color: '#aac',
                zIndex: 200,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.overflowY = 'auto'; (e.currentTarget as HTMLDivElement).style.pointerEvents = 'auto' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.overflowY = 'hidden'; (e.currentTarget as HTMLDivElement).style.pointerEvents = 'none' }}
            >
              <div style={{ color: '#66d66a', fontWeight: 600, marginBottom: 4 }}>
                ● 运行{autoMode ? ' (自动)' : ''}{runtimeRef.current?.skipMode ? ' [跳过]' : ''}
              </div>
              <div style={{ color: '#8cf', fontSize: 10, marginBottom: 2 }}>资源</div>
              <div style={{ color: '#aaa', fontSize: 10, paddingLeft: 6 }}>
                场景对象: {activeResources.sceneObjects.length}
                {activeResources.sceneObjects.length > 0 && (
                  <div style={{ paddingLeft: 8, color: '#888', maxHeight: 60, overflowY: 'auto' }}>
                    {activeResources.sceneObjects.map((id) => (
                      <div key={id} style={{ whiteSpace: 'nowrap' }}>· {id}</div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ color: '#aaa', fontSize: 10, paddingLeft: 6 }}>
                音频: {activeResources.audioObjects.length}
                {activeResources.audioObjects.length > 0 && (
                  <div style={{ paddingLeft: 8, color: '#888', maxHeight: 60, overflowY: 'auto' }}>
                    {activeResources.audioObjects.map((id) => (
                      <div key={id} style={{ whiteSpace: 'nowrap' }}>· {id}</div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ color: '#aaa', fontSize: 10, paddingLeft: 6 }}>
                滤镜: {activeResources.filterObjects.length}
                {activeResources.filterObjects.length > 0 && (
                  <div style={{ paddingLeft: 8, color: '#888', maxHeight: 60, overflowY: 'auto' }}>
                    {activeResources.filterObjects.map((id) => (
                      <div key={id} style={{ whiteSpace: 'nowrap' }}>· {id}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 右下角：日志区域（悬浮可滚动，仅全屏模式下显示） ── */}
          {propIsFullscreen && logs.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 4,
                right: 8,
                width: 360,
                maxHeight: 280,
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.75)',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'monospace',
                lineHeight: 1.6,
                color: '#999',
                zIndex: 200,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.06)',
                pointerEvents: 'none',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.overflowY = 'auto'; (e.currentTarget as HTMLDivElement).style.pointerEvents = 'auto' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.overflowY = 'hidden'; (e.currentTarget as HTMLDivElement).style.pointerEvents = 'none' }}
            >
              {logs.slice(-20).map((entry, i) => {
                const time = new Date(entry.timestamp).toLocaleTimeString()
                const color = entry.type === 'error' ? '#f66'
                  : entry.type === 'warning' ? '#fa0'
                  : '#8c8'
                return (
                  <div key={i} style={{ color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ opacity: 0.5 }}>{time}</span> {entry.message}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── 左下角：系统资源占用面板 ── */}
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              left: 4,
              padding: '6px 10px',
              background: 'rgba(0,0,0,0.78)',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: 'monospace',
              lineHeight: 1.7,
              color: '#aac',
              zIndex: 200,
              pointerEvents: 'none',
              whiteSpace: 'pre',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {(() => {
              const g = gpuInfo
              const s = systemResources
              const lines: string[] = []
              if (s) {
                lines.push(`CPU: ${s.cpuPercent.toFixed(1)}%  |  内存: ${s.memoryMB}MB`)
              }
              if (g) {
                const nameLabel = g.name.length > 30 ? g.name.slice(0, 28) + '..' : g.name
                lines.push(`GPU: ${nameLabel}`)
                if (g.utilizationPercent !== null) {
                  lines.push(`GPU 负载: ${g.utilizationPercent}%  |  温度: ${g.temperature}°C`)
                }
                if (g.memoryUsedMB !== null) {
                  const memPct = g.memoryTotalMB ? Math.round((g.memoryUsedMB / g.memoryTotalMB) * 100) : 0
                  lines.push(`GPU 显存: ${g.memoryUsedMB}MB / ${g.memoryTotalMB}MB (${memPct}%)`)
                }
              }
              return lines.length > 0 ? lines.join('\n') : '(正在采集...)'
            })()}
          </div>

          {/* ── 右下提示：F3 已开启 ── */}
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '2px 10px',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: 4,
              fontSize: 10,
              fontFamily: 'monospace',
              color: '#666',
              zIndex: 200,
              pointerEvents: 'none',
            }}
          >
            F3 调试模式
          </div>
        </div>
      )}

      <style>{`
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes overlayFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>
      </div>{/* ── 预览内部容器结束 ── */}
    </div>
  )
}



