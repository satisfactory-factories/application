import { test as base } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'

import { newClient, type TestUser } from './accounts'

interface Fixtures {
  /**
   * A second (third, fourth) client: the same browser, its own storage and its
   * own socket, which is what makes it a separate device. Every one opened
   * through here is closed when the test ends.
   */
  client: (options?: { user?: TestUser }) => Promise<BrowserContext>
}

export const test = base.extend<Fixtures>({
  client: async ({ browser }, use) => {
    const opened: BrowserContext[] = []

    await use(async (options = {}) => {
      const context = await newClient(browser, options)
      opened.push(context)
      return context
    })

    for (const context of opened) await context.close()
  },
})

export { expect } from '@playwright/test'
