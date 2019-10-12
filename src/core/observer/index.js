/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving(value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any
  dep: Dep
  vmCount: number // number of vms that have this object as root $data

  constructor(value: any) {
    this.value = value
    this.dep = new Dep() // ! 实例一个订阅器
    this.vmCount = 0
    def(value, '__ob__', this) // ! 自身实例添加到数据对象 value 的 __ob__ 属性上 (__ob__监听对象标识)
    // ! 监听数组时
    if (Array.isArray(value)) {
      // ! 判断当前环境的对象中是否有 __proto__ 属性 （是否支持使用 __proto__）
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value) // ! 再次监听数组，监听一些嵌套的数组
    } else {
      this.walk(value) // ! 监听对象
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk(obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray(items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 * ! 监听方法
 */
export function observe(value: any, asRootData: ?boolean): Observer | void {
  // ! 非虚拟节点的对象
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void

  // ! 已经是监听对象了，不需要重复监听，直接获取 __ob__ 属性
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) && // ! 对象可扩展，没有被 freeze
    !value._isVue // ! 不是 Vue 实例
  ) {
    ob = new Observer(value) // ! 实例化一个监听对象
  }

  // ! 对象是根实例数据对象时， vmCount++
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 * ! 定义响应式的函数
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep() // ! 实例化一个订阅器

  const property = Object.getOwnPropertyDescriptor(obj, key) // ! 获取对象的属性描述符
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // ! 缓存对象原来的 getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  let childOb = !shallow && observe(val) // ! 当 val 不为 undefined 时深度监听
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val // ! 获取值
      if (Dep.target) {
        dep.depend() // ! 添加进订阅器，依赖收集
        if (childOb) {
          childOb.dep.depend() // ! 依赖收集
          if (Array.isArray(value)) {
            dependArray(value) // ! 数组手动收集依赖
          }
        }
      }
      return value // ! 返回值
    },
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val // ! 获取值 (旧值)
      /* eslint-disable no-self-compare */
      // !                    NaN === NaN false
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal) // ! 执行原来的 setter, 设置新值
      } else {
        val = newVal // ! 设置新值
      }
      childOb = !shallow && observe(newVal) // ! 深度监听新值（对象或者数组）
      dep.notify() // ! 通知观察者, 触发依赖
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 * ! 设置新增的属性为响应式
 */
export function set(target: Array<any> | Object, key: any, val: any): any {
  if (
    process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`
    )
  }

  // ! target 是数组且 key 有效时
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key) // ! 修改数组长度 key, 否则大于原数组长度时 splice 无效
    target.splice(key, 1, val) // ! 使用重写的 splice 增加或者替换元素，并触发响应
    return val
  }

  // ! key 已经存在对象 target 且不在它的原型中时
  if (key in target && !(key in Object.prototype)) {
    target[key] = val // ! 直接修改原来的值，会自动触发 setter
    return val 
  }

  // ! 获取原对象的 __ob__ 属性
  const ob = (target: any).__ob__
  // ! 不允许设置 Vue 实例 和 根实例数据对象（根 data 不是响应式的）的属性
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' &&
      warn(
        'Avoid adding reactive properties to a Vue instance or its root $data ' +
          'at runtime - declare it upfront in the data option.'
      )
    return val
  }

  // ! 原对象不是响应式对象，新属性直接赋值并返回
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val) // ! 新属性变成响应式
  ob.dep.notify() // ! 手动触发依赖
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array<any> | Object, key: any) {
  if (
    process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`
    )
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1) // ! splice 删除元素，并触发响应
    return
  }
  const ob = (target: any).__ob__

  // ! 不能删除 Vue 实例 和 根实例数据对象（根 data 不是响应式的）的属性
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' &&
      warn(
        'Avoid deleting properties on a Vue instance or its root $data ' +
          '- just set it to null.'
      )
    return
  }
  // ! 没有要删除的属性
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key] // ! 删除目标的字段

  // ! 目标不是响应式，不处理
  if (!ob) {
    return
  }
  ob.dep.notify() // ! 手动触发依赖
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 * ! 数组元素依赖收集 (数组的索引是非响应式的，defineProperty 无法定义数组索引)
 */
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend() // ! 收集依赖
    if (Array.isArray(e)) {
      dependArray(e) // ! 递归调用
    }
  }
}
