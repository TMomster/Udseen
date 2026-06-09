import type { Runtime, RuntimeValue } from './Runtime'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BuiltinFunction = (...args: RuntimeValue[]) => RuntimeValue
export type BuiltinObjectFunction = string

/**
 * 向运行时注册所有内置函数
 */
export function registerBuiltins(runtime: Runtime): void {
  const sym = runtime.getSymbolTable()
  const animQueue = runtime.getAnimQueue()

  // Math builtins
  sym.declare('Math', {
    random: () => Math.random(),
    floor: (x: number) => Math.floor(x),
    ceil: (x: number) => Math.ceil(x),
    round: (x: number) => Math.round(x),
    abs: (x: number) => Math.abs(x),
    min: (...args: number[]) => Math.min(...args),
    max: (...args: number[]) => Math.max(...args),
    sin: (x: number) => Math.sin(x),
    cos: (x: number) => Math.cos(x),
    PI: Math.PI
  } as unknown as RuntimeValue)

  // Global say function (narration)
  sym.declare('say', (async (text: string) => {
    runtime.onLog?.('[say] 调用 onDialogue')
    if (!runtime.onDialogue) {
      runtime.onLog?.('[say] 错误: onDialogue 回调未注册')
      return
    }
    await runtime.onDialogue(null, String(text))
  }) as unknown as RuntimeValue)

  // parallel and sequence as callable functions
  sym.declare('parallel', (async (...animations: (() => Promise<void>)[]) => {
    await animQueue.parallel(animations.map((fn) => fn()))
  }) as unknown as RuntimeValue)

  sym.declare('sequence', (async (...animations: (() => Promise<void>)[]) => {
    await animQueue.sequence(animations)
  }) as unknown as RuntimeValue)

  // pause - 暂停执行，任意位置点击继续
  sym.declare('pause', (async () => {
    runtime.onLog?.('[pause] 等待用户点击...')
    await runtime.waitForUserClick()
    runtime.onLog?.('[pause] 用户点击，继续执行')
  }) as unknown as RuntimeValue)

  // speech - 控制对话框显隐
  // speech(0) 隐藏对话框，speech(1) 在隐藏时重新显示
  sym.declare('speech', ((visible: number) => {
    runtime.onSpeechVisibility?.(visible !== 0)
  }) as unknown as RuntimeValue)
}

/**
 * 暂停脚本执行并显示选择项
 * 通过 runtime.onChoice 回调实现
 */
export function showChoice(
  runtime: Runtime,
  choices: { text: string; action: () => void | Promise<void> }[]
): Promise<void> {
  return new Promise((resolve) => {
    runtime.onChoice?.(
      choices.map((c) => ({
        ...c,
        action: async () => {
          await c.action()
          resolve()
        }
      }))
    )
  })
}
