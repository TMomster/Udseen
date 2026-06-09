import type {
  ScriptNode,
  StatementNode,
  ExpressionNode,
  VariableDeclNode,
  AssignmentNode,
  FunctionDefNode,
  ObjectFunctionDefNode,
  ObjectMethodCallNode,
  IfStatementNode,
  WhileStatementNode,
  BlockNode,
  AsyncBlockNode,
  NumberLiteralNode,
  StringLiteralNode,
  BooleanLiteralNode,
  ReferenceCallNode,
  ArrayLiteralNode,
  BinaryOpNode,
  UnaryOpNode,
  GroupExpressionNode,
  PropertyAccessNode,
  ChoiceStatementNode,
  ArrDeclNode,
  MapDeclNode,
  MapLiteralNode,
  WaitNode
} from '../parser/index'
import { SceneObject, RuntimeMap } from './SceneObject'
import { FilterObject, isFilterObject } from './FilterObject'
import { AnimationQueue } from './AnimationQueue'
import { registerBuiltins, showChoice } from './builtins'
import * as PIXI from 'pixi.js'
// 静态导入 Howl，避免每次音频调用都动态 import 增加内存引用和异步延迟
import { Howl } from 'howler'

/**
 * 运行时值类型
 */
export type RuntimeValue =
  | number
  | string
  | boolean
  | null
  | RuntimeValue[]
  | SceneObject
  | AudioObject
  | FilterObject
  | RuntimeFunction
  | FactoryObject
  | RuntimeMap
  | { type: 'group'; elements: RuntimeValue[] }

/**
 * 音频对象（Audio/Voice/BGM）
 */
export interface AudioObject {
  type: 'audio'
  id: string
  filePath: string
  howl: unknown  // Howl instance
  looping: boolean
  volume: number
  paused: boolean
  playbackRate: number
}

/**
 * 用户自定义函数
 */
interface RuntimeFunction {
  type: 'function'
  name: string
  params: string[]
  autoZeroParams: boolean[]
  body: BlockNode
  closure: SymbolTable
}

/**
 * 工厂对象（如 Character、Background）
 */
interface FactoryObject {
  type: 'factory'
  name: string
}

/**
 * 符号表
 */
class SymbolTable {
  private parent: SymbolTable | null = null
  private vars: Map<string, RuntimeValue> = new Map()

  constructor(parent?: SymbolTable) {
    if (parent) this.parent = parent
  }

