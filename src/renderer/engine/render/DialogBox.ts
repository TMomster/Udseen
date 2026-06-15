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
    /** 可选：顶部边距，设置后将覆盖从底部定位，改为从顶部定位 */
    topMargin?: number
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
    /** 线性变换（用于创建异形对话框，如平行四边形、旋转框等）
     * 作用于对话框背景 Graphics，内容（文本/头像）保持平直不变。
     * 角度单位：度 */
    transform?: {
      /** X 轴斜切角度（度），正=右斜 */
      skewX?: number
      /** Y 轴斜切角度（度），正=下斜 */
      skewY?: number
      /** 旋转角度（度），正=顺时针 */
      rotation?: number
    }
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
    /** 头像顶部边距：相对于对话框顶部的偏移（正=向下移），默认在对话框顶部 */
    topMargin?: number
    /** 头像圆角（0=直角方形，height/2=正圆形） */
    borderRadius?: number
    /** 头像描边颜色 */
    borderColor?: number
    /** 头像描边宽度 */
    borderWidth?: number
    /** 头像描边透明度 */
    borderAlpha?: number
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
    /** 文本对齐方式 */
    textAlign?: 'left' | 'center' | 'right'
    /** 字重：'normal' | 'bold' */
    fontWeight?: string
    /** 字体样式：'normal' | 'italic' */
    fontStyle?: string
  }
  nameText: {
    fontFamily: string
    fontSize: number
    color: string
    letterSpacing: number
    strokeColor: string
    strokeAlpha: number
    strokeWidth: number
    /** 姓名文本上边距 */
    topMargin?: number
    /** 姓名文本左边距 */
    leftMargin?: number
    /** 姓名文本下边距 */
    bottomMargin?: number
    /** 字重：'normal' | 'bold' */
    fontWeight?: string
    /** 字体样式：'normal' | 'italic' */
    fontStyle?: string
  }
  /** 自动播放进度环样式 */
  autoProgress: {
    /** 圆环直径 */
    size: number
    /** 圆环颜色 (PIXI color number) */
    color: number
    /** 圆环线条宽度 */
    width: number
    /** 圆环距对话框右上角的边距（水平和垂直共用） */
    rightMargin: number
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
    bottomMargin: 12,
    borderRadius: 12,
    borderColor: 0x6363b3,
    borderWidth: 2,
    borderAlpha: 0.5
  },
  dialogueText: {
    fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif',
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
    strokeWidth: 0,
    textAlign: 'left',
    fontWeight: 'normal',
    fontStyle: 'normal'
  },
  nameText: {
    fontFamily: 'Source Han Serif SC, Noto Serif SC, SimSun, serif',
    fontSize: 18,
    color: '#d4a843',
    letterSpacing: 2,
    strokeColor: '#000000',
    strokeAlpha: 0,
    strokeWidth: 0,
    topMargin: 0,
    leftMargin: 10,
    bottomMargin: 0,
    fontWeight: 'bold',
    fontStyle: 'normal'
  },
  autoProgress: {
    size: 36,
    color: 0x7c6ff0,
    width: 3,
    rightMargin: 16,
  },
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
  /** 自动播放进度环 */
  private progressRing: PIXI.Graphics
  /** 进度环背景圆 */
  private progressRingBg: PIXI.Graphics
  /** 进度环动画开始时间 */
  private progressStartTime = 0
  /** 进度环总时长 */
  private progressDuration = 0
  /** 进度环中心 X */
  private progressCenterX = 0
  /** 进度环中心 Y */
  private progressCenterY = 0
  /** 进度环动画 ticker 函数引用 */
  private progressTickerFn: (() => void) | null = null
  /** 对话框历史记录，支持上一步/下一步导航 */
  private dialogHistory: Array<{ speaker: string | null; text: string; avatar?: string }> = []
  /** 当前在历史中的索引 */
  private historyIndex: number = -1
  /** 头像纹理缓存 key -> Texture（避免多次加载同一头像文件） */
  private avatarTextureCache = new Map<string, PIXI.Texture>()
  /** 组件销毁标记，用于防止异步回调访问已销毁实例 */
  private _destroyed = false

  constructor(app: PIXI.Application, style?: Partial<DialogStyle>) {
    this.app = app
    // 深度合并：传入的 style 可能只包含部分字段（如 JSON 解析结果），缺失字段回退到 DEFAULT_STYLE
    this.style = {
      box: { ...DEFAULT_STYLE.box, ...style?.box },
      nameBox: { ...DEFAULT_STYLE.nameBox, ...style?.nameBox },
      avatar: { ...DEFAULT_STYLE.avatar, ...style?.avatar },
      dialogueText: { ...DEFAULT_STYLE.dialogueText, ...style?.dialogueText },
      nameText: { ...DEFAULT_STYLE.nameText, ...style?.nameText },
      autoProgress: { ...DEFAULT_STYLE.autoProgress, ...style?.autoProgress },
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

    // 自动播放进度环背景圆（默认隐藏）
    this.progressRingBg = new PIXI.Graphics()
    this.progressRingBg.visible = false
    this.container.addChild(this.progressRingBg)
    // 自动播放进度环（默认隐藏）- 最后添加确保在最上层
    this.progressRing = new PIXI.Graphics()
    this.progressRing.visible = false
    this.container.addChild(this.progressRing)

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

    // 对话框尺寸和位置（支持 topMargin 从顶部定位）
    const boxHeight = Math.round(s.box.height)
    const boxX = Math.round(s.box.leftMargin)
    const boxWidth = Math.round(VW - s.box.leftMargin - s.box.rightMargin)
    const boxY = s.box.topMargin !== undefined
      ? Math.round(s.box.topMargin)
      : Math.round(VH - boxHeight - s.box.bottomMargin)

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

    // 异形对话框变换（斜切/旋转作用于背景 Graphics，不影响文本和头像）
    const tf = s.box.transform
    if (tf) {
      this.bg.skew.set(
        (tf.skewX ?? 0) * Math.PI / 180,
        (tf.skewY ?? 0) * Math.PI / 180
      )
      this.bg.rotation = (tf.rotation ?? 0) * Math.PI / 180
    } else {
      this.bg.skew.set(0, 0)
      this.bg.rotation = 0
    }

    // ---- 头像（预览用占位图形，支持圆角、描边和顶部偏移） ----
    this.clearAvatarChildren()
    this.avatarContainer.visible = false
    this.hasAvatar = false
    if (hasAvatar) {
      const placeholder = new PIXI.Graphics()
      const avRadius = s.avatar.borderRadius ?? Math.min(avW, s.avatar.height) / 2
      placeholder.beginFill(0xcccccc, 0.4)
      if (s.avatar.borderWidth && s.avatar.borderWidth > 0) {
        placeholder.lineStyle(s.avatar.borderWidth, s.avatar.borderColor ?? 0xffffff, s.avatar.borderAlpha ?? 0.5)
      }
      placeholder.drawRoundedRect(0, 0, avW, s.avatar.height, avRadius)
      placeholder.endFill()
      this.avatarContainer.addChild(placeholder)
      this.avatarContainer.position.set(
        boxX + s.avatar.leftMargin,
        boxY + (s.avatar.topMargin ?? 0)
      )
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

      // 更新姓名文本样式（含新属性）
      this.speakerText.style.fontFamily = s.nameText.fontFamily
      this.speakerText.style.fontSize = s.nameText.fontSize
      this.speakerText.style.fill = s.nameText.color
      this.speakerText.style.letterSpacing = s.nameText.letterSpacing
      this.speakerText.style.stroke = s.nameText.strokeColor
      this.speakerText.style.strokeThickness = s.nameText.strokeWidth
      this.speakerText.style.fontWeight = s.nameText.fontWeight ?? 'bold'
      this.speakerText.style.fontStyle = s.nameText.fontStyle ?? 'normal'
      this.speakerText.text = speaker
      const ntLM = s.nameText.leftMargin ?? 10
      this.speakerText.position.set(nbX + ntLM, nbY + (nbH - this.speakerText.height) / 2)
      this.speakerText.visible = true
    } else {
      this.nameBoxBg.visible = false
      this.speakerText.visible = false
    }

    // ---- 对话文本（支持对齐、粗体、斜体） ----
    this.dialogueText.style.fontFamily = s.dialogueText.fontFamily
    this.dialogueText.style.fontSize = s.dialogueText.fontSize
    this.dialogueText.style.fill = s.dialogueText.color
    this.dialogueText.style.lineHeight = s.dialogueText.lineHeight
    this.dialogueText.style.letterSpacing = s.dialogueText.letterSpacing
    this.dialogueText.style.stroke = s.dialogueText.strokeColor
    this.dialogueText.style.strokeThickness = s.dialogueText.strokeWidth
    this.dialogueText.style.fontWeight = s.dialogueText.fontWeight ?? 'normal'
    this.dialogueText.style.fontStyle = s.dialogueText.fontStyle ?? 'normal'

    const txAlign = s.dialogueText.textAlign ?? 'left'
    const txLMargin = s.dialogueText.leftMargin
    const txRMargin = s.dialogueText.rightMargin
    const txBottomMargin = s.dialogueText.bottomMargin ?? 8
    const txTopMargin = s.dialogueText.topMargin ?? 8
    const contentWidth = boxWidth - txLMargin - txRMargin - textLeftShift
    const txX = boxX + textLeftShift + txLMargin
    const textAreaTopOffset = speaker ? s.nameBox.height + txTopMargin : txTopMargin
    const textAreaY = boxY + textAreaTopOffset
    const textAvailableHeight = boxHeight - textAreaTopOffset - txBottomMargin
    const TEXT_MASK_VERTICAL_PADDING = 6

    this.dialogueText.text = text
    this.dialogueText.style.wordWrapWidth = contentWidth
    this.dialogueText.position.set(txX, textAreaY)
    this.dialogueText.visible = true

    // 裁剪遮罩
    if (!this.dialogueMask) {
      this.dialogueMask = new PIXI.Graphics()
      this.container.addChild(this.dialogueMask)
    }
    this.dialogueMask.clear()
    this.dialogueMask.beginFill(0xffffff)
    this.dialogueMask.drawRect(txX, textAreaY, contentWidth, Math.max(4, textAvailableHeight + TEXT_MASK_VERTICAL_PADDING))
    this.dialogueMask.endFill()
    this.dialogueText.mask = this.dialogueMask

    this.container.visible = true
    this.mountToStage()
  }

  /**
   * 显示对话框，返回 Promise，用户点击后 resolve
   * @param avator 可选，头像文件路径，空字符串表示无头像
   * @param autoDelay 可选，自动推进延迟（ms），用于 auto 模式
   * @param audioDurationMs 可选，绑定的音频时长（ms），用于进度环同步音频进度
   */
  async show(speaker: string | null, text: string, avator?: string, autoDelay?: number, audioDurationMs?: number, visible: boolean = true): Promise<void> {
    // 组件已销毁，跳过所有操作（防止组件卸载后异步回调访问已释放的 PIXI 资源）
    if (this._destroyed) return

    // 记录到历史，截断当前索引之后的部分（如果在导航后 show 新内容）
    this.dialogHistory = this.dialogHistory.slice(0, this.historyIndex + 1)
    this.dialogHistory.push({ speaker, text, avatar: avator })
    this.historyIndex = this.dialogHistory.length - 1

    // 渲染对话框 UI
    await this.renderDialog(speaker, text, avator)

    this.container.visible = visible

    // 计算进度环位置
    const s = this.style
    const boxWidth = Math.round(VIRTUAL_WIDTH - s.box.leftMargin - s.box.rightMargin)
    const boxX = Math.round(s.box.leftMargin)
    const boxHeight = Math.round(s.box.height)
    const boxY = s.box.topMargin !== undefined
      ? Math.round(s.box.topMargin)
      : Math.round(VIRTUAL_HEIGHT - boxHeight - s.box.bottomMargin)
    this.progressCenterX = boxX + boxWidth - s.autoProgress.rightMargin - s.autoProgress.size / 2
    this.progressCenterY = boxY + s.autoProgress.rightMargin + s.autoProgress.size / 2

    return new Promise<void>((resolve) => {
      this.resolveFn = resolve

      // 进度环动画时长：
      // - 自动模式（autoDelay 存在）：使用 autoDelay 作为总时长，环归零即自动推进
      // - 非自动模式（autoDelay 无，但 audioDurationMs 存在）：使用音频时长，展示音频播放进度
      const animDuration = (autoDelay && autoDelay > 0) ? autoDelay : (audioDurationMs ?? 0)
      if (animDuration > 0) {
        this.startProgressAnimation(animDuration)
      }

      // 自动推进定时器（仅当 autoDelay 明确 >0 时设置）
      if (autoDelay && autoDelay > 0) {
        this.autoClickTimer = setTimeout(() => {
          this.stopProgressAnimation()
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
    const boxY = s.box.topMargin !== undefined
      ? Math.round(s.box.topMargin)
      : Math.round(VH - boxHeight - s.box.bottomMargin)

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

    // 异形对话框变换（斜切/旋转作用于背景 Graphics，不影响文本和头像）
    const tf = s.box.transform
    if (tf) {
      this.bg.skew.set(
        (tf.skewX ?? 0) * Math.PI / 180,
        (tf.skewY ?? 0) * Math.PI / 180
      )
      this.bg.rotation = (tf.rotation ?? 0) * Math.PI / 180
    } else {
      this.bg.skew.set(0, 0)
      this.bg.rotation = 0
    }

    // ---- 头像（支持圆角、描边和顶部偏移） ----
    this.clearAvatarChildren()
    this.avatarContainer.visible = false
    this.hasAvatar = false

    if (avator) {
      try {
        // 从缓存获取或加载头像纹理
        let avatarTexture = this.avatarTextureCache.get(avator)
        if (!avatarTexture) {
          avatarTexture = await PIXI.Assets.load(avator)
          this.avatarTextureCache.set(avator, avatarTexture)
        }
        if (avatarTexture) {
          const frameW = s.avatar.width
          const frameH = s.avatar.height
          const avRadius = s.avatar.borderRadius ?? Math.min(frameW, frameH) / 2

          // 头像遮罩（圆角/圆形裁剪）
          const mask = new PIXI.Graphics()
          mask.beginFill(0xffffff)
          mask.drawRoundedRect(0, 0, frameW, frameH, avRadius)
          mask.endFill()

          // 头像精灵
          const avatarSprite = new PIXI.Sprite(avatarTexture)
          const scale = Math.min(frameW / avatarTexture.width, frameH / avatarTexture.height)
          avatarSprite.scale.set(scale)
          avatarSprite.anchor.set(0.5)
          avatarSprite.position.set(frameW / 2, frameH / 2)
          avatarSprite.mask = mask

          this.avatarContainer.addChild(mask)
          this.avatarContainer.addChild(avatarSprite)

          // 头像描边
          if (s.avatar.borderWidth && s.avatar.borderWidth > 0) {
            const border = new PIXI.Graphics()
            border.lineStyle(s.avatar.borderWidth, s.avatar.borderColor ?? 0xffffff, s.avatar.borderAlpha ?? 0.5)
            border.drawRoundedRect(0, 0, frameW, frameH, avRadius)
            this.avatarContainer.addChild(border)
          }

          this.avatarContainer.position.set(boxX + s.avatar.leftMargin, boxY + (s.avatar.topMargin ?? 0))
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

      // 更新姓名文本样式（含新属性）
      this.speakerText.style.fontWeight = s.nameText.fontWeight ?? 'bold'
      this.speakerText.style.fontStyle = s.nameText.fontStyle ?? 'normal'
      this.speakerText.text = speaker
      const ntLM = s.nameText.leftMargin ?? 10
      this.speakerText.position.set(nbX + ntLM, nbY + (nbH - this.speakerText.height) / 2)
      this.speakerText.visible = true
    } else {
      this.nameBoxBg.visible = false
      this.speakerText.visible = false
    }

    // ---- 对话文本（支持对齐、粗体、斜体） ----
    this.dialogueText.style.fontWeight = s.dialogueText.fontWeight ?? 'normal'
    this.dialogueText.style.fontStyle = s.dialogueText.fontStyle ?? 'normal'

    const txAlign = s.dialogueText.textAlign ?? 'left'
    const txLMargin = s.dialogueText.leftMargin
    const txRMargin = s.dialogueText.rightMargin
    const txBottomMargin = s.dialogueText.bottomMargin ?? 8
    const txTopMargin = s.dialogueText.topMargin ?? 8
    const contentWidth = boxWidth - txLMargin - txRMargin - textLeftShift
    const txX = boxX + textLeftShift + txLMargin

    const textAreaTopOffset = speaker ? s.nameBox.height + txTopMargin : txTopMargin
    const textAreaY = boxY + textAreaTopOffset
    const textAvailableHeight = boxHeight - textAreaTopOffset - txBottomMargin
    const TEXT_MASK_VERTICAL_PADDING = 6

    this.dialogueText.text = text
    this.dialogueText.style.wordWrapWidth = contentWidth
    this.dialogueText.position.set(txX, textAreaY)

    if (!this.dialogueMask) {
      this.dialogueMask = new PIXI.Graphics()
      this.container.addChild(this.dialogueMask)
    }
    this.dialogueMask.clear()
    this.dialogueMask.beginFill(0xffffff)
    this.dialogueMask.drawRect(txX, textAreaY, contentWidth, Math.max(4, textAvailableHeight + TEXT_MASK_VERTICAL_PADDING))
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
      this.stopProgressAnimation()
      if (this.autoClickTimer) {
        clearTimeout(this.autoClickTimer)
        this.autoClickTimer = null
      }
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
    this.stopProgressAnimation()
    // 先 resolve 再置 null，确保被中断的对话 Promise 能放行
    this.resolveFn?.()
    this.resolveFn = null
    if (this.autoClickTimer) {
      clearTimeout(this.autoClickTimer)
      this.autoClickTimer = null
    }
    this.bg.eventMode = 'none'
    this.bg.cursor = 'default'
    this.progressRingBg.visible = false
  }

  /**
   * 清除头像容器所有子节点，保留缓存的纹理不销毁（由本类生命周期管理）
   */
  private clearAvatarChildren(): void {
    while (this.avatarContainer.children.length > 0) {
      const child = this.avatarContainer.children[0]
      if (child instanceof PIXI.Sprite) {
        // Sprite 使用缓存的纹理，不销毁纹理，只销毁 Sprite 自身
        child.destroy({ children: true, texture: false })
      } else {
        child.destroy()
      }
    }
  }

  /**
   * 控制对话框可见性（speech() 调用）
   */
  setVisible(visible: boolean): void {
    this.container.visible = visible
  }

  /**
   * 设置舞台偏移（用于全屏模式下整体上移）
   */
  setStageOffset(x: number, y: number): void {
    this.container.x = x
    this.container.y = y
  }

  /**
   * 销毁对话框
   */
  destroy(): void {
    this._destroyed = true
    this.stopProgressAnimation()
    if (this.autoClickTimer) {
      clearTimeout(this.autoClickTimer)
      this.autoClickTimer = null
    }
    // 销毁所有缓存的头像纹理，释放 GPU 内存
    for (const [, texture] of this.avatarTextureCache) {
      texture.destroy(true)
    }
    this.avatarTextureCache.clear()
    this.bg.eventMode = 'none'
    this.progressRingBg.visible = false
    if (this.container.parent) {
      this.container.parent.removeChild(this.container)
    }
    this.container.destroy({ children: true })
  }

  /**
   * 启动自动播放进度环动画
   */
  private startProgressAnimation(duration: number): void {
    this.progressDuration = duration
    this.progressStartTime = performance.now()
    this.progressRing.visible = true
    this.progressRingBg.visible = true
    // 绘制初始满圆
    this.drawProgressRing(1)

    const tickerFn = (): void => {
      const elapsed = performance.now() - this.progressStartTime
      const ratio = Math.max(0, 1 - elapsed / this.progressDuration)
      this.drawProgressRing(ratio)
      if (ratio <= 0 && this.progressTickerFn) {
        this.app.ticker.remove(this.progressTickerFn)
        this.progressTickerFn = null
      }
    }
    this.progressTickerFn = tickerFn
    this.app.ticker.add(tickerFn)
  }

  /**
   * 绘制进度环（弧形）
   * @param progress 0~1 的进度值，1=满圆
   */
  private drawProgressRing(progress: number): void {
    const ap = this.style.autoProgress
    const radius = ap.size / 2
    const cx = this.progressCenterX
    const cy = this.progressCenterY

    // 绘制半透明背景圆
    this.progressRingBg.clear()
    this.progressRingBg.lineStyle(ap.width * 0.5, ap.color, 0.15)
    this.progressRingBg.drawCircle(cx, cy, radius)

    // 绘制进度弧
    this.progressRing.clear()
    if (progress <= 0) return

    const innerR = Math.max(1, radius - ap.width / 2)
    this.progressRing.lineStyle(ap.width, ap.color, 0.9)
    // 从 12 点钟方向顺时针画弧
    this.progressRing.arc(
      cx, cy, innerR,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress
    )
  }

  /**
   * 停止进度环动画并隐藏
   */
  private stopProgressAnimation(): void {
    if (this.progressTickerFn) {
      this.app.ticker.remove(this.progressTickerFn)
      this.progressTickerFn = null
    }
    this.progressRing.visible = false
    this.progressRing.clear()
    this.progressRingBg.visible = false
    this.progressRingBg.clear()
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
