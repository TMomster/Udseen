import * as PIXI from 'pixi.js'
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './PixiRenderer'

/**
 * 对话框样式配置
 *
 * 定位方式：对话框 box 使用边距（相对屏幕边缘），
 * 内部元素（姓名框、头像、对话文本、姓名文本）使用
 * 相对于对话框背景框左上角的直接 X/Y 绝对坐标，
 * 可自由放置在框内任意位置。
 */
export interface HistoryEntry {
  speaker: string | null
  text: string
  avatar?: string
  audioPath?: string
}

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
    /** 是否显示头像（false = 即使提供了头像也忽略，用于电影模板等） */
    showAvatar?: boolean
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
    /** X 坐标：相对于对话框左边缘的偏移量（0 = 最左端） */
    x: number
    /** Y 坐标：相对于对话框上边缘的偏移量（0 = 最顶端） */
    y: number
    width: number
    height: number
    backgroundColor: number
    backgroundAlpha: number
    borderColor: number
    borderAlpha: number
    borderWidth: number
    borderRadius: number
  }
  avatar: {
    /** X 坐标：相对于对话框左边缘的偏移量（0 = 紧贴左边缘） */
    x: number
    /** Y 坐标：相对于对话框上边缘的偏移量（0 = 紧贴上边缘） */
    y: number
    width: number
    height: number
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
    /** X 坐标：文本区域左边缘，相对于对话框左边缘 */
    x: number
    /** Y 坐标：文本区域上边缘，相对于对话框上边缘 */
    y: number
    /** 文本区域宽度（即 wordWrapWidth） */
    width: number
    /** 文本区域高度 */
    height: number
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
    /** X 坐标：姓名文本在姓名框内的水平偏移量 */
    x: number
    /** Y 坐标：姓名文本在姓名框内的垂直偏移量（不设置则居中） */
    y?: number
    /** 文本对齐方式：left | center | right */
    textAlign?: 'left' | 'center' | 'right'
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
    /** 圆环中心 X：相对于对话框右边缘的距离（正数=向左偏移） */
    x: number
    /** 圆环中心 Y：相对于对话框上边缘的偏移量 */
    y: number
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
    x: 24,
    y: 6,
    width: 160,
    height: 40,
    backgroundColor: 0x1a1a3a,
    backgroundAlpha: 0.9,
    borderColor: 0x6363b3,
    borderAlpha: 0.4,
    borderWidth: 1,
    borderRadius: 6
  },
  avatar: {
    x: 16,
    y: 0,
    width: 130,
    height: 130,
    borderRadius: 12,
    borderColor: 0x6363b3,
    borderWidth: 2,
    borderAlpha: 0.5
  },
  dialogueText: {
    fontFamily: "'Smiley Sans','Source Han Sans SC','Noto Sans SC','Microsoft YaHei',sans-serif",
    fontSize: 26,
    color: '#e8e8f0',
    x: 12,
    y: 54,
    width: 1736,
    height: 150,
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
    fontFamily: "'Smiley Sans','Source Han Sans SC','Noto Sans SC','Microsoft YaHei',sans-serif",
    fontSize: 18,
    color: '#d4a843',
    letterSpacing: 2,
    strokeColor: '#000000',
    strokeAlpha: 0,
    strokeWidth: 0,
    x: 10,
    y: undefined,
    textAlign: 'left',
    fontWeight: 'bold',
    fontStyle: 'normal'
  },
  autoProgress: {
    size: 36,
    color: 0x7c6ff0,
    width: 3,
    x: 34,
    y: 34,
  },
}

// ─── 样式应用与对齐辅助函数 ─────────────────────────────────

/**
 * 一次性构建对话文本的完整 TextStyle 并应用到 PIXI.Text 对象。
 * 在设置 .text 之前调用，确保 align/wordWrap 等样式完整生效。
 */
