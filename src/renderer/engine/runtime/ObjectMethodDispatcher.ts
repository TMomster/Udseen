import type { ObjectFunctionDefNode } from '../parser/index'
import type { Runtime, RuntimeValue, AudioObject } from './Runtime'
import type { SceneObject, RuntimeMap } from './SceneObject'
import { FilterObject, isFilterObject } from './FilterObject'
import { SymbolTable } from './SymbolTable'

/**
 * 方法处理函数类型
 */
type MethodHandler = (obj: SceneObject, args: RuntimeValue[], runtime: Runtime) => Promise<void>

/**
 * 预构建的方法注册表
 * O(1) 查找替代原来 callObjectMethod 中 8 步线性遍历
 */
const BUILTIN_METHODS: Record<string, MethodHandler> = {
  // ---- 生命周期 ----
  begin: async (obj, args) => { const visible = args.length >= 1 ? Boolean(args[0]) : true; obj.begin(visible) },
  autobegin: async (obj, args) => { const visible = args.length >= 1 ? Boolean(args[0]) : true; obj.autobegin(visible) },
  end: async (obj) => obj.end(),

  // ---- 动图控制 ----
  loop: async (obj) => { obj.loopAnim() },
  pause: async (obj) => { obj.pauseAnim() },
  stop: async (obj) => { obj.stopAnim() },
  speed: async (obj, args) => { obj.setAnimSpeed(Math.max(0.1, (args[0] as number) ?? 1)) },
  fps: async (obj, args) => { obj.setFPS((args[0] as number) ?? 16) },
  frame: async (obj, args) => { obj.showFrame((args[0] as number) ?? 1) },

  // ---- 移动与变换 ----
  move: async (obj, args, runtime) => {
    const dx = (args[0] as number) ?? 0; const dy = (args[1] as number) ?? 0
    const duration = (args.length >= 3 && typeof args[2] === 'number') ? (args[2] as number) : runtime.getAsyncTime()
    const sw = 960 + obj.x + dx; const sh = 540 - (obj.y + dy)
    if (duration > 0 && obj.sprite) await runtime.getAnimQueue().moveTo(obj.sprite, sw, sh, duration)
    else if (obj.sprite) { obj.sprite.x = sw; obj.sprite.y = sh }
    obj.x += dx; obj.y += dy
  },
  setPos: async (obj, args, runtime) => {
    let targetX: number, targetY: number, duration = 0
    if (args.length >= 1 && isRuntimeMap(args[0])) {
      const pos = args[0] as RuntimeMap
      targetX = (pos.entries.posX as number) ?? obj.x; targetY = (pos.entries.posY as number) ?? obj.y
      duration = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    } else {
      targetX = (args[0] as number) ?? obj.x; targetY = (args[1] as number) ?? obj.y
      duration = (args.length >= 3 && typeof args[2] === 'number') ? (args[2] as number) : runtime.getAsyncTime()
    }
    const sx = 960 + targetX; const sy = 540 - targetY
    if (duration > 0 && obj.sprite) await runtime.getAnimQueue().moveTo(obj.sprite, sx, sy, duration)
    else if (obj.sprite) { obj.sprite.x = sx; obj.sprite.y = sy }
    obj.x = targetX; obj.y = targetY
  },
  moveToX: async (obj, args, runtime) => {
    const x = args[0] as number; const dur = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : (runtime.getAsyncTime() || 1000)
    await runtime.getAnimQueue().animate(obj.sprite!, { x: 960 + x }, dur); obj.x = x
  },
  moveToY: async (obj, args, runtime) => {
    const y = args[0] as number; const dur = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : (runtime.getAsyncTime() || 1000)
    await runtime.getAnimQueue().animate(obj.sprite!, { y: 540 - y }, dur); obj.y = y
  },
  rotate: async (obj, args, runtime) => {
    const angle = args[0] as number; const dur = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    const rad = angle * (Math.PI / 180)
    if (dur > 0 && obj.sprite) await runtime.getAnimQueue().rotateTo(obj.sprite!, rad, dur)
    else if (obj.sprite) obj.sprite.rotation = rad
    obj.rotation = rad
  },
  rotateTo: async (obj, args, runtime) => {
    const angle = args[0] as number; const dur = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    const targetDeg = obj.rotation * (180 / Math.PI) + angle; const rad = targetDeg * (Math.PI / 180)
    if (dur > 0 && obj.sprite) await runtime.getAnimQueue().rotateTo(obj.sprite!, rad, dur)
    else if (obj.sprite) obj.sprite.rotation = rad
    obj.rotation = rad
  },
  scale: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    if (time > 0 && obj.sprite) await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: val, y: val }, time)
    obj.setScale(val)
  },
  scaleTo: async (obj, args, runtime) => {
    const m = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    const tv = obj.scaleX * m
    if (time > 0 && obj.sprite) await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: tv, y: tv }, time)
    obj.setScale(tv)
  },
  scaleX: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    if (time > 0 && obj.sprite) await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: val }, time)
    obj.setScaleX(val)
  },
  scaleY: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    if (time > 0 && obj.sprite) await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { y: val }, time)
    obj.setScaleY(val)
  },
  scaleXTo: async (obj, args, runtime) => {
    const m = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    const tv = obj.scaleX * m
    if (time > 0 && obj.sprite) await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: tv }, time)
    obj.setScaleX(tv)
  },
  scaleYTo: async (obj, args, runtime) => {
    const m = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    const tv = obj.scaleY * m
    if (time > 0 && obj.sprite) await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { y: tv }, time)
    obj.setScaleY(tv)
  },
  alpha: async (obj, args, runtime) => {
    const val = Math.max(0, Math.min(1, args[0] as number)); const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    if (time > 0 && obj.sprite) await runtime.getAnimQueue().animateProperty(obj.sprite, { alpha: val }, time)
    obj.setAlpha(val)
  },
  index: async (obj, args) => { obj.setIndex(args[0] as number) },
  setAlpha: async (obj, args, runtime) => {
    const val = Math.max(0, Math.min(1, args[0] as number)); const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    if (time > 0 && obj.sprite) await runtime.getAnimQueue().animateProperty(obj.sprite, { alpha: val }, time)
    obj.setAlpha(val)
  },
  setScale: async (obj, args, runtime) => {
    if (args.length >= 2 && typeof args[0] === 'number' && typeof args[1] === 'number') {
      const sx = args[0] as number; const sy = args[1] as number
      const time = (args.length >= 3 && typeof args[2] === 'number') ? (args[2] as number) : runtime.getAsyncTime()
      if (time > 0 && obj.sprite) await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: sx, y: sy }, time)
      obj.setScaleXY(sx, sy)
    } else {
      const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
      if (time > 0 && obj.sprite) await runtime.getAnimQueue().animateProperty(obj.sprite.scale, { x: val, y: val }, time)
      obj.setScale(val)
    }
  },
  setTint: async (obj, args) => { obj.setTint(args[0] as number) },

  // ---- 滤镜 ----
  blur: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    const intensity = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    obj.intensityValue = intensity
    if (time > 0) { obj.setBlur(obj.blurValue); await runtime.getAnimQueue().animateProperty(obj.blurFilter!, { blur: Math.max(0, val * 10) * intensity }, time) }
    obj.setBlur(val)
  },
  brightness: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { const sv = obj.brightnessValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setBrightness(sv + (val - sv) * p) }, time) }
    obj.setBrightness(val)
  },
  contrast: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { const sv = obj.contrastValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setContrast(sv + (val - sv) * p) }, time) }
    obj.setContrast(val)
  },
  saturation: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { const sv = obj.saturationValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setSaturation(sv + (val - sv) * p) }, time) }
    obj.setSaturation(val)
  },
  gamma: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { const sv = obj.gammaValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setGamma(sv + (val - sv) * p) }, time) }
    obj.setGamma(val)
  },
  rgb: async (obj, args, runtime) => {
    const r = args[0] as number; const g = args[1] as number; const b = args[2] as number
    const time = (args.length >= 4 && typeof args[3] === 'number') ? (args[3] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 5 && typeof args[4] === 'number') ? Math.max(0, Math.min(1, args[4] as number)) : 1
    if (time > 0) { const [sr, sg, sb] = obj.rgbValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setRGB(sr + (r - sr) * p, sg + (g - sg) * p, sb + (b - sb) * p) }, time) }
    obj.setRGB(r, g, b)
  },
  hex: async (obj, args, runtime) => {
    const h = String(args[0] ?? ''); const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { const hx = h.replace('#', ''); const tr = parseInt(hx.substring(0, 2), 16); const tg = parseInt(hx.substring(2, 4), 16); const tb = parseInt(hx.substring(4, 6), 16)
      if (!isNaN(tr) && !isNaN(tg) && !isNaN(tb)) { const [sr, sg, sb] = obj.rgbValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setRGB(sr + (tr - sr) * p, sg + (tg - sg) * p, sb + (tb - sb) * p) }, time) } }
    obj.setHex(h)
  },
  clearFilters: async (obj) => { obj.clearFilters() },

  // ---- 高级滤镜 ----
  glow: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { const sv = obj.glowValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setGlow(sv + (val - sv) * p) }, time) }
    obj.setGlow(val)
  },
  dropShadow: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { await runtime.getAnimQueue().animateCallback((p) => { obj.setDropShadow(val * p) }, time) }
    obj.setDropShadow(val)
  },
  noise: async (obj, args, runtime) => {
    const val = args[0] as number; const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { const sv = obj.noiseValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setNoise(sv + (val - sv) * p) }, time) }
    obj.setNoise(val)
  },

  // ---- 可见性（替换旧 hide） ----
  visible: async (obj, args, runtime) => {
    const able = Boolean(args[0])
    const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : 0
    await obj.visible(able, time > 0 ? time : undefined)
  },

  // ---- 文本属性（Text 类型） ----
  size: async (obj, args) => { obj.setFontSize((args[0] as number) ?? 32) },
  px: async (obj, args) => { obj.setFontSize((args[0] as number) ?? 32) },
  bold: async (obj, args) => { obj.setFontBold(args.length < 1 ? true : Boolean(args[0])) },
  italic: async (obj, args) => { obj.setFontItalic(args.length < 1 ? true : Boolean(args[0])) },
  uline: async (obj, args) => { obj.setFontUnderline(args.length < 1 ? true : Boolean(args[0])) },
  deline: async (obj, args) => { obj.setFontStrikethrough(args.length < 1 ? true : Boolean(args[0])) },

  // ---- 新增滤镜 ----
  bw: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { const sv = obj.bwValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setBW(sv + (val - sv) * p) }, time) }
    obj.setBW(val)
  },
  distort: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { const sv = obj.distortValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setDistort(sv + (val - sv) * p) }, time) }
    obj.setDistort(val)
  },
  psychedelic: async (obj, args, runtime) => {
    const val = args[0] as number
    const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
    obj.intensityValue = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : 1
    if (time > 0) { const sv = obj.psychedelicValue; await runtime.getAnimQueue().animateCallback((p) => { obj.setPsychedelic(sv + (val - sv) * p) }, time) }
    obj.setPsychedelic(val)
  },

  // ---- 对话 ----
  say: async (obj, args, runtime) => {
    const text = String(args[0] ?? '')
    const audioPath = args[1] ? String(args[1]) : undefined
    const speaker = obj.displayName
    const avator = obj.avatorPath || ''
    const audioDuration = await runtime.playDialogueAudio(audioPath)
    if (runtime.onDialogue) {
      await runtime.onDialogue(speaker, text, avator, audioDuration)
    }
  }
}

