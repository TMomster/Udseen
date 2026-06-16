import * as PIXI from 'pixi.js'
import { parseGIF, decompressFrames } from 'gifuct-js'
import { TextureCache } from './TextureCache'
import { getErrorTexture } from '../../assets/ErrorImages'

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
   * @param objectType 对象类型（如 'Background' / 'Character'），加载失败时用于显示对应错误图
   */
  static async loadTexture(path: string, objectType: string = ''): Promise<PIXI.Texture> {
    try {
      const texture = await TextureCache.get(path)
      // 检查纹理有效性：PixiJS 7 中 Assets.load() 对不存在的文件可能返回无效纹理（valid=false）
      // 而不是抛出异常，因此必须主动检查纹理是否真正可用
      if (!texture || !texture.valid) {
        console.warn('[Udseen] 纹理无效（valid=false），使用占位纹理:', path)
        return TextureLoader.createPlaceholderTexture(objectType)
      }
      return texture
    } catch (err) {
      console.error('[Udseen] 纹理加载失败:', path, err)
      return TextureLoader.createPlaceholderTexture(objectType)
    }
  }

  /**
   * 异步加载：先尝试 GIF 解析，失败则回退普通图片
   * @param objectType 对象类型，加载失败时用于显示对应错误图
   */
  static async load(path: string, id: string, objectType: string = ''): Promise<TextureLoadResult> {
    // 尝试作为 GIF 动图加载
    if (path.toLowerCase().endsWith('.gif')) {
      const result = await TextureLoader.loadAnimatedGIF(path)
      if (result && result.textures.length > 1) {
        return result
      }
      // GIF 解析失败或仅单帧，回退普通加载
    }

    // 普通图片加载
    const texture = await TextureLoader.loadTexture(path, objectType)
    return {
      isAnimated: false,
      textures: [texture],
      frameDelay: 0
    }
  }

  /**
   * 生成占位纹理（资源加载失败时使用）
   * @param objectType 对象类型：'Background' 显示背景错误图，'Character' 显示角色错误图，其他类型也使用默认错误图
   */
  static createPlaceholderTexture(objectType: string = ''): PIXI.Texture {
    return getErrorTexture(objectType)
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


