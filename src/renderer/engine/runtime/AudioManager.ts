import { Howl } from 'howler'
import type { AudioObject, RuntimeValue } from './Runtime'

/** Howler.js 支持的音频格式 */
const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.ogg', '.opus', '.wav', '.aac', '.m4a', '.flac', '.webm'
])

/** 音频方法调用的上下文（提供 Runtime 回调能力，避免循环依赖） */
export interface AudioCallContext {
  lastExecutionLine: number
  onError?: (msg: string) => void
  onExecutionError?: (line: number, msg: string) => void
  onWarning?: (msg: string) => void
  resolveAssetPath: (rawPath: string, factoryName: string | null) => string
}

/**
 * 音频管理器：负责音频生命周期管理（播放、控制、渐变）
 * 从 Runtime 拆分而来，Runtime 通过本类代理所有音频操作
 */
export class AudioManager {
  private animFrameIds: Set<number> = new Set()
  private dialogueHowl: Howl | null = null

  /** 取消所有音频 speed 渐变动画的 rAF */
  cancelAnimFrameIds(): void {
    for (const id of this.animFrameIds) {
      cancelAnimationFrame(id)
    }
    this.animFrameIds.clear()
  }

  getAnimFrameIds(): Set<number> {
    return this.animFrameIds
  }

  /**
   * 检查音频文件扩展名是否在支持列表中
   */
  isAudioFormatSupported(filePath: string): boolean {
    const dotIdx = filePath.lastIndexOf('.')
    if (dotIdx === -1) return false
    const ext = filePath.slice(dotIdx).toLowerCase()
    return SUPPORTED_AUDIO_EXTENSIONS.has(ext)
  }

  /**
   * 遍历所有已注册的音频对象，调用 stop + unload 释放 Howl 音频缓冲
   */
  cleanupAllAudio(audioObjects: Map<string, AudioObject>): void {
    const audios = Array.from(audioObjects.values())
    for (const audio of audios) {
      if (audio.howl) {
        try {
          (audio.howl as Howl).stop()
          ;(audio.howl as Howl).unload()
        } catch {
          // 忽略单个音频的清理异常，确保继续清理其他音频
        }
        audio.howl = null
      }
    }
    audioObjects.clear()
    // 清理对话音频
    if (this.dialogueHowl) {
      try {
        this.dialogueHowl.stop()
        this.dialogueHowl.unload()
      } catch { /* 忽略清理异常 */ }
      this.dialogueHowl = null
    }
  }

  /**
   * 播放对话音频 - 对话框出现时自动播放一次，终止上一个对话音频，播放完成后自动销毁
   */
  playDialogueAudio(audioPath: string | undefined, context: AudioCallContext): Promise<number> {
    // 终止上一个对话音频
    if (this.dialogueHowl) {
      try {
        this.dialogueHowl.stop()
        this.dialogueHowl.unload()
      } catch { /* 忽略旧音频清理异常 */ }
      this.dialogueHowl = null
    }
    if (!audioPath) return Promise.resolve(0)
    const resolvedPath = context.resolveAssetPath(audioPath, 'Audio')
    // 预检对话音频格式
    if (!this.isAudioFormatSupported(resolvedPath)) {
      context.onWarning?.(`对话音频格式不支持: ${resolvedPath}（支持的格式: mp3, ogg, opus, wav, aac, m4a, flac, webm）`)
      return Promise.resolve(0)
    }
    return new Promise<number>((resolve) => {
      try {
        const howl = new Howl({
          src: [resolvedPath],
          loop: false,
          volume: 1,
          onload: () => {
            resolve(howl.duration() * 1000)
          },
          onloaderror: () => resolve(0),
          onplayerror: () => resolve(0),
          onend: () => {
            // 播放完成后自动销毁缓存
            try { howl.unload() } catch { /* 忽略 */ }
            if (this.dialogueHowl === howl) {
              this.dialogueHowl = null
            }
          }
        })
        this.dialogueHowl = howl
        howl.play()
      } catch {
        this.dialogueHowl = null
        resolve(0)
      }
    })
  }

  /**
   * 触发音频错误：红色日志 + 编辑器行高亮
   */
  reportAudioError(msg: string, context: AudioCallContext, line?: number): void {
    const errLine = line ?? context.lastExecutionLine
    context.onError?.(msg)
    context.onExecutionError?.(errLine, msg)
  }

