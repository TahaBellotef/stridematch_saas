# Script to rename all folders to lowercase
# Run this AFTER closing VS Code and stopping the dev server

$ErrorActionPreference = "Stop"

# Navigate to the project root
Set-Location "C:\Users\essid\OneDrive\Bureau\stridematch\lab-frontend"

Write-Host "Starting folder renames..." -ForegroundColor Green

# Set git to handle case-sensitive renames
git config core.ignorecase false

# Rename Commerce nested folders
Write-Host "Renaming Commerce nested folders..." -ForegroundColor Yellow
git mv src/app/admin/Commerce/Inventory/notificationsCommerce src/app/admin/Commerce/Inventory/notifications-commerce-tmp
git mv src/app/admin/Commerce/Inventory/notifications-commerce-tmp src/app/admin/Commerce/Inventory/notifications-commerce

git mv src/app/admin/Commerce/Inventory/overviewCommerce src/app/admin/Commerce/Inventory/overview-commerce-tmp
git mv src/app/admin/Commerce/Inventory/overview-commerce-tmp src/app/admin/Commerce/Inventory/overview-commerce

git mv src/app/admin/Commerce/Inventory/productsCommerce src/app/admin/Commerce/Inventory/products-commerce-tmp
git mv src/app/admin/Commerce/Inventory/products-commerce-tmp src/app/admin/Commerce/Inventory/products-commerce

# Rename Inventory to inventory
Write-Host "Renaming Inventory to inventory..." -ForegroundColor Yellow
git mv src/app/admin/Commerce/Inventory src/app/admin/Commerce/inventory-tmp
git mv src/app/admin/Commerce/inventory-tmp src/app/admin/Commerce/inventory

# Rename Commerce to commerce
Write-Host "Renaming Commerce to commerce..." - ForegroundColor Yellow
git mv src/app/admin/Commerce src/app/admin/commerce-tmp
git mv src/app/admin/commerce-tmp src/app/admin/commerce

# Rename Dashboard nested folders
Write-Host "Renaming Dashboard nested folders..." -ForegroundColor Yellow
git mv src/app/admin/Dashboard/customersDashboard src/app/admin/Dashboard/customers-dashboard-tmp
git mv src/app/admin/Dashboard/customers-dashboard-tmp src/app/admin/Dashboard/customers-dashboard

# Rename Dashboard to dashboard
Write-Host "Renaming Dashboard to dashboard..." -ForegroundColor Yellow
git mv src/app/admin/Dashboard src/app/admin/dashboard-tmp
git mv src/app/admin/dashboard-tmp src/app/admin/dashboard

# Rename Settings nested folders
Write-Host "Renaming Settings nested folders..." -ForegroundColor Yellow
git mv src/app/admin/Settings/notificationsSettings src/app/admin/Settings/notifications-settings-tmp
git mv src/app/admin/Settings/notifications-settings-tmp src/app/admin/Settings/notifications-settings

git mv src/app/admin/Settings/scanSetup src/app/admin/Settings/scan-setup-tmp
git mv src/app/admin/Settings/scan-setup-tmp src/app/admin/Settings/scan-setup

# Rename Settings to settings
Write-Host "Renaming Settings to settings..." -ForegroundColor Yellow
git mv src/app/admin/Settings src/app/admin/settings-tmp
git mv src/app/admin/settings-tmp src/app/admin/settings

# Rename auth folders
Write-Host "Renaming auth folders..." -ForegroundColor Yellow
git mv src/app/auth/changePassword src/app/auth/change-password-tmp
git mv src/app/auth/change-password-tmp src/app/auth/change-password

git mv src/app/auth/forgotPassword src/app/auth/forgot-password-tmp
git mv src/app/auth/forgot-password-tmp src/app/auth/forgot-password

# Restore git config
git config core.ignorecase true

Write-Host "All folders renamed successfully!" -ForegroundColor Green
Write-Host "Reviewing changes..." -ForegroundColor Yellow
git status

Write-Host "`nTo commit these changes, run:" -ForegroundColor Cyan
Write-Host "git add -A" -ForegroundColor White
Write-Host "git commit -m 'Rename all route folders to lowercase'" -ForegroundColor White

Write-Host "`nAfter committing, you'll need to update import references in your code." -ForegroundColor Yellow
