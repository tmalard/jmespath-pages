<script>
  import Value from "./Value.svelte"
  let { key, value } = $props()
</script>

{#snippet keyValueSnippet(key, value)}
  <details>
    <summary class="text-md font-mono">
      {key}:
    </summary>
    <Value {value} {keyValueSnippet} />
  </details>
{/snippet}

{@render keyValueSnippet(key, value)}