/**
 * 对象方法调度器
 * 提供 O(1) 方法表查找，替代原来 callObjectMethod 中 8 步线性遍历
 * 负责内置方法、用户定义对象函数、别名的统一分发
 */
export class ObjectMethodDispatcher {
  private methodTable: Map<string, MethodHandler>

  constructor() {
    this.methodTable = new Map(Object.entries(BUILTIN_METHODS)) as Map<string, MethodHandler>
  }

  /**
   * 共享的对象方法调用调度
   * O(1) 查找内置方法，再依次检查 FilterObject、AudioObject、用户定义函数、别名
   */
  async callObjectMethod(
    objValue: RuntimeValue,
    methodName: string,
    args: RuntimeValue[],
    runtime: Runtime,
    scope: import('./Runtime').SymbolTable
  ): Promise<void> {
    // Handle FilterObject
    if (isFilterObject(objValue)) {
      return this.callFilterMethod(objValue, methodName, args, runtime)
    }

    // Handle AudioObject
    if (isAudioObject(objValue)) {
      return runtime.getAudioManager().callAudioMethod(
        objValue,
        methodName,
        args,
        {
          lastExecutionLine: runtime.getLastExecutionLine(),
          onError: runtime.onError,
          onExecutionError: runtime.onExecutionError,
          onWarning: runtime.onWarning,
          resolveAssetPath: (raw, factory) => runtime.getAssetResolver().resolveAssetPath(raw, factory)
        }
      )
    }

    // Find the target SceneObject
    let targetObj: SceneObject | undefined
    if (isSceneObjectValue(objValue)) {
      targetObj = objValue
    } else if (typeof objValue === 'string') {
      targetObj = runtime.getSceneObject(objValue)
    }

    if (!targetObj) {
      const valType = objValue === null ? 'null' : typeof objValue
      throw new Error(`无法调用方法 '${methodName}'：'obj' (${valType}) 不是场景对象`)
    }

    // O(1) 查找内置方法
    const handler = this.methodTable.get(methodName)
    if (handler) {
      await handler(targetObj, args, runtime)
      return
    }

    // Check type-specific user-defined ObjectFunction
    if (targetObj.objectType) {
      const typeKey = `${targetObj.objectType}::${methodName}`
      const typeObjFuncDef = runtime.getObjectFunction(typeKey)
      if (typeObjFuncDef) {
        await this.callObjectFunction(typeObjFuncDef, targetObj, args, scope)
        return
      }
    }

    // Check if method is a user-defined ObjectFunction (generic)
    const objFuncDef = runtime.getObjectFunction(methodName)
    if (objFuncDef) {
      await this.callObjectFunction(objFuncDef, targetObj, args, scope)
      return
    }

    // Check method aliases
    if (targetObj.objectType) {
      const aliasKey = `${targetObj.objectType}::${methodName}`
      const aliasMethod = runtime.getMethodAlias(aliasKey)
      if (aliasMethod) {
        const originalMethodName = aliasMethod.split('::').pop()!
        return this.callObjectMethod(objValue, originalMethodName, args, runtime, scope)
      }
    }

    // Also check generic ObjectType::methodName alias
    const genericAliasKey = `ObjectType::${methodName}`
    const genericAliasMethod = runtime.getMethodAlias(genericAliasKey)
    if (genericAliasMethod) {
      const originalMethodName = genericAliasMethod.split('::').pop()!
      return this.callObjectMethod(objValue, originalMethodName, args, runtime, scope)
    }

    // Direct alias
    const directAlias = runtime.getMethodAlias(methodName)
    if (directAlias) {
      const parts = directAlias.split('::')
      if (parts.length > 1) {
        const originalMethodName = parts.pop()!
        return this.callObjectMethod(objValue, originalMethodName, args, runtime, scope)
      }
    }

    throw new Error(`未知方法 '${methodName}'`)
  }

