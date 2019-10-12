/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype // ! 数组原型
export const arrayMethods = Object.create(arrayProto) // ! 通过数组原型创建的对象

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 * ! 重定义 arrayMethods 对象的属性
 */
methodsToPatch.forEach(function(method) {
  // cache original method
  const original = arrayProto[method] // ! 原生方法
  def(arrayMethods, method, function mutator(...args) {
    const result = original.apply(this, args) // ! 原生方法调用生成的值，也是返回值
    const ob = this.__ob__
    let inserted // ! 数组新增的值, 数组类型
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2) // ! 获取传入参数的第三个参数以后的值所有值，即新增的值
        break
    }
    if (inserted) ob.observeArray(inserted) // ! 监听新增的值，使其成为响应式
    // notify change
    ob.dep.notify() // ! 手动触发依赖通知
    return result
  })
})
