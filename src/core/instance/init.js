/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin(Vue: Class<Component>) {
  // ! 初始化的方法
  Vue.prototype._init = function(options?: Object) {
    const vm: Component = this
    // a uid
    vm._uid = uid++ // ! 唯一标示

    let startTag, endTag
    /* istanbul ignore if */
    // ! 性能追踪相关
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // ! 合并配置
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor), // ! Vue 初始化时的默认配置,比如默认的指令和组件等等
        options || {}, // ! 用户传入的配置
        vm // !  Vue 实例对象本身
      )
    }
    /* istanbul ignore else */
    // ! 初始化代理
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    initLifecycle(vm) // ! 初始化生命周期相关配置 存储本身实例到父节点 新增属性 $parent $root $children $refs 等
    initEvents(vm) // ! 初始化事件相关配置 更新 listeners
    initRender(vm) // ! 初始化渲染, 创建VNode 另新增属性 $attrs 和 $listeners
    callHook(vm, 'beforeCreate') // ! 调用 beforeCreate 钩子函数
    initInjections(vm) // ! 初始化 Injections resolve injections before data/props 
    initState(vm) // ! 初始化状态 按顺序 props => methods => data => computed  => watch
    initProvide(vm) // ! 初始化 Provide resolve provide after data/props 
    callHook(vm, 'created') // ! 调用 created 钩子函数

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // ! 如果有 el，就挂载在该元素上
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

// ! 初始化内部组件的方法
export function initInternalComponent(
  vm: Component,
  options: InternalComponentOptions
) {
  // ! 初始化时合并 options，下同
  const opts = (vm.$options = Object.create(vm.constructor.options))
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent // ! 存储 parent
  opts._parentVnode = parentVnode // ! 存储 parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// ! 解析 Vue 初始化时构造函数的 options (注意区别 Vue 的构造函数和子类（Vue.extend()）的构造函数)
export function resolveConstructorOptions(Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options // ! 返回 options
}

function resolveModifiedOptions(Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