  async callAudioMethod(audio: AudioObject, methodName: string, args: RuntimeValue[], context: AudioCallContext): Promise<void> {
    // 记录当前行号以用于异步回调中的错误高亮
    const currentLine = context.lastExecutionLine

    switch (methodName) {
      case 'begin':
      case 'loop': {
        // 预检音频格式
        if (!this.isAudioFormatSupported(audio.filePath)) {
          this.reportAudioError(
            `不支持的音频格式: ${audio.filePath}（支持的格式: mp3, ogg, opus, wav, aac, m4a, flac, webm）`,
            context,
            currentLine
          )
          return  // 静默跳过，不抛出异常
        }

        const looping = methodName === 'loop'

        // 销毁旧的 Howl 实例
        if (audio.howl) {
          try {
            ;(audio.howl as any).stop()
            ;(audio.howl as any).unload()
          } catch { /* 忽略旧实例清理异常 */ }
          audio.howl = null
        }

        // 预检：在 Electron 环境下先验证音频文件是否存在
        try {
          const fileCheck = await (window as any).electronAPI?.fileExists?.(audio.filePath)
          if (fileCheck === false) {
            this.reportAudioError(
              `音频文件不存在: ${audio.filePath}`,
              context,
              currentLine
            )
            audio.howl = null
            return
          }
        } catch {
          // 文件检查不可用时，跳过预检
        }

        try {
          const howl = new Howl({
            src: [audio.filePath],
            loop: looping,
            volume: audio.volume,
            html5: true,
            onloaderror: (_soundId: unknown, _error: unknown) => {
              this.reportAudioError(`音频加载失败: ${audio.filePath}`, context, currentLine)
              try { howl.unload() } catch { /* 忽略 */ }
              audio.howl = null
            },
            onplayerror: (_soundId: unknown) => {
              context.onWarning?.(`音频播放被浏览器策略阻止: ${audio.filePath}，等待用户交互后自动恢复`)
              howl.once('unlock', () => {
                if (audio.howl === howl) {
                  try { howl.play() } catch { /* 忽略 */ }
                }
              })
            }
          })
          audio.howl = howl
          audio.looping = looping
          audio.paused = false
          howl.rate(audio.playbackRate)
          howl.play()
        } catch (err) {
          this.reportAudioError(
            `音频播放异常: ${err instanceof Error ? err.message : String(err)}`,
            context,
            currentLine
          )
          audio.howl = null
        }
        break
      }
      case 'pause':
        if (audio.howl) {
          try {
            ;(audio.howl as any).pause()
          } catch { /* 忽略暂停异常 */ }
          audio.paused = true
        }
        break
      case 'end':
        if (audio.howl) {
          try {
            ;(audio.howl as any).stop()
            ;(audio.howl as any).unload()
          } catch { /* 忽略释放异常 */ }
          audio.howl = null
        }
        audio.paused = false
        break
      case 'volume': {
        if (typeof args[0] !== 'number') break
        const vol = Math.max(0, Math.min(100, args[0]))
        const time = (args[1] as number) ?? 0
        audio.volume = vol / 100
        const howl = audio.howl as any
        if (audio.howl && time > 0) {
          try {
            howl.fade(howl.volume(), audio.volume, time)
          } catch { /* 忽略音量渐变动画异常 */ }
        } else if (audio.howl) {
          try {
            howl.volume(audio.volume)
          } catch { /* 忽略音量设置异常 */ }
        }
        break
      }
      case 'speed': {
        if (typeof args[0] !== 'number') break
        const targetRate = Math.max(0.1, args[0])
        const time = (args[1] as number) ?? 0
        if (audio.howl && time > 0) {
          try {
            const howl = audio.howl as any
            const startRate = howl.rate()
            const startTime = performance.now()
            const animate = (now: number) => {
              const elapsed = now - startTime
              const t = Math.min(elapsed / (time * 1000), 1)
              const currentRate = startRate + (targetRate - startRate) * t
              try { howl.rate(currentRate) } catch { /* 忽略速率动画异常 */ }
              audio.playbackRate = currentRate
              if (t < 1) {
                const nextId = requestAnimationFrame(animate)
                this.animFrameIds.add(nextId)
              }
            }
            const initialId = requestAnimationFrame(animate)
            this.animFrameIds.add(initialId)
          } catch { /* 忽略速率渐变动画初始化异常 */ }
        } else if (audio.howl) {
          try {
            ;(audio.howl as any).rate(targetRate)
          } catch { /* 忽略速率设置异常 */ }
          audio.playbackRate = targetRate
        } else {
          audio.playbackRate = targetRate
        }
        break
      }
      case 'set':
        if (typeof args[0] === 'string') {
          const newPath = args[0] as string
          if (!this.isAudioFormatSupported(newPath)) {
            this.reportAudioError(
              `不支持的音频格式: ${newPath}（支持的格式: mp3, ogg, opus, wav, aac, m4a, flac, webm）`,
              context,
              currentLine
            )
          }
          audio.filePath = newPath
        }
        break
      default:
        throw new Error(`音频对象不支持方法 '${methodName}'`)
    }
  }
}
