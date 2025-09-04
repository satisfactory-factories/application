#!/bin/bash

# Define the target file
FILE="maels-big-boi-plan.ts"

# Check if the file exists
if [[ ! -f "$FILE" ]]; then
  echo "Error: $FILE not found."
  exit 1
fi

# Perform the replacements
sed -i \
    -e "s/type: 'Product'/type: GroupType.Product/g" \
    -e "s/type: 'Power'/type: GroupType.Power/g" \
    -e "s/updated: 'ingredient'/updated: FactoryPowerChangeType.Ingredient/g" \
    "$FILE"

echo "Replacements completed successfully in $FILE."
