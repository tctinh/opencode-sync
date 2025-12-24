/**
 * Init command - Set up sync credentials
 */

import inquirer from "inquirer";
import { saveAuth, loadAuth, clearAuth } from "../../storage/auth.js";
import { validateToken, getUser, findSyncGist } from "../../core/gist.js";
import { generatePassphrase } from "../../core/crypto.js";
import { paths } from "../../utils/paths.js";
import { pushCommand } from "./push.js";
import { pullCommand } from "./pull.js";

interface InitOptions {
  force?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  console.log("\n🔧 OpenCode Sync Setup\n");
  
  // Check existing credentials
  const existing = loadAuth();
  if (existing && !options.force) {
    console.log("✓ Already configured.");
    console.log(`  Config dir: ${paths.config}`);
    console.log(`  Sync storage: ${paths.sync}`);
    
    const { reconfigure } = await inquirer.prompt([
      {
        type: "confirm",
        name: "reconfigure",
        message: "Do you want to reconfigure?",
        default: false,
      },
    ]);
    
    if (!reconfigure) {
      console.log("\nRun 'opencodesync status' to see sync status.");
      return;
    }
  }
  
  console.log("This wizard will set up:");
  console.log("  1. GitHub Personal Access Token (for Gist storage)");
  console.log("  2. Encryption passphrase (for data security)\n");
  
  // Step 1: GitHub Token
  console.log("─".repeat(50));
  console.log("Step 1: GitHub Personal Access Token\n");
  console.log("You need a GitHub token with 'gist' scope.");
  console.log("Create one at: https://github.com/settings/tokens/new");
  console.log("Required scope: ✓ gist\n");
  
  const { githubToken } = await inquirer.prompt([
    {
      type: "password",
      name: "githubToken",
      message: "Enter your GitHub token:",
      mask: "*",
      validate: (input: string) => {
        if (!input || input.length < 10) {
          return "Token seems too short. Please enter a valid token.";
        }
        return true;
      },
    },
  ]);
  
  // Validate token
  console.log("\nValidating token...");
  const isValid = await validateToken(githubToken);
  
  if (!isValid) {
    console.error("✗ Invalid token or missing 'gist' scope.");
    console.error("  Please create a token with the 'gist' scope enabled.");
    process.exit(1);
  }
  
  const user = await getUser(githubToken);
  console.log(`✓ Authenticated as ${user.login}${user.name ? ` (${user.name})` : ""}`);
  
  // Step 2: Encryption Passphrase
  console.log("\n" + "─".repeat(50));
  console.log("Step 2: Encryption Passphrase\n");
  console.log("Your data will be encrypted before uploading.");
  console.log("Use the SAME passphrase on all devices.\n");
  
  const suggested = generatePassphrase();
  console.log(`Suggested passphrase: ${suggested}\n`);
  
  const { passphrase, confirmPassphrase } = await inquirer.prompt([
    {
      type: "password",
      name: "passphrase",
      message: "Enter passphrase (or paste suggested):",
      mask: "*",
      validate: (input: string) => {
        if (!input || input.length < 8) {
          return "Passphrase must be at least 8 characters.";
        }
        return true;
      },
    },
    {
      type: "password",
      name: "confirmPassphrase",
      message: "Confirm passphrase:",
      mask: "*",
    },
  ]);
  
  if (passphrase !== confirmPassphrase) {
    console.error("✗ Passphrases do not match.");
    process.exit(1);
  }
  
  // Check for existing Gist
  console.log("\nChecking for existing sync data...");
  const existingGist = await findSyncGist(githubToken);
  
  let gistId: string | undefined;
  if (existingGist) {
    console.log(`✓ Found existing sync Gist: ${existingGist.id}`);
    const { useExisting } = await inquirer.prompt([
      {
        type: "confirm",
        name: "useExisting",
        message: "Use this existing Gist for sync?",
        default: true,
      },
    ]);
    
    if (useExisting) {
      gistId = existingGist.id;
    }
  }
  
  // Save credentials
  console.log("\nSaving credentials...");
  
  if (existing) {
    clearAuth();
  }
  
  saveAuth({
    githubToken,
    passphrase,
    gistId,
  });
  
  console.log("✓ Credentials saved securely.\n");
  
  // Summary
  console.log("─".repeat(50));
  console.log("Setup Complete!\n");
  
  // Offer to pull or push based on whether using existing gist
  if (gistId) {
    const { shouldPull } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldPull",
        message: "Do you want to pull your settings from this Gist now?",
        default: true,
      },
    ]);
    
    if (shouldPull) {
      console.log("\nPulling settings...\n");
      await pullCommand({ verbose: false });
    } else {
      console.log("\nRun 'opencodesync pull' when you're ready to download your settings.");
    }
  } else {
    const { shouldPush } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldPush",
        message: "Do you want to push your current settings now?",
        default: true,
      },
    ]);
    
    if (shouldPush) {
      console.log("\nPushing settings...\n");
      await pushCommand({ verbose: false, force: false });
    } else {
      console.log("\nRun 'opencodesync push' when you're ready to upload your settings.");
    }
  }
  
  console.log("\nRun 'opencodesync status' to check sync status.\n");
  
  console.log("⚠️  IMPORTANT: Remember your passphrase!");
  console.log("   You'll need it to sync on other devices.\n");
}
