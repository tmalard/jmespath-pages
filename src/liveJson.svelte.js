// accepts an arbitrary object and provides simple setters/getters for modification

import jmespath from "jmespath"

const IDENTIFIER = /(?<token>(?<key>\w+)(?<breaker>\[(?<ary_index>\d+)\]\.|\.)?)/gm

// actions stored when building the edit history
const CHANGE = "change" // value != previous (but still present)
const DELETE = "delete" // value no longer present

let originalCopy = $state({})
let workingCopy = $state({})
let editHistory = $state([])

// Multiple JMESPath queries support
let queries = $state([])
let queriesDebounced = $state([])
let previewQuery = $state("")
let previewQueryDebounced = $state("")

// Individual working copies for each query
let queryWorkingCopies = $derived.by(() => {
  return queriesDebounced.map((q) => jmesFilter(originalCopy, q))
})

function mergeResults(results) {
  if (results.length === 0) return {}
  if (results.length === 1) return results[0]

  // Check if first result is an array
  const firstResult = results[0]
  if (Array.isArray(firstResult)) {
    // Concatenate all arrays
    return results.flat()
  }

  // Merge objects
  return Object.assign({}, ...results)
}

// Master working copy merged from all query results
let masterWorkingCopy = $derived.by(() => {
  const results = queryWorkingCopies

  // Include preview query if it exists
  if (previewQueryDebounced) {
    const previewResult = jmesFilter(originalCopy, previewQueryDebounced)
    return mergeResults([...results, previewResult])
  }

  if (results.length === 0) return workingCopy
  return mergeResults(results)
})

export const query = {
  get all() {
    return queries
  },
  get preview() {
    return previewQuery
  },
  set preview(value) {
    previewQuery = value
    setTimeout(() => {
      previewQueryDebounced = value
    }, 250)
  },
  add(queryString) {
    queries = [...queries, queryString]
    setTimeout(() => {
      queriesDebounced = [...queriesDebounced, queryString]
    }, 250)
  },
  remove(index) {
    queries = queries.filter((_, i) => i !== index)
    queriesDebounced = queriesDebounced.filter((_, i) => i !== index)
  },
  update(index, queryString) {
    queries = queries.map((q, i) => (i === index ? queryString : q))
    setTimeout(() => {
      queriesDebounced = queriesDebounced.map((q, i) => (i === index ? queryString : q))
    }, 250)
  },
  clear() {
    queries = []
    queriesDebounced = []
  },
}

function jmesFilter(obj, str) {
  if (!str) return obj

  try {
    return jmespath.search(obj, str)
  } catch (e) {
    console.error("failed to filter:", { query: str, error: e })
    return obj
  }
}

function isPrimitive(value) {
  if (typeof value === "object") {
    if (value === null) return true
    return false
  }

  // todo: better narrowing
  return true
}

function allPrimitivesOrPrimitiveArray(value) {
  if (typeof value === "object") {
    if (value === null) return true
    if (Array.isArray(value)) return value.every(isPrimitive)
    return false
  }
  return isPrimitive(value)
}

function canCoerceCsv(obj) {
  if (typeof obj !== "object") return false
  if (obj === null) return false

  /**
   * Case 1, Array of Objects:
   * ```
   * Object.values =
   * [
   *   { question, answer, foo, bar },
   *   { question, answer, foo, bar },
   *   { question, answer, foo, bar }
   * ]
   * ```
   */
  if (Array.isArray(obj)) {
    return obj.every((inner) => {
      // non-object = ambiguous
      if (typeof inner !== "object") return false
      if (inner === null) return false

      // array within array COULD be explicit column order..
      // not support for now
      if (Array.isArray(inner)) return false

      // must be object AND every value is primitive
      return Object.values(inner).every(allPrimitivesOrPrimitiveArray)
    })
  }

  // todo: is there a case 2 ???
  return false
}

let filteredOriginal = $derived.by(() => {
  // Only apply preview query to original
  return jmesFilter(originalCopy, previewQueryDebounced)
})