  async callFilterMethod(filterObj: FilterObject, methodName: string, args: RuntimeValue[], runtime: Runtime): Promise<void> {
    const uniformAnimate = async (
      setter: (val: number, intensity?: number) => void,
      getter: () => number,
      val: number
    ): Promise<void> => {
      const time = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
      const intensity = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : undefined
      if (time > 0) {
        const sv = getter()
        await runtime.getAnimQueue().animateCallback((p) => { setter(sv + (val - sv) * p, intensity) }, time)
      }
      setter(val, intensity)
    }

    switch (methodName) {
      case 'begin': filterObj.begin(); break
      case 'end': filterObj.end(); break
      case 'hex': {
        const hColor = String(args[0] ?? '')
        const hTime = (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : runtime.getAsyncTime()
        const hIntensity = (args.length >= 3 && typeof args[2] === 'number') ? Math.max(0, Math.min(1, args[2] as number)) : undefined

        if (hTime > 0) {
          const hx = hColor.replace('#', '')
          const tr = parseInt(hx.substring(0, 2), 16)
          const tg = parseInt(hx.substring(2, 4), 16)
          const tb = parseInt(hx.substring(4, 6), 16)
          if (!isNaN(tr) && !isNaN(tg) && !isNaN(tb)) {
            const [sr, sg, sb] = filterObj.rgbValue
            await runtime.getAnimQueue().animateCallback((p) => {
              filterObj.rgb(sr + (tr - sr) * p, sg + (tg - sg) * p, sb + (tb - sb) * p, undefined, hIntensity)
            }, hTime)
          }
        }
        filterObj.hex(hColor, undefined, hIntensity)
        break
      }
      case 'rgb': {
        const rv = (args[0] as number) ?? 0
        const gv = (args[1] as number) ?? 0
        const bv = (args[2] as number) ?? 0
        const rgbTime = (args.length >= 4 && typeof args[3] === 'number') ? (args[3] as number) : runtime.getAsyncTime()
        const rgbIntensity = (args.length >= 5 && typeof args[4] === 'number') ? Math.max(0, Math.min(1, args[4] as number)) : undefined
        if (rgbTime > 0) {
          const [sr, sg, sb] = filterObj.rgbValue
          await runtime.getAnimQueue().animateCallback((p) => {
            filterObj.rgb(sr + (rv - sr) * p, sg + (gv - sg) * p, sb + (bv - sb) * p, undefined, rgbIntensity)
          }, rgbTime)
        }
        filterObj.rgb(rv, gv, bv, undefined, rgbIntensity)
        break
      }
      case 'blur': await uniformAnimate((v) => filterObj.blur(v), () => filterObj.blurValue, (args[0] as number) ?? 0); break
      case 'brightness': await uniformAnimate((v) => filterObj.brightness(v), () => filterObj.brightnessValue, (args[0] as number) ?? 1); break
      case 'contrast': await uniformAnimate((v) => filterObj.contrast(v), () => filterObj.contrastValue, (args[0] as number) ?? 1); break
      case 'saturation': await uniformAnimate((v) => filterObj.saturation(v), () => filterObj.saturationValue, (args[0] as number) ?? 1); break
      case 'gamma': await uniformAnimate((v) => filterObj.gamma(v), () => filterObj.gammaValue, (args[0] as number) ?? 1); break
      case 'bw': await uniformAnimate((v) => filterObj.bw(v), () => filterObj.bwValue, (args[0] as number) ?? 0); break
      case 'distort': await uniformAnimate((v) => filterObj.distort(v), () => filterObj.distortValue, (args[0] as number) ?? 0); break
      case 'psychedelic': await uniformAnimate((v) => filterObj.psychedelic(v), () => filterObj.psychedelicValue, (args[0] as number) ?? 0); break
      case 'intensity':
        filterObj.intensity((args[0] as number) ?? 1, (args.length >= 2 && typeof args[1] === 'number') ? (args[1] as number) : undefined)
        break
      default:
        throw new Error(`滤镜对象不支持方法 '${methodName}'`)
    }
  }

  async callObjectFunction(
    def: ObjectFunctionDefNode,
    obj: SceneObject,
    args: RuntimeValue[],
    _scope: import('./Runtime').SymbolTable
  ): Promise<void> {
    // 委托给 Runtime.executeObjectFunctionBlock 统一处理参数绑定和执行
    await runtime.executeObjectFunctionBlock(def, obj, args, _scope)
  }
}

// ---- 辅助函数 ----

function isAudioObject(val: RuntimeValue): val is AudioObject {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && (val as Record<string, unknown>).type === 'audio'
}

function isSceneObjectValue(val: RuntimeValue): val is SceneObject {
  return typeof val === 'object' && val !== null && (val as Record<string, unknown>)._isSceneObject === true
}

function isRuntimeMap(val: RuntimeValue): val is RuntimeMap {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && (val as Record<string, unknown>).type === 'map'
}

export { BUILTIN_METHODS }
