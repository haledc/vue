/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
}

// ! 校验 props 函数
export function validateProp(
  key: string,
  propOptions: Object, // ! 合并后的 props 选项
  propsData: Object, // ! 数据来源对象
  vm?: Component
): any {
  const prop = propOptions[key] // ! 获取定义的 prop 的属性包括 type 默认值等
  const absent = !hasOwn(propsData, key) // ! 外界没有传值进来
  let value = propsData[key] // ! 获取传进来的值
  // boolean casting
  const booleanIndex = getTypeIndex(Boolean, prop.type) // ! 获取 Boolean 类型的索引

  // ! 优先验证 boolean 类型的值
  if (booleanIndex > -1) {
    // ! 外界没有传值，且没有默认值，
    if (absent && !hasOwn(prop, 'default')) {
      value = false // ! 值为 false

      // ! 外界传入空字符串 或者 名字由驼峰转连字符后与值为相同字符串 (someProp="some-prop)
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      const stringIndex = getTypeIndex(String, prop.type) // ! 获取 String 类型的索引

      // ! 没有定义 String 类型
      // ! 或者 Boolean 类型的索引排在 String 类型的索引前 (类型是数组时 [Boolean String]))
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true // ! 值为 true
      }
    }
  }

  // check default value
  // ! 处理 prop 未传值，但是有默认值的情况
  if (value === undefined) {
    value = getPropDefaultValue(vm, prop, key) // ! 获取默认值(非响应式)
    // since the default value is a fresh copy,
    // make sure to observe it.
    const prevShouldObserve = shouldObserve // ! 缓存原来的值
    toggleObserving(true) // ! 不管原来 shouldObserve 是否 true, 这里都先设置为 true
    observe(value) // ! 把默认值设为响应式
    toggleObserving(prevShouldObserve) // ! 还原成原先的值
  }

  // ! 验证类型，只有在非生产环境进行，且跳过 WEEX 环境的某种判断
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && '@binding' in value)
  ) {
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 * ! 获取 prop 的默认值
 */
function getPropDefaultValue(
  vm: ?Component,
  prop: PropOptions,
  key: string
): any {
  // no default, return undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default // ! 获取默认值
  // warn against non-factory defaults for Object & Array
  // ! 对象和数组类型的默认值必须使用函数返回值，否则会报错
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' +
        key +
        '": ' +
        'Props with type Object/Array must use a factory function ' +
        'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  if (
    vm &&
    vm.$options.propsData &&
    vm.$options.propsData[key] === undefined && // ! 此时，外界还没传值
    vm._props[key] !== undefined // ! 已经定义非 undefined 的默认值
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // ! 默认值是函数类型，但是要求的类型不为 Function（类型是数组或者对象） 时需要求值
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 * ! 类型验证的函数
 */
function assertProp(
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // ! 有 required 时必须传数据，否则报错
  if (prop.required && absent) {
    warn('Missing required prop: "' + name + '"', vm)
    return
  }

  // ! 非必需传数据且值为 null 或者 undefined 时，直接返回
  if (value == null && !prop.required) {
    return
  }

  // ! 判断类型是否与期望相符
  let type = prop.type // ! 获取类型
  let valid = !type || type === true // ! 没有设置类型或者类型的值为 true 时，不需要校验，直接判定为 true
  const expectedTypes = [] // ! 期望类型的集合
  if (type) {
    // ! 数组类型
    if (!Array.isArray(type)) {
      type = [type]
    }
    // ! 遍历数组的所有类型，并验证每一种类型, 当出现一种类型验证失败后 !valid 时，循环结束
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i]) // ! 类型验证的返回值
      expectedTypes.push(assertedType.expectedType || '') // ! 把返回放入到数组中，后面统一处理
      valid = assertedType.valid // ! 本次循环验证的结果
    }
  }

  // ! 当验证失败，报错
  if (!valid) {
    warn(getInvalidTypeMessage(name, value, expectedTypes), vm)
    return
  }

  // ! 自定义验证
  const validator = prop.validator // ! 获取用户自定义的验证器

  // ! 把 value 作为参数传入并执行自定义验证器，
  // ! 当它返回值为 false 时，验证失败，报错
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

// ! 可通过 typeof 来验证的数据类型正则
const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

// ! 类型验证
function assertType(
  value: any,
  type: Function
): {
  valid: boolean,
  expectedType: string
} {
  let valid
  const expectedType = getType(type) // ! 获取期待的类型

  // ! 可通过 typeof 来验证的数据类型
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value // ! t 的值是字符串小写
    valid = t === expectedType.toLowerCase() // ! 验证类型
    // for primitive wrapper objects
    // ! 包装类型的验证，验证原型，比如 const str = new String('123')，str 是 String 的实例对象
    if (!valid && t === 'object') {
      valid = value instanceof type
    }

    // ! 对象验证
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)

    // ! 数组验证
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)

    // ! 其他验证 => 自定义类型 (原型验证)
  } else {
    valid = value instanceof type
  }

  // ! 返回验证结果和期望的类型
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 * ! 获取类型值
 * ! 匹配类型的函数名称。因为不同 iframes 之间的相同类型的构造函数名称是不同的。
 */
function getType(fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

// ! 判断类型是否相同
function isSameType(a, b) {
  return getType(a) === getType(b)
}

// ! 获取匹配的类型索引。如果值大于 -1 时，说明匹配到了值
function getTypeIndex(type, expectedTypes): number {
  // ! 期望的类型不是数组时，直接比较，是相同类型返回 0，不是返回 1
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }

  // ! 期望的类型是数组时，需要遍历，然后一一比较，返回匹配的类型在数组中的索引
  // ! 如果都没有匹配到，返回 -1
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage(name, value, expectedTypes) {
  let message =
    `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

function styleValue(value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

function isExplicable(value) {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => value.toLowerCase() === elem)
}

function isBoolean(...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
