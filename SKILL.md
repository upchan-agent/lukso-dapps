---
name: lukso-dapps
description: An extensible skill for operating blockchain DApps via a Universal Profile (UP). Designed primarily for LUKSO, and easily extendable by adding commands to dapps.yaml. Also supports EVM multichain expansion (chains other than LUKSO are untested).
version: 1.3.4
aliases:
  - lyx
tags:
  - lukso
  - dapps
  - blockchain
  - universal-profile
  - lsp26
  - nft
---

# lukso-dapps Skill

**Alias**: Commands can be executed with `/lyx`

Based on LUKSO's Universal Profile, this skill supports a wide range of DApp operations such as follow actions, NFT minting, token transfers, and agent registration. You can extend it with new commands simply by adding definitions to `dapps.yaml`. It is designed with future multichain deployment to EVM chains such as Base and Ethereum in mind (⚠️ chains other than LUKSO are untested).

> ⚠️ **Important Instructions for Agents**
>
> - **Commands with ✅ in the TX column write to the blockchain and cannot be undone.** Always confirm the details with the user and obtain explicit approval before execution.
> - **Always ask for explicit confirmation before executing any transaction, even if the user's instruction appears clear.** Present the full details (token, address, amount, etc.) and wait for approval.
> - If there is any ambiguity about the recipient address, amount, or contract operation, do not execute the command and ask the user to confirm.
> - Only use the `--yes` flag when the user has reviewed and approved the operation.
> - The developer assumes no responsibility for any loss or damage resulting from the use of this skill. Any erroneous operation by an agent is also the user's own responsibility.

---

## Confirmation Mode

**All TX commands (marked with ✅) require `--yes` flag for execution.**

| Default (no `--yes`) | With `--yes` |
|---------------------|--------------|
| Shows confirmation prompt | Executes immediately |

