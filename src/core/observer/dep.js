/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * ! 订阅器 -> 依赖和触发收集
 */
export default class Dep {
  static target: ?Watcher
  id: number
  subs: Array<Watcher>

  constructor() {
    this.id = uid++ // ! 唯一标识，可以用来区分 dep，以及引用 dep 的属性
    this.subs = []
  }

  // ! 添加观察者
  addSub(sub: Watcher) {
    this.subs.push(sub)
  }

  // ! 删除观察者
  removeSub(sub: Watcher) {
    remove(this.subs, sub)
  }

  /**
   * ! 依赖收集
   */
  depend() {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  /**
   * ! 触发依赖
   */
  notify() {
    // stabilize the subscriber list first
    const subs = this.subs.slice()

    // ! 同步执行观察者，不是异步队列全部入队后一起执行
    // ! 需要按照顺序来执行，主要用于开发环境中测试代码
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id) // ! id 升序排序
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null // ! 初始化为 null
const targetStack = []

// ! 把 target 放入栈中，并赋值 Dep.target
export function pushTarget(target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

// ! 把 target 移出栈中，Dep.target 变成栈的最后一个元素 或者 undefined
export function popTarget() {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
