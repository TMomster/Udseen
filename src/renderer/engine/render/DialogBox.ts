import * as PIXI from 'pixi.js'
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './PixiRenderer'

/**
 * 对话框样式配置
 */
export interface DialogStyle {
  box: {
    width?: number  // 不再使用，由 leftMargin + rightMargin 推导
    height: number
    leftMargin: number
    rightMargin: number
    bottomMargin: number
    backgroundColor: number
    backgroundAlpha: number
    borderColor: number
    borderAlpha: number
    borderWidth: number
    borderRadius: number
    /** 对话框阴影模糊半径 */
    shadowBlur: number
    /** 阴影颜色 */
    shadowColor: number
    /** 阴影透明度 */
    shadowAlpha: number
    /** 阴影水平偏移 */
    shadowOffsetX: number
    /** 阴影垂直偏移 */
    shadowOffsetY: number
  }
  nameBox: {
    width: number
    height: number
    leftMargin: number
    rightMargin: number
    bottomMargin: number
    backgroundColor: number
    backgroundAlpha: number
    borderColor: number
    borderAlpha: number
    borderWidth: number
    borderRadius: number
  }
  avatar: {
    width: number
    height: number
    leftMargin: number
    rightMargin: number
    bottomMargin: number
  }
  dialogueText: {
    fontFamily: string
    fontSize: number
    color: string
    topMargin: number
    leftMargin: number
    rightMargin: number
    bottomMargin: number
    lineHeight: number
    letterSpacing: number
    strokeColor: string
    strokeAlpha: number
    strokeWidth: number
  }
  nameText: {
    fontFamily: string
    fontSize: number
    color: string
    letterSpacing: number
    strokeColor: string
    strokeAlpha: number
    strokeWidth: number
  }
  /** 点击继续指示符样式 */
  indicator: {
    fontFamily: string
    fontSize: number
    color: string
    /** 偏移（从右下角算起） */
    offsetX: number
    offsetY: number
  }
}

/**
 * 默认对话框样式
 */
const DEFAULT_STYLE: DialogStyle = {
  box: {
    width: 1800,
    height: 220,
    leftMargin: 80,
    rightMargin: 80,
    bottomMargin: 30,
    backgroundColor: 0x0f0f23,
    backgroundAlpha: 0.85,
    borderColor: 0x2d2d5a,
    borderAlpha: 0.5,
    borderWidth: 1,
    borderRadius: 12,
    shadowBlur: 20,
    shadowColor: 0x000000,
    shadowAlpha: 0.35,
    shadowOffsetX: 0,
    shadowOffsetY: 6
  },
  nameBox: {
    width: 160,
    height: 40,
    leftMargin: 24,
    rightMargin: 24,
    bottomMargin: 8,
    backgroundColor: 0x1a1a3a,
    backgroundAlpha: 0.9,
    borderColor: 0x6363b3,
    borderAlpha: 0.4,
    borderWidth: 1,
    borderRadius: 6
  },
  avatar: {
    width: 130,
    height: 130,
    leftMargin: 16,
    rightMargin: 14,
    bottomMargin: 12
  },
  dialogueText: {
    fontFamily: 'Microsoft YaHei, SimHei, sans-serif',
    fontSize: 26,
    color: '#e8e8f0',
    topMargin: 8,
    leftMargin: 12,
    rightMargin: 12,
    bottomMargin: 16,
    lineHeight: 40,
    letterSpacing: 1,
    strokeColor: '#000000',
    strokeAlpha: 0,
    strokeWidth: 0
  },
  nameText: {
    fontFamily: 'Microsoft YaHei, SimHei, sans-serif',
    fontSize: 18,
    color: '#d4a843',
    letterSpacing: 2,
    strokeColor: '#000000',
    strokeAlpha: 0,
    strokeWidth: 0
  },
  indicator: {
    fontFamily: 'Microsoft YaHei, SimHei, sans-serif',
    fontSize: 22,
    color: '#6e6e9e',
    offsetX: 20,
    offsetY: 12
  }
}