**Commands requiring `--yes`:**
- All commands with ✅ in TX column (see [Command List](#command-list))
- Including: `up:follow`, `up:tokens transfer`, `up:send-lyx`, `forever-moments:mint`, etc.

**Read-only commands (❌ in TX column) do not require `--yes`.**

---

## Getting Started (Setup)

### Step 1: Create a Universal Profile

Create a UP at [universaleverything.io](https://universaleverything.io) or [my.universalprofile.cloud](https://my.universalprofile.cloud).

---

### Step 2: Generate a Controller Key

```bash
# Generate a key
node -e "const ethers=await import('ethers');const w=ethers.Wallet.createRandom();console.log('Controller Address:',w.address);console.log('Private Key:',w.privateKey)"

# Create the credentials file
mkdir -p ~/.openclaw/credentials
cat > ~/.openclaw/credentials/universal-profile-key.json << 'EOF'
{
  "universalProfile": {
    "address": "0xYourUPAddress"
  },
  "controller": {
    "address": "0xGeneratedControllerAddress",
    "privateKey": "0xGeneratedPrivateKey"
  }
}
EOF
chmod 600 ~/.openclaw/credentials/universal-profile-key.json
```

### ⚠️⚠️Security notice⚠️⚠️

- **Never** commit them to version control
- **Always** restrict access with `chmod 600`
- Anyone who can read the file can control your UP

---

### Step 3: Grant Permissions to the Controller

https://openclaw.universalprofile.cloud/authorize

#### Permission Presets (Recommended Configuration)

| Preset | Included Permissions | Use Case |
|---|---|---|
| **Token Operator** | `TRANSFERVALUE`, `SUPER_CALL`, `SIGN`, `EXECUTE_RELAY_CALL` | Token and NFT transfers |
| **Profile Manager** | `STATICCALL`, `SUPER_SETDATA`, `SIGN`, `EXECUTE_RELAY_CALL` | Profile updates |
| **Wallet** ⭐ Recommended | `TRANSFERVALUE`, `SUPER_CALL`, `STATICCALL`, `SUPER_SETDATA`, `SIGN`, `EXECUTE_RELAY_CALL` | Full wallet functionality |
| **Full Access** ⚠️ Dangerous | `CHANGEOWNER`, `ADDCONTROLLER`, `EDITPERMISSIONS`, `ADDEXTENSIONS` +16 | Full control (use with caution) |

#### Risks of Individual Permissions

For detailed risk levels for each permission, see the [Security](#security) section.

---

### Step 4: Verify It Works

```bash
/lyx status
```

---

## Command List

TX column: ✅ = writes to the blockchain (irreversible), ❌ = read-only

### UP Operations (`up`)

| Command | Description | TX |
|---|---|---|
| `/lyx up:tokens list` | List all token balances | ❌ |
| `/lyx up:tokens info` | Get token information | ❌ |
| `/lyx up:tokens transfer` | Transfer tokens | ✅ |
| `/lyx up:follow` | Follow (single) | ✅ |
| `/lyx up:unfollow` | Unfollow (single) | ✅ |
| `/lyx up:follow-batch` | Batch follow | ✅ |
| `/lyx up:unfollow-batch` | Batch unfollow | ✅ |
| `/lyx up:send-lyx` | Send LYX | ✅ |
| `/lyx up:update-profile` | Update profile | ✅ |
| `/lyx up:update-grid` | Update TheGrid metadata | ✅ |
| `/lyx up:info` | Display UP information | ❌ |
| `/lyx up:get-profile` | Profile details (defaults to your own UP if omitted) | ❌ |
| `/lyx up:get-grid` | Get TheGrid metadata (defaults to your own UP if omitted) | ❌ |
| `/lyx up:get-follows` | Get following list (LSP26) | ❌ |
| `/lyx up:get-followers` | Get followers list (LSP26) | ❌ |

> * `tokens transfer` is ✅, while `tokens info` is ❌
>
> **Note (v1.1.0+)**: `up:update-profile` merges with existing metadata by default. Only specified fields are updated; others are preserved. Use `--replace` flag for full replacement.

### Forever Moments (`forever-moments`)

| Command | Description | TX |
|---|---|---|
| `/lyx forever-moments:mint` | Mint a moment | ✅ |
| `/lyx forever-moments:create-collection` | Create a collection | ✅ |
| `/lyx forever-moments:register-up` | Register a UP as a collection | ✅ |
| `/lyx forever-moments:charge` | Charge LIKES (LYX → LIKES) | ✅ |

### Universal Trust (`universal-trust`)

| Command | Description | TX |
|---|---|---|
| `/lyx universal-trust:register` | Register an agent | ✅ |
| `/lyx universal-trust:endorse` | Send an endorsement | ✅ |
| `/lyx universal-trust:publish-skills` | Publish skills | ✅ |
| `/lyx universal-trust:verify` | Check registration status | ❌ |
| `/lyx universal-trust:read-skills` | Read skills | ❌ |
| `/lyx universal-trust:list-agents` | List all registered agents | ❌ |
| `/lyx universal-trust:get-endorsements` | Get endorsements for address | ❌ |

---

### Agent Token Claimer (`agent-token-claimer`)

| Command | Description | TX |
|---|---|---|
| `/lyx agent-token-claimer:check` | Check eligibility, supply status, and auto-decode codeword | ❌ |
| `/lyx agent-token-claimer:claim` | Claim tokens from a drop (requires eligibility) | ✅ |
| `/lyx agent-token-claimer:decode-codeword` | Decode codeword from existing on-chain claims | ❌ |
| `/lyx agent-token-claimer:auto-check` | Scan all drops for eligibility (for cron) | ❌ |

---

## Usage

### UP Operations (`up`)

#### Follow

```bash
# Single
/lyx up:follow --target 0x...

# Batch
/lyx up:follow-batch --targets 0x...,0x...,0x...

# Specify a chain
/lyx up:follow --target 0x... --network base
```

#### Send LYX

> **Required permissions**: `TRANSFERVALUE` + AllowedCalls (the recipient address must be registered), or `SUPER_TRANSFERVALUE` (can send to any address)

```bash
# Confirmation mode (does not execute)
/lyx up:send-lyx --to 0x... --amount 1.0

# Execute
/lyx up:send-lyx --to 0x... --amount 1.0 --yes
```

#### Update Profile

**v1.1.0+ (Merge mode - default):**

```bash
# Update single field (safe - other fields preserved)
/lyx up:update-profile --key LSP3Profile --description "New description"

# Update multiple fields
/lyx up:update-profile --key LSP3Profile \
  --name "🆙chan" \
  --description "AI assistant"

# Update with image (requires local file)
/lyx up:update-profile --key LSP3Profile \
  --name "🆙chan" \
  --image ./photo.png
```

**Full replacement:**

```bash
# JSON input with --replace flag
/lyx up:update-profile --key LSP3Profile --json profile.json --replace
```

#### List Tokens

```bash
# List your tokens
/lyx up:tokens list

# List specific address tokens
/lyx up:tokens list --address 0x...
```

#### Transfer Tokens

```bash
# Transfer (confirmation mode - shows details, requires --yes to execute)
/lyx up:tokens transfer --token 0x... --to 0x... --amount 100

# Execute transfer (with confirmation flag)
/lyx up:tokens transfer --token 0x... --to 0x... --amount 100 --yes

# Check info
/lyx up:tokens info --token 0x...
```

#### View Profile

```bash
# Your own UP (`--address` can be omitted)
/lyx up:get-profile

# Specify another address
/lyx up:get-profile --address 0x...
```

#### Get/Update Grid

```bash
# Your own UP (`--address` can be omitted)
/lyx up:get-grid

# Specify another address
/lyx up:get-grid --address 0x...

# Update TheGrid metadata
/lyx up:update-grid --json grid.json
```

> For metadata format, see [TheGrid Metadata Format](#thegrid-metadata-format)

#### Get Follows/Followers

```bash
# Get following list
/lyx up:get-follows --address 0x...

# Get followers list
/lyx up:get-followers --address 0x...

# With limit (default: 100)
/lyx up:get-follows --address 0x... --limit 20
```

---

### Forever Moments (`forever-moments`)

#### Post a Moment

```bash
/lyx forever-moments:mint --image ./photo.png --title "My Moment" --description "Amazing!"
```

#### Register a UP as a Collection

```bash
# Confirmation mode
/lyx forever-moments:register-up --type 1 --fee 0 --gating false

# Execute
/lyx forever-moments:register-up --type 1 --fee 0 --gating false --yes
```

---

### Universal Trust (`universal-trust`)

```bash
# Register an agent
/lyx universal-trust:register --name "MyAgent" --description "Description"

# Endorsement
/lyx universal-trust:endorse --target 0x... --reason "Great agent!"

# Check registration status
/lyx universal-trust:verify --address 0x... --detailed

# Publish skills
/lyx universal-trust:publish-skills --name "my-skill" --content "# My Skill\n\nDescription..."

# Read skills (list all skill keys)
/lyx universal-trust:read-skills --address 0x...

# Read skills (specific skill)
/lyx universal-trust:read-skills --address 0x... --skill-key 0x...

# List all registered agents
/lyx universal-trust:list-agents

# Get endorsements for an address
/lyx universal-trust:get-endorsements --address 0x...
```

---

### Agent Token Claimer (`agent-token-claimer`)

#### Check and Claim Tokens

```bash
# Check eligibility (includes codeword auto-decode)
/lyx agent-token-claimer:check --token 0xD95446D689e9DA102c2E0e6E2AaaCDCc94887333

# Claim if eligible
/lyx agent-token-claimer:claim --token 0xD954...7333

# Claim with codeword
/lyx agent-token-claimer:claim --token 0x... --codeword "secret"
```

#### Decode Codeword (Detailed Analysis)

```bash
# Extract codeword from existing claims
/lyx agent-token-claimer:decode-codeword --token 0x...
```

#### Auto-Check (Cron/Periodic Scanning)

```bash
# Scan all drops for eligibility
/lyx agent-token-claimer:auto-check --mode check-only --limit 20
```

> **Note**: `check` auto-decodes codewords if existing claims exist. Use `decode-codeword` for detailed analysis.

---

## TheGrid Metadata Format

See [LSP28 TheGrid Specification](https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-28-TheGrid.md) for the full metadata format.

Basic example:
```json
{
  "LSP28TheGrid": [
    {
      "title": "My Grid",
      "gridColumns": 2,
      "visibility": "public",
      "grid": [
        {
          "width": 1,
          "height": 2,
          "type": "IFRAME",
          "properties": {
            "src": "https://example.com"
          }
        }
      ]
    }
  ]
}
```

---

## Adding Commands

```bash
# 1. Add the definition to dapps.yaml
vim dapps.yaml

# 2. Copy from the template
mkdir -p dapps/my-dapp
cp dapps/_template/command.js dapps/my-dapp/my-command.js

# 3. Implement it
vim dapps/my-dapp/my-command.js
```

---

## Command Execution Flow

```text
/lyx up:follow --target 0x...
  ↓
cli.js loads dapps.yaml
  ↓
Gets the definition for up:follow (file: ./dapps/up/follow.js)
  ↓
follow.js builds the transaction data
  ↓
lib/core/executor.js executes it
  ↓
Writes to the blockchain
```

**Role of `dapps.yaml`:**
- Maps command names to scripts
- Defines arguments and whether authentication is required
- This is the file to edit when adding a new command

**Execution mechanism:**
- **LUKSO / LUKSO Testnet**: Prioritizes gasless relay execution, with fallback to direct execution on failure
- **Base / Ethereum**: Executes directly from an EOA (implemented but untested)

---

## Multichain Support

- **⚠️ Not tested yet. Use at your own risk (DYOR)**

| `--network` | Chain | Gasless Relay | Gas Token |
|---|---|---|---|
| `lukso` (default) | LUKSO Mainnet | ✅ Supported | LYX |
| `luksoTestnet` | LUKSO Testnet | ✅ Supported | LYXt |
| `base` | Base Mainnet | ❌ Not supported | ETH |
| `ethereum` | Ethereum Mainnet | ❌ Not supported | ETH |

**Note**: Forever Moments supports only LUKSO Mainnet.

---

## Security

### Warning About Plaintext Credentials

Credentials are stored in plaintext at `~/.openclaw/credentials/universal-profile-key.json`.

- **Never** commit them to version control
- **Always** restrict access with `chmod 600`
- Anyone who can read the file can control the UP

### Permission Presets (Detailed)

| Preset | Details | Included Permissions |
|---|---|---|
| **Token Operator** | Token/NFT transfers, contract calls, signatures | `TRANSFERVALUE`, `SUPER_CALL`, `SIGN`, `EXECUTE_RELAY_CALL` |
| **Profile Manager** | Profile updates, data reads, signatures | `STATICCALL`, `SUPER_SETDATA`, `SIGN`, `EXECUTE_RELAY_CALL` |
| **Wallet** ⭐ Recommended | Full wallet functionality: transfers, updates, contract interactions, signatures | `TRANSFERVALUE`, `SUPER_CALL`, `STATICCALL`, `SUPER_SETDATA`, `SIGN`, `EXECUTE_RELAY_CALL` |
| **Full Access** ⚠️ Dangerous | Full profile control | `CHANGEOWNER`, `ADDCONTROLLER`, `EDITPERMISSIONS`, `ADDEXTENSIONS` +16 |

### Risks of Individual Permissions (Detailed)

| Permission | Risk | Description |
|---|---|---|
| `CHANGEOWNER` | 🔴 Critical | Can change ownership of the UP |
| `ADDCONTROLLER` | 🔴 Critical | Can add a new controller |
| `EDITPERMISSIONS` | 🔴 Critical | Can modify existing permissions |
| `SUPER_CALL` | 🔴 High | Can call arbitrary contracts |
| `SUPER_SETDATA` | 🟡 Medium | Can write arbitrary data |
| `CALL` | 🟡 Medium | Restricted contract call |
| `TRANSFERVALUE` | 🟡 Medium | Can send LYX / tokens |
| `SIGN` | 🟢 Low | Signature only |

---

## Debugging

```bash
# Output detailed logs for the LSP25 relay
export DEBUG_LSP25=true
/lyx up:follow --target 0x...
```

**Example output:**

```text
[DEBUG] LSP25 encoded message: { version: 25, chainId: 42, nonce: <current nonce>, ... }
[DEBUG] EIP-191 hash: 0x...
[DEBUG] Attempting relay execution...
[DEBUG] Relay execution successful: 0x...
```

---

## Global Options

| Option | Description |
|---|---|
| `--network <n>` | Specify the network (`lukso` \| `luksoTestnet` \| `base` \| `ethereum`) |
| `--direct` | Skip gasless relay and execute directly |
| `--fallback false` | Disable fallback if relay execution fails |

---

## References

- **Forever Moments**: https://www.forevermoments.life
- **Universal Profile Cloud**: https://my.universalprofile.cloud
- **LUKSO Docs**: https://docs.lukso.tech

---

## Changelog

See [GitHub Releases](https://github.com/upchan-agent/lukso-dapps/releases) for full changelog.

### v1.3.5 (2026-04-14)

Fix LYX send via relay, refactor direct execution to match official, cleanup dead code

#### Bug Fixes
- **`up:send-lyx` via relay**: Fixed 400 "Gas estimation failure" — LSP25 signature now includes the value field per spec. Previously value was hardcoded to 0, causing signature mismatch for non-zero LYX transfers.
- **`up:get-grid`**: Fixed empty display — LSP28 TheGrid is an array of sections, but display code treated it as a single object. Now iterates over all sections.

#### Refactors
- **Direct execution**: Changed from `KM.execute(payload)` to `UP.execute(op, target, value, data)` — matches official reference implementation. `To` address is now UP instead of KeyManager.
- **Function rename**: `buildUpExecute` → `buildExecutePayload` (matches official naming)
- **Removed deprecated parameter**: Dropped unused `upAddress` first argument from `buildExecutePayload` across all 19 command files.

#### Cleanup
- Removed unused functions: `buildExecuteCall`, `executeLSP7Transfer`, `executeLyxTransfer` from executor.js (123 lines)

### v1.3.4 (2026-04-03)

Quota check fix, --replace flag bug fix, gasless relay for Grid, image verification for moments

#### New Features
- **`forever-moments:mint`**: Added automatic `keccak256` verification for image and video files — ensures lsp-indexer recognizes uploaded media

#### Bug Fixes
- **`checkQuota()`: Fixed 401 Unauthorized error** — Changed signature method from `signMessage(string)` to `signMessage(ethers.getBytes(solidityPackedKeccak256(...)))` to match the relayer's verification scheme
- **`checkQuota()`: Return raw API response** — Now returns the actual fields from the relayer (`quota`, `totalQuota`, `unit`, `resetDate`) instead of mapping to non-existent fields
- **`up:update-profile --replace`: Fixed flag not working** — `args.replace === true` comparison failed because CLI args are strings (`'true'`), added `|| args.replace === 'true'`

#### Improvements
- **`up:update-grid`**: Now uses `executeSetDataWithFallback()` for gasless relay support (was direct-only before)
- **`up:update-grid`**: Added `--direct` flag support to force direct execution
- **`forever-moments:mint`**: Metadata now includes explicit `links: []`, `documents: []`, `attributes: []` arrays for LSP4 completeness

### v1.3.3 (2026-03-27)

New LSP26 follow/follower query commands and agent list

New LSP26 follow/follower query commands and agent list

#### New Features
- `up:get-follows` - Retrieve following list for any UP address
- `up:get-followers` - Retrieve followers list for any UP address
- Extended LSP26 ABI with `followerCount`, `followingCount`, `getFollowsByIndex`, `getFollowersByIndex`
- `universal-trust:list-agents` - List all registered agents via Blockscout API
- `universal-trust:get-endorsements` - Get endorsements for any address via Blockscout API

#### Bug Fixes
- Fixed `publish-skills` returning undefined meta on confirmation mode

### v1.3.1 (2026-03-27)

Confirmation mode bug fixes

#### Bug Fixes
- Added `--yes` flag requirement to all TX commands (confirmation mode by default)
- Fixed syntax error in set-metadata.js (duplicate variable declaration)

#### Breaking Changes
- All TX commands now require `--yes` flag for immediate execution

### v1.3.0 (2026-03-26)

LSP3Profile and LSP28TheGrid fetching using erc725.js

#### Changes
- Migrated `up:get-profile`, `up:update-profile`, `up:get-grid` to use erc725.js
- Added `@erc725/erc725.js` ^0.28.2 dependency

### v1.2.0 (2026-03-26)

`up:tokens list` command added

#### New Features
- List all token balances for an address (LSP7 and LSP8)
- Fetches data from LUKSO Blockscout API
