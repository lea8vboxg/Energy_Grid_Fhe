pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EnergyGridFhe is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    bool public batchOpen;

    struct Order {
        address seller;
        address buyer;
        euint32 pricePerKWh;
        euint32 quantityKWh;
        ebool isSellOrder;
    }
    mapping(uint256 => Order) public orders;
    uint256 public orderCount;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event OrderSubmitted(address indexed seller, address indexed buyer, uint256 pricePerKWhCt, uint256 quantityKWhCt, uint256 isSellOrderCt);
    event DecryptionRequested(uint256 indexed requestId, uint256 batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 batchId);

    error NotOwner();
    error NotProvider();
    error PausedState();
    error CooldownActive();
    error BatchNotOpen();
    error InvalidBatchId();
    error ReplayDetected();
    error StateMismatch();
    error InvalidProof();
    error OrderNotFound();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedState();
        _;
    }

    modifier respectCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 60;
        currentBatchId = 1;
        batchOpen = false;
        emit ProviderAdded(owner);
    }

    function transferOwnership(address newOwner) public onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) public onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) public onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function pause() public onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() public onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) public onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch() public onlyOwner whenNotPaused {
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() public onlyOwner whenNotPaused {
        batchOpen = false;
        emit BatchClosed(currentBatchId);
        currentBatchId++;
    }

    function submitOrder(
        address seller,
        address buyer,
        euint32 pricePerKWh,
        euint32 quantityKWh,
        ebool isSellOrder
    ) external onlyProvider whenNotPaused respectCooldown {
        if (!batchOpen) revert BatchNotOpen();
        lastSubmissionTime[msg.sender] = block.timestamp;
        orders[orderCount] = Order(seller, buyer, pricePerKWh, quantityKWh, isSellOrder);
        emit OrderSubmitted(seller, buyer, pricePerKWh.toBytes32(), quantityKWh.toBytes32(), isSellOrder.toBytes32());
        orderCount++;
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded() internal {
        if (!FHE.isInitialized()) {
            FHE.initialize();
        }
    }

    function _requireInitialized() internal view {
        if (!FHE.isInitialized()) {
            revert("FHE not initialized");
        }
    }

    function requestMatching(uint256 orderId1, uint256 orderId2) public onlyProvider whenNotPaused {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (orderId1 >= orderCount || orderId2 >= orderCount) {
            revert OrderNotFound();
        }
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        _initIfNeeded();
        Order storage order1 = orders[orderId1];
        Order storage order2 = orders[orderId2];
        ebool match = order1.isSellOrder.fheXor(order2.isSellOrder);
        ebool priceMatch = order1.pricePerKWh.fheEq(order2.pricePerKWh);
        ebool canTrade = match.fheAnd(priceMatch);
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = canTrade.toBytes32();
        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext(currentBatchId, stateHash, false);
        emit DecryptionRequested(requestId, currentBatchId, stateHash);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) {
            revert ReplayDetected();
        }
        _requireInitialized();
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.asEbool(FHE.asUint32(cleartexts, 0)).toBytes32();
        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }
        try FHE.checkSignatures(requestId, cleartexts, proof) {
            bool canTrade = abi.decode(cleartexts, (bool));
            decryptionContexts[requestId].processed = true;
            emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId);
        } catch {
            revert InvalidProof();
        }
    }
}