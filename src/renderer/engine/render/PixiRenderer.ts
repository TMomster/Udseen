import * as PIXI from 'pixi.js'
import { AnimationQueue } from '../runtime/AnimationQueue'

/** 虚拟舞台逻辑分辨率（所有脚本坐标基于此空间） */
export const VIRTUAL_WIDTH = 1920
export const VIRTUAL_HEIGHT = 1080

/**
 * 渲染适配器接口
 */
export interface IRenderer {
  init(container: HTMLElement, width: number, height: number): Promise<void>
  destroy(): void
  getApp(): PIXI.Application
  getSceneContainer(): PIXI.Container
  getAnimQueue(): AnimationQueue
  setBackgroundColor(color: number): void
  resize(width: number, height: number): void
  getVirtualWidth(): number
  getVirtualHeight(): number
  /** 当前容器 → 虚拟空间的缩放比例 */
  getScale(): number
  /** 显示/隐藏演出区域边界 */
  setBorderVisible(visible: boolean): void
  /** 动态修改虚拟高度 */
  setVirtualHeight(height: number): void
  /**
   * 全屏模式：contain 等比缩放 + margin:auto 居中（与 resize 完全一致）
   * 确保全屏和预览模式下坐标计算方式完全统一。
   * 调用时机：进入全屏或全屏 resize 时
   */
  resizeFullscreen(containerWidth: number, containerHeight: number): void
}

/**
 * PixiJS 渲染适配器实现
 *
 * 虚拟舞台坐标系统：
 * - 舞台始终以 VIRTUAL_WIDTH × VIRTUAL_HEIGHT（1920×1080）的逻辑分辨率渲染
 * - Canvas 通过 CSS 等比缩放（contain 模式）并 margin:auto 居中适配实际容器尺寸
 * - 所有脚本中的坐标值（x, y, move 等）都基于虚拟空间，在不同屏幕上效果一致
 *
 * 全屏模式：
 * - 与预览模式完全相同的 contain 等比缩放 + margin:auto 居中
 * - 两种模式下坐标计算方式完全一致（均匀缩放 scaleX = scaleY）
 * - 使用 margin:auto 而非 CSS transform 居中，避免亚像素偏移
 */
export class PixiRenderer implements IRenderer {
  private app: PIXI.Application | null = null
  private sceneContainer: PIXI.Container | null = null
  private animQueue = new AnimationQueue()
  private container: HTMLElement | null = null
  private _virtualWidth = VIRTUAL_WIDTH
  private _virtualHeight = VIRTUAL_HEIGHT
  /** 当前是否处于全屏展示模式 */
  private _isFullscreen = false
  /** 坐标系校准偏移（虚拟空间像素），通过 CSS transform 平移 canvas 元素实现，不影响 PIXI 内部坐标 */
  private _calibrationOffsetX = 0
  private _calibrationOffsetY = 0

  async init(container: HTMLElement): Promise<void> {
    this.container = container

    this.app = new PIXI.Application({
      width: this._virtualWidth,
      height: this._virtualHeight,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      // resolution 上限 2x，避免 3x Retina 屏幕浪费 GPU 像素（性能与画质平衡点）
      // autoDensity: false 表示我们完全控制 CSS 尺寸，PIXI 不会覆盖我们的 CSS 设置
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: false,
      powerPreference: 'high-performance'
    })

    // 启用舞台子节点排序，确保 DialogBox/ChoicePanel 能通过 zIndex 或添加顺序保持在顶层
    this.app.stage.sortableChildren = true

    // 创建场景容器：所有角色/背景精灵放入此容器，滤镜作用于此处，不覆盖对话框/选项面板
    this.sceneContainer = new PIXI.Container()
    this.app.stage.addChild(this.sceneContainer)

    const canvas = this.app.view as HTMLCanvasElement
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.right = '0'
    canvas.style.top = '0'
    canvas.style.bottom = '0'
    canvas.style.margin = 'auto'
    canvas.style.transform = 'none'
    container.appendChild(canvas)

    // FPS cap for performance
    this.app.ticker.maxFPS = 60
  }

