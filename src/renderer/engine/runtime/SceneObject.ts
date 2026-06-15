import { gsap } from 'gsap'
import * as PIXI from 'pixi.js'
import { GlowFilter, DropShadowFilter } from 'pixi-filters'
import { TextureCache } from './TextureCache'
import { TextureLoader } from './TextureLoader'
import { FrameAnimator } from './FrameAnimator'
import { FilterController } from './FilterController'

export interface RuntimeMap {
  type: 'map'
  entries: Record<string, number | string | boolean | null>
}

/**
 * 场景对象：所有可视元素（角色、背景等）的基类
 * 组合使用 TextureLoader（静态）、FrameAnimator（动画）、FilterController（滤镜）
 */
export class SceneObject {
  readonly _isSceneObject: true = true

  id: string
  objectType: string = 'SceneObject'
  scriptId: string = ''
  displayName: string = 'Character'
  avatorPath: string = ''
  texturePath: string = ''
  sprite: PIXI.Sprite | null = null
  _visible = false
  x = 0
  y = 0
  rotation = 0
  alpha = 1
  scaleX = 1
  scaleY = 1
  zIndex = 0

  // 组合子模块
  frameAnimator: FrameAnimator
  filterController: FilterController

  // 向后兼容属性访问器（供 ObjectMethodDispatcher 使用）
  get blurFilter(): PIXI.BlurFilter | null { return this.filterController.blurFilter }
  get colorFilter(): PIXI.ColorMatrixFilter | null { return this.filterController.colorFilter }
  get glowFilter(): GlowFilter | null { return this.filterController.glowFilter }
  get dropShadowFilter(): DropShadowFilter | null { return this.filterController.dropShadowFilter }
  get noiseFilter(): PIXI.NoiseFilter | null { return this.filterController.noiseFilter }
  get blurValue(): number { return this.filterController.blurValue }
  get brightnessValue(): number { return this.filterController.brightnessValue }
  get contrastValue(): number { return this.filterController.contrastValue }
  get saturationValue(): number { return this.filterController.saturationValue }
  get gammaValue(): number { return this.filterController.gammaValue }
  get rgbValue(): [number, number, number] { return this.filterController.rgbValue }
  get glowValue(): number { return this.filterController.glowValue }
  get noiseValue(): number { return this.filterController.noiseValue }

  get intensityValue(): number { return this.filterController.intensityValue }
  set intensityValue(val: number) { this.filterController.intensityValue = val }

  // 新增滤镜属性
  get bwValue(): number { return this.filterController.bwValue }
  get distortValue(): number { return this.filterController.distortValue }
  get psychedelicValue(): number { return this.filterController.psychedelicValue }

  get isAnimated(): boolean { return this.frameAnimator.isAnimated }
  get animFrames(): PIXI.Texture[] { return this.frameAnimator.animFrames }
  get animFrameIndex(): number { return this.frameAnimator.animFrameIndex }
  get animSpeed(): number { return this.frameAnimator.animSpeed }
  get animPlaying(): boolean { return this.frameAnimator.animPlaying }
  get animLooping(): boolean { return this.frameAnimator.animLooping }

  private app: PIXI.Application
  private sceneContainer: PIXI.Container
  private destroyTimer: ReturnType<typeof setTimeout> | null = null

  constructor(id: string, app: PIXI.Application, sceneContainer: PIXI.Container) {
    this.id = id
    this.app = app
    this.sceneContainer = sceneContainer
    app.stage.sortableChildren = true
    this.frameAnimator = new FrameAnimator(this)
    this.filterController = new FilterController(this)
  }

  /**
   * set: 加载纹理并创建 Sprite，但不加入舞台
   * 若路径为 .gif 文件且含多帧，自动解析为动图
   * 加载失败时会自动生成彩色占位纹理
   */
  async set(texturePath: string): Promise<void> {
    this.destroySprite()
    this.frameAnimator.clear()

    const result = await TextureLoader.load(texturePath, this.id)

    // 动图：保存帧序列但不保存 texturePath（GIF 帧不通过 TextureCache 管理）
    if (result.isAnimated && result.textures.length > 1) {
      this.frameAnimator.setFrames(result.textures, result.frameDelay)
    } else {
      this.texturePath = texturePath
    }

    this.sprite = new PIXI.Sprite(result.textures[0])
    this.sprite.anchor.set(0.5)
    // 世界坐标 → 屏幕坐标（中心原点，y-up → y-down）
    this.sprite.x = 960 + this.x
    this.sprite.y = 540 - this.y
    this.sprite.rotation = this.rotation
    this.sprite.alpha = this.alpha
    this.sprite.scale.set(this.scaleX, this.scaleY)
    this.sprite.zIndex = this.zIndex
    this.sprite.visible = false

    // 恢复已设置的滤镜
    this.filterController.applyFilters()
  }