/**
 * 对话框 - PixiJS 舞台上直接绘制的对话 UI 组件
 *
 * 在虚拟舞台坐标空间 (1920×1080) 中定位，
 * 使用 PIXI.Graphics 绘制背景圆角矩形，PIXI.Text 绘制文本，
 * 通过 pointerdown 事件实现点击推进。
 */
export class DialogBox {
  private app: PIXI.Application
  private container: PIXI.Container
  private bg: PIXI.Graphics
  /** 姓名框背景（独立 Graphics，使姓名框有背景色和描边） */
  private nameBoxBg: PIXI.Graphics
  private speakerText: PIXI.Text
  private dialogueText: PIXI.Text
  /** 头像容器（仅定位用，不设裁剪遮罩） */
  public avatarContainer: PIXI.Container
  /** 当前是否显示头像，影响文本布局 */
  public hasAvatar = false
  private resolveFn: (() => void) | null = null
  private style: DialogStyle
  /** 对话文本裁剪遮罩 */
  private dialogueMask: PIXI.Graphics | null = null
  private autoClickTimer: ReturnType<typeof setTimeout> | null = null
  /** 对话框历史记录，支持上一步/下一步导航 */
  private dialogHistory: Array<{ speaker: string | null; text: string; avatar?: string }> = []
  /** 当前在历史中的索引 */
  private historyIndex: number = -1

  constructor(app: PIXI.Application, style?: Partial<DialogStyle>) {
    this.app = app
    // 深度合并：传入的 style 可能只包含部分字段（如 JSON 解析结果），缺失字段回退到 DEFAULT_STYLE
    this.style = {
      box: { ...DEFAULT_STYLE.box, ...style?.box },
      nameBox: { ...DEFAULT_STYLE.nameBox, ...style?.nameBox },
      avatar: { ...DEFAULT_STYLE.avatar, ...style?.avatar },
      dialogueText: { ...DEFAULT_STYLE.dialogueText, ...style?.dialogueText },
      nameText: { ...DEFAULT_STYLE.nameText, ...style?.nameText },
      indicator: { ...DEFAULT_STYLE.indicator, ...style?.indicator }
    }

    this.container = new PIXI.Container()
    this.container.visible = false

    // 背景框
    this.bg = new PIXI.Graphics()
    this.container.addChild(this.bg)

    // 姓名框背景（独立绘制背景色和描边）
    this.nameBoxBg = new PIXI.Graphics()
    this.container.addChild(this.nameBoxBg)

    // 头像容器（默认隐藏）
    this.avatarContainer = new PIXI.Container()
    this.avatarContainer.visible = false
    this.container.addChild(this.avatarContainer)

    // 说话者名称（使用 nameText 样式）
    this.speakerText = new PIXI.Text('', {
      fontFamily: this.style.nameText.fontFamily,
      fontSize: this.style.nameText.fontSize,
      fill: this.style.nameText.color,
      letterSpacing: this.style.nameText.letterSpacing,
      stroke: this.style.nameText.strokeColor,
      strokeThickness: this.style.nameText.strokeWidth
    })
    this.container.addChild(this.speakerText)

    // 对话文本
    this.dialogueText = new PIXI.Text('', {
      fontFamily: this.style.dialogueText.fontFamily,
      fontSize: this.style.dialogueText.fontSize,
      fill: this.style.dialogueText.color,
      wordWrap: true,
      wordWrapWidth: 0, // 在 show 时计算
      lineHeight: this.style.dialogueText.lineHeight,
      letterSpacing: this.style.dialogueText.letterSpacing,
      stroke: this.style.dialogueText.strokeColor,
      strokeThickness: this.style.dialogueText.strokeWidth
    })
    this.container.addChild(this.dialogueText)

    // 对话框历史记录重置
    this.dialogHistory = []
    this.historyIndex = -1
  }

