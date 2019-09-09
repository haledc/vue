/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

export function createCompilerCreator(baseCompile: Function): Function {
  return function createCompiler(baseOptions: CompilerOptions) {
    // ! 编译模板字符串的方法
    function compile(
      template: string,
      options?: CompilerOptions // ! 用户定制选项
    ): CompiledResult {
      const finalOptions = Object.create(baseOptions) // ! 创建最终的编译选项参数
      const errors = [] // ! 错误信息集合
      const tips = [] // ! 提示信息集合

      let warn = (msg, range, tip) => {
        ;(tip ? tips : errors).push(msg)
      }

      // ! 将用户定制选项配置合并到最终的选项参数中
      if (options) {
        if (
          process.env.NODE_ENV !== 'production' &&
          options.outputSourceRange
        ) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            ;(tip ? tips : errors).push(data)
          }
        }
        // merge custom modules
        // ! 合并数组
        if (options.modules) {
          finalOptions.modules = (baseOptions.modules || []).concat(
            options.modules
          )
        }

        // merge custom directives
        // ! 合并对象
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        // ! 其他的直接复制进去
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn

      const compiled = baseCompile(template.trim(), finalOptions) // ! 具体的编译方法，生成渲染函数字符串

      if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn)
      }
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile, // ! 生成渲染函数字符串
      compileToFunctions: createCompileToFunctionFn(compile) // ! 生成真正的渲染函数
    }
  }
}
