#!/bin/bash

# Build the Next.js application
echo "Building Omestr application..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
  echo "Build successful!"
  
  # Run any additional deployment steps
  # For example, deploy to Vercel
  if command -v vercel &> /dev/null; then
    echo "Deploying to Vercel..."
    vercel --prod
  else
    echo "Vercel CLI not found. To deploy to Vercel, please install the Vercel CLI:"
    echo "npm install -g vercel"
    echo ""
    echo "Alternatively, you can deploy using:"
    echo "1. Connect your GitHub repository to Vercel for automatic deployments"
    echo "2. Use the Vercel dashboard to deploy manually"
  fi
else
  echo "Build failed. Please fix the errors before deploying."
  exit 1
fi

echo "Deployment script completed!" 