/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// ! 代理属性 this.key = this[xxx].key
export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// ! 初始化状态方法，初始化 props methods data computed watch
export function initState(vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    observe((vm._data = {}), true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

// ! 初始化 props 方法
function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {} // ! 获取 props 数据来源
  const props = (vm._props = {})
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = (vm.$options._propKeys = [])
  const isRoot = !vm.$parent

  // root instance props should be converted
  // ! 不是根组件时，不进行监听，因为可能传过来的引用类型的值已经是响应式数据
  if (!isRoot) {
    toggleObserving(false) // ! 关闭监听开关 shouldObserve = false
  }

  // ! 遍历选项上的 props 属性
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm) // ! 校验 props
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)

      // ! prop 的名字是保留的属性，发出警告
      if (
        isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)
      ) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }

      // ! 定义 props 的属性，不是响应式
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          // ! 组件直接修改 props 属性，发出警告
          warn(
            `Avoid mutating a prop directly since the value will be ` +
              `overwritten whenever the parent component re-renders. ` +
              `Instead, use a data or computed property based on the prop's ` +
              `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // ! 定义 props 的属性，不是响应式
      // ! 因为 shouldObserve = false, 不会变成响应式
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key) // ! 代理 props 上的属性 vm.xxx = vm._props.xxx
    }
  }
  toggleObserving(true) // ! 开启监听开关 shouldObserve = true
}

// ! 初始化 data
function initData(vm: Component) {
  let data = vm.$options.data
  data = vm._data = typeof data === 'function' ? getData(data, vm) : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' &&
      warn(
        'data functions should return an object:\n' +
          'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
        vm
      )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  // ! props 优先级 > methods 优先级 > data 优先级
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(`Method "${key}" has already been defined as a data property.`, vm)
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' &&
        warn(
          `The data property "${key}" is already declared as a prop. ` +
            `Use prop default value instead.`,
          vm
        )
    } else if (!isReserved(key)) {
      proxy(vm, `_data`, key) // ! 代理 data 上的属性 vm.xxx = vm._data.xxx
    }
  }
  // observe data
  observe(data, true /* asRootData */) // ! 把 data 上的属性变成响应式的
}

export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true } // ! 计算属性是懒观察

// ! 初始化计算属性选项
function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = (vm._computedWatchers = Object.create(null)) // ! 维护一个变量存储计算属性，默认值是空对象
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  // ! 遍历计算属性
  for (const key in computed) {
    const userDef = computed[key] // ! 获取每个计算属性的函数或者对象
    const getter = typeof userDef === 'function' ? userDef : userDef.get // ! 获取 getter

    // ! 计算属性没有 getter 发出警告
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(`Getter is missing for computed property "${key}".`, vm)
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // ! 创建计算属性的观察者
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions // ! 计算属性选项 { lazy: true }
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef) // ! 实现计算属性（定义和代理），把计算属性变成响应式

      // ! 如果计算属性名称在 data 和 props 被使用了，发出警告
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

// ! 实现计算属性
export function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering() // ! 是否为服务端渲染，服务端渲染不需要缓存

  // ! 计算属性是函数时
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key) // ! 创建计算属性的 getter
      : createGetterInvoker(userDef) // ! 传入函数 userDef
    sharedPropertyDefinition.set = noop // ! setter 为空函数

    // ! 计算属性是对象时
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop // ! setter 为 set 函数
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    sharedPropertyDefinition.set === noop
  ) {
    sharedPropertyDefinition.set = function() {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition) // ! 把计算属性代理到实例对象中
}

// ! 创建计算属性 getter 的函数，需要根据 dirty 更新值和收集依赖
// ! 返回一个新的 computedGetter 函数
function createComputedGetter(key) {
  return function computedGetter() {
    const watcher = this._computedWatchers && this._computedWatchers[key] // ! 获取计算属性观察者
    if (watcher) {
      // ! 如果 dirty 为 true 时，表示计算属性观察者可以更新
      if (watcher.dirty) {
        watcher.evaluate() // ! 调用 evaluate 更新计算属性的值
      }
      if (Dep.target) {
        watcher.depend() // ! 计算属性收集依赖
      }
      return watcher.value // ! 返回计算属性的值
    }
  }
}

// ! 创建计算属性调用钩子函数，自己调用函数，用于服务端渲染中
function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this)
  }
}

// ! 初始化方法选项
function initMethods(vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      // ! 方法必须是函数，否则报错
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[
            key
          ]}" in the component definition. ` +
            `Did you reference the function correctly?`,
          vm
        )
      }

      // ! 方法名不能和 props 里面的属性名相同，否则报错，这样会产生冲突，覆盖掉 props 的属性
      if (props && hasOwn(props, key)) {
        warn(`Method "${key}" has already been defined as a prop.`, vm)
      }

      // ! 方法和实例组件属性同名 且 是 Vue 的保留字时（以_或者$开头的，如 _data $parent 等）会报错
      // ! 会产生冲突，覆盖掉实例属性
      if (key in vm && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
            `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // ! 代理方法到实例，并且指向实例
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

// ! 初始化 watch 选项
function initWatch(vm: Component, watch: Object) {
  // ! 遍历 watch
  for (const key in watch) {
    const handler = watch[key] // ! 获取 handler

    // ! 如果 handler 是数组（多个观察者），遍历数组后分别创建 Watcher 实例
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

// ! 创建 watcher 的工厂函数
function createWatcher(
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // ! 传入的 handler 是对象时
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler // ! 获取对象里的 handler 方法作为 cb
  }
  // ! 传入的 handler 是字符串时  => watch: { name: 'cbName' }
  if (typeof handler === 'string') {
    handler = vm[handler] // ! 获取相同名字的函数作为 cb
  }
  return vm.$watch(expOrFn, handler, options) // ! 最后调用实例的 $watch 方法
}

// ! state 混入
export function stateMixin(Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function() {
    return this._data
  }
  const propsDef = {}
  propsDef.get = function() {
    return this._props
  }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function() {
      warn(
        'Avoid replacing instance root $data. ' +
          'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function() {
      warn(`$props is readonly.`, this)
    }
  }
  // ! 定义 $data 和 $props 的 getter （响应式只读属性）
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // ! 新增实例方法 $set $delete
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // ! 新增实例方法 $watch => 创建 Watcher 实例对象
  Vue.prototype.$watch = function(
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this

    // ! 还是对象，调用前面的 createWatcher 方法
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true // ! 设置 user 为 true，说明是用户自定义的回调函数
    const watcher = new Watcher(vm, expOrFn, cb, options) // ! 创建观察者实例，并传入设置的参数

    // ! 如果设置了 immediate
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value) // ! 先立即执行一次回调函数
      } catch (error) {
        handleError(
          error,
          vm,
          `callback for immediate watcher "${watcher.expression}"`
        )
      }
    }

    return function unwatchFn() {
      watcher.teardown() // ! 移除 watcher
    }
  }
}
