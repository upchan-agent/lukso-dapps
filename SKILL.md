---
name: lukso-dapps
description: An extensible skill for operating blockchain DApps via a Universal Profile (UP). Designed primarily for LUKSO, and easily extendable by adding commands to dapps.yaml. Also supports EVM multichain expansion (chains other than LUKSO are untested).
version: 1.0.0
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
> - If there is any ambiguity about the recipient address, amount, or contract operation, do not execute the command and ask the user to confirm.
> - Only use the `--yes` flag when the user has reviewed and approved the operation.
> - The developer assumes no responsibility for any loss or damage resulting from the use of this skill. Any erroneous operation by an agent is also the user's own responsibility.

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
| `/lyx up:follow` | Follow (single) | ✅ |
| `/lyx up:unfollow` | Unfollow (single) | ✅ |
| `/lyx up:follow-batch` | Batch follow | ✅ |
| `/lyx up:unfollow-batch` | Batch unfollow | ✅ |
| `/lyx up:send-lyx` | Send LYX | ✅ |
| `/lyx up:tokens` | Token info / transfer | Depends on subcommand* |
| `/lyx up:update-profile` | Update profile | ✅ |
| `/lyx up:update-grid` | Update TheGrid metadata | ✅ |
| `/lyx up:info` | Display UP information | ❌ |
| `/lyx up:get-profile` | Profile details (defaults to your own UP if omitted) | ❌ |
| `/lyx up:get-grid` | Get TheGrid metadata (defaults to your own UP if omitted) | ❌ |

> * `tokens transfer` is ✅, while `tokens info` is ❌

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

---

## Usage

### Follow

```bash
# Single
/lyx up:follow --target 0x...

# Batch
/lyx up:follow-batch --targets 0x...,0x...,0x...

# Specify a chain
/lyx up:follow --target 0x... --network base
```

### Send LYX

> **Required permissions**: `TRANSFERVALUE` + AllowedCalls (the recipient address must be registered), or `SUPER_TRANSFERVALUE` (can send to any address)

```bash
# Confirmation mode (does not execute)
/lyx up:send-lyx --to 0x... --amount 1.0

# Execute
/lyx up:send-lyx --to 0x... --amount 1.0 --yes
```

### Update Profile

```bash
# Builder mode
/lyx up:update-profile --key LSP3Profile \
  --name "🆙chan" \
  --description "AI assistant" \
  --image ./photo.png

# JSON input
/lyx up:update-profile --key LSP3Profile --json profile.json
```

### Post a Moment

```bash
/lyx forever-moments:mint --image ./photo.png --title "My Moment" --description "Amazing!"
```

### Register a UP as a Collection

```bash
# Confirmation mode
/lyx forever-moments:register-up --type 1 --fee 0 --gating false

# Execute
/lyx forever-moments:register-up --type 1 --fee 0 --gating false --yes
```

### Transfer Tokens

```bash
# Transfer
/lyx up:tokens transfer --token 0x... --to 0x... --amount 100

# Check info
/lyx up:tokens info --token 0x...
```

### View Profile

```bash
# Your own UP (`--address` can be omitted)
/lyx up:get-profile

# Specify another address
/lyx up:get-profile --address 0x...
```

### TheGrid Operations

```bash
# Your own UP (`--address` can be omitted)
/lyx up:get-grid

# Specify another address
/lyx up:get-grid --address 0x...
```

### Universal Trust

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
```

---

## TheGrid Metadata Format

Metadata format for LSP28 TheGrid (in English, aligned with the official specification):

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

### Main Grid Properties

| Property | Type | Required | Description |
|---|---|---|---|
| `title` | string | ✅ | Display name for the grid |
| `gridColumns` | number | ✅ | Number of columns (recommended: 2–4) |
| `visibility` | string | - | `public` or `private` (default: `public`) |
| `grid` | array | ✅ | Array of grid items |

### Grid Item Properties

| Property | Type | Required | Description |
|---|---|---|---|
| `width` | number | ✅ | Item width in grid units (recommended: 1–3) |
| `height` | number | ✅ | Item height in grid units (recommended: 1–3) |
| `type` | string | ✅ | Item type: `IFRAME`, `TEXT`, `IMAGES`, or custom |
| `properties` | object | ✅ | Type-specific properties |

### Supported Item Types

#### IFRAME

```json
{
  "type": "IFRAME",
  "properties": {
    "src": "https://example.com",
    "allow": "accelerometer; autoplay",
    "sandbox": "allow-scripts",
    "allowfullscreen": true,
    "referrerpolicy": "no-referrer"
  }
}
```

#### TEXT

```json
{
  "type": "TEXT",
  "properties": {
    "title": "My Title",
    "titleColor": "#000000",
    "text": "Description text",
    "textColor": "#333333",
    "backgroundColor": "#ffffff",
    "backgroundImage": "https://image.jpg",
    "link": "https://example.com"
  }
}
```

#### IMAGES

```json
{
  "type": "IMAGES",
  "properties": {
    "type": "grid",
    "images": ["https://image1.jpg", "https://image2.jpg"]
  }
}
```

#### Custom Types (X, Instagram, QR_CODE, etc.)

```json
{
  "type": "X",
  "properties": {
    "type": "post",
    "username": "username",
    "id": "1234567890",
    "theme": "light"
  }
}
```

> **Note**: For the full specification, see [LSP28 TheGrid](https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-28-TheGrid.md)

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
