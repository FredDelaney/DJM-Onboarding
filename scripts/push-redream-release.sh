#!/usr/bin/env bash
set -euo pipefail

# Use an existing Git or GitHub CLI login. Do not collect or save credentials.
repo_url='https://github.com/FredDelaney/DJM-Onboarding.git'
release_branch='codex/redream-agent-release-20261017'
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
bundle_path="${1:-$script_dir/redream-agent-release-20261017.bundle}"

if ! command -v git >/dev/null 2>&1; then
  printf '%s\n' 'Git is required. Install the Apple Command Line Tools, then run this again.' >&2
  exit 1
fi
if [ ! -r "$bundle_path" ]; then
  printf '%s\n' 'The release bundle was not found. Unzip the complete package before running this script.' >&2
  exit 1
fi
if ! bundle_ref="$(git bundle list-heads "$bundle_path" "refs/heads/$release_branch" 2>/dev/null)" || [ -z "$bundle_ref" ]; then
  printf '%s\n' 'The release bundle could not be verified. Download the package again.' >&2
  exit 1
fi

release_dir="$(mktemp -d "${TMPDIR:-/tmp}/redream-github-sync.XXXXXX")"
git clone --quiet --branch "$release_branch" "$bundle_path" "$release_dir"
git -C "$release_dir" bundle verify "$bundle_path" >/dev/null 2>&1
git -C "$release_dir" remote set-url origin "$repo_url"
expected_head="$(git -C "$release_dir" rev-parse HEAD)"
use_gh=0
if command -v gh >/dev/null 2>&1 && gh auth status --hostname github.com >/dev/null 2>&1; then
  use_gh=1
fi
git_remote() {
  if [ "$use_gh" = 1 ]; then
    git -c credential.helper= -c 'credential.helper=!gh auth git-credential' "$@"
  else
    git "$@"
  fi
}
export GIT_TERMINAL_PROMPT=0

printf 'Pushing release branch to %s\n' "$repo_url"
if ! git_remote -C "$release_dir" push --set-upstream origin "HEAD:refs/heads/$release_branch"; then
  printf '\n%s\n' 'GitHub did not accept the push. Check the error above. If sign-in is needed, use an existing GitHub CLI login and retry, or open the prepared working copy in GitHub Desktop and push from there.' >&2
  printf 'The prepared working copy is available at: %s\n' "$release_dir" >&2
  exit 1
fi

remote_ref="$(git_remote -C "$release_dir" ls-remote --heads origin "refs/heads/$release_branch")"
actual_head="${remote_ref%%[[:space:]]*}"
if [ "$actual_head" != "$expected_head" ]; then
  printf '%s\n' 'The uploaded branch did not match the prepared release. Please share this message so it can be checked.' >&2
  exit 1
fi
printf '\nVerified: %s\n' "$expected_head"
printf 'Open: https://github.com/FredDelaney/DJM-Onboarding/tree/%s\n' "$release_branch"
