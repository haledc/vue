/* @flow */
/* globals MessageChannel */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIOS, isNative } from './env'

const callbacks = []
let pending = false

// ! 执行 callbacks 所有的回调
function flushCallbacks() {
  pending = false // ! 重置 pending
  const copies = callbacks.slice(0)
  callbacks.length = 0 // ! 清空 callbacks
  // ! 执行拷贝副本的所有回调函数
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using both microtasks and (macro) tasks.
// In < 2.4 we used microtasks everywhere, but there are some scenarios where
// microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690) or even between bubbling of the same
// event (#6566). However, using (macro) tasks everywhere also has subtle problems
// when state is changed right before repaint (e.g. #6813, out-in transitions).
// Here we use microtask by default, but expose a way to force (macro) task when
// needed (e.g. in event handlers attached by v-on).
let microTimerFunc // ! 微任务回调函数
let macroTimerFunc // ! 宏任务回调函数
let useMacroTask = false // ! 是否使用宏任务回调

// Determine (macro) task defer implementation.
// Technically setImmediate should be the ideal choice, but it's only available
// in IE. The only polyfill that consistently queues the callback after all DOM
// events triggered in the same loop is by using MessageChannel.
/* istanbul ignore if */
// ! 宏任务实现 setImmediate => MessageChannel => setTimeout （性能从高到低）
// ! 检测是否支持原生 setImmediate (目前只有高版本 IE 和 Edge 支持)
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  macroTimerFunc = () => {
    setImmediate(flushCallbacks)
  }
  // ! 检测是否支持原生 MessageChannel （web workers）
} else if (
  typeof MessageChannel !== 'undefined' &&
  (isNative(MessageChannel) ||
    // PhantomJS
    MessageChannel.toString() === '[object MessageChannelConstructor]')
) {
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = flushCallbacks // ! port1 监听 message
  macroTimerFunc = () => {
    port.postMessage(1) // ! port2 发送 message
  }
} else {
  /* istanbul ignore next */
  // ! 最后降级为 setTimeout，性能最差的实现
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// Determine microtask defer implementation.
/* istanbul ignore next, $flow-disable-line */
// ! 微任务实现 Promise => 降级成宏任务
// ! 检测是否支持原生 Promise，使用 Promise 实现微任务
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  microTimerFunc = () => {
    p.then(flushCallbacks)
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
} else {
  // fallback to macro
  microTimerFunc = macroTimerFunc // ! 不支持 Promise， 微任务降级成宏任务
}

/**
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued using a (macro) task instead of a microtask.
 * ! 强制使 cb 为宏任务；在 v-on 事件时使用
 */
export function withMacroTask(fn: Function): Function {
  return (
    fn._withTask ||
    (fn._withTask = function() {
      useMacroTask = true
      const res = fn.apply(null, arguments)
      useMacroTask = false
      return res
    })
  )
}

export function nextTick(cb?: Function, ctx?: Object) {
  let _resolve

  // ! 把 cb 放入 callbacks 数组中
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })

  // ! pending 队列是否等待刷新
  if (!pending) {
    pending = true
    if (useMacroTask) {
      macroTimerFunc() // ! 执行宏任务回调函数 注册回调函数为宏任务
    } else {
      microTimerFunc() // ! 执行微任务回调函数 注册回调函数为微任务
    }
  }

  // $flow-disable-line
  // ! nextTick 没有传入回调函数时，提供一个 Promise 化的调用
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
