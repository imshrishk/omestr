# PowerShell Deployment Script for Omestr

# Build the Next.js application
Write-Host "Building Omestr application..." -ForegroundColor Green
npm run build

# Check if build was successful
if ($LASTEXITCODE -eq 0) {
    Write-Host "Build successful!" -ForegroundColor Green
    
    # Check if Vercel CLI is installed
    try {
        $vercelVersion = vercel --version
        Write-Host "Deploying to Vercel..." -ForegroundColor Yellow
        vercel --prod
    } catch {
        Write-Host "Vercel CLI not found. To deploy to Vercel, please install the Vercel CLI:" -ForegroundColor Yellow
        Write-Host "npm install -g vercel" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Alternatively, you can deploy using:" -ForegroundColor Cyan
        Write-Host "1. Connect your GitHub repository to Vercel for automatic deployments" -ForegroundColor Cyan
        Write-Host "2. Use the Vercel dashboard to deploy manually" -ForegroundColor Cyan
    }
} else {
    Write-Host "Build failed. Please fix the errors before deploying." -ForegroundColor Red
    Exit 1
}

Write-Host "Deployment script completed!" -ForegroundColor Green