function applyDialogueTextStyles(
  textObj: PIXI.Text,
  config: DialogStyle['dialogueText'],
  contentWidth: number,
  align: string
): void {
  textObj.style = new PIXI.TextStyle({
    fontFamily: config.fontFamily,
    fontSize: config.fontSize as number,
    fill: config.color,
    lineHeight: config.lineHeight as number,
    letterSpacing: config.letterSpacing as number,
    stroke: config.strokeColor,
    strokeThickness: config.strokeWidth as number,
    fontWeight: config.fontWeight ?? 'normal',
    fontStyle: config.fontStyle ?? 'normal',
    wordWrap: true,
    wordWrapWidth: contentWidth,
    align: align as 'left' | 'center' | 'right' | 'justify'
  })
}

/**
 * 一次性构建姓名文本的完整 TextStyle 并应用到 PIXI.Text 对象。
 */
function applyNameTextStyles(
  textObj: PIXI.Text,
  config: DialogStyle['nameText'],
  wrapWidth: number
): void {
  const opts: Record<string, unknown> = {
    fontFamily: config.fontFamily,
    fontSize: config.fontSize as number,
    fill: config.color,
    letterSpacing: config.letterSpacing as number,
    stroke: config.strokeColor,
    strokeThickness: config.strokeWidth as number,
    wordWrap: true,
    wordWrapWidth: wrapWidth,
    align: (config.textAlign ?? 'left')
  }
  if (config.fontWeight) opts.fontWeight = config.fontWeight
  if (config.fontStyle) opts.fontStyle = config.fontStyle
  textObj.style = new PIXI.TextStyle(opts as PIXI.ITextStyle)
}

/**
 * 手动计算文本对齐的 X 偏移量。
 *
 * PIXI.js 的 `TextStyle.align` 只对多行文本生效，单行文本始终居左渲染。
 * 此函数在文本内容已设置后调用，通过测量 `textObj.width` 来手动计算偏移，
 * 从而支持单行和多行文本的正确居左/居中/居右。
 *
 * @param textObj  已经设置好样式和内容的 PIXI.Text 对象
 * @param containerWidth  文本容器的宽度（即 wordWrapWidth）
 * @param align  对齐方式 'left' | 'center' | 'right'
 * @returns 需要增加到原始 X 位置的偏移量（像素）
 */
