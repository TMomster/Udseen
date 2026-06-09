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
}

/**
 * PixiJS 渲染适配器实现
 *
 * 虚拟舞台坐标系统：
 * - 舞台始终以 VIRTUAL_WIDTH × VIRTUAL_HEIGHT（1920×1080）的逻辑分辨率渲染
 * - Canvas 通过 CSS 等比缩放并居中适配实际容器尺寸
 * - 所有脚本中的坐标值（x, y, move 等）都基于虚拟空间，在不同屏幕上效果一致
 */
export class PixiRenderer implements IRenderer {
  private app: PIXI.Application | null = null
  private sceneContainer: PIXI.Container | null = null
  private animQueue = new AnimationQueue()
  private container: HTMLElement | null = null
  private _virtualWidth = VIRTUAL_WIDTH
  private _virtualHeight = VIRTUAL_HEIGHT

  async init(container: HTMLElement): Promise<void> {
    this.container = container

    this.app = new PIXI.Application({
      width: this._virtualWidth,
      height: this._virtualHeight,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      // 限制分辨率为 1，避免 Retina 屏幕下 GPU 显存翻 4 倍
      // PixiJS 通过 autoDensity + CSS scale 仍可保持画面清晰度
      resolution: 1,
      autoDensity: true,
      powerPreference: 'high-performance'
    })

    // 启用舞台子节点排序，确保 DialogBox/ChoicePanel 能通过 zIndex 或添加顺序保持在顶层
    this.app.stage.sortableChildren = true

    // 创建场景容器：所有角色/背景精灵放入此容器，滤镜作用于此处，不覆盖对话框/选项面板
    this.sceneContainer = new PIXI.Container()
    this.app.stage.addChild(this.sceneContainer)

    const canvas = this.app.view as HTMLCanvasElement
    canvas.style.position = 'absolute'
    canvas.style.left = '50%'
    canvas.style.top = '50%'
    canvas.style.transform = 'translate(-50%, -50%)'
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

  setBackgroundColor(color: number): void {
    if (this.app) {
      this.app.renderer.background.color = color
    }
  }

  /**
   * 根据容器实际尺寸 CSS 等比缩放舞台 Canvas
   * 不改变 PixiJS 内部渲染分辨率，仅调整 CSS 显示大小
   */
  resize(width: number, height: number): void {
    if (!this.app) return
    const scale = Math.min(width / this._virtualWidth, height / this._virtualHeight)
    const canvas = this.app.view as HTMLCanvasElement
    canvas.style.width = `${Math.round(this._virtualWidth * scale)}px`
    canvas.style.height = `${Math.round(this._virtualHeight * scale)}px`
    // 居中已由 CSS absolute + transform 保证
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
