/* @flow */

import { toArray } from '../util/index'

// ! 初始化 Global use ，添加用于安装插件的方法 use
export function initUse(Vue: GlobalAPI) {
  Vue.use = function(plugin: Function | Object) {
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = []) // ! 维护一个数组，存储注册后的插件

    // ! 数组中已存在插件，直接返回，不用安装
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1) // ! 提取插件配置 => args = (pluginName, options) => options
    args.unshift(this) // ! 把 Vue 添加到参数数组最前面 => args = (Vue, options)

    // ! 查找插件本身自带的 install 方法，并传入 Vue，进行调用
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args) // ! 第一个传入的 args 是 Vue，下同

      // ! 插件本身就是函数，就直接调用
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }

    installedPlugins.push(plugin) // ! 把安装好的插件放入维护的数组中
    return this
  }
}