  set(name: string, value: RuntimeValue): void {
    // Try to update in current or ancestor scope
    let scope: SymbolTable | null = this
    while (scope) {
      if (scope.vars.has(name)) {
        scope.vars.set(name, value)
        return
      }
      scope = scope.parent
    }
    // Not found in any scope, set in current
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

/**
 * Runtime - 全局解释器
 */
export class Runtime {
  private symbolTable!: SymbolTable
  private objectFunctions: Map<string, ObjectFunctionDefNode> = new Map()
  private sceneObjects: Map<string, SceneObject> = new Map()
  private audioObjects: Map<string, AudioObject> = new Map()
  private filterObjects: Map<string, FilterObject> = new Map()
  private animQueue = new AnimationQueue()
  private app: PIXI.Application
  private sceneContainer: PIXI.Container
  private running = false
  private abortController: AbortController | null = null
  /** 执行代数计数器：每次 execute() 调用递增，防止旧执行链的 finally 误清新一代状态 */
  private executionGen = 0
  /**
   * async_time 栈：async(time) { ... } 块将时间值推入，块结束后弹出
   * 嵌套 async 块形成栈结构，内置方法通过 getAsyncTime() 读取当前 async 时间
   */
  private asyncTimeStack: number[] = []
  private typeAliases: Map<string, string> = new Map()  // alias -> original first part (type name)
  private typeAliasReverse: Map<string, string> = new Map()  // original -> alias (simple)
  private methodAliases: Map<string, string> = new Map()  // "Type::alias" -> "Type::method"
  /** AST 语句节点到行号的映射 */
  private lineMap: Map<StatementNode, number> = new Map()
  /** 最后执行的语句行号（用于错误时标记位置） */
  private lastExecutionLine = 0

  /** 事件回调 */
  onLog?: (msg: string) => void
  onError?: (err: string) => void
  onChoice?: (choices: { text: string; action: () => void | Promise<void> }[]) => void
  onStateChange?: (running: boolean) => void
  /** 对话回调 - 显示对话文本，返回 Promise 在用户点击后 resolve */
  onDialogue?: (speaker: string | null, text: string, avator?: string) => Promise<void>
  /** 警告回调 - 用于在日志区域显示黄色警告 */
  onWarning?: (msg: string) => void
  /** 对话框显隐回调 - speech(0) 隐藏, speech(1) 重新显示 */
  onSpeechVisibility?: (visible: boolean) => void
  /** 重置 UI 回调 - 脚本结束时隐藏对话框和选项面板 */
  onResetUI?: () => void
  /** 执行位置回调 - 每执行一条语句前调用，line 为 1-based 行号 */
  onExecutionPosition?: (line: number) => void
  /** 执行错误回调 - 脚本执行出错时调用，提供行号和错误消息 */
  onExecutionError?: (line: number, msg: string) => void

  /** 全局 pause() 的点击 resolve 函数 */
  userClickResolve: (() => void) | null = null

  constructor(app: PIXI.Application, sceneContainer: PIXI.Container) {
    this.app = app
    this.sceneContainer = sceneContainer
    this.initSymbolTable()
  }

  /**
   * 初始化/重置符号表：注册内建函数和工厂对象
   */
  private initSymbolTable(): void {
    this.symbolTable = new SymbolTable()
    this.symbolTable.declare('__runtime__', {
      toString: () => '[Runtime]'
    } as unknown as RuntimeValue)

    // 注册内建函数（Math、say、parallel、sequence 等）
    registerBuiltins(this)

    // 注册工厂对象（Audio/Voice/BGM 统一合并为 Audio）
    this.symbolTable.declare('Character', { type: 'factory', name: 'Character' })
    this.symbolTable.declare('Background', { type: 'factory', name: 'Background' })
    this.symbolTable.declare('Audio', { type: 'factory', name: 'Audio' })
    this.symbolTable.declare('Filter', { type: 'factory', name: 'Filter' })
  }

  getApp(): PIXI.Application {
    return this.app
  }

  getAnimQueue(): AnimationQueue {
    return this.animQueue
  }

  /**
   * 返回当前 async 块的统一时长（毫秒），0 表示没有生效的 async(time) 上下文
   * 内置方法在未显式提供 time 参数时调用此方法获取默认动画时长
   */
  getAsyncTime(): number {
    return this.asyncTimeStack.length > 0 ? this.asyncTimeStack[this.asyncTimeStack.length - 1] : 0
  }

  getSceneObject(id: string): SceneObject | undefined {
    return this.sceneObjects.get(id)
  }

  registerSceneObject(id: string, obj: SceneObject): void {
    this.sceneObjects.set(id, obj)
  }

  registerAudioObject(id: string, obj: AudioObject): void {
    this.audioObjects.set(id, obj)
  }

  registerFilterObject(id: string, obj: FilterObject): void {
    this.filterObjects.set(id, obj)
  }

  getSymbolTable(): SymbolTable {
    return this.symbolTable
  }

  registerObjectFunction(name: string, def: ObjectFunctionDefNode): void {
    this.objectFunctions.set(name, def)
  }

  /**
   * 执行整个脚本
   */
  async execute(ast: ScriptNode, lineMap?: Map<StatementNode, number>): Promise<void> {
    const myGen = ++this.executionGen
    this.lineMap = lineMap ?? new Map()

    if (this.running) {
      this.stop()
      // Small delay to let cleanup happen
      await new Promise((r) => setTimeout(r, 50))
    }

    this.running = true
    this.onStateChange?.(true)
    this.abortController = new AbortController()

    try {
      await this.executeBlock({ type: 'Block', statements: ast.statements }, this.symbolTable)
    } catch (err: unknown) {
      if (err instanceof AbortError) {
        this.log('脚本执行已停止')
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        this.onExecutionError?.(this.lastExecutionLine, msg)
      }
    } finally {
      // 代数检查：只有当前执行代才清理资源并更新状态
      // 防止 cancelAll() 放行旧执行链后，旧 finally 覆盖新一代的运行状态
      if (myGen === this.executionGen) {
        this.releaseAllResources()
        this.running = false
        this.onStateChange?.(false)
      }
    }
  }

  /**
   * 停止执行
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.releaseAllResources()
    this.running = false
    this.onStateChange?.(false)
  }

  /**
   * 释放所有运行时资源：GSAP 动画、音频、场景对象、舞台、UI 组件、符号表
   * 此方法幂等（可安全重复调用），被 stop()、execute() finally、destroy() 共同使用
   */
  private releaseAllResources(): void {
    // 1. 取消所有 GSAP 动画并放行挂起的 Promise（防止旧执行链永久挂起）
    this.animQueue.cancelAll()
    // 完全替换为新的 AnimationQueue 实例，确保零共享状态
    // 旧 AnimationQueue 成为孤儿，旧执行链即便放行后也不会影响新队列
    this.animQueue = new AnimationQueue()

    // 2. 清理所有音频（stop + unload，释放音频缓冲）
    this.cleanupAllAudio()

    // 3. 销毁所有 SceneObject（释放 sprite 纹理 + GPU 滤镜资源）
    const objs = Array.from(this.sceneObjects.values())
    objs.forEach((obj) => obj.end())
    this.sceneObjects.clear()

    // 3.5 移除并销毁所有 FilterObject（从 sceneContainer.filters 移除 + 销毁 GPU 滤镜资源）
    const filters = Array.from(this.filterObjects.values())
    filters.forEach((f) => f.end())
    this.filterObjects.clear()
    // 确保场景容器无残留滤镜
    this.sceneContainer.filters = null

    // 3.6 放行挂起的 pause() 点击 resolve
    this.userClickResolve?.()
    this.userClickResolve = null

    // 4. 强制清空场景容器所有子节点（兜底清除残留精灵/容器）
    this.sceneContainer.removeChildren()

    // 5. 重置 UI（隐藏对话框和选项面板——如果脚本中断时它们还可见）
    this.onResetUI?.()

    // 6. 重置符号表（重建内置函数和工厂对象，清除用户变量/绑定）
    this.initSymbolTable()

    // 7. 清除 async_time 栈（防止旧执行链的栈残留影响新执行）
    this.asyncTimeStack = []

    // 8. 清除用户定义的对象函数和类型别名
    this.objectFunctions.clear()
    this.typeAliases.clear()
    this.typeAliasReverse.clear()
    this.methodAliases.clear()
  }

  /**
   * 遍历所有已注册的音频对象，调用 stop + unload 释放 Howl 音频缓冲
   */
  private cleanupAllAudio(): void {
    const audios = Array.from(this.audioObjects.values())
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
    this.audioObjects.clear()
  }

  /**
   * 彻底销毁 Runtime，释放所有资源
   * 组件卸载时应当调用此方法而非仅置 null
   */
  /**
   * 等待用户点击一次演出区域
   * 返回 Promise，用户点击舞台任意位置后 resolve
   */
  waitForUserClick(): Promise<void> {
    return new Promise((resolve) => {
      this.userClickResolve = resolve
    })
  }

  destroy(): void {
    this.stop()
  }

  isRunning(): boolean {
    return this.running
  }

  // ---- Internal Execution ----

  private checkAborted(): void {
    if (this.abortController?.signal.aborted) {
      throw new AbortError()
    }
  }

  private log(msg: string): void {
    this.onLog?.(msg)
  }

  private async executeBlock(block: BlockNode, scope: SymbolTable): Promise<void> {
    const childScope = scope.createChild()
    for (const stmt of block.statements) {
      this.checkAborted()
      await this.executeStatement(stmt, childScope)
    }
  }

  /* async 行为组：所有语句同时启动 */
  /* async(time) { ... } / async(time) expr 语法：
   *   - time=0（或不指定）：等待组内所有动作完成后继续执行
   *   - time>0：有限等待。async 组开始后经过 time 毫秒即继续执行后续脚本，
   *     无论组内动作是否完成。组内未完成的动画会继续在后台执行。
   *     注意：这可能导致未预期的视觉行为（如后续脚本操作组内正在动画的对象），
   *     使用时应谨慎。
   */
  private async execAsyncBlock(block: AsyncBlockNode, scope: SymbolTable): Promise<void> {
    const childScope = scope.createChild()
    // 计算等待时间
    let waitTime = 0
    if (block.time !== undefined) {
      const timeVal = await this.evaluate(block.time, scope)
      const raw = typeof timeVal === 'number' ? timeVal : 0
      waitTime = Math.abs(Math.trunc(raw))
    }

    // 捕获组内单条语句的错误，避免一个失败影响其他
    const safePromises = block.statements.map((stmt) =>
      this.executeStatement(stmt, childScope).catch(() => {})
    )

    if (waitTime > 0) {
      // 有限等待：waitTime ms 后继续执行，无论组内是否结束
      const allDone = Promise.all(safePromises)
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, waitTime))
      const winner = await Promise.race([allDone.then(() => 'all'), timeout.then(() => 'timeout')])
      if (winner === 'timeout') {
        this.onWarning?.('async(time) 有限等待超时：组内动画尚未全部完成，但后续脚本将继续执行。' +
          '继续操作组内对象可能导致未预期的视觉行为，请谨慎使用！')
      }
    } else {
      // 等待所有语句完成
      await Promise.all(safePromises)
    }
  }

  /* choice 语句：显示选项，用户选择后执行对应块 */
  private async execChoiceStatement(stmt: ChoiceStatementNode, scope: SymbolTable): Promise<void> {
    const choices = stmt.choices.map((c) => ({
      text: c.text,
      action: async () => {
        // 在子作用域执行选中的块，确保所有异步语句完成
        const childScope = scope.createChild()
        for (const s of c.block.statements) {
          await this.executeStatement(s, childScope)
        }
      }
    }))
    await showChoice(this, choices)
  }

  /** wait(time) stmt：延迟指定毫秒后执行该语句 */
  private async execWaitStatement(stmt: WaitNode, scope: SymbolTable): Promise<void> {
    const timeVal = await this.evaluate(stmt.time, scope)
    const ms = typeof timeVal === 'number' ? timeVal : 0
    await new Promise((resolve) => setTimeout(resolve, ms))
    return await this.executeStatement(stmt.statement, scope)
  }

