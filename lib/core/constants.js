/**
 * LUKSO DApps - Core Constants
 * 
 * ⚠️ IMPORTANT: Changes to this file may break existing functionality. Review carefully.
 * 
 * Category Order (Dependency-based):
 * 1. NETWORK     - Basic network settings
 * 2. CHAINS      - Chain configurations
 * 3. CONTRACTS   - Contract addresses
 * 4. ABIS        - Contract ABI definitions
 * 5. DATA_KEYS   - LSP data keys (ERC725Y)
 * 6. PERMISSIONS - LSP6 KeyManager permissions
 * 7. OTHERS      - Other constants
 */

// ═══════════════════════════════════════════════════════════
// NETWORK
// ═══════════════════════════════════════════════════════════

export const RPC_URL = 'https://rpc.mainnet.lukso.network';
export const CHAIN_ID = 42;
export const LSP25_VERSION = 25n;

// ═══════════════════════════════════════════════════════════
// CHAINS
// ═══════════════════════════════════════════════════════════
/**
 * Chain configurations
 * 
 * executionModel:
 * - 'lsp6': LUKSO chains - Controller → KeyManager.execute(payload) → UP
 *           Value is embedded in UP.execute() payload. No msg.value needed.
 * - 'eoa':  EVM chains - EOA → wallet.sendTransaction({ to, data, value })
 *           ETH transfers use the value parameter.
 */
export const CHAINS = {
  lukso: {
    chainId: 42,
    name: 'LUKSO',
    rpcUrl: 'https://rpc.mainnet.lukso.network',
    relayerUrl: 'https://relayer.mainnet.lukso.network/api',
    explorerUrl: 'https://explorer.execution.mainnet.lukso.network',
    supportsRelay: true,
    executionModel: 'lsp6',
    nativeCurrency: 'LYX',
  },
  luksoTestnet: {
    chainId: 4201,
    name: 'LUKSO Testnet',
    rpcUrl: 'https://rpc.testnet.lukso.network',
    relayerUrl: 'https://relayer.testnet.lukso.network/api',
    explorerUrl: 'https://explorer.execution.testnet.lukso.network',
    supportsRelay: true,
    executionModel: 'lsp6',
    nativeCurrency: 'LYXt',
  },
  base: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    relayerUrl: null,
    explorerUrl: 'https://basescan.org',
    supportsRelay: false,
    executionModel: 'eoa',
    nativeCurrency: 'ETH',
  },
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    relayerUrl: null,
    explorerUrl: 'https://etherscan.io',
    supportsRelay: false,
    executionModel: 'eoa',
    nativeCurrency: 'ETH',
  },
};

// ═══════════════════════════════════════════════════════════
// CONTRACTS
// ═══════════════════════════════════════════════════════════
/**
 * Main contract addresses
 */
export const CONTRACTS = {
  LSP26: '0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA',
  UNIVERSAL_TRUST_REGISTRY: '0x16505FeC789F4553Ea88d812711A0E913D926ADD',
  SKILLS_REGISTRY: '0x64B3AeCE25B73ecF3b9d53dA84948a9dE987F4F6',
};

// ═══════════════════════════════════════════════════════════
// ABIS
// ═══════════════════════════════════════════════════════════
/**
 * Contract ABI definitions
 * 
 * Includes:
 * - LSP standards (LSP0, LSP6, LSP7, LSP26)
 * - ERC standards (ERC20, ERC721, ERC725Y)
 * - Custom contracts (UniversalTrustRegistry)
 */