  /**
   * 预览对话框 - 同步渲染静态预览，不使用异步加载和 Promise/点击交互
   * 用于模板设置编辑器中的实时预览，保证预览效果与 show() 完全一致
   */
  preview(dialogStyle: DialogStyle, hasAvatar: boolean, speaker: string | null, text: string): void {
    this.style = dialogStyle
    const VW = VIRTUAL_WIDTH
    const VH = VIRTUAL_HEIGHT
    const s = this.style

    // 对话框尺寸和位置
    const boxHeight = Math.round(s.box.height)
    const boxX = Math.round(s.box.leftMargin)
    const boxWidth = Math.round(VW - s.box.leftMargin - s.box.rightMargin)
    const boxY = Math.round(VH - boxHeight - s.box.bottomMargin)

    // 头像占用的水平偏移量
    const avW = s.avatar.width
    const avRightMargin = s.avatar.rightMargin
    const textLeftShift = hasAvatar ? avW + avRightMargin : 0

    // 绘制背景（含阴影）
    this.bg.clear()
    if (s.box.shadowBlur && s.box.shadowBlur > 0 && s.box.shadowAlpha > 0) {
      this.bg.beginFill(s.box.shadowColor, s.box.shadowAlpha)
      this.bg.drawRoundedRect(
        boxX + (s.box.shadowOffsetX ?? 0),
        boxY + (s.box.shadowOffsetY ?? 0),
        boxWidth, boxHeight,
        s.box.borderRadius
      )
      this.bg.endFill()
    }
    this.bg.beginFill(s.box.backgroundColor, s.box.backgroundAlpha)
    if (s.box.borderWidth > 0) {
      this.bg.lineStyle(s.box.borderWidth, s.box.borderColor, s.box.borderAlpha)
    }
    this.bg.drawRoundedRect(boxX, boxY, boxWidth, boxHeight, s.box.borderRadius)
    this.bg.endFill()

    // ---- 头像（预览用占位图形） ----
    this.avatarContainer.removeChildren()
    this.avatarContainer.visible = false
    this.hasAvatar = false
    if (hasAvatar) {
      const placeholder = new PIXI.Graphics()
      placeholder.beginFill(0xcccccc, 0.4)
      placeholder.drawRoundedRect(0, 0, avW, s.avatar.height, 8)
      placeholder.endFill()
      this.avatarContainer.addChild(placeholder)
      this.avatarContainer.position.set(boxX + s.avatar.leftMargin, boxY)
      this.avatarContainer.visible = true
      this.hasAvatar = true
    }

    // ---- 姓名框 ----
    if (speaker) {
      const nbX = boxX + textLeftShift + s.nameBox.leftMargin
      const nbY = boxY + 6
      const nbW = s.nameBox.width
      const nbH = s.nameBox.height

      this.nameBoxBg.clear()
      this.nameBoxBg.beginFill(s.nameBox.backgroundColor, s.nameBox.backgroundAlpha)
      if (s.nameBox.borderWidth > 0) {
        this.nameBoxBg.lineStyle(s.nameBox.borderWidth, s.nameBox.borderColor, s.nameBox.borderAlpha)
      }
      this.nameBoxBg.drawRoundedRect(nbX, nbY, nbW, nbH, s.nameBox.borderRadius)
      this.nameBoxBg.endFill()
      this.nameBoxBg.visible = true

      this.speakerText.style.fontFamily = s.nameText.fontFamily
      this.speakerText.style.fontSize = s.nameText.fontSize
      this.speakerText.style.fill = s.nameText.color
      this.speakerText.style.letterSpacing = s.nameText.letterSpacing
      this.speakerText.style.stroke = s.nameText.strokeColor
      this.speakerText.style.strokeThickness = s.nameText.strokeWidth
      this.speakerText.text = speaker
      this.speakerText.position.set(nbX + 10, nbY + (nbH - this.speakerText.height) / 2)
      this.speakerText.visible = true
    } else {
      this.nameBoxBg.visible = false
      this.speakerText.visible = false
    }

    // ---- 对话文本 ----
    this.dialogueText.style.fontFamily = s.dialogueText.fontFamily
    this.dialogueText.style.fontSize = s.dialogueText.fontSize
    this.dialogueText.style.fill = s.dialogueText.color
    this.dialogueText.style.lineHeight = s.dialogueText.lineHeight
    this.dialogueText.style.letterSpacing = s.dialogueText.letterSpacing
    this.dialogueText.style.stroke = s.dialogueText.strokeColor
    this.dialogueText.style.strokeThickness = s.dialogueText.strokeWidth

    const txLMargin = s.dialogueText.leftMargin
    const txRMargin = s.dialogueText.rightMargin
    const txBottomMargin = s.dialogueText.bottomMargin ?? 8
    const txTopMargin = s.dialogueText.topMargin ?? 8
    const txX = boxX + textLeftShift + txLMargin
    const textAreaTopOffset = speaker ? s.nameBox.height + txTopMargin : txTopMargin
    const textAreaY = boxY + textAreaTopOffset
    const textAvailableHeight = boxHeight - textAreaTopOffset - txBottomMargin
    // 单字绘制区域额外留空，防止特殊字体上下超出标准字高导致被裁剪
    const TEXT_MASK_VERTICAL_PADDING = 6

    this.dialogueText.text = text
    this.dialogueText.style.wordWrapWidth = boxWidth - txLMargin - txRMargin - textLeftShift
    this.dialogueText.position.set(txX, textAreaY)
    this.dialogueText.visible = true

    // 裁剪遮罩
    if (!this.dialogueMask) {
      this.dialogueMask = new PIXI.Graphics()
      this.container.addChild(this.dialogueMask)
    }
    this.dialogueMask.clear()
    this.dialogueMask.beginFill(0xffffff)
    this.dialogueMask.drawRect(txX, textAreaY, boxWidth - txLMargin - txRMargin - textLeftShift, Math.max(4, textAvailableHeight + TEXT_MASK_VERTICAL_PADDING))
    this.dialogueMask.endFill()
    this.dialogueText.mask = this.dialogueMask

    this.container.visible = true
    this.mountToStage()
  }

