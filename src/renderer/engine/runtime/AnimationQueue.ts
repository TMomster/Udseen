import { gsap } from 'gsap'
import * as PIXI from 'pixi.js'

/**
 * 动画队列管理：支持并发(parallel)和串行(sequence)执行
 */
export class AnimationQueue {
  /** 所有挂起动画 Promise 的 resolve 函数集合，用于 cancelAll() 时强制放行 */
  private pendingResolves: Set<() => void> = new Set()

  /**
   * 串行执行一组动画
   */
  sequence(animations: (() => Promise<void>)[]): Promise<void> {
    return animations.reduce(
      (chain, anim) => chain.then(() => anim()),
      Promise.resolve()
    )
  }

  /**
   * 并发执行一组动画
   */
  parallel(animations: Promise<void>[]): Promise<void> {
    return Promise.all(animations).then(() => {})
  }

  /**
   * 单个动画：将 Sprite 从当前状态过渡到目标状态
   * 注意：GSAP tween 被 kill 后不会触发 onComplete，因此我们跟踪 resolve
   * 确保 cancelAll() 可以放行所有挂起的动画 Promise。
   * 注：使用 try-catch 包裹 gsap.to()，防止异常导致 Promise 永久挂起。
   */
  animate(
    sprite: PIXI.Sprite,
    props: Record<string, number>,
    duration: number,
    easing = 'power2.out'
  ): Promise<void> {
    return new Promise((resolve) => {
      this.pendingResolves.add(resolve)
      this.ensureTicker()
      try {
        gsap.to(sprite, {
          ...props,
          duration: duration / 1000,
          ease: easing,
          overwrite: 'auto',
          onComplete: () => {
            this.pendingResolves.delete(resolve)
            resolve()
          }
        })
      } catch (err) {
        this.pendingResolves.delete(resolve)
        console.error('[AnimationQueue] gsap.to() 异常:', err, sprite, props)
        resolve()
      }
    })
  }

  /**
   * 移动到目标位置
   */
  moveTo(sprite: PIXI.Sprite, x: number, y: number, duration: number): Promise<void> {
    return this.animate(sprite, { x, y }, duration)
  }

  /**
   * 旋转到目标角度
   */
  rotateTo(sprite: PIXI.Sprite, angle: number, duration: number): Promise<void> {
    return this.animate(sprite, { rotation: angle }, duration, 'none')
  }

  /**
   * 渐隐
   */
  fadeOut(sprite: PIXI.Sprite, duration: number): Promise<void> {
    return this.animate(sprite, { alpha: 0 }, duration)
  }

  /**
   * 渐显
   */
  fadeIn(sprite: PIXI.Sprite, duration: number): Promise<void> {
    return this.animate(sprite, { alpha: 1 }, duration)
  }

  /**
   * 缩放变化
   */
  scaleTo(sprite: PIXI.Sprite, sx: number, sy: number, duration: number): Promise<void> {
    return this.animate(sprite, { scaleX: sx, scaleY: sy }, duration)
  }

  /**
   * 等待一段时间
   */
  wait(duration: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, duration))
  }

  /**
   * 通用属性动画：将任意对象的数值属性从当前值过渡到目标值
   * 注：使用 try-catch 包裹 gsap.to()，防止异常导致 Promise 永久挂起。
   */
  animateProperty(
    target: object,
    props: Record<string, number>,
    duration: number,
    easing = 'power2.out'
  ): Promise<void> {
    return new Promise((resolve) => {
      this.pendingResolves.add(resolve)
      this.ensureTicker()
      try {
        gsap.to(target, {
          ...props,
          duration: duration / 1000,
          ease: easing,
          overwrite: 'auto',
          onComplete: () => {
            this.pendingResolves.delete(resolve)
            resolve()
          }
        })
      } catch (err) {
        this.pendingResolves.delete(resolve)
        console.error('[AnimationQueue] animateProperty gsap.to() 异常:', err, target, props)
        resolve()
      }
    })
  }

  /**
   * 通用回调动画：在 duration 时间内持续调用回调函数，传入 0~1 的进度值
   * 适用于无法直接 tween 对象属性的场景（如滤镜矩阵更新）
   * 注：使用 try-catch 包裹 gsap.to()，防止异常导致 Promise 永久挂起。
   */
  animateCallback(
    callback: (progress: number) => void,
    duration: number,
    easing = 'power2.out'
  ): Promise<void> {
    return new Promise((resolve) => {
      this.pendingResolves.add(resolve)
      this.ensureTicker()
      const proxy = { t: 0 }
      try {
        gsap.to(proxy, {
          t: 1,
          duration: duration / 1000,
          ease: easing,
          overwrite: 'auto',
          onUpdate: () => callback(proxy.t),
          onComplete: () => {
            this.pendingResolves.delete(resolve)
            resolve()
          }
        })
      } catch (err) {
        this.pendingResolves.delete(resolve)
        console.error('[AnimationQueue] animateCallback gsap.to() 异常:', err, proxy)
        resolve()
      }
    })
  }

  /**
   * 取消所有挂起的动画：
   * 1. 放行所有未完成的 Promise（防止旧执行链永久挂起）
   * 2. 杀死所有 GSAP tween（立即停止属性变化）
   * 3. 休眠 GSAP ticker，防止残留 rAF 尝试操作已销毁的对象
   * 4. 清空 pendingResolves 集合
   */
  cancelAll(): void {
    for (const resolve of this.pendingResolves) {
      resolve()
    }
    this.pendingResolves.clear()
    gsap.killTweensOf('*')
    // 完全停止 GSAP ticker 的 rAF 循环，防止残留 tick 尝试操作已销毁的精灵
    gsap.ticker.sleep()
  }

  /**
   * 确保 GSAP ticker 正在运行（在创建新动画前调用）
   */
  private ensureTicker(): void {
    gsap.ticker.wake()
  }

  /**
   * 杀死 Sprite 上的所有动画
   */
  killAll(sprite: PIXI.Sprite): void {
    gsap.killTweensOf(sprite)
  }
}