function computeAlignOffset(textObj: PIXI.Text, containerWidth: number, align: string): number {
  if (align === 'left') return 0
  const textWidth = textObj.width
  if (align === 'center') return Math.max(0, (containerWidth - textWidth) / 2)
  if (align === 'right') return Math.max(0, containerWidth - textWidth)
  return 0
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
  private dialogHistory: HistoryEntry[] = []
  /** 当前在历史中的索引 */
  private historyIndex: number = -1
  /** 头像纹理缓存 key -> Texture（避免多次加载同一头像文件） */
  private avatarTextureCache = new Map<string, PIXI.Texture>()
  /** 组件销毁标记，用于防止异步回调访问已销毁实例 */
  private _destroyed = false

  // ── 逐字播放相关 ──
  /** 逐字播放每字符延迟（毫秒） */
  private _typingDelay = 40
  /** 逐字播放定时器句柄 */
  private _typingTimeoutId: ReturnType<typeof setTimeout> | null = null
  /** 完整文本 */
  private _fullText = ''
  /** 是否正在逐字播放中 */
  private _isTyping = false
  /** 文本布局参数缓存（逐字播放时用于重新计算对齐偏移） */
  private _textLayout: { txX: number; contentWidth: number; txAlign: string; textAreaY: number } | null = null

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

    // ---- 头像（预览用占位图形，支持圆角、描边） ----
    // 使用相对于 box 左上角的直接 XY 坐标定位
    this.clearAvatarChildren()
    this.avatarContainer.visible = false
    this.hasAvatar = false
    if (hasAvatar && (s.box.showAvatar ?? true)) {
      const placeholder = new PIXI.Graphics()
      const avRadius = s.avatar.borderRadius ?? Math.min(s.avatar.width, s.avatar.height) / 2
      placeholder.beginFill(0xcccccc, 0.4)
      if (s.avatar.borderWidth && s.avatar.borderWidth > 0) {
        placeholder.lineStyle(s.avatar.borderWidth, s.avatar.borderColor ?? 0xffffff, s.avatar.borderAlpha ?? 0.5)
      }
      placeholder.drawRoundedRect(0, 0, s.avatar.width, s.avatar.height, avRadius)
      placeholder.endFill()
      this.avatarContainer.addChild(placeholder)
      this.avatarContainer.position.set(
        boxX + s.avatar.x,
        boxY + s.avatar.y
      )
      this.avatarContainer.visible = true
      this.hasAvatar = true
    }

    // ---- 姓名框 ----
    // 使用相对于 box 左上角的直接 XY 坐标定位，可在框内任意位置放置
    if (speaker) {
      const nbX = boxX + s.nameBox.x
      const nbY = boxY + s.nameBox.y
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

      // 更新姓名文本样式
      const ntX = s.nameText.x
      const nameWrapWidth = Math.max(nbW - ntX * 2, 10)
      applyNameTextStyles(this.speakerText, s.nameText, nameWrapWidth)
      this.speakerText.text = speaker
      const nameOffset = computeAlignOffset(this.speakerText, nameWrapWidth, s.nameText.textAlign ?? 'left')
      // Y 坐标：若配置了 nameText.y 则使用，否则垂直居中于姓名框
      const ntY = s.nameText.y !== undefined ? s.nameText.y : (nbH - this.speakerText.height) / 2
      this.speakerText.position.set(nbX + ntX + nameOffset, nbY + ntY)
      this.speakerText.visible = true
    } else {
      this.nameBoxBg.visible = false
      this.speakerText.visible = false
    }

    // ---- 对话文本（支持对齐、粗体、斜体） ----
    // 使用相对于 box 左上角的直接 XY 坐标和宽高定位文本区域
    const txAlign = s.dialogueText.textAlign ?? 'left'
    const contentWidth = Math.round(s.dialogueText.width)
    const txX = boxX + s.dialogueText.x
    const textAreaY = boxY + s.dialogueText.y
    const textAreaH = s.dialogueText.height
    const TEXT_MASK_VERTICAL_PADDING = 6

    applyDialogueTextStyles(this.dialogueText, s.dialogueText, contentWidth, txAlign)
    this.dialogueText.text = text
    const alignOffset = computeAlignOffset(this.dialogueText, contentWidth, txAlign)
    this.dialogueText.position.set(txX + alignOffset, textAreaY)
    this.dialogueText.visible = true

    // 裁剪遮罩
    if (!this.dialogueMask) {
      this.dialogueMask = new PIXI.Graphics()
      this.container.addChild(this.dialogueMask)
    }
    this.dialogueMask.clear()
    this.dialogueMask.beginFill(0xffffff)
    this.dialogueMask.drawRect(txX, textAreaY, contentWidth, Math.max(4, textAreaH + TEXT_MASK_VERTICAL_PADDING))
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
  async show(speaker: string | null, text: string, avator?: string, autoDelay?: number, audioDurationMs?: number, visible: boolean = true, audioPath?: string): Promise<void> {
    // 组件已销毁，跳过所有操作（防止组件卸载后异步回调访问已释放的 PIXI 资源）
    if (this._destroyed) return

    // 记录到历史，截断当前索引之后的部分（如果在导航后 show 新内容）
    this.dialogHistory = this.dialogHistory.slice(0, this.historyIndex + 1)
    this.dialogHistory.push({ speaker, text, avatar: avator, audioPath })
    this.historyIndex = this.dialogHistory.length - 1

    // 渲染对话框 UI（renderDialog 会设置完整文本，稍后逐字显示）
    await this.renderDialog(speaker, text, avator)
    this._fullText = text

    this.container.visible = visible

    // 逐字播放动画：从空文本开始逐字显示
    // 跳过模式（autoDelay <= 10ms）时直接显示全文，不播放打字动画
    if (autoDelay !== undefined && autoDelay <= 10) {
      this.dialogueText.text = text
      this._applyTypingPosition()
    } else {
      await this._startTyping(text)
    }

    // 计算进度环位置（使用相对于 box 右边缘/上边缘的直接 XY 坐标）
    const s = this.style
    const boxWidth = Math.round(VIRTUAL_WIDTH - s.box.leftMargin - s.box.rightMargin)
    const boxX = Math.round(s.box.leftMargin)
    const boxHeight = Math.round(s.box.height)
    const boxY = s.box.topMargin !== undefined
      ? Math.round(s.box.topMargin)
      : Math.round(VIRTUAL_HEIGHT - boxHeight - s.box.bottomMargin)
    this.progressCenterX = boxX + boxWidth - s.autoProgress.x
    this.progressCenterY = boxY + s.autoProgress.y

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

    if (avator && (s.box.showAvatar ?? true)) {
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

          this.avatarContainer.position.set(boxX + s.avatar.x, boxY + s.avatar.y)
          this.avatarContainer.visible = true
          this.hasAvatar = true
        }
      } catch {
        this.hasAvatar = false
      }
    }

    // ---- 姓名框 ----
    // 使用相对于 box 左上角的直接 XY 坐标
    if (speaker) {
      const nbX = boxX + s.nameBox.x
      const nbY = boxY + s.nameBox.y
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

      // 姓名文本
      const ntX = s.nameText.x
      const nameWrapWidth = Math.max(nbW - ntX * 2, 10)
      applyNameTextStyles(this.speakerText, s.nameText, nameWrapWidth)
      this.speakerText.text = speaker
      const nameOffset = computeAlignOffset(this.speakerText, nameWrapWidth, s.nameText.textAlign ?? 'left')
      const ntY = s.nameText.y !== undefined ? s.nameText.y : (nbH - this.speakerText.height) / 2
      this.speakerText.position.set(nbX + ntX + nameOffset, nbY + ntY)
      this.speakerText.visible = true
    } else {
      this.nameBoxBg.visible = false
      this.speakerText.visible = false
    }

    // ---- 对话文本（支持对齐、粗体、斜体） ----
    const txAlign = s.dialogueText.textAlign ?? 'left'
    const contentWidth = Math.round(s.dialogueText.width)
    const txX = boxX + s.dialogueText.x
    const textAreaY = boxY + s.dialogueText.y
    const textAreaH = s.dialogueText.height
    const TEXT_MASK_VERTICAL_PADDING = 6

    applyDialogueTextStyles(this.dialogueText, s.dialogueText, contentWidth, txAlign)
    this.dialogueText.text = text
    const alignOffset = computeAlignOffset(this.dialogueText, contentWidth, txAlign)
    this.dialogueText.position.set(txX + alignOffset, textAreaY)

    // 缓存文本布局参数，供逐字播放时重新计算对齐偏移
    this._textLayout = { txX, contentWidth, txAlign, textAreaY }

    if (!this.dialogueMask) {
      this.dialogueMask = new PIXI.Graphics()
      this.container.addChild(this.dialogueMask)
    }
    this.dialogueMask.clear()
    this.dialogueMask.beginFill(0xffffff)
    this.dialogueMask.drawRect(txX, textAreaY, contentWidth, Math.max(4, textAreaH + TEXT_MASK_VERTICAL_PADDING))
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
   * - 如果在逐字播放中 → 跳过打字显示全文，不 resolve Promise
   * - 如果在浏览历史对话框，则显示历史中的下一条，不 resolve Promise
   * - 如果已经是最新对话框，则 resolve Promise 让脚本继续执行
   */
  advance(): void {
    // 正在逐字播放 → 跳过打字，显示全文，但不放行
    if (this._isTyping) {
      this._skipTyping()
      return
    }

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
   * 获取完整对话历史
   */
  getHistory(): HistoryEntry[] {
    return this.dialogHistory.slice()
  }

  /**
   * 获取当前历史索引
   */
  getHistoryIndex(): number {
    return this.historyIndex
  }

  /**
   * 跳转到历史中指定索引位置（用于对话历史面板点击）
   */
  goToHistory(index: number): void {
    if (index < 0 || index >= this.dialogHistory.length) return
    if (index === this.historyIndex) {
      // 已经在当前位置，重新渲染一次确保显示正确
      const step = this.dialogHistory[index]
      this.renderDialog(step.speaker, step.text, step.avatar)
      return
    }
    this.historyIndex = index
    const step = this.dialogHistory[index]
    this.renderDialog(step.speaker, step.text, step.avatar)
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
    // 清理逐字播放
    if (this._typingTimeoutId) {
      clearTimeout(this._typingTimeoutId)
      this._typingTimeoutId = null
    }
    this._isTyping = false
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
   * 设置逐字播放速度
   * @param speed 'slow'（80ms/字）| 'medium'（40ms/字）| 'fast'（15ms/字）
   */
  setTypingSpeed(speed: 'slow' | 'medium' | 'fast'): void {
    switch (speed) {
      case 'slow': this._typingDelay = 80; break
      case 'medium': this._typingDelay = 40; break
      case 'fast': this._typingDelay = 15; break
    }
  }

  /**
   * 设置舞台偏移（用于全屏模式下整体上移）
   */
  setStageOffset(x: number, y: number): void {
    this.container.x = x
    this.container.y = y
  }

  // ── 逐字播放辅助方法 ──

  /**
   * 开始逐字播放
   * @returns Promise，所有字符显示完成后 resolve
   */
  private _startTyping(fullText: string): Promise<void> {
    return new Promise<void>((resolve) => {
      if (fullText.length === 0) {
        resolve()
        return
      }
      this._isTyping = true
      // 清空文本，从零开始逐字显示
      this.dialogueText.text = ''
      this._applyTypingPosition()

      let index = 0
      const typeNext = (): void => {
        if (this._destroyed) {
          this._isTyping = false
          resolve()
          return
        }
        if (index < fullText.length) {
          this.dialogueText.text = fullText.substring(0, index + 1)
          this._applyTypingPosition()
          index++
          this._typingTimeoutId = setTimeout(typeNext, this._typingDelay)
        } else {
          // 打字完成
          this._isTyping = false
          this._typingTimeoutId = null
          resolve()
        }
      }
      // 立即开始打第一个字
      typeNext()
    })
  }

  /**
   * 跳过逐字播放，立即显示完整文本
   */
  private _skipTyping(): void {
    if (this._typingTimeoutId) {
      clearTimeout(this._typingTimeoutId)
      this._typingTimeoutId = null
    }
    this._isTyping = false
    this.dialogueText.text = this._fullText
    this._applyTypingPosition()
  }

  /**
   * 根据当前文本内容重新计算对齐偏移并设置位置
   */
  private _applyTypingPosition(): void {
    const layout = this._textLayout
    if (!layout) return
    const alignOffset = computeAlignOffset(this.dialogueText, layout.contentWidth, layout.txAlign)
    this.dialogueText.position.set(layout.txX + alignOffset, layout.textAreaY)
  }

  /**
   * 销毁对话框
   */
  destroy(): void {
    this._destroyed = true
    this.stopProgressAnimation()
    if (this._typingTimeoutId) {
      clearTimeout(this._typingTimeoutId)
      this._typingTimeoutId = null
    }
    this._isTyping = false
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
