import type { RuntimeValue } from './Runtime'

/**
 * 符号表：作用域链式变量存储
 * 从 Runtime 拆分而来，保持原有 API 不变
 */
export class SymbolTable {
  private parent: SymbolTable | null = null
  private vars: Map<string, RuntimeValue> = new Map()

  constructor(parent?: SymbolTable) {
    if (parent) this.parent = parent
  }

  set(name: string, value: RuntimeValue): void {
    let scope: SymbolTable | null = this
    while (scope) {
      if (scope.vars.has(name)) {
        scope.vars.set(name, value)
        return
      }
      scope = scope.parent
    }
    this.vars.set(name, value)
  }

  declare(name: string, value: RuntimeValue): void {
    this.vars.set(name, value)
  }

  get(name: string): RuntimeValue | undefined {
    let scope: SymbolTable | null = this
    while (scope) {
      if (scope.vars.has(name)) return scope.vars.get(name)
      scope = scope.parent
    }
    return undefined
  }

  has(name: string): boolean {
    return this.get(name) !== undefined
  }

  createChild(): SymbolTable {
    return new SymbolTable(this)
  }
}
