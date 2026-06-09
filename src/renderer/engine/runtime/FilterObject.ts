import * as PIXI from 'pixi.js'
import { gsap } from 'gsap'
import { GlowFilter, DropShadowFilter } from 'pixi-filters'
// PIXI.NoiseFilter 已内置在 pixi.js v7 核心中，无需额外导入

/**
 * 屏幕滤镜对象
 * 覆盖整个演出场景，支持 RGB、hex、模糊、明度、对比度、饱和度、伽马
 * 多个滤镜可以叠加（各自将滤镜加入 stage.filters 数组按序生效）
 *
 * 用法:
 *   fl = Filter.set()
 *   fl.hex("#7F66FF")
 *   fl.begin()
 *
 * 强度控制:
 *   fl.intensity(0.5)       // 设置滤镜强度（半透明效果）
 *   fl.intensity(0.5, 1000) // 1000ms 内渐显到目标强度
 */
export class FilterObject {
  /** 类型标记 */
  readonly type: 'filter' = 'filter'

  id: string
  private sceneContainer: PIXI.Container

  /** 模糊滤镜实例 */
  blurFilter: PIXI.BlurFilter | null = null
  /** 颜色滤镜实例 */
  colorFilter: PIXI.ColorMatrixFilter | null = null
  /** 发光滤镜实例 */
  glowFilter: GlowFilter | null = null
  /** 投影滤镜实例 */
  dropShadowFilter: DropShadowFilter | null = null
  /** 噪点滤镜实例 */
  noiseFilter: PIXI.NoiseFilter | null = null

  /** 当前滤镜值（全强度目标值） */
  blurValue: number = 0
  brightnessValue: number = 1
  contrastValue: number = 1
  saturationValue: number = 1
  gammaValue: number = 1
  rgbValue: [number, number, number] = [255, 255, 255]
  glowValue: number = 0
  noiseValue: number = 0

  /** 滤镜强度 0~1.0，默认 1 为全强度 */
  intensityValue: number = 1
  /** 全强度颜色矩阵快照（用于 intensity lerp） */
  private fullColorMatrix: number[] | null = null

  constructor(id: string, _app: PIXI.Application, sceneContainer: PIXI.Container) {
    this.id = id
    this.sceneContainer = sceneContainer
  }

  // ---- 生命周期 ----

  /**
   * 将本滤镜应用到舞台（立即以当前强度生效）
   */
  begin(): void {
    this.syncToStage()
  }

  /**
   * 从舞台移除本滤镜
   */
  end(): void {
    this.removeFromStage()
    // 销毁滤镜释放 GPU 资源
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
  }

  /**
   * 设置滤镜强度（滤镜透明度）0~1.0
   * 1 = 全强度，0 = 完全透明（无效果）
   * @param time 可选渐显时间（毫秒），省略则立即生效
   */
  intensity(val: number, time?: number): void | Promise<void> {
    const target = Math.max(0, Math.min(1, val))
    const duration = (time ?? 0) / 1000 // 转为秒

    if (duration <= 0) {
      // 无动画：立即生效
      this.intensityValue = target
      this.applyIntensityToFilters()
      this.syncToStage()
      return
    }

    // 有动画：先以强度 0 加入舞台，然后渐显到目标强度
    this.intensityValue = 0
    this.applyIntensityToFilters()
    this.syncToStage()

    return new Promise((resolve) => {
      gsap.to(this, {
        intensityValue: target,
        duration,
        ease: 'power2.out',
        onUpdate: () => {
          this.applyIntensityToFilters()
        },
        onComplete: () => {
          this.applyIntensityToFilters()
          resolve()
        }
      })
    })
  }

  // ---- 滤镜设置方法 ----

