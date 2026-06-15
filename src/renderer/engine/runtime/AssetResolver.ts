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
   */
  resolveAssetPath(rawPath: string, factoryName: string | null): string {
    const baseDir = factoryName === 'Character' ? 'assets/public/character' :
                    factoryName === 'Background' ? 'assets/public/background' :
                    factoryName === 'Audio' ? 'assets/public/audio' : ''
    if (!baseDir) return rawPath
    return `${baseDir}/${rawPath}`
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