  destroy(): void {
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true })
      this.app = null
    }
    if (this.container) {
      this.container.innerHTML = ''
    }
  }

  getApp(): PIXI.Application {
    if (!this.app) throw new Error('Renderer not initialized')
    return this.app
  }

  getSceneContainer(): PIXI.Container {
    if (!this.sceneContainer) throw new Error('Renderer not initialized')
    return this.sceneContainer
  }

  getAnimQueue(): AnimationQueue {
    return this.animQueue
  }

  getVirtualWidth(): number {
    return this._virtualWidth
  }

  getVirtualHeight(): number {
    return this._virtualHeight
  }

  /** 当前容器 → 虚拟空间的缩放比例 */
  getScale(): number {
    if (!this.container) return 1
    const { width, height } = this.container.getBoundingClientRect()
    return Math.min(width / this._virtualWidth, height / this._virtualHeight)
  }

  /** 设置坐标系校准偏移（虚拟空间像素），通过 CSS transform 平移 canvas 实现 */
  setCalibrationOffset(x: number, y: number): void {
    this._calibrationOffsetX = x
    this._calibrationOffsetY = y
    this._applyCalibrationTransform()
  }

  /** 将存储的校准偏移转换为 CSS 像素并应用到 canvas 的 CSS transform */
  private _applyCalibrationTransform(): void {
    if (!this.app) return
    const canvas = this.app.view as HTMLCanvasElement
    const scale = this.getScale()
    const dx = Math.round(this._calibrationOffsetX * scale)
    const dy = Math.round(this._calibrationOffsetY * scale)
    if (dx === 0 && dy === 0) {
      canvas.style.transform = 'none'
    } else {
      canvas.style.transform = `translate(${dx}px, ${dy}px)`
    }
  }

  setBackgroundColor(color: number): void {
    if (this.app) {
      this.app.renderer.background.color = color
    }
  }

  /**
   * 根据容器实际尺寸 CSS 等比缩放舞台 Canvas（非全屏模式）
   * 与 resizeFullscreen 使用完全相同的 contain 缩放 + margin:auto 居中，
   * 确保两种模式下坐标计算方式完全一致。
   */
  resize(width: number, height: number): void {
    if (!this.app) return
    this._isFullscreen = false
    const scale = Math.min(width / this._virtualWidth, height / this._virtualHeight)
    const canvas = this.app.view as HTMLCanvasElement
    // 使用与 resizeFullscreen 完全相同的居中方式
    canvas.style.left = '0'
    canvas.style.right = '0'
    canvas.style.top = '0'
    canvas.style.bottom = '0'
    canvas.style.margin = 'auto'
    canvas.style.transform = 'none'
    canvas.style.width = `${Math.round(this._virtualWidth * scale)}px`
    canvas.style.height = `${Math.round(this._virtualHeight * scale)}px`
    // resize 后重新应用校准偏移的 CSS transform（覆盖上面的 'none'）
    this._applyCalibrationTransform()
  }

  /** 动态修改虚拟高度（内部分辨率 + 舞台 hitArea），用于演出区域裁切放大 */
  setVirtualHeight(height: number): void {
    if (!this.app) return
    if (height === this._virtualHeight) return
    this._virtualHeight = height
    // 只修改内部渲染缓冲区尺寸（canvas 的 width/height 属性），
    // CSS 尺寸由外层 resize/resizeFullscreen 独立控制，不受影响
    this.app.renderer.resize(this._virtualWidth, height)
    this.app.stage.hitArea = new PIXI.Rectangle(0, 0, this._virtualWidth, height)
  }

  /**
   * 全屏模式 resize：与预览模式完全一致的 contain 等比缩放 + 居中，
   * 确保两种模式下坐标计算方式完全统一。
   *
   * 关键设计：
   * - 计算 scale = min(containerWidth/VIRTUAL_WIDTH, containerHeight/_virtualHeight)
   * - CSS 尺寸 = Math.round(VIRTUAL_WIDTH × scale) × Math.round(_virtualHeight × scale)
   * - 使用 margin: auto 实现像素级精确居中，避免 transform:translate 的亚像素偏移
   *
   * 这样全屏和预览的坐标映射完全一致：scaleX = scaleY（均匀缩放），
   * handleMouseMove 中的 scale = canvasRect.width / VIRTUAL_WIDTH 对 X/Y 轴均成立。
   */
  resizeFullscreen(containerWidth: number, containerHeight: number): void {
    if (!this.app) return
    this._isFullscreen = true
    const scale = Math.min(containerWidth / this._virtualWidth, containerHeight / this._virtualHeight)
    const canvas = this.app.view as HTMLCanvasElement
    // 使用 margin:auto 居中（left/right/top/bottom=0 使浏览器自动计算精确像素偏移）
    // 比 transform: translate(-50%, -50%) 更可靠，没有亚像素问题
    canvas.style.left = '0'
    canvas.style.right = '0'
    canvas.style.top = '0'
    canvas.style.bottom = '0'
    canvas.style.margin = 'auto'
    canvas.style.transform = 'none'
    canvas.style.width = `${Math.round(this._virtualWidth * scale)}px`
    canvas.style.height = `${Math.round(this._virtualHeight * scale)}px`
    // resizeFullscreen 后重新应用校准偏移的 CSS transform（覆盖上面的 'none'）
    this._applyCalibrationTransform()
  }

  /** 显示/隐藏演出区域边界（非全屏编辑时帮助用户确认组件位置） */
  setBorderVisible(visible: boolean): void {
    if (!this.app) return
    const canvas = this.app.view as HTMLCanvasElement
    if (visible) {
      canvas.style.outline = '1px solid rgba(255,255,255,0.2)'
    } else {
      canvas.style.outline = 'none'
    }
  }
}
