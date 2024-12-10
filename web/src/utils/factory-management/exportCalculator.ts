// import { Factory } from '@/interfaces/planner/FactoryInterface'
//
// export const configureExportCalculator = (factories: Factory[]) => {
//   factories.forEach(factory => {
//     // For each surplus product we need to make sure there is an export calculator setting associated with it
//     Object.keys(factory.exports).forEach(part => {
//       // If there's not already a record for this surplus product, create one now.
//       let selected: string | null = null
//       const requestKeys = Object.keys(factory.dependencies.requests)
//
//       if (!factory.exportCalculator[part]) {
//         // Set it to the first request by default
//         if (requestKeys.length > 0) {
//           selected = requestKeys[0]
//         }
//       }
//
//       factory.exportCalculator[part] = {
//         selected,
//         factorySettings: {},
//       }
//     })
//   })
// }
