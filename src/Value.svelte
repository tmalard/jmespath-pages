<script>
  let { value, keyValueSnippet, path = "", editable = false } = $props()
  // todo: prettier, more intuitive array delineation
  // todo: allow toggling column split for arrays, specifically
</script>

{#snippet renderable(val, outerPath = "")}
  <div title={outerPath} class="font-monospace block min-h-4">
    {#if val && typeof val === "object"}
      {#if Array.isArray(val)}
        <ul class="grid gap-1.5">
          {#each val as arrayItem, index}
            <li
              class={`rounded-l border-l-2 border-gray-500/50 ${typeof arrayItem === "object" ? "hover:border-gray-600/95" : ""}`}
            >
              {@render renderable(arrayItem, `${outerPath}[${index}]`)}
            </li>
          {/each}
        </ul>
      {:else}
        <div>
          {#each Object.entries(val) as [key, innerValue]}
            {@render keyValueSnippet({
              key,
              value: innerValue,
              path: outerPath ? `${outerPath}.${key}` : key,
              editable,
            })}
          {/each}
        </div>
      {/if}
    {:else}
      <span class="pl-4">
        {val}
      </span>
    {/if}
  </div>
{/snippet}

{@render renderable(value, path)}
