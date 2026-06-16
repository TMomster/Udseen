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
import { FilterObject } from './FilterObject'
import { AnimationQueue } from './AnimationQueue'
import { registerBuiltins, showChoice } from './builtins'
import { SymbolTable } from './SymbolTable'
import { AudioManager, type AudioCallContext } from './AudioManager'
import { AssetResolver } from './AssetResolver'
import { ObjectMethodDispatcher } from './ObjectMethodDispatcher'
import * as PIXI from 'pixi.js'



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
  /** 脚本中的变量名（标识符），如 bgm9 */
  scriptId: string
  /** 显示名称（由 set 的第二个参数传入） */
  displayName: string
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
 * Runtime - 全局解释器（精简为调度器角色）
 *
 * 第三期重构拆分：
 * - AudioManager: 音频生命周期管理
 * - AssetResolver: 资源路径解析
 * - ObjectMethodDispatcher: 方法分发表（O(1) 查找）
 * - SymbolTable: 独立符号表类
 */
export class Runtime {
  /** 组合的新模块 */
  readonly audioManager = new AudioManager()
  readonly assetResolver = new AssetResolver()
  readonly methodDispatcher = new ObjectMethodDispatcher()
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
  onDialogue?: (speaker: string | null, text: string, avator?: string, audioDurationMs?: number, audioPath?: string) => Promise<void>
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
  /** 跳过模式：按住 Ctrl 时启用，忽略等待快速执行 */
  skipMode: boolean = false
  /** speech 禁用模式：speech(0) 后启用，后续 say 不显示对话框，直到 speech(1) 恢复 */
  speechDisabled: boolean = false

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

    // 注册工厂对象
    this.symbolTable.declare('Character', { type: 'factory', name: 'Character' })
    this.symbolTable.declare('Background', { type: 'factory', name: 'Background' })
    this.symbolTable.declare('Audio', { type: 'factory', name: 'Audio' })
    this.symbolTable.declare('Filter', { type: 'factory', name: 'Filter' })
    this.symbolTable.declare('Text', { type: 'factory', name: 'Text' })
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

  getObjectFunction(key: string): ObjectFunctionDefNode | undefined {
    return this.objectFunctions.get(key)
  }

  getMethodAlias(key: string): string | undefined {
    return this.methodAliases.get(key)
  }

  getLastExecutionLine(): number {
    return this.lastExecutionLine
  }

  getAudioManager(): AudioManager {
    return this.audioManager
  }

  getAssetResolver(): AssetResolver {
    return this.assetResolver
  }

  registerObjectFunction(name: string, def: ObjectFunctionDefNode): void {
    this.objectFunctions.set(name, def)
  }

  /**
   * 执行对象函数体（由 ObjectMethodDispatcher.callObjectFunction 委托调用）
   */
  async executeObjectFunctionBlock(
    def: ObjectFunctionDefNode,
    obj: SceneObject,
    args: RuntimeValue[],
    scope: SymbolTable
  ): Promise<void> {
    const funcScope = new SymbolTable()
    let argIdx = 0
    for (let i = 0; i < def.params.length; i++) {
      if (def.params[i] === 'obj') continue
      const autoZero = def.autoZeroParams && def.autoZeroParams[i]
      funcScope.declare(def.params[i], args[argIdx] ?? (autoZero ? 0 : null))
      argIdx++
    }
    funcScope.declare('obj', obj)
    await this.executeBlock(def.block, funcScope)
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
        try {
          this.releaseAllResources()
        } catch (err) {
          console.error('[Runtime] releaseAllResources 失败（强制复位状态）:', err)
        }
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
    try {
      this.releaseAllResources()
    } catch (err) {
      console.error('[Runtime] stop 中 releaseAllResources 失败（强制复位状态）:', err)
    }
    this.running = false
    this.onStateChange?.(false)
  }

