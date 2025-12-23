<script>
  import "./tailwind.4.1.14"
  import Value from "./Value.svelte"

  import { setOriginal, query, original, working } from "./liveJson.svelte"

  let jsonInput = $state("")
  let jsonError = $state("")
  let hasLoadedJson = $state(false)
  let boundOpen = $state({})

  function loadJsonFromText() {
    try {
      const parsed = JSON.parse(jsonInput)
      setOriginal(JSON.parse(JSON.stringify(parsed)))
      jsonError = ""
      hasLoadedJson = true
    } catch (e) {
      jsonError = `Invalid JSON: ${e.message}`
    }
  }

  function loadJsonFromFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result)
        setOriginal(JSON.parse(JSON.stringify(parsed)))
        jsonError = ""
        hasLoadedJson = true
        jsonInput = ""
      } catch (err) {
        jsonError = `Invalid JSON file: ${err.message}`
      }
    }
    reader.readAsText(file)
  }

  function addQuery() {
    if (query.preview.trim()) {
      query.add(query.preview)
      query.preview = ""
    }
  }

  function removeQuery(index) {
    query.remove(index)
  }

  function updateQuery(index, value) {
    query.update(index, value)
  }

  function downloadJSON() {
    const jsonStr = JSON.stringify(working.view, null, 2)
    const blob = new Blob([jsonStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "working-copy.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  function formatCsvItem(item) {
    if (item === undefined) return ""

    const value = `${item}`
    const needQuote = value.search(/("|,|\n)/g) >= 0
    return needQuote ? `"${value.replaceAll('"', '""')}"` : value.replaceAll('"', '""')
  }

  function downloadCSV() {
    if (!working.canCsv) return

    // 1. first, append (in order) normal values & array values
    const headerMap = new Map()
    working.view.forEach((obj) => {
      Object.entries(obj).forEach(([key, value]) => {
        if (typeof value === "object" && Array.isArray(value)) {
          // if value is array, update highest idx count
          if (!headerMap.has(key) || (headerMap.get(key) && headerMap.get(key) < value.length)) {
            headerMap.set(key, value.length)
          }
        } else {
          headerMap.set(key, false)
        }
      })
    })

    // 2. extract values in order, based on headers
    const headers = new Set()
    const rows = working.view.map((obj, csvIndex) => {
      const currentRow = []
      ;[...headerMap].forEach(([key, arrayColumn]) => {
        const value = obj[key]
        if (value && arrayColumn) {
          ;[...new Array(arrayColumn)].forEach((_, index) => {
            headers.add(`${key}[${index}]`)
            currentRow.push(formatCsvItem(value[index]))
          })
        } else {
          headers.add(key)
          currentRow.push(formatCsvItem(value))
        }
      })

      return [csvIndex, ...currentRow].join(",")
    })

    rows.unshift(["index", ...headers])

    const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "working-copy.csv"
    a.click()
    URL.revokeObjectURL(url)
  }
</script>

{#snippet keyValueSnippet({ key, value, path = "", editable = false })}
  <details
    class="overflow-hidden pl-4 font-mono text-xs text-nowrap"
    bind:open={() => boundOpen[path], (v) => (boundOpen[path] = v)}
  >
    <summary class="cursor-pointer border border-transparent hover:border-b-black" title={path}>
      <span
        class="px-1.5 py-0.5"
        class:font-semibold={boundOpen[path]}
        class:bg-gray-200={boundOpen[path]}
        class:rounded={boundOpen[path]}
      >
        {key}
      </span>
      {#if value && typeof value === "object"}
        <span class="text-gray-500">
          {#if Array.isArray(value)}
            Array ({value.length})
          {:else}
            Object ({Object.keys(value).length})
          {/if}
        </span>
      {/if}
      {#if boundOpen[path]}
        <span>:</span>
      {/if}
    </summary>
    {#if boundOpen[path]}
      <Value
        {...{
          value,
          keyValueSnippet,
          path,
          editable,
        }}
      />
    {/if}
  </details>
{/snippet}

<section class="mb-2 bg-stone-100 p-4">
  {#if !hasLoadedJson}
    <div class="max-w-6xl space-y-3">
      <div class="mb-2 font-mono text-sm font-bold tracking-wider uppercase">Load JSON Data</div>

      <!-- File Upload -->
      <div class="border border-stone-300 bg-white p-3">
        <label class="flex cursor-pointer items-center gap-3">
          <span
            class="cursor-pointer border-2 border-black bg-blue-600 px-3 py-2 font-mono text-sm tracking-wide text-white uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-75 hover:translate-x-1 hover:translate-y-1 hover:bg-blue-700 hover:shadow-none"
          >
            Choose File
          </span>
          <input type="file" accept=".json" onchange={loadJsonFromFile} class="hidden" />
          <span class="font-mono text-xs text-stone-600">Upload a JSON file</span>
        </label>
      </div>

      <!-- Text Input -->
      <div class="border border-stone-300 bg-white p-3">
        <div class="mb-2 font-mono text-xs font-semibold">Or paste JSON:</div>
        <textarea
          bind:value={jsonInput}
          rows="8"
          class="w-full resize-y border border-stone-300 bg-stone-50 px-3 py-2 font-mono text-xs focus:border-stone-400 focus:outline-none"
        ></textarea>
        <button
          onclick={loadJsonFromText}
          disabled={!jsonInput.trim()}
          class="mt-2 cursor-pointer border-2 border-black bg-blue-600 px-3 py-2 font-mono text-sm tracking-wide text-white uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-75 hover:translate-x-1 hover:translate-y-1 hover:bg-blue-700 hover:shadow-none disabled:cursor-not-allowed disabled:bg-stone-400 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          Load JSON
        </button>
      </div>

      {#if jsonError}
        <div class="border-2 border-red-600 bg-red-50 p-3 font-mono text-xs text-red-800">
          {jsonError}
        </div>
      {/if}
    </div>
  {:else}
    <div class="max-w-6xl space-y-3">
      <!-- Action Buttons Row -->
      <div class="flex items-center justify-between gap-2">
        <button
          onclick={() => {
            setOriginal({})
            hasLoadedJson = false
            jsonInput = ""
            jsonError = ""
          }}
          class="cursor-pointer border-2 border-black bg-red-600 px-3 py-2 font-mono text-sm tracking-wide text-white uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-75 hover:translate-x-1 hover:translate-y-1 hover:bg-red-700 hover:shadow-none"
        >
          Reset State
        </button>
      </div>

      <!-- Query Input Section -->
      <div class="border border-stone-300 bg-white p-3">
        <div class="flex items-center gap-2">
          <textarea
            bind:value={query.preview}
            placeholder="JMESPath query"
            rows="2"
            class="flex-1 resize-y border border-transparent bg-transparent px-2 py-1.5 font-mono text-xs focus:border-stone-400 focus:outline-none"
            onkeydown={(e) => e.key === "Enter" && e.ctrlKey && addQuery()}
          ></textarea>
          <button
            onclick={addQuery}
            class="cursor-pointer border-2 border-black bg-blue-600 px-3 py-1.5 font-mono text-sm tracking-wide whitespace-nowrap text-white uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all duration-75 hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-blue-700 hover:shadow-none"
          >
            Add
          </button>
          {#if query.all.length > 0}
            <button
              onclick={query.clear}
              class="cursor-pointer border-2 border-black bg-stone-700 px-3 py-1.5 font-mono text-sm tracking-wide text-white uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all duration-75 hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-stone-900 hover:shadow-none"
            >
              Clear
            </button>
          {/if}
        </div>
      </div>

      <!-- Active Queries List -->
      {#if query.all.length > 0}
        <div class="border border-stone-300 bg-white p-3">
          <div class="mb-2 pb-1 font-mono text-xs font-bold tracking-wider uppercase">
            Active Queries: {query.all.length}
          </div>
          <div class="space-y-2">
            {#each query.all as q, i}
              <div
                class="flex items-start gap-2 border border-stone-200 p-2 transition-all duration-75 hover:border-stone-400"
              >
                <textarea
                  value={q}
                  oninput={(e) => updateQuery(i, e.target.value)}
                  rows="1"
                  class="flex-1 resize-y border border-transparent bg-transparent px-2 py-1 font-mono text-xs focus:border-stone-400 focus:outline-none"
                ></textarea>
                <button
                  onclick={() => removeQuery(i)}
                  class="cursor-pointer border-2 border-black bg-white px-2 py-1 font-mono text-sm uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all duration-75 hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-red-600 hover:text-white hover:shadow-none"
                >
                  ×
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</section>

{#if hasLoadedJson}
  <div class="grid grid-cols-2">
    <!-- controls -->
    <span></span>
    <div class="mb-2">
      <div class="flex justify-center gap-4">
        <button
          onclick={downloadJSON}
          class="cursor-pointer border-2 border-black bg-black px-3 py-2 font-mono text-sm tracking-wide text-white uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-75 hover:translate-x-1 hover:translate-y-1 hover:bg-white hover:text-black hover:shadow-none"
        >
          ↓ Save JSON
        </button>

        {#if working.canCsv}
          <button
            onclick={downloadCSV}
            class="cursor-pointer border-2 border-black bg-black px-3 py-2 font-mono text-sm tracking-wide text-white uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-75 hover:translate-x-1 hover:translate-y-1 hover:bg-white hover:text-black hover:shadow-none"
          >
            ↓ Save CSV
          </button>
        {/if}
      </div>
    </div>

    <!-- previews -->
    <section>
      <!-- if all results filtered out (null), fall back on orig -->
      <Value value={original.view || original.value} {keyValueSnippet} />
    </section>

    <section>
      <Value editable value={working.view} {keyValueSnippet} />
    </section>
  </div>
{/if}
