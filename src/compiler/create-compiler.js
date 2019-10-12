/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

export function createCompilerCreator(baseCompile: Function): Function {
  return function createCompiler(baseOptions: CompilerOptions) {
    // ! 编译模板字符串的函数 => 对 baseCompile 进行一层包装，使其适用于 web 平台
    function compile(
      template: string,
      options?: CompilerOptions // ! 用户定制选项
    ): CompiledResult {
      const finalOptions = Object.create(baseOptions) // ! 最终的编译选项参数
      const errors = [] // ! 错误信息集合
      const tips = [] // ! 提示信息集合

      let warn = (msg, range, tip) => {
        ;(tip ? tips : errors).push(msg)
      }

      // ! 将用户设置的选项配置合并到最终的选项参数中
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
        // ! 合并 modules 选项，数组类型
        if (options.modules) {
          finalOptions.modules = (baseOptions.modules || []).concat(
            options.modules
          )
        }

        // merge custom directives
        // ! 合并 directives 选项，对象类型
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        // ! 其他直接复制进去
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn

      // ! 具体的编译方法，生成 AST render staticRenderFns 组成的对象返回值
      const compiled = baseCompile(template.trim(), finalOptions)

      if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn) // ! 检查 AST 语法，判断编译前的模板字符串是否有语法错误
      }

      // ! 把错误信息和提示信息放入到返回的对象中
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile, // ! 编译模板字符串的函数，模板字符串 => 渲染函数字符串
      compileToFunctions: createCompileToFunctionFn(compile) // ! 生成渲染函数的函数，渲染函数字符串 => 渲染函数
    }
  }
}
