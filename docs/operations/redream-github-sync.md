# Push the prepared ReDream release from a Mac

ReDream is already live. This package completes the source sync to the approved repository, FredDelaney/DJM-Onboarding, using your own Mac's GitHub login. It does not use Desktop Commander.

1. Download and unzip ReDream-GitHub-Sync.zip into Downloads on the Mac.
2. Press Command + Space, type Terminal and press Return.
3. Paste this command and press Return:

```bash
bash "$HOME/Downloads/ReDream-GitHub-Sync/push-redream-release.sh"
```

The folder contains the script and redream-agent-release-20261017.bundle. Keep them together. If the folder is somewhere other than Downloads, use its actual path in the command.

The script verifies the bundle, creates a fresh working folder, pushes codex/redream-agent-release-20261017 to https://github.com/FredDelaney/DJM-Onboarding.git, and verifies that GitHub has the exact prepared commit. The final success message starts with Verified and includes a branch URL. A newer conflicting release branch causes an error for review.

An existing GitHub CLI login is used when available. Otherwise the Mac's existing Git credential helper is used. The script does not collect tokens, install tools or change global Git settings. If authentication is missing, the push stops with an error and prints the path to the prepared working folder. That folder can also be added to GitHub Desktop and pushed from there after signing in. Share the error message if help is needed; do not send a password or access token.

The transfer helper was checked with real local Git repositories for a successful exact-commit push, an unchanged main branch, a repeated run, rejection of a newer remote branch, and a missing bundle. These are transfer checks; the actual GitHub push still requires an authenticated Mac.

Packaging must start from a complete Git history. The recovered checkout was shallow; its missing ancestors were fetched from the public repository before creating the portable bundle. Verify the finished archive by cloning its extracted bundle into a new repository and comparing the resulting commit with the release branch. Verification inside an existing shallow checkout alone is insufficient.