  /**
   * begin: 将 Sprite 加入舞台，设置可见性
   * begin(true) = 可见（默认），begin(false) = 隐藏
   * 若为动图则自动开始播放
   */
  begin(visible = true): void {
    if (!this.sprite) return
    this.sprite.visible = visible
    this._visible = visible
    if (visible && !this.sceneContainer.children.includes(this.sprite)) {
      this.sceneContainer.addChild(this.sprite)
    }
    if (visible && this.frameAnimator.isAnimated) {
      this.frameAnimator.startAnim(false)
    }
    if (!visible) {
      this.frameAnimator.pause()
    }
  }

  /**
   * autobegin: 显示/隐藏后自动 end() 释放（旧 mode 功能的替代）
   * autobegin() = autobegin(true) 显示后自动释放
   * autobegin(false) 隐藏后自动释放
   */
  autobegin(visible = true): void {
    this.begin(visible)
    this.destroyTimer = setTimeout(() => {
      this.destroyTimer = null
      this.end()
    }, 50)
  }

  /**
   * loop: 循环播放动画（动图专用）
   */
  loopAnim(): void {
    if (!this.sprite) return
    this.sprite.visible = true
    this._visible = true
    if (!this.sceneContainer.children.includes(this.sprite)) {
      this.sceneContainer.addChild(this.sprite)
    }
    if (this.frameAnimator.isAnimated) {
      this.frameAnimator.startAnim(true)
    }
  }

  // ---- 动画委派方法 ----
  startAnim(loop: boolean): void { this.frameAnimator.startAnim(loop) }
  pauseAnim(): void { this.frameAnimator.pause() }
  stopAnim(): void { this.frameAnimator.stop() }
  setAnimSpeed(val: number): void { this.frameAnimator.setAnimSpeed(val) }
  setFPS(fps: number): void { this.frameAnimator.setFPS(fps) }
  gotoFrame(frameNum: number): void { this.frameAnimator.gotoFrame(frameNum) }

  /** 静态显示动图的指定帧 */
  showFrame(frameNum: number): void {
    if (!this.sprite) return
    this.sprite.visible = true
    this._visible = true
    if (!this.sceneContainer.children.includes(this.sprite)) {
      this.sceneContainer.addChild(this.sprite)
    }
    this.frameAnimator.pause()
    if (this.frameAnimator.isAnimated && this.frameAnimator.animFrames.length > 0 && frameNum >= 1) {
      const idx = (frameNum - 1) % this.frameAnimator.animFrames.length
      this.frameAnimator.animFrameIndex = idx
      this.sprite.texture = this.frameAnimator.animFrames[idx]
    }
  }

  /**
   * visible: 设置可见性
   * visible(true) 可见，visible(false) 隐藏（动图自动暂停）
   * 可选 time 参数产生渐显/渐隐效果
   */
  async visible(able: boolean, time?: number): Promise<void> {
    if (!this.sprite) return
    if (time && time > 0) {
      const targetAlpha = able ? 1 : 0
      const startAlpha = this.sprite.alpha
      // 渐显时先确保可见
      if (able) {
        this.sprite.visible = true
        this.sprite.alpha = 0
      }
      await this.animateToAlpha(targetAlpha, time)
      if (!able) {
        this.sprite.visible = false
      }
      this.sprite.alpha = targetAlpha
    } else {
      this.sprite.visible = able
      if (!able) {
        this.frameAnimator.pause()
      } else if (this.frameAnimator.isAnimated) {
        this.frameAnimator.startAnim(false)
      }
    }
    this._visible = able
  }

  private animateToAlpha(target: number, time: number): Promise<void> {
    return new Promise((resolve) => {
      const start = this.sprite!.alpha
      const diff = target - start
      const startTime = performance.now()
      const tick = () => {
        const elapsed = performance.now() - startTime
        const t = Math.min(1, elapsed / time)
        this.sprite!.alpha = start + diff * t
        if (t < 1) {
          requestAnimationFrame(tick)
        } else {
          resolve()
        }
      }
      tick()
    })
  }

  /** end: 彻底销毁，从舞台移除并释放纹理和滤镜资源 */
  end(): void {
    if (this.destroyTimer) {
      clearTimeout(this.destroyTimer)
      this.destroyTimer = null
    }
    this.frameAnimator.clear()
    this.filterController.destroyAll()
    this.destroySprite()
    this._visible = false
  }

  private destroySprite(): void {
    this.frameAnimator.clear()
    if (this.sprite) {
      gsap.killTweensOf(this.sprite)
      if (this.sprite.parent) {
        this.sprite.parent.removeChild(this.sprite)
      }
      if (this.texturePath && this.sprite.texture) {
        TextureCache.release(this.texturePath)
      } else if (this.sprite.texture) {
        this.sprite.texture.destroy(true)
      }
      this.texturePath = ''
      this.sprite.destroy()
      this.sprite = null
    }
  }

  // ---- 位置相关 ----

  getPos(): RuntimeMap {
    return {
      type: 'map',
      entries: {
        posX: this.x,
        posY: this.y
      }
    }
  }

  getPosX(): number {
    return this.x
  }

  getPosY(): number {
    return this.y
  }

  setPosition(x: number, y: number): void {
    this.x = x
    this.y = y
    if (this.sprite) {
      // 世界坐标 → 屏幕坐标（中心原点，y-up → y-down）
      this.sprite.x = 960 + x
      this.sprite.y = 540 - y
    }
  }

