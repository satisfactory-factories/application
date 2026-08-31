import { describe, expect, it } from 'vitest'
import { fireEvent } from '@testing-library/vue'
import ShareButton from './ShareButton.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'

describe('ShareButton', () => {
  it('should match snapshot', () => {
    const subject = vuetifyRender(ShareButton)
    expect(subject.html()).toMatchSnapshot()
  })

  // A `title` attribute is the browser's tooltip, not the app's: it takes a second to
  // appear and is unstyled. This one has to be a real hover tooltip.
  it('says what it opens on hover', async () => {
    const subject = vuetifyRender(ShareButton)

    await fireEvent.mouseEnter(subject.getByTestId('share-button'))

    expect(document.body.textContent)
      .toContain('Share this tab: a snapshot link, or an invite to plan together')
  })
})