  /**
   * 显示对话框，返回 Promise，用户点击后 resolve
   * @param avator 可选，头像文件路径，空字符串表示无头像
   * @param autoDelay 可选，自动推进延迟（ms），用于 auto 模式
   */
  async show(speaker: string | null, text: string, avator?: string, autoDelay?: number): Promise<void> {
    // 记录到历史，截断当前索引之后的部分（如果在导航后 show 新内容）
    this.dialogHistory = this.dialogHistory.slice(0, this.historyIndex + 1)
    this.dialogHistory.push({ speaker, text, avatar: avator })
    this.historyIndex = this.dialogHistory.length - 1

    // 渲染对话框 UI
    await this.renderDialog(speaker, text, avator)

    this.container.visible = true

    return new Promise<void>((resolve) => {
      this.resolveFn = resolve
      if (autoDelay && autoDelay > 0) {
        this.autoClickTimer = setTimeout(() => {
          if (this.resolveFn) {
            this.resolveFn()
            this.resolveFn = null
          }
        }, autoDelay)
      }
    })
  }

  /**
   * 渲染对话框 UI（背景、头像、姓名、文本），不处理交互逻辑
   */
  private async renderDialog(speaker: string | null, text: string, avator?: string): Promise<void> {
    const VW = VIRTUAL_WIDTH
    const VH = VIRTUAL_HEIGHT
    const s = this.style

    const boxHeight = Math.round(s.box.height)
    const boxX = Math.round(s.box.leftMargin)
    const boxWidth = Math.round(VW - s.box.leftMargin - s.box.rightMargin)
    const boxY = Math.round(VH - boxHeight - s.box.bottomMargin)

    const avW = s.avatar.width
    const avRightMargin = s.avatar.rightMargin
    const textLeftShift = avator ? avW + avRightMargin : 0

    // 绘制背景（含阴影）
    this.bg.clear()
    if (s.box.shadowBlur && s.box.shadowBlur > 0 && s.box.shadowAlpha > 0) {
      this.bg.beginFill(s.box.shadowColor, s.box.shadowAlpha)
      this.bg.drawRoundedRect(
        boxX + (s.box.shadowOffsetX ?? 0),
        boxY + (s.box.shadowOffsetY ?? 0),
        boxWidth, boxHeight,
        s.box.borderRadius
      )
      this.bg.endFill()
    }
    this.bg.beginFill(s.box.backgroundColor, s.box.backgroundAlpha)
    if (s.box.borderWidth > 0) {
      this.bg.lineStyle(s.box.borderWidth, s.box.borderColor, s.box.borderAlpha)
    }
    this.bg.drawRoundedRect(boxX, boxY, boxWidth, boxHeight, s.box.borderRadius)
    this.bg.endFill()

    // ---- 头像 ----
    this.avatarContainer.removeChildren()
    this.avatarContainer.visible = false
    this.hasAvatar = false

    if (avator) {
      try {
        const avatarTexture = await PIXI.Assets.load(avator)
        if (avatarTexture) {
          const avatarSprite = new PIXI.Sprite(avatarTexture)
          const frameW = s.avatar.width
          const frameH = s.avatar.height
          const scale = Math.min(frameW / avatarTexture.width, frameH / avatarTexture.height)
          avatarSprite.scale.set(scale)
          avatarSprite.anchor.set(0.5)
          avatarSprite.position.set(frameW / 2, boxHeight / 2)

          this.avatarContainer.addChild(avatarSprite)
          this.avatarContainer.position.set(boxX + s.avatar.leftMargin, boxY)
          this.avatarContainer.visible = true
          this.hasAvatar = true
        }
      } catch {
        this.hasAvatar = false
      }
    }

    // ---- 姓名框 ----
    if (speaker) {
      const nbX = boxX + textLeftShift + s.nameBox.leftMargin
      const nbY = boxY + 6
      const nbW = s.nameBox.width
      const nbH = s.nameBox.height

      this.nameBoxBg.clear()
      this.nameBoxBg.beginFill(s.nameBox.backgroundColor, s.nameBox.backgroundAlpha)
      if (s.nameBox.borderWidth > 0) {
        this.nameBoxBg.lineStyle(s.nameBox.borderWidth, s.nameBox.borderColor, s.nameBox.borderAlpha)
      }
      this.nameBoxBg.drawRoundedRect(nbX, nbY, nbW, nbH, s.nameBox.borderRadius)
      this.nameBoxBg.endFill()
      this.nameBoxBg.visible = true

      this.speakerText.text = speaker
      this.speakerText.position.set(nbX + 10, nbY + (nbH - this.speakerText.height) / 2)
      this.speakerText.visible = true
    } else {
      this.nameBoxBg.visible = false
      this.speakerText.visible = false
    }

    // ---- 对话文本 ----
    const txLMargin = s.dialogueText.leftMargin
    const txRMargin = s.dialogueText.rightMargin
    const txBottomMargin = s.dialogueText.bottomMargin ?? 8
    const txTopMargin = s.dialogueText.topMargin ?? 8
    const txX = boxX + textLeftShift + txLMargin

    const textAreaTopOffset = speaker ? s.nameBox.height + txTopMargin : txTopMargin
    const textAreaY = boxY + textAreaTopOffset
    const textAvailableHeight = boxHeight - textAreaTopOffset - txBottomMargin
    // 单字绘制区域额外留空，防止特殊字体上下超出标准字高导致被裁剪
    const TEXT_MASK_VERTICAL_PADDING = 6

    this.dialogueText.text = text
    this.dialogueText.style.wordWrapWidth = boxWidth - txLMargin - txRMargin - textLeftShift
    this.dialogueText.position.set(txX, textAreaY)

    if (!this.dialogueMask) {
      this.dialogueMask = new PIXI.Graphics()
      this.container.addChild(this.dialogueMask)
    }
    this.dialogueMask.clear()
    this.dialogueMask.beginFill(0xffffff)
    this.dialogueMask.drawRect(txX, textAreaY, boxWidth - txLMargin - txRMargin - textLeftShift, Math.max(4, textAvailableHeight + TEXT_MASK_VERTICAL_PADDING))
    this.dialogueMask.endFill()
    this.dialogueText.mask = this.dialogueMask

    this.mountToStage()
  }

