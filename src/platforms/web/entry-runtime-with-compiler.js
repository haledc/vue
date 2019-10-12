/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index' // ! 导入 runtime 版本的 Vue
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import {
  shouldDecodeNewlines,
  shouldDecodeNewlinesForHref
} from './util/compat'

// ! 通过 id 获取元素的 innerHTML
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

const mount = Vue.prototype.$mount // ! 缓存 runtime 版本的 $mount 方法

// ! 重写 $mount 方法 with compiler
Vue.prototype.$mount = function(
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)

  /* istanbul ignore if */
  // ! 不能挂载在 body 和 html 标签上
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' &&
      warn(
        `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
      )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // ! 如果没有渲染函数，使用 el 或者 template 构建渲染函数
  if (!options.render) {
    let template = options.template

    // ! 获取 template 的值
    // ! 优先从 template 选项中获取
    if (template) {
      if (typeof template === 'string') {
        // ! id 选择器
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
        // ! 元素类型
      } else if (template.nodeType) {
        template = template.innerHTML
        // ! 其他无效的 template 报错
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
      // ! 其次从 el 选项获取
    } else if (el) {
      template = getOuterHTML(el)
    }

    if (template) {
      /* istanbul ignore if */
      // ! 测试编译性能之开始
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // ! 生成渲染函数
      const { render, staticRenderFns } = compileToFunctions(
        template,
        {
          outputSourceRange: process.env.NODE_ENV !== 'production',
          shouldDecodeNewlines,
          shouldDecodeNewlinesForHref,
          delimiters: options.delimiters, // ! 分隔符配置，是个数组，默认是 ['{{', '}}']，可定义为 ['${', '}']
          comments: options.comments // ! 评论配置，是否保留 html 中的注释，默认是 false， 不保留
        },
        this
      )
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      // ! 测试编译性能之结束
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  return mount.call(this, el, hydrating) // ! 调用 runtime mount 函数
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML(el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions // ! 新增编译方法 compile

export default Vue