  /**
   * 释放所有运行时资源：GSAP 动画、音频、场景对象、舞台、UI 组件、符号表
   * 此方法幂等（可安全重复调用），被 stop()、execute() finally、destroy() 共同使用
   */
  private releaseAllResources(): void {
    try {
      // 1. 取消所有 GSAP 动画并放行挂起的 Promise（防止旧执行链永久挂起）
      this.animQueue.cancelAll()
      // 完全替换为新的 AnimationQueue 实例，确保零共享状态
      // 旧 AnimationQueue 成为孤儿，旧执行链即便放行后也不会影响新队列
      this.animQueue = new AnimationQueue()

      // 2. 清理所有音频（通过 AudioManager 释放 Howl 音频缓冲 + 取消 rAF）
      try { this.audioManager.cleanupAllAudio(this.audioObjects) } catch (e) { console.warn('[Runtime] cleanupAllAudio error:', e) }
      try { this.audioManager.cancelAnimFrameIds() } catch (e) { console.warn('[Runtime] cancelAnimFrameIds error:', e) }

      // 3. 销毁所有 SceneObject（释放 sprite 纹理 + GPU 滤镜资源）
      const objs = Array.from(this.sceneObjects.values())
      objs.forEach((obj) => {
        try { obj.end() } catch (e) { console.warn('[Runtime] obj.end error:', e) }
      })
      this.sceneObjects.clear()

      // 3.5 移除并销毁所有 FilterObject（从 sceneContainer.filters 移除 + 销毁 GPU 滤镜资源）
      const filters = Array.from(this.filterObjects.values())
      filters.forEach((f) => {
        try { f.end() } catch (e) { console.warn('[Runtime] filter.end error:', e) }
      })
      this.filterObjects.clear()
      // 确保场景容器无残留滤镜
      try { this.sceneContainer.filters = null } catch { /* ignore */ }

      // 3.6 放行挂起的 pause() 点击 resolve
      try {
        this.userClickResolve?.()
        this.userClickResolve = null
      } catch { /* ignore */ }

      // 4. 强制清空场景容器所有子节点（兜底清除残留精灵/容器）
      try { this.sceneContainer.removeChildren() } catch { /* ignore */ }

      // 5. 重置 UI（隐藏对话框和选项面板——如果脚本中断时它们还可见）
      try { this.onResetUI?.() } catch { /* ignore */ }
    } catch (err) {
      console.error('[Runtime] releaseAllResources 发生未预期异常:', err)
    }

    // === 以下操作在 try 之外执行，确保状态一定能复位 ===

    // 6. 重置符号表（重建内置函数和工厂对象，清除用户变量/绑定）
    try { this.initSymbolTable() } catch { /* ignore */ }

    // 7. 清除 async_time 栈（防止旧执行链的栈残留影响新执行）
    this.asyncTimeStack = []

    // 8. 清除用户定义的对象函数和类型别名
    this.objectFunctions.clear()
    this.typeAliases.clear()
    this.typeAliasReverse.clear()
    this.methodAliases.clear()

    // 9. 重置运行时状态标记（防止旧执行残留影响新执行）
    this.speechDisabled = false
    this.skipMode = false
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

  /** 获取当前活跃资源信息（用于调试面板），返回脚本中的变量名（标识符） */
  getResourceInfo(): { sceneObjects: string[]; audioObjects: string[]; filterObjects: string[] } {
    return {
      sceneObjects: Array.from(this.sceneObjects.values()).map(obj => obj.scriptId || obj.displayName || obj.id),
      audioObjects: Array.from(this.audioObjects.values()).map(obj => obj.scriptId || obj.displayName || obj.id),
      filterObjects: Array.from(this.filterObjects.keys()),
    }
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
    if (this.skipMode) {
      // 跳过模式：不等待，直接执行
      return await this.executeStatement(stmt.statement, scope)
    }
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
    // 如果值是 SceneObject/AudioObject，标记其脚本标识符
    if (isSceneObjectValue(value)) {
      value.scriptId = stmt.name
    } else if (isAudioObject(value)) {
      value.scriptId = stmt.name
    }
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
      // 如果值是 SceneObject/AudioObject，标记其脚本标识符
      if (isSceneObjectValue(value)) {
        value.scriptId = stmt.name
      } else if (isAudioObject(value)) {
        value.scriptId = stmt.name
      }
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
      const objId = this.assetResolver.resolveObjectId(objExpr)
      const factoryName = this.assetResolver.resolveFactoryName(objExpr, this)

      // Resolve asset path
      const rawPath = args[0] as string
      const resolvedPath = await this.assetResolver.resolveAssetPath(rawPath, factoryName)

      // Extract display name (second arg to set: set(path, name))
      const displayName = args.length >= 2 && typeof args[1] === 'string'
        ? (args[1] as string)
        : factoryName ?? 'SceneObject'

      // Audio factory creates audio objects
      if (factoryName === 'Audio') {
        const audioObj: AudioObject = {
          type: 'audio',
          id: objId,
          scriptId: objId,
          displayName,
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
        // Audio.set 时做格式预检（仅警告，不阻止创建）
        if (!this.audioManager.isAudioFormatSupported(resolvedPath)) {
          this.onWarning?.(`不支持的音频格式: ${resolvedPath}（支持的格式: mp3, ogg, opus, wav, aac, m4a, flac, webm）`)
        }
        return
      }

      // Text factory: set(text) 创建文本对象
      if (factoryName === 'Text') {
        const textObjId = this.assetResolver.generateObjectId()
        const textContent = String(args[0] ?? '')
        const sceneObj = new SceneObject(textObjId, this.app, this.sceneContainer)
        sceneObj.objectType = 'Text'
        sceneObj.scriptId = textObjId
        sceneObj.displayName = displayName
        sceneObj.setText(textContent)
        sceneObj.zIndex = 999
        this.registerSceneObject(textObjId, sceneObj)
        scope.declare(textObjId, sceneObj)
        this.log(`定义文本 ${textObjId}: "${textContent}"`)
        return
      }

      // Create a SceneObject
      const sceneObj = new SceneObject(objId, this.app, this.sceneContainer)
      if (factoryName) sceneObj.objectType = factoryName
      sceneObj.scriptId = objId
      sceneObj.displayName = displayName

      // Extract avator (third arg to set: set(path, name, avator))
      if (args.length >= 3 && typeof args[2] === 'string') {
        const avatorPath = args[2] as string
        if (avatorPath && factoryName === 'Character') {
          const resolvedAvatorPath = await this.assetResolver.resolveAssetPath(avatorPath, factoryName)
          sceneObj.avatorPath = resolvedAvatorPath
        }
      }

      await sceneObj.set(resolvedPath)

      // 异步验证头像路径
      if (sceneObj.avatorPath) {
        this.assetResolver.validateAvatorPath(sceneObj, displayName, this.onWarning)
      }

      this.registerSceneObject(objId, sceneObj)
      scope.declare(objId, sceneObj)
      return
    }

    // Factory non-set method calls are not supported; only .set() is available
    if (isFactory(objValue)) {
      throw new Error(`工厂 '${objValue.name}' 没有方法 '${methodName}'`)
    }

    // Delegate to ObjectMethodDispatcher (O(1) method table lookup)
    await this.methodDispatcher.callObjectMethod(objValue, methodName, args, this, scope)
  }





  /**
   * 播放对话音频 - 对话框出现时自动播放一次，终止上一个对话音频，播放完成后自动销毁
   * @param audioPath 相对于 audio 目录的文件路径，如 "effect/click.mp3"
   * @returns 音频时长（毫秒），无音频时返回 0
   */
  playDialogueAudio(audioPath: string | undefined): Promise<number> {
    return this.audioManager.playDialogueAudio(audioPath, {
      lastExecutionLine: this.lastExecutionLine,
      onError: this.onError,
      onExecutionError: this.onExecutionError,
      onWarning: this.onWarning,
      resolveAssetPath: async (raw, factory) => this.assetResolver.resolveAssetPath(raw, factory)
    })
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
            const filterObj = new FilterObject(this.assetResolver.generateObjectId(), this.app, this.sceneContainer)
            this.registerFilterObject(filterObj.id, filterObj)
            // evaluate 路径不覆盖工厂名，由赋值语句负责将返回值存入变量
            this.log(`定义滤镜 ${filterObj.id}`)
            return filterObj
          }

          // Text factory: set(text) 创建文本对象
          if (factoryName === 'Text') {
            const textObjId = this.assetResolver.generateObjectId()
            const textContent = String(args[0] ?? '')
            const sceneObj = new SceneObject(textObjId, this.app, this.sceneContainer)
            sceneObj.objectType = 'Text'
            sceneObj.scriptId = textObjId
            sceneObj.displayName = displayName
            sceneObj.setText(textContent)
            sceneObj.zIndex = 999
            this.registerSceneObject(textObjId, sceneObj)
            scope.declare(textObjId, sceneObj)
            this.log(`定义文本 ${textObjId}: "${textContent}"`)
            return
          }

          if (typeof args[0] !== 'string') throw new Error('set() 需要一个路径参数')
          const objId = this.assetResolver.generateObjectId()

          // Resolve asset path
          const rawPath = args[0] as string
          const resolvedPath = await this.assetResolver.resolveAssetPath(rawPath, factoryName)

          // Extract display name (second arg to set: set(path, name))
          const displayName = args.length >= 2 && typeof args[1] === 'string'
            ? (args[1] as string)
            : factoryName

          // Audio factory
          if (factoryName === 'Audio') {
            const audioObj: AudioObject = {
              type: 'audio',
              id: objId,
              scriptId: '',
              displayName,
              filePath: resolvedPath,
              howl: null,
              looping: false,
              volume: 1,
              paused: false,
              playbackRate: 1
            }
            this.registerAudioObject(objId, audioObj)
            // 格式预检（仅警告，不阻止创建）
            if (!this.audioManager.isAudioFormatSupported(resolvedPath)) {
              this.onWarning?.(`不支持的音频格式: ${resolvedPath}（支持的格式: mp3, ogg, opus, wav, aac, m4a, flac, webm）`)
            }
            this.log(`定义音频 ${objId} (${resolvedPath})`)
            return audioObj
          }

          const sceneObj = new SceneObject(objId, this.app, this.sceneContainer)
          sceneObj.objectType = factoryName
          sceneObj.scriptId = ''
          sceneObj.displayName = displayName

          // Extract avator (third arg to set: set(path, name, avator))
          if (args.length >= 3 && typeof args[2] === 'string') {
            const avatorPath = args[2] as string
            if (avatorPath && factoryName === 'Character') {
              const resolvedAvatorPath = await this.assetResolver.resolveAssetPath(avatorPath, factoryName)
              sceneObj.avatorPath = resolvedAvatorPath
            }
          }

          await sceneObj.set(resolvedPath)

          // 异步验证头像路径
          if (sceneObj.avatorPath) {
            this.assetResolver.validateAvatorPath(sceneObj, displayName, this.onWarning)
          }

          this.registerSceneObject(objId, sceneObj)
          return sceneObj
        }

        // Factory non-set method calls are not supported in expressions
        if (isFactory(objValue)) {
          throw new Error(`工厂 '${objValue.name}' 没有方法 '${mc.method}'`)
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
        // 返回 objValue 以支持链式调用：obj.a().b()
        await this.methodDispatcher.callObjectMethod(objValue, mc.method, args, this, s)
        return objValue
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

    // 禁止 bool 参与数值运算
    if (typeof left === 'boolean' || typeof right === 'boolean') {
      if (expr.op !== '==' && expr.op !== '!=' && expr.op !== '&&' && expr.op !== '||') {
        throw new Error('类型错误: 布尔值不能参与数值运算（小类型不能转换为大类型）')
      }
    }

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
      case '-':
        if (typeof val === 'boolean') throw new Error('类型错误: 布尔值不能参与数值运算（小类型不能转换为大类型）')
        return -(val as number)
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

/** 检查值是否为 RuntimeMap */
function isRuntimeMap(val: RuntimeValue): val is RuntimeMap {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && (val as Record<string, unknown>).type === 'map'
}
