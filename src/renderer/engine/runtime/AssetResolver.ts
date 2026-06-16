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
  async resolveAssetPath(rawPath: string, factoryName: string | null): Promise<string> {
    const subDir = factoryName === 'Character' ? 'character' :
                   factoryName === 'Background' ? 'background' :
                   factoryName === 'Audio' ? 'audio' : ''
    if (!subDir) return rawPath

    const relativePath = `assets/public/${subDir}/${rawPath}`

    // 1) 主资源目录：构造绝对路径检查文件是否存在
    if (this.publicDir) {
      const primaryAbsPath = `${this.publicDir}/${subDir}/${rawPath}`.replace(/\\/g, '/')
      try {
        const exists = await (window as any).electronAPI?.fileExists?.(primaryAbsPath)
        if (exists) return relativePath // 主目录资源，保持向后兼容
      } catch { /* 降级到虚拟路径搜索 */ }
    }

    // 2) 虚拟路径搜索
    for (const vp of this.virtualPaths) {
      const vpAbsPath = `${vp}/${rawPath}`.replace(/\\/g, '/')
      try {
        const exists = await (window as any).electronAPI?.fileExists?.(vpAbsPath)
        if (exists) {
          // 通过 IPC 读取文件并返回 data URL（浏览器环境兼容）
          const dataUrl = await (window as any).electronAPI?.readBinary?.(vpAbsPath)
          if (dataUrl) return dataUrl
        }
      } catch { /* 跳过当前虚拟路径 */ }
    }

    // 3) 都找不到，返回相对路径（加载时会失败）
    return relativePath
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
