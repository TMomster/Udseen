import * as PIXI from 'pixi.js'
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './PixiRenderer'

/**
 * 选项按钮样式配置
 */
export interface ChoiceStyle {
  panel: {
    horizontalAlign: 'center' | 'left' | 'right'
    verticalAlign: 'center' | 'top' | 'bottom'
    marginX: number
    marginY: number
  }
  button: {
    width: number
    height: number
    gap: number
    borderRadius: number
    backgroundColor: number
    backgroundAlpha: number
    backgroundColorHover: number
    borderColor: number
    borderAlpha: number
    borderWidth: number
    /** 悬停时文本颜色 */
    textColorHover?: string
  }
  buttonDisabled: {
    backgroundColor: number
    backgroundAlpha: number
    borderColor: number
    borderAlpha: number
    borderWidth: number
    /** 禁用时文本颜色 */
    textColor?: string
  }
  text: {
    fontFamily: string
    fontSize: number
    color: string
    textAlign: 'center' | 'left' | 'right'
    leftMargin: number
    rightMargin: number
    bottomMargin: number
    /** 字重：'normal' | 'bold' */
    fontWeight?: string
    /** 字体样式：'normal' | 'italic' */
    fontStyle?: string
    letterSpacing?: number
    strokeColor?: string
    strokeAlpha?: number
    strokeWidth?: number
  }
}

/**
 * 默认选项样式
 */
const DEFAULT_STYLE: ChoiceStyle = {
  panel: {
    horizontalAlign: 'center',
    verticalAlign: 'center',
    marginX: 0,
    marginY: 0
  },
  button: {
    width: 600,
    height: 64,
    gap: 14,
    borderRadius: 8,
    backgroundColor: 0x0f0f23,
    backgroundAlpha: 0.85,
    backgroundColorHover: 0x1a1a3a,
    borderColor: 0x3d3d6b,
    borderAlpha: 0.4,
    borderWidth: 1,
    textColorHover: '#ffffff'
  },
  buttonDisabled: {
    backgroundColor: 0x444444,
    backgroundAlpha: 0.4,
    borderColor: 0x555555,
    borderAlpha: 0.3,
    borderWidth: 1,
    textColor: '#888888'
  },
  text: {
    fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif',
    fontSize: 26,
    color: '#e8e8f0',
    textAlign: 'center' as const,
    leftMargin: 16,
    rightMargin: 16,
    bottomMargin: 0,
    fontWeight: 'normal',
    fontStyle: 'normal',
    letterSpacing: 1,
    strokeColor: '#000000',
    strokeAlpha: 0,
    strokeWidth: 0
  }
}

/**
 * 选项按钮 - 在 PixiJS 舞台上直接绘制的选择项组件
 *
 * 在虚拟舞台坐标空间 (1920×1080) 中显示，
 * 每个选项是一个可点击的圆角矩形+文本。
 */
export class ChoicePanel {
  private app: PIXI.Application
  private container: PIXI.Container
  private buttons: PIXI.Container[] = []
  private style: ChoiceStyle
  /** 当前展示的选项，每次 show() 时更新，供复用按钮的 pointerdown 闭包读取最新的 action */
  private currentChoices: { text: string; action: () => void }[] = []

  constructor(app: PIXI.Application, style?: Partial<ChoiceStyle>) {
    this.app = app
    // 深度合并：传入的 style 可能缺少部分字段（如 panel），缺失部分回退到 DEFAULT_STYLE
    this.style = this.mergeStyle(style)
    this.container = new PIXI.Container()
    this.container.visible = false
    this.container.sortableChildren = true
  }

  /**
   * 深度合并用户样式与默认样式，缺失字段（如 panel）自动回退到 DEFAULT_STYLE
   */
  private mergeStyle(partial: Partial<ChoiceStyle> | undefined): ChoiceStyle {
    const defaults = DEFAULT_STYLE
    if (!partial) return { ...defaults }

    const result: ChoiceStyle = {
      panel: { ...defaults.panel, ...partial.panel },
      button: { ...defaults.button, ...partial.button },
      buttonDisabled: { ...defaults.buttonDisabled, ...partial.buttonDisabled },
      text: { ...defaults.text, ...partial.text }
    }
    return result
  }

