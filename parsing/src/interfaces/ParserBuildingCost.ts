// The one-time material cost to construct a single building: what the Build Gun spends when it
// is placed, as opposed to the power it draws or the parts a few of them consume to keep running.
export interface ParserBuildingCostIngredient {
  part: string;
  amount: number;
}
