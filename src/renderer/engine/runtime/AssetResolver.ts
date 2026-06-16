import type { ExpressionNode } from '../parser/index'
import type { Runtime } from './Runtime'
import type { SceneObject } from './SceneObject'

/**
 * 资源路径解析器：负责资产路径补全、格式检查、对象 ID 生成
 * 从 Runtime 拆分而来
 */
export class AssetResolver {
  /** 对象 ID 自增计数器 */
  private objectIdCounter = 0

  /** 主资源目录的绝对路径（如 C:/project/assets/public） */
  private publicDir = ''

  /** 虚拟路径列表（绝对路径） */
  private virtualPaths: string[] = []

  /**
   * 配置虚拟路径与公共目录（在 Runtime 启动前调用）
   */
  configure(publicDir: string, virtualPaths: string[]): void {
    this.publicDir = publicDir
    this.virtualPaths = virtualPaths
  }

  /**
   * 生成唯一对象 ID，避免因 ID 与工厂名（Audio/Background/Character）冲突而覆盖工厂对象
   */
  generateObjectId(): string {
    return `_obj_${++this.objectIdCounter}`
  }

  resolveObjectId(expr: ExpressionNode): string {
    if (expr.type === 'ReferenceCall') {
      return (expr as { ref: string }).ref
    }
    return this.generateObjectId()
  }

  /**
   * 根据工厂类型自动补全资产路径
   *
   * 先尝试主资源目录，若文件不存在则搜索虚拟路径。
   * 虚拟路径中的文件通过 IPC 读取并返回 data URL 以确保加载兼容性。
   */
  /** 尝试多种路径变体查找文件（支持中文、URL 编码等场景） */
  private async tryFindPath(
    baseDir: string,
    rawPath: string,
    subDir: string
  ): Promise<{ found: boolean; absPath: string; relativePath: string }> {
    const candidates: { absPath: string; withSubdir: boolean }[] = [
      // 原始路径（带子目录优先）
      { absPath: `${baseDir}/${subDir}/${rawPath}`, withSubdir: true },
      { absPath: `${baseDir}/${rawPath}`, withSubdir: false },
    ]

    // 如果路径可能被 URL 编码，尝试解码
    if (rawPath.includes('%')) {
      try {
        const decoded = decodeURIComponent(rawPath)
        candidates.push({ absPath: `${baseDir}/${subDir}/${decoded}`, withSubdir: true })
        candidates.push({ absPath: `${baseDir}/${decoded}`, withSubdir: false })
      } catch { /* ignore */ }
    }

    // 如果路径包含未编码的非 ASCII，尝试编码
    if (/[^\x00-\x7F]/.test(rawPath)) {
      try {
        const encoded = encodeURI(rawPath)
        candidates.push({ absPath: `${baseDir}/${subDir}/${encoded}`, withSubdir: true })
        candidates.push({ absPath: `${baseDir}/${encoded}`, withSubdir: false })
      } catch { /* ignore */ }
    }

    for (const { absPath, withSubdir } of candidates) {
      const normalized = absPath.replace(/\\/g, '/')
      try {
        const exists = await (window as any).electronAPI?.fileExists?.(normalized)
        if (exists) {
          // relPath 与文件实际存放位置对齐：若文件在 subDir 下则用 subDir 前缀，否则用 rawPath 自身
          const relPath = withSubdir
            ? `assets/public/${subDir}/${rawPath}`
            : `assets/public/${rawPath}`
          return { found: true, absPath: normalized, relativePath: relPath }
        }
      } catch { /* continue */ }
    }

    return { found: false, absPath: '', relativePath: `assets/public/${subDir}/${rawPath}` }
  }

  /** 对路径中的非 ASCII 部分进行 URL 编码，确保 Howl/HTMLAudioElement 能正确加载 */
  private encodePathForUrl(path: string): string {
    // data URL 不需要编码
    if (path.startsWith('data:')) return path
    const parts = path.split('/')
    return parts.map(p => /[^\x00-\x7F]/.test(p) ? encodeURI(p) : p).join('/')
  }

  async resolveAssetPath(rawPath: string, factoryName: string | null): Promise<string> {
    const subDir = factoryName === 'Character' ? 'character' :
                   factoryName === 'Background' ? 'background' :
                   factoryName === 'Audio' ? 'audio' : ''
    if (!subDir) return rawPath

    const defaultRelativePath = `assets/public/${subDir}/${rawPath}`

    // 1) 主资源目录搜索（含路径变体）
    if (this.publicDir) {
      const result = await this.tryFindPath(this.publicDir, rawPath, subDir)
      if (result.found) return this.encodePathForUrl(result.relativePath)
    }

    // 2) 虚拟路径搜索（含路径变体）
    for (const vp of this.virtualPaths) {
      const result = await this.tryFindPath(vp, rawPath, subDir)
      if (result.found) {
        // 通过 IPC 读取文件并返回 data URL（浏览器环境兼容）
        try {
          const dataUrl = await (window as any).electronAPI?.readBinary?.(result.absPath)
          if (dataUrl) return dataUrl
        } catch { /* 跳过 */ }
      }
    }

    // 3) 都找不到，返回相对路径（加载时会使用占位纹理）
    return this.encodePathForUrl(defaultRelativePath)
  }

  /**
   * 解析工厂名称：通过表达式查找符号表
   */
  resolveFactoryName(expr: ExpressionNode, runtime: Runtime): string | null {
    if (expr.type === 'ReferenceCall') {
      const ref = (expr as { ref: string }).ref
      const val = runtime.getSymbolTable().get(ref)
      if (val !== undefined && this.isFactory(val)) return val.name
      // Check type aliases
      const typeAliases = (runtime as unknown as { typeAliases: Map<string, string> }).typeAliases
      if (typeAliases?.has(ref)) {
        const originalType = typeAliases.get(ref)!
        const originalVal = runtime.getSymbolTable().get(originalType)
        if (originalVal && this.isFactory(originalVal)) return originalVal.name
      }
    }
    return null
  }

  /**
   * 异步验证头像路径是否存在
   */
  async validateAvatorPath(sceneObj: SceneObject, displayName: string, onWarning?: (msg: string) => void): Promise<void> {
    // 跳过 data URL（来自虚拟路径的资源）
    if (sceneObj.avatorPath.startsWith('data:')) return
    try {
      const exists = await (window as any).electronAPI?.fileExists(sceneObj.avatorPath)
      if (exists === false) {
        onWarning?.(`Character '${displayName}' 的头像路径无效: ${sceneObj.avatorPath}`)
        sceneObj.avatorPath = ''
      }
    } catch {
      // 无法验证路径时，保留路径
    }
  }

  private isFactory(val: unknown): val is { type: 'factory'; name: string } {
    return typeof val === 'object' && val !== null && !Array.isArray(val) &&
      (val as Record<string, unknown>).type === 'factory'
  }
}
