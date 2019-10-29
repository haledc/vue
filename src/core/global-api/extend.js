/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

// ! 初始化 extend， 添加 extend 方法
export function initExtend(Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0 
  let cid = 1 // ! 子类构造器 ID

  /**
   * Class inheritance
   * ! extend 方法 -> 创建 Vue 子类
   */
  Vue.extend = function(extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    const Super = this // ! 根构造器 -> Vue
    const SuperId = Super.cid
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {}) // ! 缓存
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId] // ! 返回缓存
    }

    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      validateComponentName(name)
    }

    // ! 生成子类
    const Sub = function VueComponent(options) {
      this._init(options) // ! 初始化子类
    }
    Sub.prototype = Object.create(Super.prototype) // ! 继承根构造器 -> 原型连接
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    Sub.options = mergeOptions(Super.options, extendOptions) // ! 合并配置
    Sub['super'] = Super // ! 存储父级

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    if (Sub.options.props) {
      initProps(Sub) // ! 初始化 props
    }
    if (Sub.options.computed) {
      initComputed(Sub) // ! 初始化 computed
    }

    // allow further extension/mixin/plugin usage
    // ! 继承父级属性
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    ASSET_TYPES.forEach(function(type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps(Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed(Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