export const ABIS = {
  // LSP0 - Universal Profile
  LSP0: [
    'function owner() view returns (address)',
    'function execute(uint256 operation, address target, uint256 value, bytes data) payable returns (bytes)',
    'function getData(bytes32 dataKey) view returns (bytes)',
    'function setData(bytes32 dataKey, bytes value) returns (bool)',
  ],
  // LSP6 - KeyManager
  LSP6: [
    'function getNonce(address, uint128) view returns (uint256)',
    'function target() view returns (address)',
    'function execute(bytes calldata payload) external payable returns (bytes)',
  ],
  // ERC20 - Fungible Token (EVM standard)
  ERC20: [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
  ],
  // ERC721 - Non-Fungible Token (EVM standard)
  ERC721: [
    'function transferFrom(address from, address to, uint256 tokenId)',
    'function safeTransferFrom(address from, address to, uint256 tokenId)',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function approve(address to, uint256 tokenId)',
  ],
  // LSP7 - Digital Asset (Fungible Token)
  LSP7: [
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function balanceOf(address account) view returns (uint256)',
    'function transfer(address from, address to, uint256 amount, bool force, bytes data) external',
  ],
  // LSP26 - FollowerSystem
  LSP26: [
    'function isFollowing(address follower, address followee) view returns (bool)',
    'function follow(address followee) external',
    'function unfollow(address followee) external',
    'function followBatch(address[] calldata followees) external',
    'function unfollowBatch(address[] calldata followees) external',
  ],
  // ERC725Y - Universal Profile Storage
  ERC725Y: [
    'function getData(bytes32 dataKey) view returns (bytes)',
    'function setData(bytes32 dataKey, bytes value) returns (bool)',
    'function getDataBatch(bytes32[] dataKeys) view returns (bytes[])',
    'function setDataBatch(bytes32[] dataKeys, bytes[] values) returns (bool)',
  ],
  // Universal Trust Registry
  UniversalTrustRegistry: [
    'function register(string name, string description, string metadataURI) external',
    'function isRegistered(address agent) view returns (bool)',
    'function endorse(address endorsed, string reason) external',
    'function verify(address agent) view returns (bool registered, bool active, bool isUP, uint256 reputation, uint256 endorsements, uint256 trustScore, string name)',
    'function getSkillKeys(address agent) view returns (bytes32[] memory)',
    'function publishSkill(bytes32 skillKey, string name, string content) external',
    // Skill read functions (AgentSkillsRegistry)
    'function getSkill(address agent, bytes32 skillKey) view returns (tuple(string name, string content, uint16 version, uint64 updatedAt) skill)',
    'function getAllSkills(address agent) view returns (tuple(string name, string content, uint16 version, uint64 updatedAt)[] skills, bytes32[] keys)',
    'function hasSkill(address agent, bytes32 skillKey) view returns (bool)',
    'function getSkillCount(address agent) view returns (uint256)',
    'function skillKeyFor(string calldata name) pure returns (bytes32)',
  ],
};

// ═══════════════════════════════════════════════════════════
// DATA KEYS
// ═══════════════════════════════════════════════════════════
/**
 * LSP standard data keys (ERC725Y)
 * Reference: https://docs.lukso.tech/standards/
 */
export const DATA_KEYS = {
  LSP3Profile: '0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5',
  'LSP5ReceivedAssets[]': '0x6460ee3c0aac563ccbf76d6e1d07bada78e3a9514e6382b736ed3f478ab7b90b',
  'AddressPermissions[]': '0xdf30dba06db6a30e65354d9a64c609861f089545ca58c6b4dbe31a5f338cb0e3',
  'AddressPermissions:Permissions': '0x4b80742de2bf82acb3630000',
  'AddressPermissions:AllowedCalls': '0x4b80742de2bf393a64c70000',
  'AddressPermissions:AllowedERC725YDataKeys': '0x4b80742de2bf890000',
  LSP28TheGrid: '0x724141d9918ce69e6b8afcf53a91748466086ba2c74b94cab43c649ae2ac23ff',
};

/**
 * LSP4 Digital Certificate data keys
 */
export const LSP4_DATA_KEYS = {
  name: '0xdeba1e292f8ba88238e10ab3c7f88bd4be4fac56cad5194b6ecceaf653468af1',
  symbol: '0x2f0a68ab07768e01943a599e73362a0e17a63a72e94dd2e384d2c1d4db932756',
};

// ═══════════════════════════════════════════════════════════
// LSP6 PERMISSIONS
// ═══════════════════════════════════════════════════════════
/**
 * LSP6 KeyManager permission constants
 * 
 * Each permission is a bit flag. Combine multiple permissions using bitwise OR.
 * Reference: https://docs.lukso.tech/standards/LSP6KeyManager/
 */
