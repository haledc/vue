/* @flow */

import { toArray } from '../util/index'

export function initUse(Vue: GlobalAPI) {
  Vue.use = function(plugin: Function | Object) {
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = []) // ! 维护一个数组，存储注册后的插件
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    args.unshift(this) // ! 把 Vue 添加到参数数组最前面
    // ! 查找 install 方法，并调用
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args) // ! 第一个传入的参数是 Vue，下同
      // ! 插件本身是函数的，也可以直接调用
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin) // !把插件放入维护的数组
    return this
  }
}
