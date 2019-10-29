/* @flow */

// ! 全局 API 主要是设置 Vue 的静态属性和方法
import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI(Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef) // ! 新增属性 config

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  // ! 添加工具方法 util 不稳定
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  // ! 新增方法 set delete nextTick
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // ! 新增方法 observable
  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  // ! 新增属性 options, 初始值是没有原型对象的空对象
  Vue.options = Object.create(null)

  // ! 设置 Vue.options.components  Vue.options.directives Vue.options.filters 为空对象
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue // ! 新增属性 _base -> Vue 构造器

  // ! 添加内置组件 <keep-alive/>
  extend(Vue.options.components, builtInComponents)

  initUse(Vue) // ! 新增方法 Vue.use
  initMixin(Vue) // ! 新增方法  Vue.mixin
  initExtend(Vue) // ! 新增方法  Vue.extend
  initAssetRegisters(Vue) // ! 新增方法 Vue.component Vue.directive Vue.filter
}
