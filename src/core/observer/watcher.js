/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 * ! 订阅器
 */
export default class Watcher {
  vm: Component
  expression: string
  cb: Function
  id: number
  deep: boolean
  user: boolean
  lazy: boolean // ! 懒订阅
  sync: boolean
  dirty: boolean
  active: boolean
  deps: Array<Dep>
  newDeps: Array<Dep>
  depIds: SimpleSet
  newDepIds: SimpleSet
  before: ?Function
  getter: Function
  value: any

  constructor(
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this) // ! 把自己添加进去
    // options
    if (options) {
      this.deep = !!options.deep // ! 深度订阅
      this.user = !!options.user // ! 用户
      this.lazy = !!options.lazy // ! 懒订阅，专为计算属性设置
      this.sync = !!options.sync // ! 同步执行
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false // ! 默认为 false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = [] // ! 上一次添加的 Dep 实例数组
    this.newDeps = [] // ! 添加的 Dep 实例数组
    this.depIds = new Set() // ! 上一次添加的 Dep 实例数组的 id
    this.newDepIds = new Set() // ! 上一次添加的 Dep 实例数组的 id
    this.expression =
      process.env.NODE_ENV !== 'production' ? expOrFn.toString() : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' &&
          warn(
            `Failed watching path: "${expOrFn}" ` +
              'Watcher only accepts simple dot-delimited paths. ' +
              'For full control, use a function instead.',
            vm
          )
      }
    }
    this.value = this.lazy ? undefined : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   * ! 获取值
   */
  get() {
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // ! 相当于执行 updateComponent 函数；vm._update(vm._render(), hydrating)
      // ! vm._render()；对 vm 上的数据访问，触发数据对象的 getter
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // ! 如果是深度订阅 => 用于 watch 属性
      if (this.deep) {
        traverse(value) // ! 递归去访问 value，触发它所有子项的 getter
      }
      // ! 把 Dep.target 恢复成上一个状态
      // ! 当前 vm 的数据依赖收集已经完成，那么对应的渲染 Dep.target 也需要改变
      popTarget()
      this.cleanupDeps() // ! 清空依赖
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep(dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * ! 性能优化
   */
  cleanupDeps() {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this) // ! 删除旧的订阅
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds // ! 交换id
    this.newDepIds = tmp
    this.newDepIds.clear() // ! 清空 newDepIds
    tmp = this.deps
    this.deps = this.newDeps // !交换 dep
    this.newDeps = tmp
    this.newDeps.length = 0 // ! 清空 newDeps
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   * ! 更新值
   */
  update() {
    /* istanbul ignore else */
    // ! 懒订阅  => 用于计算属性
    if (this.lazy) {
      this.dirty = true // ! 设置 true，更新计算属性的值
      // ! 同步 不需要在 nextTick 后执行 ，而是同步执行 => 用于 watch 属性
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run() {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value // ! 旧值
        this.value = value // ! 新值
        // ! 设置 user 为 true 时， 会处理错误 => 用于 watch 属性
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue) // ! 传入新旧值，执行回调函数更新 view 的值
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   * ! 获取计算属性的值
   */
  evaluate() {
    this.value = this.get()
    this.dirty = false // ! 重新设置为 false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend() {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown() {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
