// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "@chainlink/contracts/src/v0.8/Chainlink.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";

contract WeatherInsurance is ReentrancyGuard, AccessControl, ChainlinkClient {
    using Math for uint256;
    using Chainlink for Chainlink.Request;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant INSURANCE_PROVIDER_ROLE = keccak256("INSURANCE_PROVIDER_ROLE");
    bytes32 public constant RISK_ACCESSOR_ROLE = keccak256("RISK_ACCESSOR_ROLE");
    bytes32 public constant CLAIMS_MANAGER_ROLE = keccak256("CLAIMS_MANAGER_ROLE");

    address private oracle;
    bytes32 private jobId;
    uint256 private fee;
    address private linkToken;

    uint256 public providerMinimumStake;
    mapping (address => uint256) public providerStakes;
    mapping (address => bool) public activeProviders;

    error MinimumEthRequired();
    error NotAProvider();

    struct Weather {
        string locationId;
        uint256 threshold;
        WeatherType weatherType;
        bool aboveThreshold;
    }

    enum WeatherType { RAINFALL, TEMPERATURE, WIND}
    enum PolicyStatus { ACTIVE, EXPIRED, CLAIMED, CANCELLED }
    enum ClaimStatus { NONE, PENDING, APPROVED, REJECTED }

    struct Insurance {
        address provider;
        string name;
        string description;
        uint256 minPremium;
        uint256 maxCoverage;
        uint256 minDuration;
        uint256 maxDuration;
        Weather details;
        bool isActive;
        uint256 riskfactor; 
    }

    struct Policy {
        uint256 productId;
        address policyholder;
        address provider;
        uint256 premium;
        uint256 coverage;
        uint256 startDate;
        uint256 endDate;
        PolicyStatus status;
        bytes32 requestId;
        ClaimStatus claimStatus;
        uint256 lastClaimDate;
    }

    struct Claim {
        uint256 policyId;
        uint256 timestamp;
        uint256 amount;
        ClaimStatus status;
        address reviewer;
        string reason;
        uint256 weatherValue;
    }

    uint256 public productCount;
    uint256 public policyCount;
    uint256 public claimCount;

    mapping (uint256 => Insurance) public products;
    mapping (uint256 => Policy) public policies;
    mapping (uint256 => Claim) public claims;
    mapping (bytes32 => uint256) private requestToPolicyId;
    mapping(address => uint256[]) public providerProducts;
    mapping(address => uint256[]) public userPolicies;

    uint256 public platformFeePercentage; // in basis points
    address public feeCollector;

    event ProductCreated(uint256 indexed productId, address indexed provider, string name);
    event ProductUpdated(uint256 indexed productId, address indexed provider);
    event PolicyCreated(uint256 indexed policyId, uint256 indexed productId, address indexed policyholder);
    event PolicyClaimed(uint256 indexed policyId, uint256 claimId, address indexed policyholder, uint256 amount);
    event ClaimSubmitted(uint256 indexed claimId, uint256 indexed policyId, address indexed policyholder);
    event ClaimProcessed(uint256 indexed claimId, ClaimStatus status, address indexed reviewer);
    event WeatherDataRequested(bytes32 indexed requestId, uint256 indexed policyId);
    event WeatherDataReceived(bytes32 indexed requestid, uint256 indexed policyId, uint256 weatherValue);
    event ProviderStaked(address indexed provider, uint256 amount);
    event ProviderUnstaked(address indexed provider, uint256 amount);

    constructor(
        address _linkToken,
        address _oracle,
        bytes32 _jobId,
        uint256 _fee
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        _setChainlinkToken(_linkToken);
        oracle = _oracle;
        jobId = _jobId;
        fee= _fee;
        linkToken = _linkToken;

        platformFeePercentage = 250;  //2.5%
        feeCollector = msg.sender;
        providerMinimumStake = 10 ether;
    }

    function stakeAsProvider() external payable {
        require(msg.value > 0, "Must stake minimum 1 ETH");
        providerStakes[msg.sender] = providerStakes[msg.sender] + msg.value;

        if(providerStakes[msg.sender] >= providerMinimumStake ) {
            _grantRole(INSURANCE_PROVIDER_ROLE, msg.sender);
            activeProviders[msg.sender] = true;
        }

        emit ProviderStaked(msg.sender, msg.value);
    }

    function unstakeAsProvider(uint256 _amount) external nonReentrant {
        require(hasRole(INSURANCE_PROVIDER_ROLE, msg.sender), "Not A Provider");
        require(_amount > 0 && _amount <= providerStakes[msg.sender], "Invalid Amount");

        bool hasActivePolicy = false;

        for (uint256 i = 0; i < providerProducts[msg.sender].length; i++) {
            uint256 prodId = providerProducts[msg.sender][i];
            if(products[prodId].isActive) {
                hasActivePolicy = true;
                break;
            }
        }

        require(!hasActivePolicy, "Cannot Unstake with active policies!!!");

        providerStakes[msg.sender] = providerStakes[msg.sender] - (_amount);

        if (providerStakes[msg.sender] < providerMinimumStake) {
            _revokeRole(INSURANCE_PROVIDER_ROLE, msg.sender);
            activeProviders[msg.sender] = false;
        }

        payable(msg.sender).transfer(_amount);

        emit ProviderUnstaked(msg.sender, _amount);
    }

    function createInsuranceProduct (
        string memory _name,
        string memory _description,
        uint256 _minPremium,
        uint256 _maxCoverage,
        uint256 _minDuration,
        uint256 _maxDuration,
        string memory _locationId,
        uint256 _threshold,
        WeatherType _weatherType,
        bool _aboveThreshold
    ) external {
        require(hasRole(INSURANCE_PROVIDER_ROLE, msg.sender), "Not A Provider");
        require(activeProviders[msg.sender], "Provider Not Active");
        require(_minPremium > 0, "Premium must be above zero");
        require(_maxCoverage > _minPremium, "Max coverage must exceed Premium");
        require(_minDuration > 0, "Duration cannot be zero");
        require(_maxDuration >= _minDuration, "Total duration cannot be less than minimum duration");

        uint256 productId = productCount++;

        products[productId] = Insurance({
            provider : msg.sender,
            name : _name,
            description : _description,
            minPremium : _minPremium,
            maxCoverage : _maxCoverage,
            minDuration : _minDuration,
            maxDuration : _maxDuration,
            details : Weather({
                locationId : _locationId,
                threshold : _threshold,
                weatherType : _weatherType,
                aboveThreshold : _aboveThreshold
            }),
            isActive : true,
            riskfactor : 50     // 50% set as default
        });
        providerProducts[msg.sender].push(productId);

        emit ProductCreated(productId, msg.sender, _name);
    }

    function updateInsuranceProduct (
        uint256 _productId,
        bool _isActive,
        uint256 _minPremium,
        uint256 _maxCoverage
    ) external {
        require(_productId < productCount, "Product Does Not Exist");
        Insurance storage product = products[_productId];

        require(product.provider == msg.sender || hasRole (ADMIN_ROLE, msg.sender), "Unauthorized");
        require(_minPremium > 0, "There should be a minimum premium");
        require(_maxCoverage > _minPremium, "Maximum coverage to be greater than minimum premium");

        product.isActive = _isActive;
        product.minPremium = _minPremium;
        product.maxCoverage = _maxCoverage;

        emit ProductUpdated(_productId, msg.sender);
    }

    function updateRisk(uint256 _productId, uint256 _riskFactor) external {
        require(hasRole(RISK_ACCESSOR_ROLE, msg.sender), "Not Authorized. Only Risk Assessor Allowed!!!");
        require(_productId < productCount, "Product Does not exist");
        require(_riskFactor > 0 && _riskFactor <= 100, "Invalid Risk Factor");

        products[_productId].riskfactor = _riskFactor;

        emit ProductUpdated(_productId, products[_productId].provider);
    }

    function purchasePolicy(
        uint256 _productId,
        uint256 _duration
    ) external payable nonReentrant {
        require(_productId < productCount, "Product doesnot exist");
        Insurance storage product = products[_productId];

        require(product.isActive, "Product Not Active");
        require(msg.value >= product.minPremium, "Premium Too Low");
        require(msg.value <= product.maxCoverage, "Premium exceeds maximum coverage");
        require(_duration >= product.minDuration, "Duration too short");
        require(_duration <= product.maxDuration, "Duration too long");

        uint256 coverageMultiplier = (100 - product.riskfactor) / 10;
        uint256 coverage = msg.value * coverageMultiplier;

        if(coverage > product.maxCoverage) {
            coverage = product.maxCoverage;
        }

        require(providerStakes[product.provider] >= coverage, "Provider Stake low to payout coverage");

        uint256 platformFee = (msg.value * platformFeePercentage) / 10000;
        uint256 providerAmount = msg.value - platformFee;

        payable(feeCollector).transfer(platformFee);

        uint256 policyId = policyCount++;
        policies[policyId] = Policy({
            productId : _productId,
            policyholder : msg.sender,
            provider : product.provider,
            premium : msg.value,
            coverage : coverage,
            startDate : block.timestamp,
            endDate : block.timestamp + _duration,
            status : PolicyStatus.ACTIVE,
            requestId : bytes32(0),
            claimStatus: ClaimStatus.NONE,
            lastClaimDate : 0
        });

        userPolicies[msg.sender].push(policyId);

        providerStakes[product.provider] += (providerAmount);

        emit PolicyCreated(policyId, _productId, msg.sender);
    }


    function cancelPolicy(uint256 _policyId) external {
        require(_policyId < policyCount, "Policy does not exist");
        Policy storage policy = policies[_policyId];

        require(policy.policyholder == msg.sender, "Not PolicyHolder");
        require(policy.status == PolicyStatus.ACTIVE, "Policy not active");

        uint256 totalDuration = policy.endDate - policy.startDate;
        uint256 remainingTime = 0;

        if(block.timestamp < policy.endDate){
            remainingTime = policy.endDate - block.timestamp;
        }

        uint256 refundPercentage = remainingTime * 100 / totalDuration;
        uint256 refundAmount = (policy.premium * refundPercentage / 100) * 75/100;        //75% of premium

        policy.status = PolicyStatus.CANCELLED;
        payable(policy.policyholder).transfer(refundAmount);
    }

    function renewPolicy(uint256 _policyId) external payable {
        require(_policyId < policyCount, "Policy does Not Exist");
        Policy storage policy = policies[_policyId];

        require(policy.policyholder == msg.sender, "Not the policy holder");
        require(policy.status == PolicyStatus.ACTIVE || policy.status == PolicyStatus.EXPIRED, "Policy Cannot be renewd");
        require(block.timestamp >= policy.endDate, "Policy not yet expired");
        require(msg.value >= policy.premium, "Insufficient Amount");

        Insurance storage product = products[policy.productId];
        require(product.isActive, "Product is not active");

        uint256 duration = policy.endDate - policy.startDate;
        uint256 platformFee = msg.value * platformFeePercentage / 10000;
        uint256 providerAmount = msg.value - platformFee;

        payable(feeCollector).transfer(platformFee);

        policy.premium = msg.value;
        policy.startDate = block.timestamp;
        policy.endDate = block.timestamp + duration;
        policy.status = PolicyStatus.ACTIVE;
        policy.claimStatus = ClaimStatus.NONE;
        policy.lastClaimDate = 0;

        providerStakes[policy.provider] += providerAmount;
    }

    function submitClaim(uint256 _policyId) external {
        require(_policyId < policyCount, "Policy Does Not Exist");
        Policy storage policy = policies[_policyId];

        require(policy.policyholder == msg.sender, "Not the policy holder");
        
        require(policy.startDate <= block.timestamp, "Policy not started");
        require(policy.endDate > block.timestamp, "Policy Expired");
        require(policy.status == PolicyStatus.ACTIVE, "Policy not active");

        uint256 claimId = claimCount++;
        claims[claimId] = Claim({
            policyId : _policyId,
            timestamp : block.timestamp,
            amount : 0,
            status : ClaimStatus.PENDING,
            reviewer : address(0),
            reason : "",
            weatherValue : 0 
        });

        policy.claimStatus = ClaimStatus.PENDING;

        requestWeatherData(_policyId, claimId);

        emit ClaimSubmitted(claimId, _policyId, msg.sender);
    }

    function requestWeatherData(uint256 _policyId, uint256 _claimId) internal {
        Policy storage policy = policies[_policyId];
        Insurance storage product = products[policy.productId];

        Chainlink.Request memory req = _buildChainlinkRequest(
            jobId,
            address(this),
            this.fetchWeatherData.selector
        );

        string memory condition;

        if(product.details.weatherType == WeatherType.RAINFALL) { condition = "rainfall"; }
        else if(product.details.weatherType == WeatherType.TEMPERATURE) { condition = "temperature"; }
        else if(product.details.weatherType == WeatherType.WIND) { condition = "wind"; }

        req._add("locationId", product.details.locationId); 
        req._add("condition", condition); 
        req._add("timestamp", uint2str(block.timestamp)); 

        bytes32 requestId = _sendChainlinkRequestTo(oracle, req, fee);

        policy.requestId = requestId;
        requestToPolicyId[requestId] = _policyId;

        emit WeatherDataRequested(requestId, _policyId);
    }

    function fetchWeatherData(bytes32 _requestId, uint256 _weatherValue) external recordChainlinkFulfillment(_requestId) {
        uint256 policyId = requestToPolicyId[_requestId];
        Policy storage policy = policies[policyId];

        require(policy.status == PolicyStatus.ACTIVE, "Policy Not Active");
        require(policy.claimStatus == ClaimStatus.PENDING, "No pending claims");

        Insurance storage product = products[policy.productId];

        emit WeatherDataReceived(_requestId, policyId, _weatherValue);

        uint256 claimId;
        bool found = false;
        for(uint256 i = 0; i < claimCount; i++){
            if(claims[i].policyId == policyId && claims[i].status == ClaimStatus.PENDING){
                claimId = i;
                found = true;
                break;
            }
        }
        require(found, "Pending claim not found");

        claims[claimId].weatherValue = _weatherValue;

        bool thresholdConditionMet = product.details.aboveThreshold ? 
            _weatherValue >= product.details.threshold :
            _weatherValue <= product.details.threshold;

        if(thresholdConditionMet) {
            uint256 payoutAmount = policy.coverage;

            require(providerStakes[policy.provider] >= payoutAmount, "Insufficient provider stake");
        
            claims[claimId].amount = payoutAmount;
            claims[claimId].status = ClaimStatus.APPROVED;
            claims[claimId].reviewer = address(this);
            claims[claimId].reason = "Weather Threshold Condition Met";

            policy.claimStatus = ClaimStatus.APPROVED;
            policy.lastClaimDate = block.timestamp;

            providerStakes[policy.provider] -= payoutAmount;

            payable(policy.policyholder).transfer(payoutAmount);

            emit ClaimProcessed(claimId, ClaimStatus.APPROVED, address(this));
            emit PolicyClaimed(policyId, claimId, policy.policyholder, payoutAmount);
        } else {
            claims[claimId].status = ClaimStatus.REJECTED;
            claims[claimId].reviewer = address(this);
            claims[claimId].reason = "Weather Threshold Conditions Not Met";

            policy.claimStatus = ClaimStatus.REJECTED;

            emit ClaimProcessed(claimId, ClaimStatus.REJECTED, address(this));
        }
    }

    function updateOracleParameters(address _oracle, bytes32 _jobId, uint256 _fee) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not Admin");

        oracle = _oracle;
        jobId = _jobId;
        fee = _fee;
    }

    function updatePlatformFee(uint256 _feePercentage, address _feeCollector) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not Admin");
        require(_feePercentage <=1000, "Fee too high");     // max 10% fee only
        require(_feeCollector != address(0), "invalid Address");

        platformFeePercentage = _feePercentage;
        feeCollector = _feeCollector;
    }

    function updateProviderMinimumStake(uint256 _minimumStake) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not Admin");
        require(_minimumStake > 0, "Minimum must be above 0 ETH");

        providerMinimumStake = _minimumStake;
    }

    function withdrawLink(uint256 _amount) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not admin");

        IERC20 link = IERC20(linkToken);
        uint256 balance = link.balanceOf(address(this));
        require(_amount <= balance, "Insufficient LINK token balance");

        bool success = link.transfer(msg.sender, _amount);
        require(success, "Transfer Failed");
    }

    function getProviderProducts(address _provider) external view returns (uint256[] memory) {
        return providerProducts[_provider];
    }

    function getUserPolicy(address _user) external view returns (uint256[] memory) {
        return userPolicies[_user];
    }

    function getProductDetails(uint256 _productId) external view returns (
        address provider,
        string memory name,
        string memory description,
        uint256 minPremium,
        uint256 maxCoverage,
        uint256 minDuration,
        uint256 maxDuration,
        string memory locationId,
        uint256 threshold,
        WeatherType weatherType,
        bool aboveThreshold,
        bool isActive,
        uint256 riskfactor
    ) {
        require(_productId < productCount, "Product Does not Exist");
        Insurance storage product = products[_productId];

        return (
            product.provider,
            product.name,
            product.description,
            product.minPremium,
            product.maxCoverage,
            product.minDuration,
            product.maxDuration,
            product.details.locationId,
            product.details.threshold,
            product.details.weatherType,
            product.details.aboveThreshold,
            product.isActive,
            product.riskfactor
        ); 
    }

    function getPolicyDetails(uint256 _policyId) external view returns (
        uint256 productId,
        address policyholder,
        address provider,
        uint256 premium,
        uint256 coverage,
        uint256 startDate,
        uint256 endDate,
        PolicyStatus status,
        ClaimStatus claimStatus,
        uint256 lastClaimDate
    ) {
        require(_policyId < policyCount, "Policy does not exist");
        Policy storage policy = policies[_policyId];

        return (
            policy.productId,
            policy.policyholder,
            policy.provider,
            policy.premium,
            policy.coverage,
            policy.startDate,
            policy.endDate,
            policy.status,
            policy.claimStatus,
            policy.lastClaimDate
        );
    }

    function getClaimDetails(uint256 _claimId) external view returns (
        uint256 policyId,
        uint256 timestamp,
        uint256 amount,
        ClaimStatus status,
        address reviewer,
        string memory reason,
        uint256 weatherValue
    ) {
        require(_claimId < claimCount, "Claim does not exist");
        Claim storage claim = claims[_claimId];
        
        return (
            claim.policyId,
            claim.timestamp,
            claim.amount,
            claim.status,
            claim.reviewer,
            claim.reason,
            claim.weatherValue
        );
    }

    function uint2str(uint256 _i) public pure returns (string memory) {
        return Strings.toString(_i);
    }
    
    receive() external payable {}       //fallback fn
}