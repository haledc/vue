/* @flow */

import { mergeOptions } from '../util/index'

// ! 初始化 mixin 方法 -> 合并配置
export function initMixin(Vue: GlobalAPI) {
  Vue.mixin = function(mixin: Object) {
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
