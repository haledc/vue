/* @flow */

import { mergeOptions } from '../util/index'

// ! 初始化 Global mixin ，添加 mixin 方法
export function initMixin(Vue: GlobalAPI) {
  Vue.mixin = function(mixin: Object) {
    this.options = mergeOptions(this.options, mixin) // ! 合并 mixin 的配置
    return this
  }
}
