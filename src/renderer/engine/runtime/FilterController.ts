import * as PIXI from 'pixi.js'
import { GlowFilter, DropShadowFilter } from 'pixi-filters'
import type { SceneObject } from './SceneObject'

/**
 * 滤镜控制器：管理 SceneObject 上6种滤镜的生命周期
 * 从 SceneObject 拆分而来，由 SceneObject 组合使用
 */
export class FilterController {
  /** 滤镜引用（public，供动画系统访问） */
  blurFilter: PIXI.BlurFilter | null = null
  colorFilter: PIXI.ColorMatrixFilter | null = null
  glowFilter: GlowFilter | null = null
  dropShadowFilter: DropShadowFilter | null = null
  noiseFilter: PIXI.NoiseFilter | null = null

  /** 当前滤镜值 */
  blurValue: number = 0
  brightnessValue: number = 1
  contrastValue: number = 1
  saturationValue: number = 1
  gammaValue: number = 1
  rgbValue: [number, number, number] = [255, 255, 255]
  glowValue: number = 0
  noiseValue: number = 0
  bwValue: number = 0
  distortValue: number = 0
  psychedelicValue: number = 0

  /** 滤镜强度 0~1.0，默认 1 */
  intensityValue: number = 1

  private owner: SceneObject

  constructor(owner: SceneObject) {
    this.owner = owner
  }

  applyFilters(): void {
    if (!this.owner.sprite) return
    const filters: PIXI.Filter[] = []
    if (this.blurFilter) filters.push(this.blurFilter)
    if (this.colorFilter) filters.push(this.colorFilter)
    if (this.glowFilter) filters.push(this.glowFilter)
    if (this.dropShadowFilter) filters.push(this.dropShadowFilter)
    if (this.noiseFilter) filters.push(this.noiseFilter)
    this.owner.sprite.filters = filters.length > 0 ? filters : null
  }

  /** 销毁所有滤镜释放 GPU 资源 */
  destroyAll(): void {
    if (this.blurFilter) { this.blurFilter.destroy(); this.blurFilter = null }
    if (this.colorFilter) { this.colorFilter.destroy(); this.colorFilter = null }
    if (this.glowFilter) { this.glowFilter.destroy(); this.glowFilter = null }
    if (this.dropShadowFilter) { this.dropShadowFilter.destroy(); this.dropShadowFilter = null }
    if (this.noiseFilter) { this.noiseFilter.destroy(); this.noiseFilter = null }
  }

  // ========== 新增滤镜 ==========

  /** 黑白效果 0~1.0 */
  setBW(val: number): void {
    this.bwValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    if (val <= 0) {
      this.applyFilters()
      return
    }
    const effective = Math.min(1, val) * this.intensityValue
    // 从彩色到黑白的线性插值
    cf.matrix = [
      0.299 + (1 - effective), 0.299, 0.299, 0, 0,
      0.587, 0.587 + (1 - effective), 0.587, 0, 0,
      0.114, 0.114, 0.114 + (1 - effective), 0, 0,
      0, 0, 0, 1, 0
    ]
    this.applyFilters()
  }

  /** 失真效果 0~1.0 */
  setDistort(val: number): void {
    this.distortValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    if (val <= 0) {
      this.applyFilters()
      return
    }
    const effective = Math.min(1, val) * this.intensityValue
    cf.matrix = [
      1 + effective * 0.5, -effective * 0.3, 0, 0, 0,
      -effective * 0.2, 1 + effective * 0.4, effective * 0.2, 0, 0,
      0, -effective * 0.3, 1 + effective * 0.5, 0, 0,
      0, 0, 0, 1, 0
    ]
    this.applyFilters()
  }

  /** 迷幻效果 0~1.0 */
  setPsychedelic(val: number): void {
    this.psychedelicValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
    if (val <= 0) {
      this.applyFilters()
      return
    }
    const effective = Math.min(1, val) * this.intensityValue
    // 色彩通道乱序 + 高饱和度
    cf.matrix = [
      1, effective * 0.8, 0, 0, 0,
      0, 1, effective * 0.8, 0, 0,
      effective * 0.8, 0, 1, 0, 0,
      0, 0, 0, 1, 0
    ]
    this.applyFilters()
  }

  private getOrCreateColorFilter(): PIXI.ColorMatrixFilter {
    if (!this.colorFilter) {
      this.colorFilter = new PIXI.ColorMatrixFilter()
    }
    return this.colorFilter
  }

  /** 高斯模糊 0~2.0 */
  setBlur(val: number): void {
    this.blurValue = val
    if (!this.blurFilter) {
      this.blurFilter = new PIXI.BlurFilter()
    }
    this.blurFilter.blur = Math.max(0, val * 10) * this.intensityValue
    this.applyFilters()
  }

  /** 明度 0~2.0 */
  setBrightness(val: number): void {
    this.brightnessValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
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
    cf.saturate(Math.max(0, effective - 1), true)
    this.applyFilters()
  }

  /** 伽马值 */
  setGamma(val: number): void {
    this.gammaValue = val
    const cf = this.getOrCreateColorFilter()
    cf.reset()
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

  /** 清除所有滤镜 */
  clearFilters(): void {
    this.intensityValue = 1
    this.destroyAll()
    if (this.owner.sprite) {
      this.owner.sprite.filters = null
    }
  }
}
