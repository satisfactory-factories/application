---
name: verify-tab-navigation
description: How to create/switch factory tabs in puppeteer when verifying the web planner
metadata: 
  node_type: memory
  type: reference
  originSessionId: 2f6112b7-ac23-484a-b1bf-92eb8058557f
---

Driving **factory tabs** in the planner via puppeteer-core (see the `verify` skill for launch setup).

The DOM has multiple `.v-tabs`: the top route nav (contains "Change Log") and the factory tab bar. Pick the factory bar as the `.v-tabs` that does NOT contain "Change Log":
```js
const factoryTabs = [...document.querySelectorAll('.v-tabs')].find(t => !t.textContent.includes('Change Log'))
```

**Add a new factory tab:** the add (+) button is a `button.v-btn--icon` that is a **direct child sibling of** `.v-tabs`, NOT inside it. Use `:scope >` — a plain `wrapper.querySelector('button.v-btn--icon')` grabs the per-tab **edit-name pen** (inside the current `.v-tab`) instead, which just turns the tab label into an empty `<input>`:
```js
const wrapper = factoryTabs.parentElement
wrapper.querySelector(':scope > button.v-btn--icon').click() // the + add-tab button
```
`addTab()` names it "New Tab" and switches to it (empty ⇒ `.main-content .v-card[id]` count drops to 0 — a good "we really switched away" checkpoint).

**Switch factory tabs:** click the nth `.v-tab` inside the factory bar (`factoryTabs.querySelectorAll('.v-tab')[i].click()`); tab 0 is the first plan.

Used to verify the tab-switch recalc fix ([[MEMORY]] — no unconditional recalc on switching to an already-calculated tab). Detect recalcs by capturing console for `factory: Calculating factories` / `calculateFactory completed`; an already-calculated tab switch emits neither.