  private async executeStatement(stmt: StatementNode, scope: SymbolTable): Promise<void> {
    this.checkAborted()

    // 触发执行位置回调（用于编辑器行高亮）
    const line = this.lineMap.get(stmt)
    if (line !== undefined) {
      this.onExecutionPosition?.(line)
      this.lastExecutionLine = line
    }

    switch (stmt.type) {
      case 'VariableDecl':
        return await this.execVariableDecl(stmt, scope)
      case 'Assignment':
        return await this.execAssignment(stmt, scope)
      case 'FunctionDef':
        return this.execFunctionDef(stmt, scope)
      case 'ObjectFunctionDef':
        return this.execObjectFunctionDef(stmt)
      case 'ObjectMethodCall':
        return await this.execObjectMethodCall(stmt, scope)
      case 'IfStatement':
        return await this.execIfStatement(stmt, scope)
      case 'WhileStatement':
        return await this.execWhileStatement(stmt, scope)
      case 'Block':
        return this.executeBlock(stmt, scope)
      case 'ExpressionStatement':
        await this.evaluate(stmt.expression, scope)
        return
      case 'ArrDecl':
        return await this.execArrDecl(stmt, scope)
      case 'MapDecl':
        return await this.execMapDecl(stmt, scope)
      case 'AsyncBlock':
        return await this.execAsyncBlock(stmt, scope)
      case 'ChoiceStatement':
        return await this.execChoiceStatement(stmt, scope)
      case 'Wait':
        return await this.execWaitStatement(stmt, scope)
    }
  }

  private async execVariableDecl(stmt: VariableDeclNode, scope: SymbolTable): Promise<void> {
    const value = await this.evaluate(stmt.value, scope)
    // Type checking for typed variables
    if (stmt.varType) {
      const actualType = this.valueTypeName(value)
      if (stmt.varType !== actualType && !this.isTypeCompatible(stmt.varType, value)) {
        throw new Error(`类型不匹配: 变量 '${stmt.name}' 声明为 ${stmt.varType}，但赋值为 ${actualType}`)
      }
    }
    scope.declare(stmt.name, value)
    this.log(`定义变量 ${stmt.name} = ${formatValue(value)}`)
  }

  /** 获取运行时值的类型名称 */
  private valueTypeName(val: RuntimeValue): string {
    if (val === null) return 'null'
    if (typeof val === 'number') return 'num'
    if (typeof val === 'string') return 'str'
    if (typeof val === 'boolean') return 'bool'
    if (Array.isArray(val)) return 'arr'
    if (isRuntimeMap(val)) return 'map'
    if (isSceneObjectValue(val)) return 'obj'
    return typeof val
  }

  /** 检查类型是否兼容 */
  private isTypeCompatible(typeName: string, value: RuntimeValue): boolean {
    switch (typeName) {
      case 'num': return typeof value === 'number'
      case 'async_time': return typeof value === 'number'  // async_time 本质等同于 num
      case 'str': return typeof value === 'string'
      case 'bool': return typeof value === 'boolean'
      case 'arr': return Array.isArray(value)
      case 'map': return isRuntimeMap(value)
      default: return true
    }
  }

  private async execArrDecl(stmt: ArrDeclNode, scope: SymbolTable): Promise<void> {
    const value = await this.evaluate(stmt.value, scope)
    if (stmt.elementType && Array.isArray(value)) {
      // Check element types
      for (const elem of value) {
        if (!this.isTypeCompatible(stmt.elementType, elem)) {
          throw new Error(`数组元素类型不匹配: 期望 ${stmt.elementType}`)
        }
      }
    }
    scope.declare(stmt.name, value)
    this.log(`定义数组 ${stmt.name} = ${formatValue(value)}`)
  }

  private async execMapDecl(stmt: MapDeclNode, scope: SymbolTable): Promise<void> {
    const entries: Record<string, RuntimeValue> = {}
    for (const entry of stmt.entries) {
      const val = await this.evaluate(entry.value, scope)
      entries[entry.key] = val
    }
    const mapVal: RuntimeMap = { type: 'map', entries: entries as Record<string, string | number | boolean | null> }
    scope.declare(stmt.name, mapVal)
    this.log(`定义映射 ${stmt.name}`)
  }

  private async execAssignment(stmt: AssignmentNode, scope: SymbolTable): Promise<void> {
    const value = await this.evaluate(stmt.value, scope)
    if (stmt.index) {
      // Array element assignment
      const target = scope.get(stmt.name)
      const idx = await this.evaluate(stmt.index, scope)
      if (target && Array.isArray(target) && typeof idx === 'number') {
        target[idx] = value
      }
    } else {
      scope.set(stmt.name, value)
      this.log(`赋值 ${stmt.name} = ${formatValue(value)}`)
    }
  }

  private execFunctionDef(stmt: FunctionDefNode, scope: SymbolTable): void {
    const func: RuntimeFunction = {
      type: 'function',
      name: stmt.name,
      params: stmt.params,
      autoZeroParams: stmt.autoZeroParams,
      body: stmt.block,
      closure: scope
    }
    scope.declare(stmt.name, func)
    this.log(`定义函数 ${stmt.name}(${stmt.params.join(', ')})`)
  }

  private execObjectFunctionDef(stmt: ObjectFunctionDefNode): void {
    if (stmt.typeNames.length > 0) {
      for (const typeName of stmt.typeNames) {
        const key = `${typeName}::${stmt.name}`
        this.objectFunctions.set(key, stmt)
        this.log(`定义对象函数 ${key}(${stmt.params.join(', ')})`)
      }
    } else {
      this.objectFunctions.set(stmt.name, stmt)
      this.log(`定义对象函数 ${stmt.name}(${stmt.params.join(', ')})`)
    }
  }

  private async execObjectMethodCall(stmt: ObjectMethodCallNode, scope: SymbolTable): Promise<void> {
    const objExpr = stmt.obj
    const methodName = stmt.method
    const args = await Promise.all(stmt.args.map((a) => this.evaluate(a, scope)))

    // Evaluate the object expression
    const objValue = await this.evaluate(objExpr, scope)

    if (methodName === 'set') {
      if (typeof args[0] !== 'string') throw new Error('set() 需要一个路径参数')
      const objId = this.resolveObjectId(objExpr)
      const factoryName = this.resolveFactoryName(objExpr)

      // Resolve asset path
      const rawPath = args[0] as string
      const resolvedPath = this.resolveAssetPath(rawPath, factoryName)

      // Extract display name (second arg to set: set(path, name))
      const displayName = args.length >= 2 && typeof args[1] === 'string'
        ? (args[1] as string)
        : factoryName ?? 'SceneObject'

      // Audio factory creates audio objects
      if (factoryName === 'Audio') {
        const audioObj: AudioObject = {
          type: 'audio',
          id: objId,
          filePath: resolvedPath,
          howl: null,
          looping: false,
          volume: 1,
          paused: false,
          playbackRate: 1
        }
        scope.declare(objId, audioObj)
        this.registerAudioObject(objId, audioObj)
        this.log(`定义音频 ${objId} (${resolvedPath})`)
        return
      }

      // Create a SceneObject
      const sceneObj = new SceneObject(objId, this.app, this.sceneContainer)
      if (factoryName) sceneObj.objectType = factoryName
      sceneObj.displayName = displayName

      // Extract avator (third arg to set: set(path, name, avator))
      if (args.length >= 3 && typeof args[2] === 'string') {
        const avatorPath = args[2] as string
        if (avatorPath && factoryName === 'Character') {
          const resolvedAvatorPath = this.resolveAssetPath(avatorPath, factoryName)
          sceneObj.avatorPath = resolvedAvatorPath
        }
      }

      await sceneObj.set(resolvedPath)

      // 异步验证头像路径
      if (sceneObj.avatorPath) {
        this.validateAvatorPath(sceneObj, displayName)
      }

      this.registerSceneObject(objId, sceneObj)
      scope.declare(objId, sceneObj)
      return
    }

    // Delegate to shared method dispatch
    await this.callObjectMethod(objValue, methodName, args, scope)
  }

