import * as PIXI from 'pixi.js'

/**
 * 全局纹理缓存（单例）
 *
 * - 避免同一纹理文件被多次加载（PIXI.Assets 虽内部有缓存，但 new Image() 回退路径无缓存）
 * - 引用计数管理：每次 get() 递增，release() 递减，归零时自动销毁并释放 GPU 内存
 * - 最大缓存数量上限（LRU 淘汰策略），防止纹理泄漏无限增长
 */
class TextureCacheImpl {
  private cache = new Map<string, { texture: PIXI.Texture; refs: number; lastAccess: number }>()
  private maxSize = 100

  /**
   * 获取纹理：缓存命中则引用计数 +1，未命中则通过 loader 加载后注册
   */
  async get(path: string): Promise<PIXI.Texture> {
    const existing = this.cache.get(path)
    if (existing) {
      existing.refs++
      existing.lastAccess = performance.now()
      return existing.texture
    }

    // 加载纹理（先尝试 PIXI.Assets.load，失败后使用原生 Image 回退）
    const texture = await this.loadImage(path)

    // 检查并发加载——防止同一路径在加载期间被 get 两次
    if (this.cache.has(path)) {
      const entry = this.cache.get(path)!
      // 新加载的纹理不再需要，销毁
      texture.destroy(true)
      entry.refs++
      return entry.texture
    }

    this.cache.set(path, { texture, refs: 1, lastAccess: performance.now() })
    this.evictLRU()
    return texture
  }

  /**
   * 释放纹理引用：引用归零时自动销毁并从缓存移除
   */
  release(path: string): void {
    const entry = this.cache.get(path)
    if (!entry) return
    entry.refs--
    if (entry.refs <= 0) {
      entry.texture.destroy(true)
      this.cache.delete(path)
    }
  }

  /**
   * 清除所有缓存的纹理（releaseAllResources 时调用）
   */
  clear(): void {
    for (const [, entry] of this.cache) {
      entry.texture.destroy(true)
    }
    this.cache.clear()
  }

  /** 当前缓存条目数 */
  get size(): number {
    return this.cache.size
  }

  // ---- 内部 ----

  private async loadImage(path: string): Promise<PIXI.Texture> {
    // 先尝试 PIXI.Assets.load
    try {
      const texture = await PIXI.Assets.load(path)
      // Assets.load 可能对不存在的文件返回无效纹理（valid=false）而非抛异常
      // 此处主动检查，若无效则降级到原生 Image 加载
      if (texture && texture.valid) {
        return texture
      }
    } catch {
      // Assets.load 失败，降级到原生 Image
    }

    // 原生 Image 元素加载（兼容 Electron file:// 等环境）
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
      throw err
    }
  }

  /** LRU 淘汰：超出 maxSize 时移除最久未访问的条目 */
  private evictLRU(): void {
    if (this.cache.size <= this.maxSize) return
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [key, entry] of this.cache) {
      if (entry.refs > 0) continue // 有引用不能淘汰
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess
        oldestKey = key
      }
    }
    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!
      entry.texture.destroy(true)
      this.cache.delete(oldestKey)
    }
  }
}

/** 全局纹理缓存单例 */
export const TextureCache = new TextureCacheImpl()
