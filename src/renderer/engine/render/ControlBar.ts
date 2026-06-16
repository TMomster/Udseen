import * as PIXI from 'pixi.js'
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './PixiRenderer'
import { usePreviewStore } from '../../store/previewStore'

/**
 * 控制栏样式配置
 */
export interface ControlBarStyle {
  /** 底部背景条 */
  bar: {
    height: number
    backgroundColor: number
    backgroundAlpha: number
  }
  /** 按钮样式 */
  button: {
    normalWidth: number
    autoWidth: number
    height: number
    borderRadius: number
    gap: number
    fontFamily: string
    fontSize: number
    /** 默认状态文本颜色 */
    defaultColor: string
    /** 默认状态背景色 (PIXI color number) */
    defaultBackground: number
    defaultBackgroundAlpha: number
    defaultBorderColor: number
    defaultBorderAlpha: number
    defaultFontWeight: string
    /** 激活状态（自动 ON）文本颜色 */
    activeColor: string
    /** 激活状态背景色 (PIXI color number) */
    activeBackground: number
    activeBackgroundAlpha: number
    activeBorderColor: number
    activeBorderAlpha: number
    activeFontWeight: string
  }
}

/** 默认控制栏样式 */
const DEFAULT_STYLE: ControlBarStyle = {
  bar: {
    height: 52,
    backgroundColor: 0x000000,
    backgroundAlpha: 0.4,
  },
  button: {
    normalWidth: 72,
    autoWidth: 84,
    height: 28,
    borderRadius: 4,
    gap: 8,
    fontFamily: "'Smiley Sans','Source Han Sans SC','Noto Sans SC','Microsoft YaHei',sans-serif",
    fontSize: 12,
    defaultColor: '#ffffff',
    defaultBackground: 0x000000,
    defaultBackgroundAlpha: 0.5,
    defaultBorderColor: 0xffffff,
    defaultBorderAlpha: 0.2,
    defaultFontWeight: 'normal',
    activeColor: '#4caf50',
    activeBackground: 0x000000,
    activeBackgroundAlpha: 0.5,
    activeBorderColor: 0x4caf50,
    activeBorderAlpha: 0.5,
    activeFontWeight: 'bold',
  },
}

interface ButtonConfig {
  label: string
  title: string
  onClick: () => void
  isAuto?: boolean
}

/**
 * 底部控制栏 - 在 PIXI 舞台上直接渲染的按钮组
 *
 * 使用 zIndex 确保始终位于舞台最顶层，不受 DialogBox mountToStage 影响。
 * 作为模板组件加载，仅在剧本执行时显示。
 */
export class ControlBar {
  private container: PIXI.Container
  private buttonObjects: Map<string, { bg: PIXI.Graphics; text: PIXI.Text; container: PIXI.Container }> = new Map()
  private app: PIXI.Application
  private style: ControlBarStyle

  /** 自动播放切换回调（在 toggleAuto 中被调用，用于父组件监听自动模式切换事件） */
  public onAutoToggle: ((auto: boolean) => void) | null = null
  /** store 订阅取消函数 */
  private _unsub: (() => void) | null = null

  constructor(app: PIXI.Application, style?: Partial<ControlBarStyle>) {
    this.app = app
    this.style = {
      bar: { ...DEFAULT_STYLE.bar, ...style?.bar },
      button: { ...DEFAULT_STYLE.button, ...style?.button },
    }

    this.container = new PIXI.Container()
    this.container.visible = false
    this.container.zIndex = 1000

    // 启用舞台 zIndex 排序
    app.stage.sortableChildren = true

    this.buildUI()
    this.mountToStage()

    // 订阅自动播放状态变化（支持外部通过 A 键或 store 直接切换），自动同步按钮外观
    this._unsub = usePreviewStore.subscribe((state, prevState) => {
      if (state.autoMode !== prevState.autoMode) {
        this.updateAutoButton()
      }
    })
  }

