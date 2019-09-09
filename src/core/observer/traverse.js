/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set() // ! 存储 id 值的集合

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 * ! 深层递归遍历
 * ! 对子对象的访问，会触发它们的 getter 过程，这样就可以收集到所有的依赖
 */
export function traverse(val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse(val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if (
    (!isA && !isObject(val)) ||
    Object.isFrozen(val) ||
    val instanceof VNode
  ) {
    return
  }
  if (val.__ob__) {
    const depId = val.__ob__.dep.id

    // ! 已经遍历的对象，不会再遍历，避免循环引用
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  // ! 数组
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)

    // ! 对象
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