  /**
   * 判断对话框是否正在等待用户交互（有挂起的 Promise）
   */
  isDialogShowing(): boolean {
    return this.resolveFn !== null
  }

  /**
   * 外部调用：推进到下一步
   * - 如果在浏览历史对话框，则显示历史中的下一条，不 resolve Promise
   * - 如果已经是最新对话框，则 resolve Promise 让脚本继续执行
   */
  advance(): void {
    if (this.historyIndex < this.dialogHistory.length - 1) {
      // 正在浏览历史，向前翻一页
      this.historyIndex++
      const step = this.dialogHistory[this.historyIndex]
      this.renderDialog(step.speaker, step.text, step.avatar)
    } else {
      // 已到最新对话，放行脚本
      this.resolveFn?.()
      this.resolveFn = null
    }
  }

  /**
   * 外部调用：仅在历史中向前推进，不 resolve Promise
   * 用于鼠标滚轮向下时浏览历史
   */
  advanceHistory(): void {
    if (this.historyIndex < this.dialogHistory.length - 1) {
      this.historyIndex++
      const step = this.dialogHistory[this.historyIndex]
      this.renderDialog(step.speaker, step.text, step.avatar)
    }
  }

  /**
   * 判断是否正在浏览历史（不是最新对话）
   */
  isBrowsingHistory(): boolean {
    return this.historyIndex < this.dialogHistory.length - 1
  }

