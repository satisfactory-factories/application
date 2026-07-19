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

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  theme: {
    defaultTheme: 'dark',
  },
  components: {
    VNumberInput,
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
    aliases,
    sets: {
      fa,
    },
  },
})