  /**
   * 共享的对象方法调用调度 - 同时在 execObjectMethodCall 和 evaluate 中使用
   */
  private async callObjectMethod(
    objValue: RuntimeValue,
    methodName: string,
    args: RuntimeValue[],
    scope: SymbolTable
  ): Promise<void> {
    // Handle FilterObject
    if (isFilterObject(objValue)) {
      await this.callFilterMethod(objValue, methodName, args)
      return
    }

    // Handle AudioObject
    if (isAudioObject(objValue)) {
      await this.callAudioMethod(objValue, methodName, args)
      return
    }

    // Find the target SceneObject
    let targetObj: SceneObject | undefined
    if (isSceneObjectValue(objValue)) {
      targetObj = objValue
    } else if (typeof objValue === 'string') {
      targetObj = this.sceneObjects.get(objValue)
    }

    if (!targetObj) {
      // Check if it's a built-in function on a non-object (e.g., playBGM)
      const builtinFunc = this.symbolTable.get(methodName)
      if (builtinFunc && typeof (builtinFunc as unknown as Record<string, unknown>).call === 'function') {
        // This is a built-in function, call it
        return
      }
      const valType = objValue === null ? 'null' : typeof objValue
      throw new Error(`无法调用方法 '${methodName}'：'obj' (${valType}) 不是场景对象`)
    }

    // Check if method is a built-in method
    const builtinMethod = builtinMethods[methodName]
    if (builtinMethod) {
      await builtinMethod(targetObj, args, this)
      return
    }

    // Check type-specific user-defined ObjectFunction first
    if (targetObj.objectType) {
      const typeKey = `${targetObj.objectType}::${methodName}`
      const typeObjFuncDef = this.objectFunctions.get(typeKey)
      if (typeObjFuncDef) {
        await this.callObjectFunction(typeObjFuncDef, targetObj, args, scope)
        return
      }
    }

    // Check if method is a user-defined ObjectFunction (generic)
    const objFuncDef = this.objectFunctions.get(methodName)
    if (objFuncDef) {
      await this.callObjectFunction(objFuncDef, targetObj, args, scope)
      return
    }

    // Check if it's a registered builtin ObjectFunction
    if (builtinObjectFunctions[methodName]) {
      await builtinObjectFunctions[methodName](targetObj, args, this)
      return
    }

    // Check method aliases
    if (targetObj.objectType) {
      const aliasKey = `${targetObj.objectType}::${methodName}`
      const aliasMethod = this.methodAliases.get(aliasKey)
      if (aliasMethod) {
        // Resolve the alias to original method name
        const originalMethodName = aliasMethod.split('::').pop()!
        return this.callObjectMethod(objValue, originalMethodName, args, scope)
      }
    }

    // Also check generic ObjectType::methodName alias
    const genericAliasKey = `ObjectType::${methodName}`
    const genericAliasMethod = this.methodAliases.get(genericAliasKey)
    if (genericAliasMethod) {
      const originalMethodName = genericAliasMethod.split('::').pop()!
      return this.callObjectMethod(objValue, originalMethodName, args, scope)
    }

    // Also check if methodName itself is an alias for a specific method
    const directAlias = this.methodAliases.get(methodName)
    if (directAlias) {
      const parts = directAlias.split('::')
      if (parts.length > 1) {
        const originalMethodName = parts.pop()!
        return this.callObjectMethod(objValue, originalMethodName, args, scope)
      }
    }

    throw new Error(`未知方法 '${methodName}'`)
  }

  private async callFilterMethod(filterObj: FilterObject, methodName: string, args: RuntimeValue[]): Promise<void> {
    switch (methodName) {
      case 'begin':
        filterObj.begin()
        break
      case 'end':
        filterObj.end()
        break
      case 'hex': {
        const color = String(args[0] ?? '')
        filterObj.hex(color)
        break
      }
      case 'rgb': {
        const r = (args[0] as number) ?? 0
        const g = (args[1] as number) ?? 0
        const b = (args[2] as number) ?? 0
        filterObj.rgb(r, g, b)
        break
      }
      case 'blur':
        filterObj.blur((args[0] as number) ?? 0)
        break
      case 'brightness':
        filterObj.brightness((args[0] as number) ?? 1)
        break
      case 'contrast':
        filterObj.contrast((args[0] as number) ?? 1)
        break
      case 'saturation':
        filterObj.saturation((args[0] as number) ?? 1)
        break
      case 'gamma':
        filterObj.gamma((args[0] as number) ?? 1)
        break
      case 'intensity':
        await filterObj.intensity((args[0] as number) ?? 1, (args[1] as number) ?? undefined)
        break
      default:
        throw new Error(`滤镜对象不支持方法 '${methodName}'`)
    }
  }

  private async callAudioMethod(audio: AudioObject, methodName: string, args: RuntimeValue[]): Promise<void> {
    switch (methodName) {
      case 'begin':
      case 'loop': {
        const looping = methodName === 'loop'
        // 销毁旧的 Howl 实例（先 stop 再 unload，释放音频缓冲数据）
        if (audio.howl) {
          ;(audio.howl as any).stop()
          ;(audio.howl as any).unload()
          audio.howl = null
        }
        const howl = new Howl({
          src: [audio.filePath],
          loop: looping,
          volume: audio.volume
        })
        audio.howl = howl
        audio.looping = looping
        audio.paused = false
        howl.rate(audio.playbackRate)
        howl.play()
        break
      }
      case 'pause':
        if (audio.howl) {
          ;(audio.howl as any).pause()
          audio.paused = true
        }
        break
      case 'end':
        // end 替代原来的 stop，用 ObjectType::end() 释放音频资源
        if (audio.howl) {
          ;(audio.howl as any).stop()
          ;(audio.howl as any).unload()
          audio.howl = null
        }
        audio.paused = false
        break
      case 'volume': {
        const vol = Math.max(0, Math.min(100, (args[0] as number) ?? 100))
        const time = (args[1] as number) ?? 0
        audio.volume = vol / 100
        const howl = audio.howl as any
        if (audio.howl && time > 0) {
          howl.fade(howl.volume(), audio.volume, time)
        } else if (audio.howl) {
          howl.volume(audio.volume)
        }
        break
      }
      case 'speed': {
        const targetRate = Math.max(0.1, (args[0] as number) ?? 1)
        const time = (args[1] as number) ?? 0
        if (audio.howl && time > 0) {
          const howl = audio.howl as any
          const startRate = howl.rate()
          const startTime = performance.now()
          const animate = (now: number) => {
            const elapsed = now - startTime
            const t = Math.min(elapsed / (time * 1000), 1)
            const currentRate = startRate + (targetRate - startRate) * t
            howl.rate(currentRate)
            audio.playbackRate = currentRate
            if (t < 1) {
              requestAnimationFrame(animate)
            }
          }
          requestAnimationFrame(animate)
        } else if (audio.howl) {
          ;(audio.howl as any).rate(targetRate)
          audio.playbackRate = targetRate
        } else {
          audio.playbackRate = targetRate
        }
        break
      }
      case 'set':
        // Audio.set already handled at factory, just update path
        if (typeof args[0] === 'string') {
          audio.filePath = args[0]
        }
        break
      default:
        throw new Error(`音频对象不支持方法 '${methodName}'`)
    }
  }

