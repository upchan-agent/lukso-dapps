# lukso-dapps

> ⚠️ **Important Notice**
>
> This skill executes transactions on the blockchain.
> - **Writes to the blockchain are irreversible.**
> - Transfers to the wrong address or incorrect contract interactions cannot be recovered.
> - The developer assumes no responsibility for any loss or damage resulting from the use of this skill.
> - **Use at your own risk.**

[OpenClaw](https://github.com/openclaw) skill for interacting with blockchain DApps via a Universal Profile (UP).

**Primary use cases**: UP operations on LUKSO, NFT minting, agent registration, and more  
**Design philosophy**: Functionality can be extended simply by adding commands to `dapps.yaml` and implement `dapps/_template/command.js`. It is designed primarily for LUKSO, while also supporting future multichain expansion to EVM chains such as Base and Ethereum (⚠️ other chains are untested).  
**Execution model**: On LUKSO, gasless relay execution is prioritized, with fallback to direct execution on failure. On EVM chains, execution is performed directly from an EOA.  
**Authentication**: In addition to write commands, `get-profile` and `get-grid` also use credentials (because when omitted, your own UP address is used by default).

---

## Quick Start

Examples of commonly used commands:

```bash
# UP operations
/lyx up:follow --target 0x...
/lyx up:send-lyx --to 0x... --amount 1.0 --yes

# Forever Moments
/lyx forever-moments:mint --image ./photo.png --title "My Moment"

# Universal Trust
/lyx universal-trust:endorse --target 0x... --reason "Great agent!"
```

See [SKILL.md](./SKILL.md) for the full command list.

---

## Development

```bash
# Run a command locally for testing
node cli.js up:follow --target 0x...
```

### Add a Command

1. Add the definition to `dapps.yaml`
2. Copy and implement `dapps/_template/command.js`

---

## Structure

```text
cli.js                    # Entry point
dapps.yaml                # Command definitions
dapps/
├── up/                   # Universal Profile operations
├── forever-moments/      # Forever Moments
└── universal-trust/      # Universal Trust
lib/
├── core/                 # Core libraries (executor, credentials, command, etc.)
└── shared/               # Shared utilities (pinata, metadata, etc.)
```

---

## Requirements

- Node.js >= 18.0.0
- ethers ^6.13.4

---

## Related Links

- [SKILL.md](./SKILL.md) - User guide (setup and full command details)
- [LUKSO Docs](https://docs.lukso.tech)
- [Forever Moments](https://www.forevermoments.life)

---

## License

MIT
