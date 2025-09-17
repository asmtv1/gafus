#!/bin/bash

# Script to help set up GitHub repository secrets
# Run this locally to get the values you need to add to GitHub

echo "🔐 GitHub Repository Secrets Setup"
echo "=================================="
echo ""
echo "Add these secrets to your GitHub repository:"
echo "Repository → Settings → Secrets and variables → Actions"
echo ""

echo "📋 Required Secrets:"
echo ""

echo "SERVER_HOST"
echo "Value: 185.239.51.125"
echo "Description: Your server IP address"
echo ""

echo "SERVER_USERNAME"
echo "Value: root"
echo "Description: SSH username for server access"
echo ""

echo "SERVER_PASSWORD"
echo "Value: YOUR_SERVER_PASSWORD_HERE"
echo "Description: SSH password for server access"
echo ""

echo "SERVER_PORT"
echo "Value: 22"
echo "Description: SSH port (usually 22)"
echo ""

echo "🔑 Optional Secrets (for enhanced security):"
echo ""

echo "DOCKER_USERNAME"
echo "Value: your_github_username"
echo "Description: GitHub username for container registry"
echo ""

echo "DOCKER_PASSWORD"
echo "Value: YOUR_GITHUB_TOKEN_HERE"
echo "Description: GitHub Personal Access Token for container registry"
echo ""

echo "📝 Steps to add secrets:"
echo "1. Go to your GitHub repository"
echo "2. Click Settings → Secrets and variables → Actions"
echo "3. Click 'New repository secret'"
echo "4. Add each secret with the name and value above"
echo "5. Click 'Add secret'"
echo ""

echo "⚠️  Important Security Notes:"
echo "- Never commit secrets to your repository"
echo "- Use strong, unique passwords in production"
echo "- Consider using SSH keys instead of passwords"
echo "- Rotate secrets regularly"
echo ""

echo "🚀 After adding secrets:"
echo "1. Push this code to trigger the first CI/CD run"
echo "2. Check Actions tab to monitor deployment"
echo "3. Use Manual Deploy workflow for testing"
echo ""

echo "📚 For more information, see DEPLOYMENT.md"
