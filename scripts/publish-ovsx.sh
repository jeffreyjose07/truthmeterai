#!/bin/bash

# Ensure the script fails on error
set -e

# Store the original publisher
ORIGINAL_PUBLISHER=$(grep '"publisher":' package.json | awk -F '"' '{print $4}')
echo "Current publisher: $ORIGINAL_PUBLISHER"

# Change publisher to jeffreyjose07
echo "Changing publisher to jeffreyjose07..."
# Use sed to replace the publisher line. Works on both macOS (BSD sed) and Linux (GNU sed) with a little care,
# but simple sed replacement is often easier with a temp file for cross-platform or just node.
# Using node is safer for JSON.
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.publisher = 'jeffreyjose07';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

echo "Publishing to Open VSX..."
# Check if OVSX_PAT is set, if not ask for it or let ovsx prompt/fail
# We use 'npm exec' to use the locally installed ovsx
npm exec ovsx publish "$@"

# Revert changes
echo "Reverting package.json..."
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.publisher = '$ORIGINAL_PUBLISHER';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

echo "Done!"