let filteredWorking = $derived.by(() => {
  // Use master working copy when queries or preview exist
  if (queriesDebounced.length > 0 || previewQueryDebounced) {
    return masterWorkingCopy
  }
  return workingCopy
})

export const original = {
  get view() {
    return filteredOriginal
  },
  get value() {
    return originalCopy
  },
}

export const working = {
  get view() {
    return filteredWorking
  },
  // get value() {
  //   return queriesDebounced.length > 0 ? masterWorkingCopy : workingCopy
  // },
  get byQuery() {
    return queryWorkingCopies
  },
  get canCsv() {
    return canCoerceCsv(filteredWorking)
  },
}

export function setOriginal(newValue) {
  originalCopy = newValue
  workingCopy = newValue
  editHistory = []
  queries = []
  queriesDebounced = []
}

export function getOriginal() {
  return filteredOriginal
}

export function setJson(newValue) {
  workingCopy = newValue
}

export function getWorking() {
  return filteredWorking
}

export function getKey(identifier) {
  const matches = identifier.matchAll(IDENTIFIER)

  let ref = queriesDebounced.length > 0 ? masterWorkingCopy : workingCopy
  try {
    matches.forEach(([_full, _token, key, _breaker, arrayIndex]) => {
      // set new ref
      ref = ref[key]
      if (arrayIndex) ref = ref[arrayIndex]
    })
  } catch (e) {
    console.error("failed to deeply parse:", { identifier, ref })
  }

  return ref
}

/**
 * {
 *   path: ["foo", "bars", 0, "baz"],
 *   value: "NEW VALUE FOR FOO.BARS[0].BAZ"
 * }
 */
function applyChange(original, change, action = CHANGE) {
  let { path, value } = change
  const currentKey = path.shift()

  // if no key left, we've reached the end of changeset and can apply
  if (!currentKey) {
    if (action === CHANGE) {
      return value
    }
  } else {
    // if we're deleting, delete ONLY if there is no additional path (before returning final)
    if (action === DELETE && path.length === 0) {
      // array needs to be spliced, objects can use delete
      if (Array.isArray(original)) {
        original.splice(currentKey, 1)
      } else {
        delete original[currentKey]
      }
    } else {
      original[currentKey] = applyChange(original[currentKey], { path, value }, action)
    }
    return original
  }
}

export function setKey(identifier, value) {
  const matches = identifier.matchAll(IDENTIFIER)
  let ref = queriesDebounced.length > 0 ? masterWorkingCopy : workingCopy
  let refs = []
  try {
    matches.forEach(([_full, _token, key, _breaker, arrayIndex]) => {
      ref = ref[key]
      refs.push(key)
      if (arrayIndex) ref = ref[arrayIndex]
      if (arrayIndex) refs.push(arrayIndex)
    })
  } catch (e) {
    console.error("failed to deeply parse:", { identifier, ref })
  }

  setJson(
    applyChange(
      workingCopy,
      {
        path: refs,
        value,
      },
      CHANGE,
    ),
  )

  editHistory.push({
    identifier,
    kind: CHANGE,
    value,
  })
}

export function deleteKey(identifier) {
  const matches = identifier.matchAll(IDENTIFIER)
  let ref = queriesDebounced.length > 0 ? masterWorkingCopy : workingCopy
  let refs = []
  try {
    matches.forEach(([_full, _token, key, _breaker, arrayIndex]) => {
      ref = ref[key]
      refs.push(key)
      if (arrayIndex) ref = ref[arrayIndex]
      if (arrayIndex) refs.push(arrayIndex)
    })
  } catch (e) {
    console.error("failed to deeply parse:", { identifier, ref })
  }

  setJson(
    applyChange(
      workingCopy,
      {
        path: refs,
      },
      DELETE,
    ),
  )

  editHistory.push({
    identifier,
    kind: DELETE,
    value: null,
  })
}
