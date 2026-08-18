/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import 'vuetify/styles'

// Composables
import { createVuetify } from 'vuetify'
import { VNumberInput } from 'vuetify/components/VNumberInput'
import { aliases, fa } from 'vuetify/iconsets/fa'
import { sfColors } from '@/utils/colors'

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        colors: {
          // Align Vuetify's semantic props (color="error"/"success", type="error", form
          // validation states…) with the sf tokens. Without this, `error` resolves to
          // Material's pink #cf6679 while our chips/text use #f44336.
          error: sfColors.error.color,
          success: sfColors.success.color,
          // Primary buttons share the product blue, so e.g. "Add Factory" and
          // the product sliver/chips are always the exact same colour.
          primary: sfColors.product.color,
        },
      },
    },
  },
  components: {
    VNumberInput,
  },
  // Vuetify 4 shrank the breakpoints (md 960→840, lg 1280→1145, xl 1920→1545).
  // The planner's smAndDown/lgAndUp switches are tuned to the old widths, so
  // pin them rather than have the sidebar collapse at a different size.
  display: {
    thresholds: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1920,
      xxl: 2560,
    },
  },
  defaults: {
    // The stable VNumberInput (graduated from labs in 3.8) rounds to integers
    // by default (precision: 0); null restores the labs behaviour of
    // unrestricted decimals, which the planner's per-minute fields rely on.
    VNumberInput: {
      precision: null,
    },
  },
  icons: {
    defaultSet: 'fa',
    // Selection-control marks are drawn in CSS, not by these aliases — see global.scss.
    aliases,
    sets: {
      fa,
    },
  },
})
