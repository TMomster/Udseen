import { gsap } from 'gsap'
import * as PIXI from 'pixi.js'
import { GlowFilter, DropShadowFilter } from 'pixi-filters'
// PIXI.NoiseFilter 已内置在 pixi.js v7 核心中
import { parseGIF, decompressFrames } from 'gifuct-js'

/**
 * 运行时映射表类型
 */
export interface RuntimeMap {
  type: 'map'
  entries: Record<string, number | string | boolean | null>
}

/**
 * 场景对象：所有可视元素（角色、背景等）的基类
 */
export class SceneObject {
  /** 类型标记，用于 HMR 环境下可靠地识别 SceneObject */
  readonly _isSceneObject: true = true

  id: string
  /** 对象类型名称（如 "Character"、"Background"、"Voice"），用于 ObjectFunction 类型分发 */
  objectType: string = 'SceneObject'
  /** 显示名称（用于对话框） */
  displayName: string = 'Character'
  /** 头像路径（由 Character.set() 的第三个参数传入，空字符串表示无头像） */
  avatorPath: string = ''
  sprite: PIXI.Sprite | null = null
  visible = false
  x = 0
  y = 0
  rotation = 0
  alpha = 1
  scaleX = 1
  scaleY = 1
  zIndex = 0

  /** 滤镜引用（public，供动画系统访问） */
  blurFilter: PIXI.BlurFilter | null = null
  colorFilter: PIXI.ColorMatrixFilter | null = null
  glowFilter: GlowFilter | null = null
  dropShadowFilter: DropShadowFilter | null = null
  noiseFilter: PIXI.NoiseFilter | null = null

  /** 当前滤镜值（用于动画插值追踪） */
  blurValue: number = 0
  brightnessValue: number = 1
  contrastValue: number = 1
  saturationValue: number = 1
  gammaValue: number = 1
  rgbValue: [number, number, number] = [255, 255, 255]
  glowValue: number = 0
  noiseValue: number = 0

  /** 滤镜强度 0~1.0，默认 1 = 全强度 */
  intensityValue: number = 1

  // ---- 动图动画状态 ----
  /** 是否为动图（多帧 GIF） */
  isAnimated: boolean = false
  /** 动图各帧纹理 */
  animFrames: PIXI.Texture[] = []
  /** 当前播放帧索引 */
  animFrameIndex: number = 0
  /** 播放倍速，1.0 = 原始帧率 */
  animSpeed: number = 1
  /** 是否正在播放 */
  animPlaying: boolean = false
  /** 是否循环播放 */
  animLooping: boolean = false

  private app: PIXI.Application
  private sceneContainer: PIXI.Container
  /** 动图帧动画 rAF ID */
  private animRAFId: number | null = null
  /** 上一帧时间戳 */
  private animLastTime: number = 0
  /** 每帧间隔（毫秒） */
  private animFrameDelay: number = 100
  /** GIF 原始帧间隔（毫秒），用于 fps(0) 恢复默认 */
  private originalFrameDelay: number = 100
  /** begin(mode!=0) 创建的自动销毁定时器，用于在 end() 或中断时取消 */
  private destroyTimer: ReturnType<typeof setTimeout> | null = null

  constructor(id: string, app: PIXI.Application, sceneContainer: PIXI.Container) {
    this.id = id
    this.app = app
    this.sceneContainer = sceneContainer
    // 启用舞台的子节点排序，以支持 zIndex
    app.stage.sortableChildren = true
  }