  /** Hex 颜色滤镜，如 "#7F66FF" */
  hex(color: string): void {
    const h = color.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      this.rgb(r, g, b)
    }
  }

  /** RGB 颜色滤镜 (r, g, b) 0~255 */
  rgb(r: number, g: number, b: number): void {
    this.rgbValue = [r, g, b]
    const cf = this.getOrCreateColorFilter()
    const rr = Math.max(0, Math.min(255, r)) / 255
    const gg = Math.max(0, Math.min(255, g)) / 255
    const bb = Math.max(0, Math.min(255, b)) / 255
    const fullMatrix: number[] = [
      rr, 0, 0, 0, 0,
      0, gg, 0, 0, 0,
      0, 0, bb, 0, 0,
      0, 0, 0, 1, 0
    ]
    this.fullColorMatrix = fullMatrix
    cf.reset()
    this.applyIntensityToColorFilter(cf)
    this.syncToStage()
  }

  /** 高斯模糊 0~2.0 */
  blur(val: number): void {
    this.blurValue = val
    if (!this.blurFilter) {
      this.blurFilter = new PIXI.BlurFilter()
    }
    this.blurFilter.blur = Math.max(0, val * 10) * this.intensityValue
    this.syncToStage()
  }

  /** 明度 0~2.0 */
  brightness(val: number): void {
    this.brightnessValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    cf.brightness(Math.max(0, val), true)
    // 将 PIXI 计算出的矩阵存为 fullColorMatrix
    this.fullColorMatrix = [...cf.matrix]
    this.applyIntensityToColorFilter(cf)
    this.syncToStage()
  }

  /** 对比度 0~2.0 */
  contrast(val: number): void {
    this.contrastValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    cf.contrast(Math.max(0, val), true)
    this.fullColorMatrix = [...cf.matrix]
    this.applyIntensityToColorFilter(cf)
    this.syncToStage()
  }

  /** 饱和度 0~2.0 */
  saturation(val: number): void {
    this.saturationValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    cf.saturate(Math.max(0, val - 1), true)
    this.fullColorMatrix = [...cf.matrix]
    this.applyIntensityToColorFilter(cf)
    this.syncToStage()
  }

  /** 伽马值 */
  gamma(val: number): void {
    this.gammaValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    const gamma = Math.max(0.1, val)
    const invGamma = 1 / gamma
    const fullMatrix: number[] = [
      invGamma, 0, 0, 0, 0,
      0, invGamma, 0, 0, 0,
      0, 0, invGamma, 0, 0,
      0, 0, 0, 1, 0
    ]
    this.fullColorMatrix = fullMatrix
    this.applyIntensityToColorFilter(cf)
    this.syncToStage()
  }

  // ---- 内部方法 ----

  private getOrCreateColorFilter(): PIXI.ColorMatrixFilter {
    if (!this.colorFilter) {
      this.colorFilter = new PIXI.ColorMatrixFilter()
    }
    return this.colorFilter
  }

  /** 发光效果 0~1.0 */
  glow(val: number): void {
    this.glowValue = val
    if (val <= 0) {
      if (this.glowFilter) {
        this.glowFilter.destroy()
        this.glowFilter = null
      }
      this.syncToStage()
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
    this.syncToStage()
  }

  /** 投影效果 */
  dropShadow(distance: number): void {
    if (distance <= 0) {
      if (this.dropShadowFilter) {
        this.dropShadowFilter.destroy()
        this.dropShadowFilter = null
      }
      this.syncToStage()
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
    this.syncToStage()
  }

  /** 噪点效果 0~1.0 */
  noise(val: number): void {
    this.noiseValue = val
    if (val <= 0) {
      if (this.noiseFilter) {
        this.noiseFilter.destroy()
        this.noiseFilter = null
      }
      this.syncToStage()
      return
    }
    const effective = val * this.intensityValue
    if (!this.noiseFilter) {
      this.noiseFilter = new PIXI.NoiseFilter(Math.max(0.01, effective))
    } else {
      this.noiseFilter.noise = Math.max(0.01, effective)
    }
    this.syncToStage()
  }

  /**
   * 将当前 intensityValue 应用到所有滤镜实例
   */
  private applyIntensityToFilters(): void {
    // 模糊
    if (this.blurFilter) {
      this.blurFilter.blur = Math.max(0, this.blurValue * 10) * this.intensityValue
    }
    // 颜色
    if (this.colorFilter) {
      this.applyIntensityToColorFilter(this.colorFilter)
    }
  }

  /**
   * 将全强度颜色矩阵按 intensityValue 向单位矩阵 lerp
   */
  private applyIntensityToColorFilter(cf: PIXI.ColorMatrixFilter): void {
    if (!this.fullColorMatrix) return
    const i = this.intensityValue
    if (i >= 1) {
      cf.matrix = [...this.fullColorMatrix] as PIXI.ColorMatrix
      return
    }
    if (i <= 0) {
      cf.reset()
      return
    }
    // 单位矩阵
    const id: number[] = [
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0
    ]
    const m = this.fullColorMatrix
    const result: number[] = []
    for (let j = 0; j < 20; j++) {
      result[j] = id[j] + i * (m[j] - id[j])
    }
    cf.matrix = result as PIXI.ColorMatrix
  }

  /**
   * 将当前持有的滤镜同步到 stage.filters
   * 如果尚未在 stage 上，则追加；如果已在 stage 上，在 PIXI 中直接修改 filter 属性会自动生效
   */
  private syncToStage(): void {
    const existing = this.sceneContainer.filters || []
    const myFilters: PIXI.Filter[] = []
    if (this.blurFilter) myFilters.push(this.blurFilter)
    if (this.colorFilter) myFilters.push(this.colorFilter)
    if (this.glowFilter) myFilters.push(this.glowFilter)
    if (this.dropShadowFilter) myFilters.push(this.dropShadowFilter)
    if (this.noiseFilter) myFilters.push(this.noiseFilter)
    if (myFilters.length === 0) return

    // 检查我的滤镜是否已经在 sceneContainer.filters 中
    const alreadyApplied = myFilters.some((f) => existing.includes(f))

    if (!alreadyApplied) {
      // 尚未应用，追加到场景容器
      this.sceneContainer.filters = [...existing, ...myFilters]
    }
    // 如果已应用，直接修改 filter 属性即可（PIXI 自动重绘）
  }

  /**
   * 从 stage.filters 移除本实例的所有滤镜
   */
  private removeFromStage(): void {
    const current = this.sceneContainer.filters
    if (!current || current.length === 0) return

    const myFilters = new Set<PIXI.Filter>()
    if (this.blurFilter) myFilters.add(this.blurFilter)
    if (this.colorFilter) myFilters.add(this.colorFilter)
    if (this.glowFilter) myFilters.add(this.glowFilter)
    if (this.dropShadowFilter) myFilters.add(this.dropShadowFilter)
    if (this.noiseFilter) myFilters.add(this.noiseFilter)
    if (myFilters.size === 0) return

    this.sceneContainer.filters = current.filter((f) => !myFilters.has(f))
    if (!this.sceneContainer.filters || this.sceneContainer.filters.length === 0) {
      this.sceneContainer.filters = null
    }
  }
}

/**
 * 类型守卫：判断 RuntimeValue 是否为 FilterObject
 */
export function isFilterObject(val: unknown): val is FilterObject {
  return typeof val === 'object' && val !== null && (val as Record<string, unknown>).type === 'filter'
}