  /**
   * 预览选项面板 - 同步渲染静态预览按钮，不使用 Promise 和交互
   * 用于模板设置编辑器中的实时预览
   */
  preview(choiceStyle: ChoiceStyle): void {
    this.style = choiceStyle
    this.hide()

    const choices = ['选项一', '选项二', '选项三']
    const VW = VIRTUAL_WIDTH
    const VH = VIRTUAL_HEIGHT
    const s = this.style

    const btnWidth = s.button.width
    const btnHeight = s.button.height
    const btnGap = s.button.gap
    const totalHeight = choices.length * btnHeight + (choices.length - 1) * btnGap

    // 计算起始 X
    let startX: number
    switch (s.panel.horizontalAlign) {
      case 'left':
        startX = VW * s.panel.marginX
        break
      case 'right':
        startX = VW - btnWidth - VW * s.panel.marginX
        break
      default:
        startX = (VW - btnWidth) / 2
    }

    // 计算起始 Y
    let startY: number
    switch (s.panel.verticalAlign) {
      case 'top':
        startY = VH * s.panel.marginY
        break
      case 'bottom':
        startY = VH - totalHeight - VH * s.panel.marginY
        break
      default:
        startY = (VH - totalHeight) / 2
    }

    for (let i = 0; i < choices.length; i++) {
      let btnContainer: PIXI.Container
      let bg: PIXI.Graphics
      let text: PIXI.Text

      if (i < this.buttons.length) {
        btnContainer = this.buttons[i]
        bg = btnContainer.children[0] as PIXI.Graphics
        text = btnContainer.children[1] as PIXI.Text
        btnContainer.visible = true
      } else {
        btnContainer = new PIXI.Container()
        btnContainer.zIndex = 1000
        bg = new PIXI.Graphics()
        btnContainer.addChild(bg)
        text = new PIXI.Text('', {
          fontFamily: s.text.fontFamily,
          fontSize: s.text.fontSize,
          fill: s.text.color
        })
        btnContainer.addChild(text)
        this.container.addChild(btnContainer)
        this.buttons.push(btnContainer)
      }

      // 更新文本样式和内容（即使复用也需要更新）
      this.applyTextStyle(text, s.text, s.text.color)
      text.text = choices[i]

      // 根据文本对齐方式设置锚点和位置
      if (s.text.textAlign === 'center') {
        text.anchor.set(0.5, 0.5)
        text.position.set(btnWidth / 2, btnHeight / 2)
      } else if (s.text.textAlign === 'right') {
        text.anchor.set(1, 0.5)
        text.position.set(btnWidth - s.text.rightMargin, btnHeight / 2)
      } else {
        text.anchor.set(0, 0.5)
        text.position.set(s.text.leftMargin, btnHeight / 2)
      }

      // 重绘背景
      bg.clear()
      this.drawButton(bg, s.button)

      // 定位
      btnContainer.position.set(startX, startY + i * (btnHeight + btnGap))
    }

    // 挂载到舞台顶层
    if (this.container.parent === this.app.stage) {
      this.app.stage.removeChild(this.container)
    }
    this.app.stage.addChild(this.container)
    this.container.visible = true
  }

  /** 应用文本样式（含粗体、斜体） */
  private applyTextStyle(text: PIXI.Text, textStyle: ChoiceStyle['text'], color: string): void {
    text.style.fontFamily = textStyle.fontFamily
    text.style.fontSize = textStyle.fontSize
    text.style.fill = color
    text.style.fontWeight = textStyle.fontWeight ?? 'normal'
    text.style.fontStyle = textStyle.fontStyle ?? 'normal'
    text.style.letterSpacing = textStyle.letterSpacing ?? 0
    text.style.stroke = textStyle.strokeColor ?? '#000000'
    text.style.strokeThickness = textStyle.strokeWidth ?? 0
  }

  /**
   * 显示选项，返回 Promise，用户选择后 resolve
   * 使用对象池复用按钮容器，避免反复创建/销毁引发的 GC 压力
   */
  async show(choices: { text: string; action: () => void }[]): Promise<void> {
    // 更新当前选项引用，后续复用按钮的 pointerdown 闭包通过 this.currentChoices 读取最新的 action
    this.currentChoices = choices

    // 隐藏按钮，准备复用
    for (const btn of this.buttons) {
      btn.visible = false
    }

    const VW = VIRTUAL_WIDTH
    const VH = VIRTUAL_HEIGHT

    const s = this.style
    const btnWidth = s.button.width
    const btnHeight = s.button.height
    const btnGap = s.button.gap
    const totalHeight = choices.length * btnHeight + (choices.length - 1) * btnGap

    // 计算起始 X 坐标
    let startX: number
    switch (s.panel.horizontalAlign) {
      case 'left':
        startX = VW * s.panel.marginX
        break
      case 'right':
        startX = VW - btnWidth - VW * s.panel.marginX
        break
      default: // center
        startX = (VW - btnWidth) / 2
    }

    // 计算起始 Y 坐标
    let startY: number
    switch (s.panel.verticalAlign) {
      case 'top':
        startY = VH * s.panel.marginY
        break
      case 'bottom':
        startY = VH - totalHeight - VH * s.panel.marginY
        break
      default: // center
        startY = (VH - totalHeight) / 2
    }

    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i]

