import * as PIXI from 'pixi.js'
import type { SceneObject } from './SceneObject'

/**
 * 动图帧动画播放器：管理 GIF 帧序列的播放/暂停/停止/循环
 * 从 SceneObject 拆分而来，由 SceneObject 组合使用
 */
export class FrameAnimator {
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

  /** 动图帧动画 rAF ID */
  private animRAFId: number | null = null
  /** 上一帧时间戳 */
  private animLastTime: number = 0
  /** 每帧间隔（毫秒） */
  private animFrameDelay: number = 100
  /** GIF 原始帧间隔（毫秒），用于 fps(0) 恢复默认 */
  private originalFrameDelay: number = 100

  /** 关联的 SceneObject（用于操作 sprite） */
  private owner: SceneObject

  constructor(owner: SceneObject) {
    this.owner = owner
  }

  /** rAF 帧循环：按帧间隔切换纹理 */
  private animTick = (now: number): void => {
    if (!this.animPlaying || !this.owner.sprite || this.animFrames.length === 0) return

    const delay = this.animFrameDelay / Math.max(0.1, this.animSpeed)
    const elapsed = now - this.animLastTime

    if (elapsed >= delay) {
      this.animFrameIndex++
      if (this.animFrameIndex >= this.animFrames.length) {
        if (this.animLooping) {
          this.animFrameIndex = 0
        } else {
          // 非循环播放结束：停在最后一帧
          this.animFrameIndex = this.animFrames.length - 1
          this.owner.sprite.texture = this.animFrames[this.animFrameIndex]
          this.pause()
          return
        }
      }
      this.owner.sprite.texture = this.animFrames[this.animFrameIndex]
      this.animLastTime = now
    }

    this.animRAFId = requestAnimationFrame(this.animTick)
  }

  /** 启动帧动画播放 */
  startAnim(loop: boolean): void {
    if (!this.isAnimated || this.animFrames.length === 0) return
    this.stop()  // 先停止旧动画
    this.animPlaying = true
    this.animLooping = loop
    this.animFrameIndex = 0
    this.animLastTime = performance.now()
    if (this.owner.sprite) {
      this.owner.sprite.texture = this.animFrames[0]
    }
    this.animRAFId = requestAnimationFrame(this.animTick)
  }

  /** 暂停动画 */
  pause(): void {
    this.animPlaying = false
    if (this.animRAFId !== null) {
      cancelAnimationFrame(this.animRAFId)
      this.animRAFId = null
    }
  }

  /** 停止动画并重置到第一帧 */
  stop(): void {
    this.pause()
    this.animFrameIndex = 0
    if (this.owner.sprite && this.animFrames.length > 0) {
      this.owner.sprite.texture = this.animFrames[0]
    }
  }

  /** 清除动画帧纹理 */
  clear(): void {
    this.stop()
    this.isAnimated = false
    for (const tex of this.animFrames) {
      tex.destroy(true)
    }
    this.animFrames = []
    this.animSpeed = 1
    this.animLooping = false
    this.animFrameDelay = 100
  }

  /** 设置动画播放倍速 */
  setAnimSpeed(val: number): void {
    this.animSpeed = Math.max(0.1, val)
  }

  /** 设置动图帧率（FPS），fps=0 时恢复原始 GIF 帧率 */
  setFPS(fps: number): void {
    if (fps <= 0) {
      this.animFrameDelay = this.originalFrameDelay
    } else {
      this.animFrameDelay = Math.max(16, 1000 / fps)
    }
  }

  /** 跳转到指定帧（1 起始） */
  gotoFrame(frameNum: number): void {
    if (frameNum <= 0 || !this.owner.sprite || this.animFrames.length === 0) return
    const idx = (frameNum - 1) % this.animFrames.length
    this.animFrameIndex = idx
    this.owner.sprite.texture = this.animFrames[idx]
  }

  /** 设置帧数据（由 SceneObject.set 调用） */
  setFrames(frames: PIXI.Texture[], delay: number): void {
    this.animFrames = frames
    this.isAnimated = true
    this.animFrameDelay = delay
    this.originalFrameDelay = delay
  }
}
