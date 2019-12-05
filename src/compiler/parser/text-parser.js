/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g // ! 默认分隔符 {{ }}
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

// ! 创建分隔符正则
const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}

// ! 文本解析的方法
export function parseText(
  text: string,
  delimiters?: [string, string] // ! 自定义分隔符 -> [open, close]
): TextParseResult | void {
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  if (!tagRE.test(text)) {
    return
  }
  const tokens = []
  const rawTokens = []
  let lastIndex = (tagRE.lastIndex = 0)
  let match, index, tokenValue
  while ((match = tagRE.exec(text))) {
    index = match.index // ! 最左边 { 的索引值
    // push text token
    if (index > lastIndex) {
      rawTokens.push((tokenValue = text.slice(lastIndex, index))) // ! 存储截取分隔符左边的普通文本
      tokens.push(JSON.stringify(tokenValue)) // !
    }
    // tag token
    const exp = parseFilters(match[1].trim()) // ! 获取分隔符里面的表达式
    tokens.push(`_s(${exp})`) // ! 拼接 _s -> 后面生成函数代码时使用这个函数解析表达式
    rawTokens.push({ '@binding': exp })
    lastIndex = index + match[0].length // ! 更新值 -> 右移，前进到这轮的普通文本和匹配的值后面
  }
  // ! 循环结束后，还有剩余的普通文本无法匹配时，把它们放入到 tokens 中
  if (lastIndex < text.length) {
    rawTokens.push((tokenValue = text.slice(lastIndex)))
    tokens.push(JSON.stringify(tokenValue))
  }
  return {
    expression: tokens.join('+'), // ! 表达式使用 + 拼接在一起
    tokens: rawTokens
  }
}
