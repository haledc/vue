/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin(Vue: GlobalAPI) {
  Vue.mixin = function(mixin: Object) {
    this.options = mergeOptions(this.options, mixin) // ! 合并 mixin 的配置
    return this
  }
}
