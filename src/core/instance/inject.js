/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

// ! 初始化 provide
export function initProvide(vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function' ? provide.call(vm) : provide
  }
}

// ! 初始化 inject
export function initInjections(vm: Component) {
  const result = resolveInject(vm.$options.inject, vm) // ! 解析 inject，获取父组件 provide 的值

  // ! 获取 provide 的值后
  if (result) {
    toggleObserving(false) // ! 不监听 inject 选项的属性不是响应式的
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        // ! 实例代理 key，另外不能修改 inject 的数据，否则报错
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
              `overwritten whenever the provided component re-renders. ` +
              `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key]) // ! 实例代理 key
      }
    })
    toggleObserving(true) // ! 恢复监听
  }
}

// ! 解析 inject 选项，即从父组件中获取 provide 的值 
export function resolveInject(inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    const keys = hasSymbol ? Reflect.ownKeys(inject) : Object.keys(inject)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      const provideKey = inject[key].from // ! 从 from 中获取对于 provide 的 key
      let source = vm
      while (source) {
        // ! 查找并获取父组件的 provide 的值
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey] // ! 注意：因为组件是先初始化 inject, 所以不会找到本身的 provide
          break
        }
        source = source.$parent // ! 循环往上找
      }
      // ! 如果循环之后还是找不到值
      if (!source) {
        // ! 如果定义了默认值则使用默认值，函数类型的默认字需要求值
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