  private buildUI(): void {
    this.container.removeChildren()
    this.buttonObjects.clear()

    const s = this.style
    const barHeight = s.bar.height

    // 底部背景条
    const barBg = new PIXI.Graphics()
    barBg.beginFill(s.bar.backgroundColor, s.bar.backgroundAlpha)
    barBg.drawRect(0, VIRTUAL_HEIGHT - barHeight, VIRTUAL_WIDTH, barHeight)
    barBg.endFill()
    this.container.addChild(barBg)

    // 仅保留"自动"按钮，移除保存、加载等按钮
    const buttonConfigs: ButtonConfig[] = [
      { label: '自动', title: '自动播放', onClick: () => this.toggleAuto(), isAuto: true },
    ]

    const buttonGap = s.button.gap
    const autoWidth = s.button.autoWidth
    const buttonHeight = s.button.height

    // 全屏时自动按钮居右，非全屏居中
    const isFullscreen = !!document.fullscreenElement
    let startX: number
    if (isFullscreen) {
      // 全屏：按钮靠右，留 20px 右边距
      startX = VIRTUAL_WIDTH - autoWidth - 20
    } else {
      // 非全屏：水平居中
      let totalWidth = 0
      for (const btn of buttonConfigs) {
        totalWidth += btn.isAuto ? autoWidth : s.button.normalWidth
      }
      totalWidth += buttonGap * (buttonConfigs.length - 1)
      startX = (VIRTUAL_WIDTH - totalWidth) / 2
    }
    const buttonsY = VIRTUAL_HEIGHT - barHeight + (barHeight - buttonHeight) / 2

    let currentX = startX
    for (const btn of buttonConfigs) {
      const w = btn.isAuto ? autoWidth : s.button.normalWidth

      const btnContainer = new PIXI.Container()
      btnContainer.eventMode = 'static'
      btnContainer.cursor = 'pointer'

      const bg = new PIXI.Graphics()
      btnContainer.addChild(bg)

      const initialAuto = btn.isAuto ? usePreviewStore.getState().autoMode : false
      const text = new PIXI.Text(btn.label, {
        fontFamily: s.button.fontFamily,
        fontSize: s.button.fontSize,
        fill: initialAuto ? s.button.activeColor : s.button.defaultColor,
        fontWeight: initialAuto ? s.button.activeFontWeight : s.button.defaultFontWeight,
      })
      text.anchor.set(0.5)
      text.position.set(w / 2, buttonHeight / 2)
      btnContainer.addChild(text)

      btnContainer.position.set(currentX, buttonsY)
      btnContainer.hitArea = new PIXI.Rectangle(0, 0, w, buttonHeight)

      // 初始化按钮背景
      if (btn.isAuto) {
        const autoMode = usePreviewStore.getState().autoMode
        this.drawButtonBg(bg, w, buttonHeight, autoMode)
      } else {
        this.drawButtonBg(bg, w, buttonHeight, false)
      }

      this.buttonObjects.set(btn.label, { bg, text, container: btnContainer })

      // 点击事件（stopPropagation 防止触发舞台全局点击推进）
      btnContainer.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation()
        btn.onClick()
      })

      this.container.addChild(btnContainer)
      currentX += w + buttonGap
    }
  }

  private drawButtonBg(g: PIXI.Graphics, w: number, h: number, active: boolean): void {
    const s = this.style.button
    g.clear()
    if (active) {
      g.beginFill(s.activeBackground, s.activeBackgroundAlpha)
      g.lineStyle(1, s.activeBorderColor, s.activeBorderAlpha)
    } else {
      g.beginFill(s.defaultBackground, s.defaultBackgroundAlpha)
      g.lineStyle(1, s.defaultBorderColor, s.defaultBorderAlpha)
    }
    g.drawRoundedRect(0, 0, w, h, s.borderRadius)
    g.endFill()
  }

  private toggleAuto(): void {
    const store = usePreviewStore.getState()
    const newAuto = !store.autoMode
    store.setAutoMode(newAuto)
    this.updateAutoButton()
    // 触发回调，用于父组件监听自动模式切换
    this.onAutoToggle?.(newAuto)
  }

  private updateAutoButton(): void {
    const autoMode = usePreviewStore.getState().autoMode
    const btnObj = this.buttonObjects.get('自动')
    if (!btnObj) return

    const s = this.style.button

    // 保持"自动"字样不变，仅切换颜色
    btnObj.text.style.fill = autoMode ? s.activeColor : s.defaultColor
    btnObj.text.style.fontWeight = autoMode ? s.activeFontWeight : s.defaultFontWeight

    // 更新背景
    this.drawButtonBg(btnObj.bg, s.autoWidth, s.height, autoMode)
  }

  /** 用新样式重绘控制栏（用于模板设置预览） */
  preview(controlBarStyle: ControlBarStyle): void {
    this.style = controlBarStyle
    this.buildUI()
    this.container.visible = true
    this.mountToStage()
  }

  show(): void {
    this.container.visible = true
  }

  hide(): void {
    this.container.visible = false
  }

  /** 设置舞台偏移（用于全屏模式下整体上移） */
  setStageOffset(x: number, y: number): void {
    this.container.x = x
    this.container.y = y
  }

  /** 确保容器挂载至舞台（zIndex 保证始终最上层） */
  mountToStage(): void {
    if (this.container.parent !== this.app.stage) {
      this.app.stage.addChild(this.container)
    }
  }

  destroy(): void {
    this._unsub?.()
    this._unsub = null
    if (this.container.parent) {
      this.container.parent.removeChild(this.container)
    }
    this.container.destroy({ children: true })
  }
}
