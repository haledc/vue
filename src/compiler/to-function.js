/* @flow */

import { noop, extend } from 'shared/util'
import { warn as baseWarn, tip } from 'core/util/debug'
import { generateCodeFrame } from './codeframe'

type CompiledFunctionResult = {
  render: Function,
  staticRenderFns: Array<Function>
}

// ! 生成渲染函数的函数，渲染函数字符串 => 渲染函数
function createFunction(code, errors) {
  try {
    return new Function(code)
  } catch (err) {
    errors.push({ err, code })
    return noop
  }
}

// ! 创建编译方法的函数
export function createCompileToFunctionFn(compile: Function): Function {
  const cache = Object.create(null) // ! 创建缓存，由下面的闭包函数引用

  // ! 最终使用的编译方法
  return function compileToFunctions(
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {
    options = extend({}, options)
    const warn = options.warn || baseWarn
    delete options.warn

    /* istanbul ignore if */
    // ! 测试能否使用 new Function(), 模板字符串编译成渲染函数依赖 new Function()
    if (process.env.NODE_ENV !== 'production') {
      // detect possible CSP restriction
      try {
        new Function('return 1') 
      } catch (e) {
        if (e.toString().match(/unsafe-eval|CSP/)) {
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
              'environment with Content Security Policy that prohibits unsafe-eval. ' +
              'The template compiler cannot work in this environment. Consider ' +
              'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
              'templates into render functions.'
          )
        }
      }
    }

    // check cache
    const key = options.delimiters
      ? String(options.delimiters) + template // ! 转换数组为字符串并和 template 合并
      : template
    if (cache[key]) {
      return cache[key]
    }

    // compile
    const compiled = compile(template, options) // ! 编译模板，模板字符串 => 渲染函数字符串

    // check compilation errors/tips
    // ! 打印编译过程的错误
    if (process.env.NODE_ENV !== 'production') {
      // ! 检查是否存在编译错误信息
      if (compiled.errors && compiled.errors.length) {
        if (options.outputSourceRange) {
          compiled.errors.forEach(e => {
            warn(
              `Error compiling template:\n\n${e.msg}\n\n` +
                generateCodeFrame(template, e.start, e.end),
              vm
            )
          })
        } else {
          warn(
            `Error compiling template:\n\n${template}\n\n` +
              compiled.errors.map(e => `- ${e}`).join('\n') +
              '\n',
            vm
          )
        }
      }
      // ! 检查是否存在编译提示信息
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) {
          compiled.tips.forEach(e => tip(e.msg, vm))
        } else {
          compiled.tips.forEach(msg => tip(msg, vm))
        }
      }
    }

    // turn code into functions
    const res = {}
    const fnGenErrors = [] // ! 生成函数时发生的错误信息的集合，主要是编译器本身的错误
    res.render = createFunction(compiled.render, fnGenErrors) // ! 生成渲染函数，渲染函数字符串 => 渲染函数
    res.staticRenderFns = compiled.staticRenderFns.map(code => {
      return createFunction(code, fnGenErrors)
    }) // ! 生成静态渲染函数的数组 => 渲染优化

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    /* istanbul ignore if */
    // ! 打印生成渲染函数中的错误
    if (process.env.NODE_ENV !== 'production') {
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        warn(
          `Failed to generate render function:\n\n` +
            fnGenErrors
              .map(({ err, code }) => `${err.toString()} in\n\n${code}\n`)
              .join('\n'),
          vm
        )
      }
    }

    return (cache[key] = res) // ! 缓存并返回编译结果 res
  }
}