  private resolveObjectId(expr: ExpressionNode): string {
    if (expr.type === 'ReferenceCall') {
      return expr.ref
    }
    return String(Math.random())
  }

  /**
   * 根据工厂类型自动补全资产路径
   * 所有资源统一放置在 assets/public/ 目录下：
   *   Character  → assets/public/character/{filename}
   *   Background → assets/public/background/{filename}
   *   Audio      → assets/public/audio/{subdir/filename}
   */
  private resolveAssetPath(rawPath: string, factoryName: string | null): string {
    const baseDir = factoryName === 'Character' ? 'assets/public/character' :
                    factoryName === 'Background' ? 'assets/public/background' :
                    factoryName === 'Audio' ? 'assets/public/audio' : ''
    if (!baseDir) return rawPath
    // 所有路径均拼接到对应基目录下（Audio 的路径已含子目录如 bgm/、effect/）
    return `${baseDir}/${rawPath}`
  }

  /**
   * 异步验证头像路径是否存在，不存在时发出黄色警告并清空头像
   */
  private async validateAvatorPath(sceneObj: SceneObject, displayName: string): Promise<void> {
    try {
      const exists = await window.electronAPI?.fileExists(sceneObj.avatorPath)
      if (exists === false) {
        this.onWarning?.(`Character '${displayName}' 的头像路径无效: ${sceneObj.avatorPath}`)
        sceneObj.avatorPath = ''
      }
    } catch {
      // 无法验证路径时（如非 Electron 环境），保留路径让 DialogBox 运行时决定
    }
  }

  private resolveFactoryName(expr: ExpressionNode): string | null {
    if (expr.type === 'ReferenceCall') {
      const val = this.getSymbolTable().get(expr.ref)
      if (val !== undefined && isFactory(val)) return val.name
      // Check if the ref is a type alias for a factory
      if (this.typeAliases.has(expr.ref)) {
        const originalType = this.typeAliases.get(expr.ref)!
        const originalVal = this.symbolTable.get(originalType)
        if (originalVal && isFactory(originalVal)) return originalVal.name
      }
    }
    return null
  }

  private async callObjectFunction(
    def: ObjectFunctionDefNode,
    obj: SceneObject,
    args: RuntimeValue[],
    _scope: SymbolTable
  ): Promise<void> {
    const funcScope = new SymbolTable()
    // 绑定用户声明的参数，跳过 'obj'——它始终由运行时自动绑定为调用该方法的场景对象
    let argIdx = 0
    for (let i = 0; i < def.params.length; i++) {
      if (def.params[i] === 'obj') continue  // obj 不占用参数位置
      const autoZero = def.autoZeroParams && def.autoZeroParams[i]
      funcScope.declare(def.params[i], args[argIdx] ?? (autoZero ? 0 : null))
      argIdx++
    }
    // 'obj' 始终指代调用方法的场景对象
    funcScope.declare('obj', obj)
    await this.executeBlock(def.block, funcScope)
  }

  private async execIfStatement(stmt: IfStatementNode, scope: SymbolTable): Promise<void> {
    const condition = await this.evaluate(stmt.condition, scope)
    if (isTruthy(condition)) {
      await this.executeBlock(stmt.thenBlock, scope)
    } else if (stmt.elseBlock) {
      await this.executeBlock(stmt.elseBlock, scope)
    }
  }

  private async execWhileStatement(stmt: WhileStatementNode, scope: SymbolTable): Promise<void> {
    while (isTruthy(await this.evaluate(stmt.condition, scope))) {
      this.checkAborted()
      await this.executeBlock(stmt.block, scope)
    }
  }

  // ---- Expression Evaluation ----

