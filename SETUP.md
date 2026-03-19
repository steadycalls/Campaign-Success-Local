# Setup Guide

Follow this walkthrough to get the Campaign Success Local project up and running from scratch.

## 1. Clone the Repository

If you haven't already, open an elevated PowerShell window (Run as Administrator) and run:

```powershell
cd "C:\Users\kjrpu\Documents\2. LI\Claude"
git clone https://github.com/steadycalls/Campaign-Success-Local.git
cd Campaign-Success-Local
```

## 2. Run the Environment Setup Script

This script will verify and install any missing dependencies, including Node.js (v20+), Git, Python (v3.11+), and C++ Build Tools. It will also check your PowerShell execution policy.

```powershell
.\setup-environment.ps1
```

**Note:** If the script indicates that the C++ Build Tools workload is missing, it will install the Visual Studio Installer. You must manually open the installer, click "Modify", check "Desktop development with C++", and complete the installation.

If any major dependencies (like Node or Python) were installed, restart your terminal before proceeding.

## 3. Open the Project in VS Code

We have pre-configured the VS Code workspace for this project. To launch it, run:

```powershell
code .
```

When VS Code opens, it will detect the `.vscode/extensions.json` file and prompt you to install the recommended extensions. Click **Install** on the prompt to ensure your development environment has all necessary tools (such as ESLint, Prettier, and TypeScript helpers).

## 4. Install Dependencies

Open the integrated terminal in VS Code (`Ctrl+~`) and install the Node modules:

```powershell
npm install
```

## 5. Start the Development Server

Once dependencies are installed, you can spin up the local environment:

```powershell
npm run dev
```

You are now ready to begin development. If you are using Claude Code, you are in position to fire Prompt 27.