  setRotation(angle: number): void {
    this.rotation = angle
    if (this.sprite) {
      this.sprite.rotation = angle
    }
  }

  // ---- 变换相关 ----

  setAlpha(val: number): void {
    this.alpha = Math.max(0, Math.min(1, val))
    if (this.sprite) {
      this.sprite.alpha = this.alpha
    }
  }

  setScale(val: number): void {
    this.scaleX = val
    this.scaleY = val
    if (this.sprite) {
      this.sprite.scale.set(val, val)
    }
  }

  setScaleX(val: number): void {
    this.scaleX = val
    if (this.sprite) {
      this.sprite.scale.x = val
    }
  }

  setScaleY(val: number): void {
    this.scaleY = val
    if (this.sprite) {
      this.sprite.scale.y = val
    }
  }

  setScaleXY(sx: number, sy: number): void {
    this.scaleX = sx
    this.scaleY = sy
    if (this.sprite) {
      this.sprite.scale.set(sx, sy)
    }
  }

  setIndex(val: number): void {
    this.zIndex = val
    if (this.sprite) {
      this.sprite.zIndex = val
    }
  }

  // ---- 文本属性（Text 类型） ----
  textContent: string = ''
  fontSize: number = 32
  fontBold: boolean = false
  fontItalic: boolean = false
  fontUnderline: boolean = false
  fontStrikethrough: boolean = false
  fontColor: number = 0xffffff

  /** 设置文本内容并创建/更新 Text 精灵 */
  setText(text: string): void {
    this.textContent = text
    this.rebuildTextSprite()
  }

  setFontSize(size: number): void {
    this.fontSize = size
    this.rebuildTextStyle()
  }

  setFontBold(val: boolean): void {
    this.fontBold = val
    this.rebuildTextStyle()
  }

  setFontItalic(val: boolean): void {
    this.fontItalic = val
    this.rebuildTextStyle()
  }

  setFontUnderline(val: boolean): void {
    this.fontUnderline = val
    this.rebuildTextStyle()
  }

  setFontStrikethrough(val: boolean): void {
    this.fontStrikethrough = val
    this.rebuildTextStyle()
  }

  setTextColor(color: number): void {
    this.fontColor = color
    if (this.sprite) {
      this.sprite.tint = color
    }
  }

  private rebuildTextSprite(): void {
    this.destroySprite()
    this.frameAnimator.clear()

    const style = this.buildTextStyle()
    const pixiText = new PIXI.Text(this.textContent, style)
    pixiText.anchor.set(0.5)
    pixiText.x = 960 + this.x
    pixiText.y = 540 - this.y
    pixiText.rotation = this.rotation
    pixiText.alpha = this.alpha
    pixiText.scale.set(this.scaleX, this.scaleY)
    pixiText.zIndex = this.zIndex
    pixiText.visible = false

    this.sprite = pixiText as unknown as PIXI.Sprite

    // 恢复已设置的滤镜
    this.filterController.applyFilters()
  }

  private rebuildTextStyle(): void {
    if (!this.sprite || !(this.sprite instanceof PIXI.Text)) return
    const style = this.buildTextStyle()
    this.sprite.style = style
  }

  private buildTextStyle(): PIXI.TextStyle {
    const fontWeight = this.fontBold ? 'bold' : 'normal'
    const fontStyle = this.fontItalic ? 'italic' : 'normal'
    return new PIXI.TextStyle({
      fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
      fontSize: this.fontSize,
      fontWeight,
      fontStyle,
      fill: this.fontColor,
      wordWrap: true,
      wordWrapWidth: 1600,
      ...(this.fontUnderline ? { textDecoration: 'underline' as const } : {}),
      ...(this.fontStrikethrough ? { textDecoration: 'line-through' as const } : {})
    })
  }

  // ---- 滤镜委派方法 ----
  setBlur(val: number): void { this.filterController.setBlur(val) }
  setBrightness(val: number): void { this.filterController.setBrightness(val) }
  setContrast(val: number): void { this.filterController.setContrast(val) }
  setSaturation(val: number): void { this.filterController.setSaturation(val) }
  setGamma(val: number): void { this.filterController.setGamma(val) }
  setRGB(r: number, g: number, b: number): void { this.filterController.setRGB(r, g, b) }
  setHex(hex: string): void { this.filterController.setHex(hex) }
  setGlow(val: number): void { this.filterController.setGlow(val) }
  setDropShadow(distance: number): void { this.filterController.setDropShadow(distance) }
  setNoise(val: number): void { this.filterController.setNoise(val) }
  clearFilters(): void { this.filterController.clearFilters() }
  // 新增滤镜
  setBW(val: number): void { this.filterController.setBW(val) }
  setDistort(val: number): void { this.filterController.setDistort(val) }
  setPsychedelic(val: number): void { this.filterController.setPsychedelic(val) }

  setTint(color: number): void {
    if (this.sprite) {
      this.sprite.tint = color
    }
  }
}