      let btnContainer: PIXI.Container
      let bg: PIXI.Graphics
      let text: PIXI.Text

      if (i < this.buttons.length) {
        // 从对象池复用
        btnContainer = this.buttons[i]
        bg = btnContainer.children[0] as PIXI.Graphics
        text = btnContainer.children[1] as PIXI.Text
        btnContainer.visible = true
      } else {
        // 创建新按钮
        btnContainer = new PIXI.Container()
        btnContainer.zIndex = 1000

        bg = new PIXI.Graphics()
        btnContainer.addChild(bg)

        text = new PIXI.Text('', {
          fontFamily: s.text.fontFamily,
          fontSize: s.text.fontSize,
          fill: s.text.color
        })
        btnContainer.addChild(text)

        // 交互
        bg.eventMode = 'static'
        bg.cursor = 'pointer'

        bg.on('pointerover', () => {
          bg.clear()
          this.drawButton(bg, { ...s.button, backgroundColor: s.button.backgroundColorHover })
          // 悬停时切换文本颜色
          if (s.button.textColorHover) {
            text.style.fill = s.button.textColorHover
          }
        })

        bg.on('pointerout', () => {
          bg.clear()
          this.drawButton(bg, s.button)
          text.style.fill = s.text.color
        })

        bg.on('pointerdown', () => {
          const idx = this.buttons.indexOf(btnContainer)
          if (idx >= 0 && idx < this.currentChoices.length) {
            this.currentChoices[idx].action()
          }
          this.hide()
        })

        this.container.addChild(btnContainer)
        this.buttons.push(btnContainer)
      }

      // 更新文字样式和内容
      this.applyTextStyle(text, s.text, s.text.color)
      text.text = choice.text

      // 根据文本对齐方式设置锚点和位置
      if (s.text.textAlign === 'center') {
        text.anchor.set(0.5, 0.5)
        text.position.set(btnWidth / 2, btnHeight / 2)
      } else if (s.text.textAlign === 'right') {
        text.anchor.set(1, 0.5)
        text.position.set(btnWidth - s.text.rightMargin, btnHeight / 2)
      } else {
        text.anchor.set(0, 0.5)
        text.position.set(s.text.leftMargin, btnHeight / 2)
      }

      // 重绘背景（默认状态）
      bg.clear()
      this.drawButton(bg, s.button)

      // 定位
      btnContainer.position.set(startX, startY + i * (btnHeight + btnGap))
    }

    // 挂载到舞台顶层
    if (this.container.parent === this.app.stage) {
      this.app.stage.removeChild(this.container)
    }
    this.app.stage.addChild(this.container)
    this.container.visible = true

    return Promise.resolve()
  }

  /**
   * 设置舞台偏移（用于全屏模式下整体上移）
   */
  setStageOffset(x: number, y: number): void {
    this.container.x = x
    this.container.y = y
  }

  /**
   * 隐藏选项面板
   */
  hide(): void {
    this.container.visible = false
  }

  /**
   * 销毁
   */
  destroy(): void {
    for (const btn of this.buttons) {
      if (btn.parent) {
        btn.parent.removeChild(btn)
      }
      btn.destroy({ children: true })
    }
    this.buttons = []
    if (this.container.parent) {
      this.container.parent.removeChild(this.container)
    }
    this.container.destroy({ children: true })
  }

  /**
   * 根据样式配置绘制圆角矩形按钮
   */
  private drawButton(g: PIXI.Graphics, btnStyle: { backgroundColor: number; backgroundAlpha: number; borderColor: number; borderAlpha: number; borderWidth: number; borderRadius?: number; backgroundColorHover?: number }): void {
    g.beginFill(btnStyle.backgroundColor, btnStyle.backgroundAlpha)
    if (btnStyle.borderWidth > 0) {
      g.lineStyle(btnStyle.borderWidth, btnStyle.borderColor, btnStyle.borderAlpha)
    }
    g.drawRoundedRect(0, 0, this.style.button.width, this.style.button.height, btnStyle.borderRadius ?? this.style.button.borderRadius)
    g.endFill()
  }
}
