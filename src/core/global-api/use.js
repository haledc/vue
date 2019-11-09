/* @flow */

import { toArray } from '../util/index'

// ! 初始化 use 方法 -> 安装插件
export function initUse(Vue: GlobalAPI) {
  Vue.use = function(plugin: Function | Object) {
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = []) // ! 维护一个数组，存储所有注册后的插件

    // ! 数组中已存在该插件，直接返回，不用重复安装
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1) // ! 提取插件的选项 [pluginName, options] -> [options]
    args.unshift(this) // ! 把 this(Vue) 添加到参数数组的最前面 [options] -> [Vue, options]

    // ! 如果插件设置了 install 方法，调用这个方法安装插件，并传入 Vue
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args) // ! args 第一个参数就是 Vue，下同

      // ! 如果插件本身就是函数，直接调用这个函数
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }

    installedPlugins.push(plugin) // ! 把安装好的插件放入维护的数组中
    return this // ! 返回 Vue
  }
}
