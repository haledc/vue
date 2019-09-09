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
 * ! 观察者
 */
export default class Watcher {
  vm: Component
  expression: string
  cb: Function
  id: number
  deep: boolean
  user: boolean
  lazy: boolean // ! 懒观察
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
      this.deep = !!options.deep // ! 深度观察
      this.user = !!options.user // ! 开发者
      this.lazy = !!options.lazy // ! 懒观察，专为计算属性设置
      this.sync = !!options.sync // ! 同步执行
      this.before = options.before // ! 触发更新之前
    } else {
      this.deep = this.user = this.lazy = this.sync = false // ! 默认为 false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = [] // ! 上一次添加的 Dep 实例数组
    this.newDeps = [] // ! 当前添加的 Dep 实例数组
    this.depIds = new Set() // ! 上一次添加到 Dep 实例的 id 的集合
    this.newDepIds = new Set() // ! 当前添加到 Dep 实例的 id 的集合
    this.expression =
      process.env.NODE_ENV !== 'production' ? expOrFn.toString() : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn) // ! 字符串转函数
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

    // ! 实例化最后，调用 get 获取值，并收集依赖
    // ! 注意计算属性采用不同的处理方法
    this.value = this.lazy ? undefined : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   * ! 获取值，依赖收集
   */
  get() {
    pushTarget(this) // ! Dep.target 赋值为 this ，并放入维护的 targetStack 中
    let value
    const vm = this.vm
    try {
      // ! 执行 getter 获取值
      // ! 相当于执行 updateComponent 函数 => 即 vm._update(vm._render(), hydrating)
      // ! 而 vm._render()；对 vm 上的数据访问，触发数据对象的 getter 收集依赖  => Dep.target => this
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
      // ! 如果是深度观察 => 用于 watch 属性
      if (this.deep) {
        traverse(value) // ! 递归去访问 value，触发它所有子项的 getter
      }

      // ! 把 Dep.target 恢复成上一个状态
      // ! 当前 vm 的数据依赖收集已经完成，那么对应的渲染 Dep.target 也需要改变
      popTarget()
      this.cleanupDeps() // ! 清空依赖，避免重复收集
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   * ! 依赖收集的方法
   */
  addDep(dep: Dep) {
    const id = dep.id
    // ! 需要先判定 new 的是否已经收集，就不用收集
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
   * ! 清空依赖，性能优化
   * ! 把 id 和数组的放入到上一次收集的依赖中
   */
  cleanupDeps() {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this) // ! 删除旧的观察者
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds // ! 交换 id
    this.newDepIds = tmp
    this.newDepIds.clear() // ! 清空 newDepIds
    tmp = this.deps
    this.deps = this.newDeps // ! 交换 dep
    this.newDeps = tmp
    this.newDeps.length = 0 // ! 清空 newDeps
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   * ! 更新值，触发 view 更新
   */
  update() {
    /* istanbul ignore else */
    // ! 如果有懒观察  =>  用于计算属性的更新
    if (this.lazy) {
      this.dirty = true // ! 设置 true ，更新计算属性的值（计算属性只有在依赖的值更新后，才会重新求值）

      // ! 同步更新，不需要在 nextTick 后执行 ，而是同步执行 => 用于 watch 属性
    } else if (this.sync) {
      this.run()

      // ! 异步更新
    } else {
      queueWatcher(this) // ! 使用异步队列更新
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   * ! 同步更新
   */
  run() {
    if (this.active) {
      const value = this.get() // ! 重新获取值 => 执行 getter => 执行 updateComponent => 返回 undefined
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
            this.cb.call(this.vm, value, oldValue) // ! 传入新旧值，执行回调函数更新 view 的值， 下同
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
   * ! 手动更新计算属性的值
   */
  evaluate() {
    this.value = this.get() // ! 手动获取新值
    this.dirty = false // ! 之后重新设置为 false
  }

  /**
   * Depend on all deps collected by this watcher.
   * ! 加入观测者
   */
  depend() {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   * ! 解除观察者
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
      this.active = false // ! 设置非激活状态
    }
  }
}