  /**
   * set: 加载纹理并创建 Sprite，但不加入舞台
   * 若路径为 .gif 文件且含多帧，自动解析为动图
   * 加载失败时会自动生成彩色占位纹理
   */
  async set(texturePath: string): Promise<void> {
    this.destroySprite()
    this.clearAnim()

    // 尝试作为 GIF 动图加载
    if (texturePath.toLowerCase().endsWith('.gif')) {
      const loaded = await this.loadAnimatedGIF(texturePath)
      if (loaded && this.animFrames.length > 0) {
        // 使用第一帧作为初始纹理
        this.sprite = new PIXI.Sprite(this.animFrames[0])
        this.sprite.anchor.set(0.5)
        this.sprite.x = 960 + this.x
        this.sprite.y = 540 - this.y
        this.sprite.rotation = this.rotation
        this.sprite.alpha = this.alpha
        this.sprite.scale.set(this.scaleX, this.scaleY)
        this.sprite.zIndex = this.zIndex
        this.sprite.visible = false
        this.applyFilters()
        return
      }
    }

    // 普通图片或 GIF 解析失败时走原流程
    const texture = await this.loadTexture(texturePath)

    this.sprite = new PIXI.Sprite(texture)
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
    this.applyFilters()
  }

  /**
   * 加载纹理：先尝试 PIXI.Assets.load，失败后使用原生 Image 元素加载
   */
  private async loadTexture(path: string): Promise<PIXI.Texture> {
    // 尝试 PIXI.Assets.load
    try {
      return await PIXI.Assets.load(path)
    } catch {
      // Assets.load 失败，使用原生 Image 元素
    }

    // 使用原生 Image 元素加载（最可靠，绕过 Vite/PixiJS 内部加载问题）
    try {
      const texture = await new Promise<PIXI.Texture>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = (): void => {
          const base = new PIXI.BaseTexture(img, { resolution: 1 })
          resolve(new PIXI.Texture(base))
        }
        img.onerror = (): void => {
          reject(new Error(`Image load failed: ${path}`))
        }
        img.src = path
      })
      return texture
    } catch (err) {
      console.error('[Udseen] 纹理加载失败:', path, err)
      return this.createPlaceholderTexture()
    }
  }

  /**
   * 生成彩色占位纹理（图片加载失败时使用）
   */
  private createPlaceholderTexture(): PIXI.Texture {
    const isBg = this.id.toLowerCase().includes('bg')
    const g = new PIXI.Graphics()
    const w = isBg ? 800 : 200
    const h = isBg ? 600 : 400

    // 背景或角色占位
    if (isBg) {
      g.beginFill(0x2d4a6f)
      g.drawRect(0, 0, w, h)
      g.endFill()
      // 加一些装饰线条
      g.lineStyle(2, 0x3a5f8f)
      g.moveTo(0, 100)
      g.lineTo(w, 100)
      g.moveTo(0, 200)
      g.lineTo(w, 200)
    } else {
      // 角色身体
      g.beginFill(0xff69b4)
      g.drawRoundedRect(50, 0, 100, h, 20)
      g.endFill()
      // 头部
      g.beginFill(0xff1493)
      g.drawCircle(w / 2, 80, 50)
      g.endFill()
    }

    const texture = g.geometry ? this.app.renderer.generateTexture(g) : PIXI.Texture.WHITE
    g.destroy()
    return texture
  }

  /** 解析 GIF 文件为帧纹理数组 */
  private async loadAnimatedGIF(path: string): Promise<boolean> {
    try {
      const response = await fetch(path)
      const buffer = await response.arrayBuffer()
      const gif = parseGIF(buffer)
      const frames = decompressFrames(gif, true)

      if (frames.length <= 1) {
        console.log('[Udseen] GIF 仅含 1 帧，作为静态图处理')
        return false
      }

      // 计算 GIF 完整画布大小
      let maxW = 0, maxH = 0
      for (const f of frames) {
        maxW = Math.max(maxW, f.dims.left + f.dims.width)
        maxH = Math.max(maxH, f.dims.top + f.dims.height)
      }

      // 共享合成 canvas（逐帧叠加，根据 disposal type 处理清除）
      const compositeCanvas = document.createElement('canvas')
      compositeCanvas.width = maxW
      compositeCanvas.height = maxH
      const compositeCtx = compositeCanvas.getContext('2d')!

      const textures: PIXI.Texture[] = []
      let totalDelay = 0

      // 保存每帧合成状态的 ImageData 快照，用于处理 Disposal Method 3 (Restore to Previous)
      const frameSnapshots: (ImageData | null)[] = []

      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]

        // ========== 在绘制当前帧之前，根据前一帧的 disposal type 处理残留 ==========
        if (i > 0) {
          const prevFrame = frames[i - 1]
          const prevDisposal = prevFrame.disposalType as number

          if (prevDisposal === 2) {
            // Restore to Background：清除前一帧的矩形区域为透明
            compositeCtx.clearRect(
              prevFrame.dims.left,
              prevFrame.dims.top,
              prevFrame.dims.width,
              prevFrame.dims.height
            )
          } else if (prevDisposal === 3) {
            // Restore to Previous：恢复为前两帧的合成状态
            const prevSnapshot = i >= 2 ? frameSnapshots[i - 2] : null
            if (prevSnapshot) {
              compositeCtx.putImageData(prevSnapshot, 0, 0)
            }
          }
          // disposalType === 0 或 1 (Do Not Dispose)：不清除，继续叠加
        }

        // ========== 绘制当前帧 ==========
        const patchData = f.patch as unknown as ArrayBuffer
        const imageData = new ImageData(
          new Uint8ClampedArray(patchData),
          f.dims.width,
          f.dims.height
        )
        compositeCtx.putImageData(imageData, f.dims.left, f.dims.top)

        // ========== 保存当前帧的快照（供后续 Restore to Previous 使用） ==========
        const snapshot = compositeCtx.getImageData(0, 0, maxW, maxH)
        frameSnapshots.push(snapshot)

        // ========== 每帧独立 canvas 创建纹理 ==========
        const frameCanvas = document.createElement('canvas')
        frameCanvas.width = maxW
        frameCanvas.height = maxH
        const frameCtx = frameCanvas.getContext('2d')!
        frameCtx.drawImage(compositeCanvas, 0, 0)

        const tex = PIXI.Texture.from(frameCanvas)
        textures.push(tex)
        totalDelay += f.delay
      }

      this.animFrames = textures
      this.isAnimated = true
      // delay 单位为 1/100 秒 → 转为毫秒，取平均帧间隔
      this.animFrameDelay = frames.length > 0
        ? Math.max(16, (totalDelay / frames.length) * 10)
        : 100
      this.originalFrameDelay = this.animFrameDelay

      compositeCanvas.remove()
      console.log(`[Udseen] GIF 动画加载成功: ${frames.length} 帧`)
      return true
    } catch (err) {
      console.error('[Udseen] GIF 解析失败:', path, err)
      return false
    }
  }

  /** rAF 帧循环：按帧间隔切换纹理 */
  private animTick = (now: number): void => {
    if (!this.animPlaying || !this.sprite || this.animFrames.length === 0) return

    const delay = this.animFrameDelay / Math.max(0.1, this.animSpeed)
    const elapsed = now - this.animLastTime

    if (elapsed >= delay) {
      this.animFrameIndex++
      if (this.animFrameIndex >= this.animFrames.length) {
        console.log('[Udseen] animTick 结束, looping=', this.animLooping, 'frames=', this.animFrames.length)
        if (this.animLooping) {
          this.animFrameIndex = 0
        } else {
          // 非循环播放结束：停在最后一帧，不重置到第 0 帧
          this.animFrameIndex = this.animFrames.length - 1
          this.sprite.texture = this.animFrames[this.animFrameIndex]
          this.pauseAnim()
          return
        }
      }
      this.sprite.texture = this.animFrames[this.animFrameIndex]
      this.animLastTime = now
    }

    this.animRAFId = requestAnimationFrame(this.animTick)
  }

  /** 启动帧动画播放 */
  startAnim(loop: boolean): void {
    if (!this.isAnimated || this.animFrames.length === 0) return
    this.stopAnim()  // 先停止旧动画
    this.animPlaying = true
    this.animLooping = loop
    this.animFrameIndex = 0
    this.animLastTime = performance.now()
    if (this.sprite) {
      this.sprite.texture = this.animFrames[0]
    }
    this.animRAFId = requestAnimationFrame(this.animTick)
  }

  /** 暂停动画 */
  pauseAnim(): void {
    this.animPlaying = false
    if (this.animRAFId !== null) {
      cancelAnimationFrame(this.animRAFId)
      this.animRAFId = null
    }
  }

  /** 停止动画并重置到第一帧 */
  stopAnim(): void {
    this.pauseAnim()
    this.animFrameIndex = 0
    if (this.sprite && this.animFrames.length > 0) {
      this.sprite.texture = this.animFrames[0]
    }
  }

  /** 清除动画帧纹理 */
  private clearAnim(): void {
    this.stopAnim()
    this.isAnimated = false
    for (const tex of this.animFrames) {
      tex.destroy(true)
    }
    this.animFrames = []
    this.animSpeed = 1
    this.animLooping = false
    this.animFrameDelay = 100
  }

  /**
   * begin: 将 Sprite 加入舞台，设置为可见
   * 若为动图则自动开始播放
   * mode=0: 需要手动 end() 释放
   * mode!=0: 显示后自动 end() 释放（适用于配音/音效等一次性资源）
   */
  begin(mode = 0): void {
    if (!this.sprite) return
    this.sprite.visible = true
    this.visible = true
    if (!this.sceneContainer.children.includes(this.sprite)) {
      this.sceneContainer.addChild(this.sprite)
    }
    // 动图自动开始播放
    if (this.isAnimated) {
      this.startAnim(false)
    }
    // mode!=0 表示一次性使用，显示后自动销毁
    if (mode !== 0) {
      // 延迟一帧后自动销毁，确保画面已渲染
      // 保存定时器 ID 以便在 end() 或中断时取消，防止脚本中止后残留回调
      this.destroyTimer = setTimeout(() => {
        this.destroyTimer = null
        this.end()
      }, 50)
    }
  }

  /**
   * loop: 循环播放动画（动图专用）
   * 与 begin() 的区别在于 loop 会自动循环播放帧动画
   */
  loopAnim(): void {
    if (!this.sprite) return
    this.sprite.visible = true
    this.visible = true
    if (!this.sceneContainer.children.includes(this.sprite)) {
      this.sceneContainer.addChild(this.sprite)
    }
    if (this.isAnimated) {
      this.startAnim(true)
    }
  }

  /**
   * 设置动画播放倍速
   */
  setAnimSpeed(val: number): void {
    this.animSpeed = Math.max(0.1, val)
  }

  /**
   * 设置动图帧率（FPS），覆盖 GIF 原始帧间隔
   * fps=0 时恢复原始 GIF 帧率
   */
  setFPS(fps: number): void {
    if (fps <= 0) {
      this.animFrameDelay = this.originalFrameDelay
    } else {
      this.animFrameDelay = Math.max(16, 1000 / fps)
    }
  }

  /**
   * 跳转到指定帧（1 起始），超出总帧数时自动环绕
   */
  gotoFrame(frameNum: number): void {
    if (frameNum <= 0 || !this.sprite || this.animFrames.length === 0) return
    const idx = (frameNum - 1) % this.animFrames.length
    this.animFrameIndex = idx
    this.sprite.texture = this.animFrames[idx]
  }

  /**
   * frame: 将 Sprite 加入舞台，静态显示动图的指定帧（默认第 1 帧），不播放
   * 与 begin() 的区别：不动画，只显示静态帧
   * 与 loop() 的区别：不循环，只显示一帧
   */
  showFrame(frameNum: number): void {
    if (!this.sprite) return
    this.sprite.visible = true
    this.visible = true
    if (!this.sceneContainer.children.includes(this.sprite)) {
      this.sceneContainer.addChild(this.sprite)
    }
    // 暂停任何正在播放的动画
    this.pauseAnim()
    // 跳转到指定帧
    if (this.isAnimated && this.animFrames.length > 0 && frameNum >= 1) {
      const idx = (frameNum - 1) % this.animFrames.length
      this.animFrameIndex = idx
      this.sprite.texture = this.animFrames[idx]
    }
  }

  /**
   * hide: 隐藏但不销毁（动图自动暂停）
   */
  hide(): void {
    if (this.sprite) {
      this.sprite.visible = false
    }
    this.visible = false
    this.pauseAnim()
  }

  /**
   * end: 彻底销毁，从舞台移除并释放纹理和滤镜资源
   */
  end(): void {
    // 取消自动销毁定时器（防止中断脚本后残留 setTimeout 回调执行已销毁的对象）
    if (this.destroyTimer) {
      clearTimeout(this.destroyTimer)
      this.destroyTimer = null
    }
    this.clearAnim()
    // 释放滤镜 GPU 资源
    if (this.blurFilter) {
      this.blurFilter.destroy()
      this.blurFilter = null
    }
    if (this.colorFilter) {
      this.colorFilter.destroy()
      this.colorFilter = null
    }
    if (this.glowFilter) {
      this.glowFilter.destroy()
      this.glowFilter = null
    }
    if (this.dropShadowFilter) {
      this.dropShadowFilter.destroy()
      this.dropShadowFilter = null
    }
    if (this.noiseFilter) {
      this.noiseFilter.destroy()
      this.noiseFilter = null
    }
    this.destroySprite()
    this.visible = false
  }

  private destroySprite(): void {
    this.clearAnim()
    if (this.sprite) {
      // 先杀死该 sprite 上的 GSAP 动画，防止 GSAP 的 rAF tick 尝试操作已销毁的精灵
      gsap.killTweensOf(this.sprite)
      if (this.sprite.parent) {
        this.sprite.parent.removeChild(this.sprite)
      }
      if (this.sprite.texture) {
        this.sprite.texture.destroy(true)
      }
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

  // ---- 滤镜相关 ----

  private applyFilters(): void {
    if (!this.sprite) return
    const filters: PIXI.Filter[] = []
    if (this.blurFilter) filters.push(this.blurFilter)
    if (this.colorFilter) filters.push(this.colorFilter)
    if (this.glowFilter) filters.push(this.glowFilter)
    if (this.dropShadowFilter) filters.push(this.dropShadowFilter)
    if (this.noiseFilter) filters.push(this.noiseFilter)
    this.sprite.filters = filters.length > 0 ? filters : null
  }

  /** 高斯模糊 0~2.0 */
  setBlur(val: number): void {
    this.blurValue = val
    if (!this.blurFilter) {
      this.blurFilter = new PIXI.BlurFilter()
    }
    this.blurFilter.blur = Math.max(0, val * 10) * this.intensityValue // 转为像素级
    this.applyFilters()
  }

  /** 使用 ColorMatrixFilter 调整颜色 */
  private getOrCreateColorFilter(): PIXI.ColorMatrixFilter {
    if (!this.colorFilter) {
      this.colorFilter = new PIXI.ColorMatrixFilter()
    }
    return this.colorFilter
  }

  /** 明度 0~2.0 */
  setBrightness(val: number): void {
    this.brightnessValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    // 在单位矩阵（1.0）和目标值之间按强度插值
    const effective = 1 + (Math.max(0, val) - 1) * this.intensityValue
    cf.brightness(effective, true)
    this.applyFilters()
  }

  /** 对比度 0~2.0 */
  setContrast(val: number): void {
    this.contrastValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    const effective = 1 + (Math.max(0, val) - 1) * this.intensityValue
    cf.contrast(effective, true)
    this.applyFilters()
  }

  /** 饱和度 0~2.0 */
  setSaturation(val: number): void {
    this.saturationValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    const effective = 1 + (Math.max(0, val) - 1) * this.intensityValue
    cf.saturate(Math.max(0, effective - 1), true) // saturate 是增量
    this.applyFilters()
  }

  /** 伽马值 */
  setGamma(val: number): void {
    this.gammaValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    // 在单位矩阵（伽马=1）和目标值之间按强度插值
    const effectiveGamma = 1 + (Math.max(0.1, val) - 1) * this.intensityValue
    const invGamma = 1 / effectiveGamma
    cf.matrix = [
      invGamma, 0, 0, 0, 0,
      0, invGamma, 0, 0, 0,
      0, 0, invGamma, 0, 0,
      0, 0, 0, 1, 0
    ]
    this.applyFilters()
  }

  /** RGB 颜色滤镜 (r, g, b) 0~255 */
  setRGB(r: number, g: number, b: number): void {
    this.rgbValue = [r, g, b]
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    // 在单位矩阵对应值（255）和目标值之间按强度插值
    const factor = this.intensityValue
    const er = Math.max(0, Math.min(255, 255 + (r - 255) * factor))
    const eg = Math.max(0, Math.min(255, 255 + (g - 255) * factor))
    const eb = Math.max(0, Math.min(255, 255 + (b - 255) * factor))
    cf.matrix = [
      er / 255, 0, 0, 0, 0,
      0, eg / 255, 0, 0, 0,
      0, 0, eb / 255, 0, 0,
      0, 0, 0, 1, 0
    ]
    this.applyFilters()
  }

  /** Hex 颜色滤镜 */
  setHex(hex: string): void {
    // 解析 hex 字符串
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      this.setRGB(r, g, b)
    }
  }

  /** 发光效果 0~1.0 */
  setGlow(val: number): void {
    this.glowValue = val
    if (val <= 0) {
      if (this.glowFilter) {
        this.glowFilter.destroy()
        this.glowFilter = null
      }
      this.applyFilters()
      return
    }
    const effective = val * this.intensityValue
    if (!this.glowFilter) {
      this.glowFilter = new GlowFilter({
        outerStrength: effective * 4,
        innerStrength: effective * 2,
        color: 0xffffff,
        quality: 0.5
      })
    } else {
      this.glowFilter.outerStrength = effective * 4
      this.glowFilter.innerStrength = effective * 2
    }
    this.applyFilters()
  }

  /** 投影效果 */
  setDropShadow(distance: number): void {
    if (distance <= 0) {
      if (this.dropShadowFilter) {
        this.dropShadowFilter.destroy()
        this.dropShadowFilter = null
      }
      this.applyFilters()
      return
    }
    const effective = Math.max(0, distance) * this.intensityValue
    if (!this.dropShadowFilter) {
      this.dropShadowFilter = new DropShadowFilter({
        distance: effective,
        blur: Math.max(1, effective * 0.5),
        color: 0x000000,
        alpha: 0.5 * this.intensityValue,
        quality: 0.5
      })
    } else {
      this.dropShadowFilter.distance = effective
      this.dropShadowFilter.blur = Math.max(1, effective * 0.5)
      this.dropShadowFilter.alpha = 0.5 * this.intensityValue
    }
    this.applyFilters()
  }

  /** 噪点效果 0~1.0 */
  setNoise(val: number): void {
    this.noiseValue = val
    if (val <= 0) {
      if (this.noiseFilter) {
        this.noiseFilter.destroy()
        this.noiseFilter = null
      }
      this.applyFilters()
      return
    }
    const effective = val * this.intensityValue
    if (!this.noiseFilter) {
      this.noiseFilter = new PIXI.NoiseFilter(Math.max(0.01, effective))
    } else {
      this.noiseFilter.noise = Math.max(0.01, effective)
    }
    this.applyFilters()
  }

  /** 清除所有滤镜（销毁 GPU 资源而非仅置 null） */
  clearFilters(): void {
    this.intensityValue = 1
    if (this.blurFilter) {
      this.blurFilter.destroy()
      this.blurFilter = null
    }
    if (this.colorFilter) {
      this.colorFilter.destroy()
      this.colorFilter = null
    }
    if (this.glowFilter) {
      this.glowFilter.destroy()
      this.glowFilter = null
    }
    if (this.dropShadowFilter) {
      this.dropShadowFilter.destroy()
      this.dropShadowFilter = null
    }
    if (this.noiseFilter) {
      this.noiseFilter.destroy()
      this.noiseFilter = null
    }
    if (this.sprite) {
      this.sprite.filters = null
    }
  }

  setTint(color: number): void {
    if (this.sprite) {
      this.sprite.tint = color
    }
  }
}
