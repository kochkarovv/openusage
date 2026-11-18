# LiteLLM

Tracks spend on a [LiteLLM](https://docs.litellm.ai) proxy virtual key against the key's budget. LiteLLM
is self-hosted and isn't a subscription: an admin gives your key a dollar budget (optionally resetting
on a schedule) and the proxy counts what you've spent.

## What it tracks

| Metric | Meaning |
|---|---|
| Budget | Spend against the key's budget (a dollar meter), with the reset time when the budget renews — shown only when the key has a budget |
| Spend | Total spend recorded on the key |

The key's alias, when it has one, is shown beside the provider name.

## Setup

LiteLLM starts turned off. Turn it on in **Customize**, then set it up there.

LiteLLM needs two things: your proxy's **host** and your **virtual key**. Add both in
**Customize → LiteLLM → API Key**: enter the host (for example `https://litellm.example.com`, or
`http://localhost:4000` for a local proxy) and the key, then Save. If you leave out `http://` or
`https://`, `https://` is assumed. A pasted `/v1` at the end of the host is ignored. macOS only allows
plain `http://` for `localhost`, IP addresses, and `.local` hosts. Use `https://` for anything else.

Both are stored at `~/.config/openusage/litellm.json`:

```json
{ "apiKey": "sk-...", "host": "https://litellm.example.com" }
```

You can also export them in your shell profile (the saved values win):

- Key: `LITELLM_API_KEY` or `LITELLM_PROXY_API_KEY`
- Host: `LITELLM_API_BASE`, `LITELLM_PROXY_API_BASE`, or `LITELLM_BASE_URL`

Clearing the key keeps the saved host, and changing the host keeps the key.

## Troubleshooting

- **"No LiteLLM API key" / "No LiteLLM host"** — add the missing value in Customize, then refresh.
- **"Host isn't a valid http(s) URL"** — fix the host; only `http` and `https` are accepted.
- **"API key invalid"** — the proxy rejected the key (401).
- **"Can't read its usage"** — the key may not call `/key/info`, and the proxy didn't report its spend
  any other way either. Ask your LiteLLM admin to allow the key to read its own info.

## Under the hood

One REST call: `GET <host>/key/info` with the key as a `Bearer` token. With no `key` parameter LiteLLM
describes the calling key; OpenUsage reads `spend`, `max_budget`, `budget_reset_at`, and `key_alias`.
A key with no `max_budget` is uncapped, so only Spend is shown.

Many proxies only let virtual keys call model routes, so `/key/info` returns 403. In that case OpenUsage
sends a chat request for a model that doesn't exist (`openusage-usage-probe`). The proxy rejects it
before calling any model, so it costs nothing, but it still reports the key's spend and budget in the
`x-litellm-key-spend` and `x-litellm-key-max-budget` response headers. This path has no reset time or
key alias. The probe shows up as a failed request in the proxy's logs. The request has no messages, so even a proxy with a
catch-all model route that forwards it upstream gets it rejected as invalid, which isn't billed.

A key that is already over its budget is rejected before the proxy adds those headers. OpenUsage
reads the spend and budget from LiteLLM's "Budget has been exceeded" message instead, or shows
"over its budget" when the message doesn't include the numbers.