  /**
   * 外部调用：回退到上一步
   * 从历史中重新显示上一条对话，不 resolve Promise
   */
  goBack(): void {
    if (this.historyIndex > 0) {
      this.historyIndex--
      const step = this.dialogHistory[this.historyIndex]
      this.renderDialog(step.speaker, step.text, step.avatar)
    }
  }

  /**
   * 隐藏对话框
   * 注意：必须在重置 resolveFn 之前调用 resolve()，
   * 否则脚本中断时 onResetUI → hide() 会导致对话 Promise 永久挂起，阻塞执行链。
   */
  hide(): void {
    this.container.visible = false
    // 先 resolve 再置 null，确保被中断的对话 Promise 能放行
    this.resolveFn?.()
    this.resolveFn = null
    if (this.autoClickTimer) {
      clearTimeout(this.autoClickTimer)
      this.autoClickTimer = null
    }
    this.bg.eventMode = 'none'
    this.bg.cursor = 'default'
  }

  /**
   * 控制对话框可见性（speech() 调用）
   */
  setVisible(visible: boolean): void {
    this.container.visible = visible
  }

  /**
   * 销毁对话框
   */
  destroy(): void {
    if (this.autoClickTimer) {
      clearTimeout(this.autoClickTimer)
      this.autoClickTimer = null
    }
    this.bg.eventMode = 'none'
    if (this.container.parent) {
      this.container.parent.removeChild(this.container)
    }
    this.container.destroy({ children: true })
  }

  /**
   * 确保容器在舞台最顶层
   */
  private mountToStage(): void {
    // 如果已挂载，先移除再重新添加到末尾（保证在最顶层）
    if (this.container.parent === this.app.stage) {
      this.app.stage.removeChild(this.container)
    }
    this.app.stage.addChild(this.container)
  }
}