export const PERMISSIONS = {
  CHANGEOWNER: '0x0000000000000000000000000000000000000000000000000000000000000001',
  ADDCONTROLLER: '0x0000000000000000000000000000000000000000000000000000000000000002',
  EDITPERMISSIONS: '0x0000000000000000000000000000000000000000000000000000000000000004',
  ADDEXTENSIONS: '0x0000000000000000000000000000000000000000000000000000000000000008',
  CHANGEEXTENSIONS: '0x0000000000000000000000000000000000000000000000000000000000000010',
  ADDUNIVERSALRECEIVERDELEGATE: '0x0000000000000000000000000000000000000000000000000000000000000020',
  CHANGEUNIVERSALRECEIVERDELEGATE: '0x0000000000000000000000000000000000000000000000000000000000000040',
  REENTRANCY: '0x0000000000000000000000000000000000000000000000000000000000000080',
  SUPER_TRANSFERVALUE: '0x0000000000000000000000000000000000000000000000000000000000000100',
  TRANSFERVALUE: '0x0000000000000000000000000000000000000000000000000000000000000200',
  SUPER_CALL: '0x0000000000000000000000000000000000000000000000000000000000000400',
  CALL: '0x0000000000000000000000000000000000000000000000000000000000000800',
  SUPER_STATICCALL: '0x0000000000000000000000000000000000000000000000000000000000001000',
  STATICCALL: '0x0000000000000000000000000000000000000000000000000000000000002000',
  SUPER_DELEGATECALL: '0x0000000000000000000000000000000000000000000000000000000000004000',
  DELEGATECALL: '0x0000000000000000000000000000000000000000000000000000000000008000',
  DEPLOY: '0x0000000000000000000000000000000000000000000000000000000000010000',
  SUPER_SETDATA: '0x0000000000000000000000000000000000000000000000000000000000020000',
  SETDATA: '0x0000000000000000000000000000000000000000000000000000000000040000',
  ENCRYPT: '0x0000000000000000000000000000000000000000000000000000000000080000',
  DECRYPT: '0x0000000000000000000000000000000000000000000000000000000000100000',
  SIGN: '0x0000000000000000000000000000000000000000000000000000000000200000',
  EXECUTE_RELAY_CALL: '0x0000000000000000000000000000000000000000000000000000000000400000',
  ERC4337_PERMISSION: '0x0000000000000000000000000000000000000000000000000000000000800000',
  ALL_PERMISSIONS: '0x0000000000000000000000000000000000000000000000000000000000ffffff',
};

/**
 * Human-readable permission names by bit position
 * Used for displaying permission details to users
 */
export const PERMISSION_NAMES = {
  0: 'CHANGEOWNER',
  1: 'ADDCONTROLLER',
  2: 'EDITPERMISSIONS',
  3: 'ADDEXTENSIONS',
  4: 'CHANGEEXTENSIONS',
  5: 'ADDUNIVERSALRECEIVERDELEGATE',
  6: 'CHANGEUNIVERSALRECEIVERDELEGATE',
  7: 'REENTRANCY',
  8: 'SUPER_TRANSFERVALUE',
  9: 'TRANSFERVALUE',
  10: 'SUPER_CALL',
  11: 'CALL',
  12: 'SUPER_STATICCALL',
  13: 'STATICCALL',
  14: 'SUPER_DELEGATECALL',
  15: 'DELEGATECALL',
  16: 'DEPLOY',
  17: 'SUPER_SETDATA',
  18: 'SETDATA',
  19: 'ENCRYPT',
  20: 'DECRYPT',
  21: 'SIGN',
  22: 'EXECUTE_RELAY_CALL',
  23: 'ERC4337_PERMISSION',
};

// ═══════════════════════════════════════════════════════════
// OTHERS
// ═══════════════════════════════════════════════════════════
/**
 * Forever Moments API base URL
 * Reference: https://www.forevermoments.life/api/agent/v1/
 */
export const API_BASE = 'https://www.forevermoments.life/api/agent/v1';

/**
 * Allowed collection categories for Forever Moments
 */
export const ALLOWED_CATEGORIES = [
  'Animals', 'Art', 'Beauty', 'Best of', 'Cars', 'Comedy', 'Culture',
  'Daily life', 'Drama', 'Earth', 'Education', 'Events', 'Family',
  'Famous', 'Fashion', 'Food & Drink', 'Fitness', 'Games', 'Good times',
  'Health', 'History', 'Humanity', 'Innovation', 'Journalism', 'Love',
  'Music', 'Nature', 'Party', 'Personal', 'Photography', 'Random',
  'Science', 'Society', 'Sport', 'Technology', 'Time capsule',
  'Travel & Adventure'
];

// ═══════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════
/**
 * Default export for backward compatibility
 * All constants are re-exported as a single object
 */
export default {
  RPC_URL,
  CHAIN_ID,
  LSP25_VERSION,
  CONTRACTS,
  ABIS,
  DATA_KEYS,
  LSP4_DATA_KEYS,
  PERMISSIONS,
  PERMISSION_NAMES,
  CHAINS,
  API_BASE,
  ALLOWED_CATEGORIES,
};
