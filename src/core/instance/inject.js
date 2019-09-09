/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

// ! 初始化 provide 的方法
export function initProvide(vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function' ? provide.call(vm) : provide
  }
}

// ! 初始化 inject 的方法
export function initInjections(vm: Component) {
  const result = resolveInject(vm.$options.inject, vm)

  // ! 获取到 inject 后
  if (result) {
    toggleObserving(false)
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
              `overwritten whenever the provided component re-renders. ` +
              `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key]) // ! 变成响应式
      }
    })
    toggleObserving(true)
  }
}

export function resolveInject(inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    const keys = hasSymbol ? Reflect.ownKeys(inject) : Object.keys(inject)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      const provideKey = inject[key].from // ! 获取 provide key 值
      let source = vm
      while (source) {
        // ! 查找并获取父组件的 provide 的值
        // ! 因为初始化时 inject的初始化在 provide 之前，所以不会获取组件本身提供的 provide 的值
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }
      // ! 如果找不到
      if (!source) {
        // ! 定义了默认值则使用默认值（可以是函数）
        if ('default' in inject[key]) {
          const provideDefault = inject[key].default
          result[key] =
            typeof provideDefault === 'function'
              ? provideDefault.call(vm)
              : provideDefault

          // ! 找不到又没有默认值，非生产环境下报错
        } else if (process.env.NODE_ENV !== 'production') {
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    return result
  }
}
