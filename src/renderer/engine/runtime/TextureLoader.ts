import * as PIXI from 'pixi.js'
import { parseGIF, decompressFrames } from 'gifuct-js'
import { TextureCache } from './TextureCache'

/**
 * 纹理加载结果：普通纹理或动图帧序列
 */
export interface TextureLoadResult {
  /** 是否为动图 */
  isAnimated: boolean
  /** 加载到的纹理列表（动图多帧，静态图单帧） */
  textures: PIXI.Texture[]
  /** 帧间隔（毫秒），仅动图有意义 */
  frameDelay: number
}

/**
 * 纹理加载器：负责图片和 GIF 动图的加载与解析
 * 从 SceneObject 拆分而来，提供静态工具方法
 */
export class TextureLoader {
  /**
   * 加载纹理文件
   * @param path 文件路径
   * @param id 场景对象 ID（用于占位纹理的颜色判断）
   */
  static async loadTexture(path: string): Promise<PIXI.Texture> {
    try {
      return await TextureCache.get(path)
    } catch (err) {
      console.error('[Udseen] 纹理加载失败:', path, err)
      return TextureLoader.createPlaceholderTexture('bg')
    }
  }

  /**
   * 异步加载：先尝试 GIF 解析，失败则回退普通图片
   */
  static async load(path: string, id: string): Promise<TextureLoadResult> {
    // 尝试作为 GIF 动图加载
    if (path.toLowerCase().endsWith('.gif')) {
      const result = await TextureLoader.loadAnimatedGIF(path)
      if (result && result.textures.length > 1) {
        return result
      }
      // GIF 解析失败或仅单帧，回退普通加载
    }

    // 普通图片加载
    const texture = await TextureLoader.loadTexture(path)
    return {
      isAnimated: false,
      textures: [texture],
      frameDelay: 0
    }
  }

  /**
   * 生成彩色占位纹理（图片加载失败时使用）
   */
  static createPlaceholderTexture(idHint: string): PIXI.Texture {
    const isBg = idHint.toLowerCase().includes('bg')
    // 使用 offscreen canvas 生成纹理，不依赖 PIXI.Application
    const canvas = document.createElement('canvas')
    canvas.width = isBg ? 800 : 200
    canvas.height = isBg ? 600 : 400
    const ctx = canvas.getContext('2d')!

    if (isBg) {
      ctx.fillStyle = '#2d4a6f'
      ctx.fillRect(0, 0, 800, 600)
      ctx.strokeStyle = '#3a5f8f'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, 100)
      ctx.lineTo(800, 100)
      ctx.moveTo(0, 200)
      ctx.lineTo(800, 200)
      ctx.stroke()
    } else {
      ctx.fillStyle = '#ff69b4'
      roundRect(ctx, 50, 0, 100, 400, 20)
      ctx.fill()
      ctx.fillStyle = '#ff1493'
      ctx.beginPath()
      ctx.arc(100, 80, 50, 0, Math.PI * 2)
      ctx.fill()
    }

    const base = new PIXI.BaseTexture(canvas, { resolution: 1 })
    return new PIXI.Texture(base)
  }

  /** 解析 GIF 文件为帧纹理数组 */
  private static async loadAnimatedGIF(path: string): Promise<TextureLoadResult | null> {
    try {
      const response = await fetch(path)
      const buffer = await response.arrayBuffer()
      const gif = parseGIF(buffer)
      const frames = decompressFrames(gif, true)

      if (frames.length <= 1) {
        console.log('[Udseen] GIF 仅含 1 帧，作为静态图处理')
        return null
      }

      // 计算 GIF 完整画布大小
      let maxW = 0, maxH = 0
      for (const f of frames) {
        maxW = Math.max(maxW, f.dims.left + f.dims.width)
        maxH = Math.max(maxH, f.dims.top + f.dims.height)
      }

      // 共享合成 canvas
      const compositeCanvas = document.createElement('canvas')
      compositeCanvas.width = maxW
      compositeCanvas.height = maxH
      const compositeCtx = compositeCanvas.getContext('2d')!

      const textures: PIXI.Texture[] = []
      let totalDelay = 0
      const frameSnapshots: (ImageData | null)[] = []

      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]

        // 根据前一帧的 disposal type 处理残留
        if (i > 0) {
          const prevFrame = frames[i - 1]
          const prevDisposal = prevFrame.disposalType as number

          if (prevDisposal === 2) {
            compositeCtx.clearRect(
              prevFrame.dims.left, prevFrame.dims.top,
              prevFrame.dims.width, prevFrame.dims.height
            )
          } else if (prevDisposal === 3) {
            const prevSnapshot = i >= 2 ? frameSnapshots[i - 2] : null
            if (prevSnapshot) {
              compositeCtx.putImageData(prevSnapshot, 0, 0)
            }
          }
        }

        // 绘制当前帧
        const patchData = f.patch as unknown as ArrayBuffer
        const imageData = new ImageData(
          new Uint8ClampedArray(patchData),
          f.dims.width, f.dims.height
        )
        compositeCtx.putImageData(imageData, f.dims.left, f.dims.top)

        // 保存快照
        frameSnapshots.push(compositeCtx.getImageData(0, 0, maxW, maxH))

        // 每帧独立 canvas 创建纹理
        const frameCanvas = document.createElement('canvas')
        frameCanvas.width = maxW
        frameCanvas.height = maxH
        const frameCtx = frameCanvas.getContext('2d')!
        frameCtx.drawImage(compositeCanvas, 0, 0)

        textures.push(PIXI.Texture.from(frameCanvas))
        totalDelay += f.delay
      }

      compositeCanvas.remove()
      const frameDelay = frames.length > 0
        ? Math.max(16, (totalDelay / frames.length) * 10)
        : 100

      return { isAnimated: true, textures, frameDelay }
    } catch (err) {
      console.error('[Udseen] GIF 解析失败:', path, err)
      return null
    }
  }
}

/** canvas 圆角矩形辅助函数 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