  async evaluate(expr: ExpressionNode, scope?: SymbolTable): Promise<RuntimeValue> {
    const s = scope ?? this.symbolTable

    switch (expr.type) {
      case 'NumberLiteral':
        return (expr as NumberLiteralNode).value
      case 'StringLiteral':
        return (expr as StringLiteralNode).value
      case 'BooleanLiteral':
        return (expr as BooleanLiteralNode).value
      case 'NullLiteral':
        return null
      case 'ReferenceCall': {
        const ref = expr as ReferenceCallNode
        const val = s.get(ref.ref)
        if (val === undefined) throw new Error(`未定义的变量 '${ref.ref}'`)
        if (ref.args) {
          // Function call
          const args = await Promise.all(ref.args.map((a) => this.evaluate(a, s)))
          if (typeof (val as unknown as Record<string, unknown>).call === 'function') {
            return (val as unknown as (...args: RuntimeValue[]) => RuntimeValue)(...args)
          }
          if (isRuntimeFunction(val)) {
            return this.callUserFunction(val, args)
          }
          throw new Error(`'${ref.ref}' 不是一个可调用的函数`)
        }
        return val
      }
      case 'ArrayLiteral': {
        const arr = expr as ArrayLiteralNode
        const elements = await Promise.all(arr.elements.map((e) => this.evaluate(e, s)))
        return elements
      }
      case 'BinaryOp': {
        const bin = expr as BinaryOpNode
        return await this.evalBinary(bin, s)
      }
      case 'UnaryOp': {
        const un = expr as UnaryOpNode
        return await this.evalUnary(un, s)
      }
      case 'ChoiceExpression': {
        // We need to know when a choice is being evaluated to pause
        // This is handled by the UI layer via the onChoice callback
        return null
      }
      case 'GroupExpression': {
        const group = expr as GroupExpressionNode
        const elements = await Promise.all(group.elements.map((e) => this.evaluate(e, s)))
        return {
          type: 'group',
          elements
        }
      }
      case 'MapLiteral': {
        const mapLit = expr as MapLiteralNode
        const entries: Record<string, RuntimeValue> = {}
        for (const entry of mapLit.entries) {
          entries[entry.key] = await this.evaluate(entry.value, s)
        }
        return { type: 'map', entries } as RuntimeMap
      }
      case 'PropertyAccess': {
        const pa = expr as PropertyAccessNode
        const objVal = await this.evaluate(pa.obj, s)
        if (objVal && typeof objVal === 'object' && !Array.isArray(objVal) && !isSceneObjectValue(objVal) && !isAudioObject(objVal)) {
          // Plain object: access property (e.g., Math.PI)
          const propVal = (objVal as Record<string, unknown>)[pa.property]
          if (propVal !== undefined) return propVal as RuntimeValue
        }
        throw new Error(`属性 '${pa.property}' 不存在`)
      }
      case 'ObjectMethodCall': {
        const mc = expr as ObjectMethodCallNode
        const objValue = await this.evaluate(mc.obj, s)
        const args = await Promise.all(mc.args.map((a) => this.evaluate(a, s)))

        // Handle factory set() - e.g., Character.set("path")
        if (mc.method === 'set' && isFactory(objValue)) {
          const factoryName = objValue.name

          // Filter factory: set() 不需要参数
          if (factoryName === 'Filter') {
            const objId = this.resolveObjectId(mc.obj)
            const filterObj = new FilterObject(objId, this.app, this.sceneContainer)
            this.registerFilterObject(objId, filterObj)
            s.declare(objId, filterObj)
            this.log(`定义滤镜 ${objId}`)
            return filterObj
          }

          if (typeof args[0] !== 'string') throw new Error('set() 需要一个路径参数')
          const objId = this.resolveObjectId(mc.obj)

          // Resolve asset path
          const rawPath = args[0] as string
          const resolvedPath = this.resolveAssetPath(rawPath, factoryName)

          // Extract display name (second arg to set: set(path, name))
          const displayName = args.length >= 2 && typeof args[1] === 'string'
            ? (args[1] as string)
            : factoryName

          // Audio factory
          if (factoryName === 'Audio') {
            const audioObj: AudioObject = {
              type: 'audio',
              id: objId,
              filePath: resolvedPath,
              howl: null,
              looping: false,
              volume: 1,
              paused: false,
              playbackRate: 1
            }
            s.declare(objId, audioObj)
            this.registerAudioObject(objId, audioObj)
            return audioObj
          }

          const sceneObj = new SceneObject(objId, this.app, this.sceneContainer)
          sceneObj.objectType = factoryName
          sceneObj.displayName = displayName

          // Extract avator (third arg to set: set(path, name, avator))
          if (args.length >= 3 && typeof args[2] === 'string') {
            const avatorPath = args[2] as string
            if (avatorPath && factoryName === 'Character') {
              const resolvedAvatorPath = this.resolveAssetPath(avatorPath, factoryName)
              sceneObj.avatorPath = resolvedAvatorPath
            }
          }

          await sceneObj.set(resolvedPath)

          // 异步验证头像路径
          if (sceneObj.avatorPath) {
            this.validateAvatorPath(sceneObj, displayName)
          }

          this.registerSceneObject(objId, sceneObj)
          return sceneObj
        }

        // Direct property/expression getters on SceneObject
        if (isSceneObjectValue(objValue)) {
          if (mc.method === 'getX') return objValue.getPosX()
          if (mc.method === 'getY') return objValue.getPosY()
          if (mc.method === 'getPosX') return objValue.getPosX()
          if (mc.method === 'getPosY') return objValue.getPosY()
          if (mc.method === 'getPos') return objValue.getPos()
        }

        // Handle method calls on plain objects (e.g., Math.random(), Math.floor(x))
        if (objValue && typeof objValue === 'object' && !Array.isArray(objValue) && !isSceneObjectValue(objValue) && !isAudioObject(objValue)) {
          const objRecord = objValue as Record<string, unknown>
          const method = objRecord[mc.method]
          if (typeof method === 'function') {
            return (method as (...a: RuntimeValue[]) => RuntimeValue)(...args)
          }
          throw new Error(`方法 '${mc.method}' 不存在`)
        }

        // Handle all other object method calls (begin, move, alpha, etc.)
        await this.callObjectMethod(objValue, mc.method, args, s)
        return null
      }
      default:
        throw new Error(`未知表达式类型: ${(expr as { type: string }).type}`)
    }
  }

  private async callUserFunction(func: RuntimeFunction, args: RuntimeValue[]): Promise<RuntimeValue> {
    const funcScope = func.closure.createChild()
    for (let i = 0; i < func.params.length; i++) {
      const autoZero = func.autoZeroParams && func.autoZeroParams[i]
      funcScope.declare(func.params[i], args[i] ?? (autoZero ? 0 : null))
    }
    // Execute the function body
    const block = func.body
    for (const stmt of block.statements) {
      if (stmt.type === 'ExpressionStatement') {
        const val = await this.evaluate(stmt.expression, funcScope)
        // Return the last expression value
        return val
      }
      if (stmt.type === 'VariableDecl') {
        await this.execVariableDecl(stmt, funcScope)
      }
    }
    return null
  }

  private async evalBinary(expr: BinaryOpNode, scope: SymbolTable): Promise<RuntimeValue> {
    const left = await this.evaluate(expr.left, scope)
    const right = await this.evaluate(expr.right, scope)

    switch (expr.op) {
      case '+':
        if (typeof left === 'number' && typeof right === 'number') return left + right
        if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right)
        return (left as number) + (right as number)
      case '-': return (left as number) - (right as number)
      case '*': return (left as number) * (right as number)
      case '/': return (left as number) / (right as number)
      case '%': return (left as number) % (right as number)
      case '==': return left === right
      case '!=': return left !== right
      case '<': return (left as number) < (right as number)
      case '<=': return (left as number) <= (right as number)
      case '>': return (left as number) > (right as number)
      case '>=': return (left as number) >= (right as number)
      case '&&': return isTruthy(left) && isTruthy(right)
      case '||': return isTruthy(left) || isTruthy(right)
      default:
        throw new Error(`未知二元运算符 '${expr.op}'`)
    }
  }

  private async evalUnary(expr: UnaryOpNode, scope: SymbolTable): Promise<RuntimeValue> {
    const val = await this.evaluate(expr.expr, scope)
    switch (expr.op) {
      case '-': return -(val as number)
      case '!': return !isTruthy(val)
      default:
        throw new Error(`未知一元运算符 '${expr.op}'`)
    }
  }
}

// ---- Utility Functions ----

class AbortError extends Error {
  constructor() {
    super('Execution aborted')
    this.name = 'AbortError'
  }
}

function isTruthy(val: RuntimeValue): boolean {
  if (val === null) return false
  if (typeof val === 'boolean') return val
  if (typeof val === 'number') return val !== 0
  if (typeof val === 'string') return val.length > 0
  if (Array.isArray(val)) return val.length > 0
  return true
}

function isRuntimeFunction(val: RuntimeValue): val is RuntimeFunction {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && (val as Record<string, unknown>).type === 'function'
}

function isFactory(val: RuntimeValue): val is FactoryObject {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && (val as Record<string, unknown>).type === 'factory'
}

function isAudioObject(val: RuntimeValue): val is AudioObject {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && (val as Record<string, unknown>).type === 'audio'
}

/**
 * 可靠地判断值是否为 SceneObject（同时支持 instanceof 和 duck-type 标记，
 * 避免 HMR 热重载时因模块实例不同导致 instanceof 失效）
 */
function isSceneObjectValue(val: RuntimeValue): val is SceneObject {
  if (val instanceof SceneObject) return true
  return typeof val === 'object' && val !== null && (val as Record<string, unknown>)._isSceneObject === true
}

function formatValue(val: RuntimeValue): string {
  if (val === null) return 'null'
  if (typeof val === 'object' && !Array.isArray(val)) return `[${(val as Record<string, unknown>).type ?? 'Object'}]`
  return String(val)
}

// ---- Built-in Object Methods ----

const builtinMethods: Record<string, (obj: SceneObject, args: RuntimeValue[], runtime: Runtime) => Promise<void>> = {
  // ---- 生命周期 ----
  begin: async (obj, args) => {
    const mode = typeof args[0] === 'number' ? args[0] : 0
    obj.begin(mode)
  },
  hide: async (obj) => obj.hide(),
  end: async (obj) => obj.end(),

  // ---- 动图控制 ----
  /** loop()：循环播放动图 */
  loop: async (obj) => {
    obj.loopAnim()
  },
  /** pause()：暂停动图播放 */
  pause: async (obj) => {
    obj.pauseAnim()
  },
  /** stop()：停止动图播放并重置到第一帧 */
  stop: async (obj) => {
    obj.stopAnim()
  },
  /** speed(val, time?)：设置动图播放倍速，1.0 为原速 */
  speed: async (obj, args) => {
    const val = Math.max(0.1, (args[0] as number) ?? 1)
    obj.setAnimSpeed(val)
  },
  /** fps(val)：设置动图帧率，覆盖 GIF 原始帧间隔，如 fps(16) 表示 16 FPS，fps(0) 恢复原始 */
  fps: async (obj, args) => {
    const val = (args[0] as number) ?? 16
    obj.setFPS(val)
  },
  /** frame(val)：将 Sprite 加入舞台，静态显示动图指定帧（默认第 1 帧），不播放 */
  frame: async (obj, args) => {
    const val = (args[0] as number) ?? 1
    obj.showFrame(val)
  },

  // ---- 移动与变换 ----
  /** move(dx, dy, time=0)：相对位移。当前坐标 + dx, +dy */
  move: async (obj, args, runtime) => {
    const dx = (args[0] as number) ?? 0
    const dy = (args[1] as number) ?? 0
    const duration = (args.length >= 3 && typeof args[2] === 'number')
      ? (args[2] as number)
      : runtime.getAsyncTime()
    const targetWorldX = obj.x + dx
    const targetWorldY = obj.y + dy
    const screenX = 960 + targetWorldX
    const screenY = 540 - targetWorldY
    if (duration > 0 && obj.sprite) {
      await runtime.getAnimQueue().moveTo(obj.sprite!, screenX, screenY, duration)
    } else {
      if (obj.sprite) { obj.sprite.x = screenX; obj.sprite.y = screenY }
    }
    obj.x = targetWorldX
    obj.y = targetWorldY
  },
  /** setPos(x, y, time=0) 或 setPos(position, time=0)：绝对位移 */
  setPos: async (obj, args, runtime) => {
    let targetX: number, targetY: number, duration = 0
    if (args.length >= 1 && isRuntimeMap(args[0])) {
      // setPos(position, time?)
      const pos = args[0] as RuntimeMap
      targetX = (pos.entries.posX as number) ?? obj.x
      targetY = (pos.entries.posY as number) ?? obj.y
      duration = (args.length >= 2 && typeof args[1] === 'number')
        ? (args[1] as number)
        : runtime.getAsyncTime()
    } else {
      // setPos(x, y, time?)
      targetX = (args[0] as number) ?? obj.x
      targetY = (args[1] as number) ?? obj.y
      duration = (args.length >= 3 && typeof args[2] === 'number')
        ? (args[2] as number)
        : runtime.getAsyncTime()
    }
    const screenX = 960 + targetX
    const screenY = 540 - targetY
    if (duration > 0 && obj.sprite) {
      await runtime.getAnimQueue().moveTo(obj.sprite!, screenX, screenY, duration)
    } else {
      if (obj.sprite) { obj.sprite.x = screenX; obj.sprite.y = screenY }
    }
    obj.x = targetX
    obj.y = targetY
  },
  moveToX: async (obj, args, runtime) => {
    const x = args[0] as number
    const duration = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : (runtime.getAsyncTime() || 1000)
    await runtime.getAnimQueue().animate(obj.sprite!, { x: 960 + x }, duration)
    obj.x = x
  },
  moveToY: async (obj, args, runtime) => {
    const y = args[0] as number
    const duration = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : (runtime.getAsyncTime() || 1000)
    await runtime.getAnimQueue().animate(obj.sprite!, { y: 540 - y }, duration)
    obj.y = y
  },
  /** rotate(angle, time=0)：绝对旋转角度（度） */
  rotate: async (obj, args, runtime) => {
    const angle = args[0] as number
    const duration = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const rad = angle * (Math.PI / 180)
    if (duration > 0 && obj.sprite) {
      await runtime.getAnimQueue().rotateTo(obj.sprite!, rad, duration)
    } else {
      if (obj.sprite) obj.sprite.rotation = rad
    }
    obj.rotation = rad
  },
  /** rotateTo(angle, time=0)：相对旋转，在当前旋转角度上再旋转 angle 度 */
  rotateTo: async (obj, args, runtime) => {
    const angle = args[0] as number
    const duration = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const targetDeg = obj.rotation * (180 / Math.PI) + angle
    const rad = targetDeg * (Math.PI / 180)
    if (duration > 0 && obj.sprite) {
      await runtime.getAnimQueue().rotateTo(obj.sprite!, rad, duration)
    } else {
      if (obj.sprite) obj.sprite.rotation = rad
    }
    obj.rotation = rad
  },

  // ---- 变换 ----
  /** scale(val, time=0)：绝对缩放，val=1.0 为原始大小 */
  scale: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    if (time > 0 && obj.sprite) {
      await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: val, y: val }, time)
    }
    obj.setScale(val)
  },
  /** scaleTo(val, time=0)：相对缩放，在当前缩放基础上再乘 val 倍 */
  scaleTo: async (obj, args, runtime) => {
    const multiplier = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const targetVal = obj.scaleX * multiplier
    if (time > 0 && obj.sprite) {
      await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: targetVal, y: targetVal }, time)
    }
    obj.setScale(targetVal)
  },
  /** scaleX(val, time=async)：水平缩放 */
  scaleX: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    if (time > 0 && obj.sprite) {
      await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: val }, time)
    }
    obj.setScaleX(val)
  },
  /** scaleY(val, time=async)：垂直缩放 */
  scaleY: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    if (time > 0 && obj.sprite) {
      await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { y: val }, time)
    }
    obj.setScaleY(val)
  },
  /** scaleXTo(val, time=0)：水平相对缩放，在当前水平缩放基础上再乘 val 倍 */
  scaleXTo: async (obj, args, runtime) => {
    const multiplier = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const targetVal = obj.scaleX * multiplier
    if (time > 0 && obj.sprite) {
      await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: targetVal }, time)
    }
    obj.setScaleX(targetVal)
  },
  /** scaleYTo(val, time=0)：垂直相对缩放，在当前垂直缩放基础上再乘 val 倍 */
  scaleYTo: async (obj, args, runtime) => {
    const multiplier = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const targetVal = obj.scaleY * multiplier
    if (time > 0 && obj.sprite) {
      await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { y: targetVal }, time)
    }
    obj.setScaleY(targetVal)
  },
  alpha: async (obj, args, runtime) => {
    const val = Math.max(0, Math.min(1, args[0] as number))
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    if (time > 0 && obj.sprite) {
      await runtime.getAnimQueue().animateProperty(obj.sprite, { alpha: val }, time)
    }
    obj.setAlpha(val)
  },
  index: async (obj, args) => {
    obj.setIndex(args[0] as number)
  },
  setAlpha: async (obj, args, runtime) => {
    const val = Math.max(0, Math.min(1, args[0] as number))
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    if (time > 0 && obj.sprite) {
      await runtime.getAnimQueue().animateProperty(obj.sprite, { alpha: val }, time)
    }
    obj.setAlpha(val)
  },
  setScale: async (obj, args, runtime) => {
    if (args.length >= 2 && typeof args[0] === 'number' && typeof args[1] === 'number') {
      const sx = args[0] as number
      const sy = args[1] as number
      const time = (args.length >= 3 && typeof args[2] === 'number')
        ? (args[2] as number)
        : runtime.getAsyncTime()
      if (time > 0 && obj.sprite) {
        await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: sx, y: sy }, time)
      }
      obj.setScaleXY(sx, sy)
    } else {
      const val = args[0] as number
      const time = (args.length >= 2 && typeof args[1] === 'number')
        ? (args[1] as number)
        : runtime.getAsyncTime()
      if (time > 0 && obj.sprite) {
        await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: val, y: val }, time)
      }
      obj.setScale(val)
    }
  },
  setTint: async (obj, args) => {
    obj.setTint(args[0] as number)
  },

  // ---- 滤镜 ----
  blur: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const intensity = (args.length >= 3 && typeof args[2] === 'number')
      ? Math.max(0, Math.min(1, args[2] as number))
      : 1
    obj.intensityValue = intensity
    if (time > 0) {
      // 确保滤镜存在，然后对 blur 数值属性做 GSAP 渐变动画
      obj.setBlur(obj.blurValue)
      const targetBlur = Math.max(0, val * 10) * intensity
      await runtime.getAnimQueue().animateProperty(obj.blurFilter!, { blur: targetBlur }, time)
    }
    obj.setBlur(val)
  },
  brightness: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const intensity = (args.length >= 3 && typeof args[2] === 'number')
      ? Math.max(0, Math.min(1, args[2] as number))
      : 1
    obj.intensityValue = intensity
    if (time > 0) {
      const startVal = obj.brightnessValue
      await runtime.getAnimQueue().animateCallback((progress) => {
        obj.setBrightness(startVal + (val - startVal) * progress)
      }, time)
    }
    obj.setBrightness(val)
  },
  contrast: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const intensity = (args.length >= 3 && typeof args[2] === 'number')
      ? Math.max(0, Math.min(1, args[2] as number))
      : 1
    obj.intensityValue = intensity
    if (time > 0) {
      const startVal = obj.contrastValue
      await runtime.getAnimQueue().animateCallback((progress) => {
        obj.setContrast(startVal + (val - startVal) * progress)
      }, time)
    }
    obj.setContrast(val)
  },
  saturation: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const intensity = (args.length >= 3 && typeof args[2] === 'number')
      ? Math.max(0, Math.min(1, args[2] as number))
      : 1
    obj.intensityValue = intensity
    if (time > 0) {
      const startVal = obj.saturationValue
      await runtime.getAnimQueue().animateCallback((progress) => {
        obj.setSaturation(startVal + (val - startVal) * progress)
      }, time)
    }
    obj.setSaturation(val)
  },
  gamma: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const intensity = (args.length >= 3 && typeof args[2] === 'number')
      ? Math.max(0, Math.min(1, args[2] as number))
      : 1
    obj.intensityValue = intensity
    if (time > 0) {
      const startVal = obj.gammaValue
      await runtime.getAnimQueue().animateCallback((progress) => {
        obj.setGamma(startVal + (val - startVal) * progress)
      }, time)
    }
    obj.setGamma(val)
  },
  rgb: async (obj, args, runtime) => {
    const r = args[0] as number
    const g = args[1] as number
    const b = args[2] as number
    const time = (args.length >= 4 && typeof args[3] === 'number')
      ? (args[3] as number)
      : runtime.getAsyncTime()
    const intensity = (args.length >= 5 && typeof args[4] === 'number')
      ? Math.max(0, Math.min(1, args[4] as number))
      : 1
    obj.intensityValue = intensity
    if (time > 0) {
      const [sr, sg, sb] = obj.rgbValue
      await runtime.getAnimQueue().animateCallback((progress) => {
        obj.setRGB(
          sr + (r - sr) * progress,
          sg + (g - sg) * progress,
          sb + (b - sb) * progress
        )
      }, time)
    }
    obj.setRGB(r, g, b)
  },
  hex: async (obj, args, runtime) => {
    const h = String(args[0] ?? '')
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const intensity = (args.length >= 3 && typeof args[2] === 'number')
      ? Math.max(0, Math.min(1, args[2] as number))
      : 1
    obj.intensityValue = intensity
    if (time > 0) {
      // 解析目标 hex 为 RGB
      const hx = h.replace('#', '')
      const tr = parseInt(hx.substring(0, 2), 16)
      const tg = parseInt(hx.substring(2, 4), 16)
      const tb = parseInt(hx.substring(4, 6), 16)
      if (!isNaN(tr) && !isNaN(tg) && !isNaN(tb)) {
        const [sr, sg, sb] = obj.rgbValue
        await runtime.getAnimQueue().animateCallback((progress) => {
          obj.setRGB(
            sr + (tr - sr) * progress,
            sg + (tg - sg) * progress,
            sb + (tb - sb) * progress
          )
        }, time)
      }
    }
    obj.setHex(h)
  },
  clearFilters: async (obj) => {
    obj.clearFilters()
  },
  // ---- 高级滤镜（需 pixi-filters） ----
  glow: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const intensity = (args.length >= 3 && typeof args[2] === 'number')
      ? Math.max(0, Math.min(1, args[2] as number))
      : 1
    obj.intensityValue = intensity
    if (time > 0) {
      const startVal = obj.glowValue
      await runtime.getAnimQueue().animateCallback((progress) => {
        obj.setGlow(startVal + (val - startVal) * progress)
      }, time)
    }
    obj.setGlow(val)
  },
  dropShadow: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const intensity = (args.length >= 3 && typeof args[2] === 'number')
      ? Math.max(0, Math.min(1, args[2] as number))
      : 1
    obj.intensityValue = intensity
    if (time > 0) {
      const startVal = 0
      await runtime.getAnimQueue().animateCallback((progress) => {
        obj.setDropShadow(startVal + (val - startVal) * progress)
      }, time)
    }
    obj.setDropShadow(val)
  },
  noise: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number')
      ? (args[1] as number)
      : runtime.getAsyncTime()
    const intensity = (args.length >= 3 && typeof args[2] === 'number')
      ? Math.max(0, Math.min(1, args[2] as number))
      : 1
    obj.intensityValue = intensity
    if (time > 0) {
      const startVal = obj.noiseValue
      await runtime.getAnimQueue().animateCallback((progress) => {
        obj.setNoise(startVal + (val - startVal) * progress)
      }, time)
    }
    obj.setNoise(val)
  },

  // ---- 对话 ----
  say: async (obj, args, runtime) => {
    const text = String(args[0] ?? '')
    const speaker = obj.displayName  // 使用显示名称而非 id
    const avator = obj.avatorPath || ''  // 自动装填头像路径
    if (runtime.onDialogue) {
      await runtime.onDialogue(speaker, text, avator)
    } else {
      runtime.getSymbolTable().get('say') // fallback to global say
    }
  }
}

/** 检查值是否为 RuntimeMap */
function isRuntimeMap(val: RuntimeValue): val is RuntimeMap {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && (val as Record<string, unknown>).type === 'map'
}

// Object functions callable from script
const builtinObjectFunctions: Record<string, (obj: SceneObject, args: RuntimeValue[], runtime: Runtime) => Promise<void>> = {
  // Additional builtins can be added here
}

export { builtinMethods, builtinObjectFunctions }
