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

/// @title WeatherSure - Weather Based Insurance Smart Contract
/// @author Spericorn 
/// @notice This contract provides parametric weather insurance using Chainlink oracles
/// @dev Implements role-based access control and Chainlink integration for weather data

contract WeatherInsurance is ReentrancyGuard, AccessControl, ChainlinkClient {
    using Math for uint256;
    using Chainlink for Chainlink.Request;

    /// @notice Role for administrative operations
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    /// @notice Role for insurance providers who offer products
    bytes32 public constant INSURANCE_PROVIDER_ROLE = keccak256("INSURANCE_PROVIDER_ROLE");
    /// @notice Role for risk assessors who evaluate product risk factors
    bytes32 public constant RISK_ACCESSOR_ROLE = keccak256("RISK_ACCESSOR_ROLE");
    /// @notice Role for claims managers who process insurance claims
    bytes32 public constant CLAIMS_MANAGER_ROLE = keccak256("CLAIMS_MANAGER_ROLE");


    /// @dev Chainlink oracle address
    address private oracle;
    /// @dev Chainlink job ID for weather data requests
    bytes32 private jobId;
    /// @dev Fee required for Chainlink oracle requests
    uint256 private fee;
    /// @dev Chainlink LINK token address
    address private linkToken;


    /// @notice Minimum stake required for providers to offer insurance products
    uint256 public providerMinimumStake;
    /// @notice Mapping of provider address to their staked amount
    mapping (address => uint256) public providerStakes;
    /// @notice Mapping of provider address to their active status
    mapping (address => bool) public activeProviders;


    /// @notice Structure defining weather conditions for an insurance product
    /// @dev Used to determine claim eligibility based on weather data
    struct Weather {
        string locationId;
        uint256 threshold;
        WeatherType weatherType;
        bool aboveThreshold;
    }

    /// @notice Types of weather conditions that can be insurance against
    enum WeatherType { RAINFALL, TEMPERATURE, WIND}
    /// @notice Possible states of an insurance policy
    enum PolicyStatus { ACTIVE, EXPIRED, CLAIMED, CANCELLED }
    /// @notice Possible states for a claim
    enum ClaimStatus { NONE, PENDING, APPROVED, REJECTED }

    /// @notice Structure containing insurance product details
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

    /// @notice Structure containing individual policy details
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

    /// @notice Structure containing claim details
    struct Claim {
        uint256 policyId;
        uint256 timestamp;
        uint256 amount;
        ClaimStatus status;
        address reviewer;
        string reason;
        uint256 weatherValue;
    }

    /// @notice Total number of insurance products created
    uint256 public productCount;
    /// @notice Total number of policies created
    uint256 public policyCount;
    /// @notice Total number of claims submitted
    uint256 public claimCount;

    /// @notice Mapping of product ID to insurance product details
    mapping (uint256 => Insurance) public products;
    /// @notice Mapping of policy ID to policy details
    mapping (uint256 => Policy) public policies;
    /// @notice Mapping of claim ID to claim details
    mapping (uint256 => Claim) public claims;
     /// @notice Mapping of Chainlink request ID to policy ID
    mapping (bytes32 => uint256) private requestToPolicyId;
    /// @notice Mapping of provider address to their product IDs
    mapping(address => uint256[]) public providerProducts;
    /// @notice Mapping of user address to their policy IDs
    mapping(address => uint256[]) public userPolicies;


    /// @notice Platform fee percentage in basis points
    uint256 public platformFeePercentage; // in basis points (10000 = 100%)
    /// @notice Address that collects platform fees
    address public feeCollector;

    /// @notice Emitted when a new insurance product is created
    /// @param productId ID of the created product
    /// @param provider Address of the insurance provider
    /// @param name Name of the insurance product
    event ProductCreated(uint256 indexed productId, address indexed provider, string name);

    /// @notice Emitted when an insurance product is updated
    /// @param productId ID of the updated product
    /// @param provider Address of the insurance provider
    event ProductUpdated(uint256 indexed productId, address indexed provider);

    /// @notice Emitted when a new policy is purchased
    /// @param policyId ID of the created policy
    /// @param productId ID of the product the policy is based on
    /// @param policyholder Address of the policyholder
    event PolicyCreated(uint256 indexed policyId, uint256 indexed productId, address indexed policyholder);

    /// @notice Emitted when a policy claim is approved and paid
    /// @param policyId ID of the claimed policy
    /// @param claimId ID of the approved claim
    /// @param policyholder Address of the policyholder receiving the claim
    /// @param amount Amount paid for the claim
    event PolicyClaimed(uint256 indexed policyId, uint256 claimId, address indexed policyholder, uint256 amount);

    /// @notice Emitted when a new claim is submitted
    /// @param claimId ID of the submitted claim
    /// @param policyId ID of the policy being claimed
    /// @param policyholder Address of the policyholder submitting the claim
    event ClaimSubmitted(uint256 indexed claimId, uint256 indexed policyId, address indexed policyholder);

    /// @notice Emitted when a claim is processed (approved or rejected)
    /// @param claimId ID of the processed claim
    /// @param status Final status of the claim
    /// @param reviewer Address of the entity that reviewed the claim
    event ClaimProcessed(uint256 indexed claimId, ClaimStatus status, address indexed reviewer);

    /// @notice Emitted when weather data is requested from Chainlink
    /// @param requestId Chainlink request ID
    /// @param policyId ID of the policy the request is for
    event WeatherDataRequested(bytes32 indexed requestId, uint256 indexed policyId);

    /// @notice Emitted when weather data is received from Chainlink
    /// @param requestid Chainlink request ID
    /// @param policyId ID of the policy the data is for
    /// @param weatherValue Weather value received from oracle
    event WeatherDataReceived(bytes32 indexed requestid, uint256 indexed policyId, uint256 weatherValue);

    /// @notice Emitted when a provider stakes ETH
    /// @param provider Address of the provider staking
    /// @param amount Amount of ETH staked
    event ProviderStaked(address indexed provider, uint256 amount);

    /// @notice Emitted when a provider unstakes ETH
    /// @param provider Address of the provider unstaking
    /// @param amount Amount of ETH unstaked
    event ProviderUnstaked(address indexed provider, uint256 amount);

    /// @notice Initializes the weather insurance contract
    /// @param _linkToken Address of the LINK token
    /// @param _oracle Address of the Chainlink oracle
    /// @param _jobId Job ID for the Chainlink oracle
    /// @param _fee Fee in LINK tokens required for oracle requests
    /// @dev Sets up roles, Chainlink integration, and platform parameters
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

        platformFeePercentage = 2500;  //2.5%
        feeCollector = msg.sender;
        providerMinimumStake = 10 ether;
    }

    /// @notice Allows an address to stake ETH and become an insurance provider
    /// @dev If stake meets minimum requirement, grants provider role
    function stakeAsProvider() external payable {
        require(msg.value > 0, "Must stake minimum 1 ETH");
        providerStakes[msg.sender] = providerStakes[msg.sender] + msg.value;

        if(providerStakes[msg.sender] >= providerMinimumStake ) {
            _grantRole(INSURANCE_PROVIDER_ROLE, msg.sender);
            activeProviders[msg.sender] = true;
        }

        emit ProviderStaked(msg.sender, msg.value);
    }

    /// @notice Allows a provider to unstake ETH if they have no active policies
    /// @param _amount Amount of ETH to unstake
    /// @dev If remaining stake falls below minimum, revokes provider role
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

    /// @notice Creates a new insurance product offering
    /// @param _name Name of the insurance product
    /// @param _description Description of the product
    /// @param _minPremium Minimum premium required
    /// @param _maxCoverage Maximum coverage offered
    /// @param _minDuration Minimum policy duration in seconds
    /// @param _maxDuration Maximum policy duration in seconds
    /// @param _locationId Geographic identifier for weather data
    /// @param _threshold Weather threshold value for claim eligibility
    /// @param _weatherType Type of weather condition being insured
    /// @param _aboveThreshold Whether claims trigger above or below threshold
    /// @dev Only active providers can create products
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
            riskfactor : 5000     // 50% set as default
        });
        providerProducts[msg.sender].push(productId);

        emit ProductCreated(productId, msg.sender, _name);
    }

    /// @notice Updates an existing insurance product
    /// @param _productId ID of the product to update
    /// @param _isActive Whether the product should be active
    /// @param _minPremium New minimum premium
    /// @param _maxCoverage New maximum coverage
    /// @dev Only the product provider or an admin can update a product
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

    /// @notice Updates the risk factor of an insurance product
    /// @param _productId ID of the product to update
    /// @param _riskFactor New Risk Factor (1-100%)
    /// @dev Only addresses with RISK_ACCESSOR_ROLE can update risk factors
    function updateRisk(uint256 _productId, uint256 _riskFactor) external {
        require(hasRole(RISK_ACCESSOR_ROLE, msg.sender), "Not Authorized. Only Risk Assessor Allowed!!!");
        require(_productId < productCount, "Product Does not exist");
        require(_riskFactor > 0 && _riskFactor <= 10000, "Invalid Risk Factor");

        products[_productId].riskfactor = _riskFactor;

        emit ProductUpdated(_productId, products[_productId].provider);
    }

    /// @notice Allows a user to purchase an insurance policy
    /// @param _productId ID of the product to purchase
    /// @param _duration Duration of the policy in seconds
    /// @dev Premium is sent as msg.value, coverage calculated based on risk factor
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

        uint256 coverageMultiplier = (10000 - product.riskfactor) / 1000;
        uint256 coverage = msg.value * coverageMultiplier;

        if(coverage > product.maxCoverage) {
            coverage = product.maxCoverage;
        }

        require(providerStakes[product.provider] >= coverage, "Provider Stake low to payout coverage");

        uint256 platformFee = (msg.value * platformFeePercentage) / 1000000;
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

    /// @notice Allows a policyholder to cancel their policy
    /// @param _policyId ID of the policy to cancel
    /// @dev Calculates refund based on remaining time, returns 75% of proportional premium
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

        uint256 refundPercentage = remainingTime * 10000 / totalDuration;
        uint256 refundAmount = (policy.premium * refundPercentage / 10000) * 7500/10000; //75% of premium

        policy.status = PolicyStatus.CANCELLED;
        payable(policy.policyholder).transfer(refundAmount);
    }

    /// @notice Allows a policyholder to renew an expired policy
    /// @param _policyId ID of the policy to renew
    /// @dev Premium is sent as msg.value, maintains same duration as original policy
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
        uint256 platformFee = msg.value * platformFeePercentage / 1000000;
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

    /// @notice Allows a policyholder to submit a claim
    /// @param _policyId ID of the policy to claim
    /// @dev Initiates a Chainlink oracle request for weather data
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

    /// @notice Requests weather data from Chainlink oracle
    /// @param _policyId ID of the policy to get weather data for
    /// @param _claimId ID of the claim being processed
    /// @dev Internal function called by submitClaim
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

    /// @notice Callback function for Chainlink oracle to deliver weather data
    /// @param _requestId ID of the Chainlink request
    /// @param _weatherValue Weather data value returned by oracle
    /// @dev Processes claim approval/rejection based on weather threshold conditions
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

    /// @notice Updates Chainlink oracle parameters
    /// @param _oracle New oracle address
    /// @param _jobId New job ID
    /// @param _fee New fee amount
    /// @dev Only addresses with ADMIN_ROLE can update
    function updateOracleParameters(address _oracle, bytes32 _jobId, uint256 _fee) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not Admin");

        oracle = _oracle;
        jobId = _jobId;
        fee = _fee;
    }

    /// @notice Updates platform fee parameters
    /// @param _feePercentage New fee percentage in basis points (max 10%)
    /// @param _feeCollector New fee collector address
    /// @dev Only addresses with ADMIN_ROLE can update
    function updatePlatformFee(uint256 _feePercentage, address _feeCollector) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not Admin");
        require(_feePercentage <=100000, "Fee too high");     // max 10% fee only
        require(_feeCollector != address(0), "invalid Address");

        platformFeePercentage = _feePercentage;
        feeCollector = _feeCollector;
    }

    /// @notice Updates minimum stake required for providers
    /// @param _minimumStake New minimum stake amount
    /// @dev Only addresses with ADMIN_ROLE can update
    function updateProviderMinimumStake(uint256 _minimumStake) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not Admin");
        require(_minimumStake > 0, "Minimum must be above 0 ETH");

        providerMinimumStake = _minimumStake;
    }

    /// @notice Allows admin to withdraw LINK tokens from the contract
    /// @param _amount Amount of LINK to withdraw
    /// @dev Only addresses with ADMIN_ROLE can withdraw
    function withdrawLink(uint256 _amount) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not admin");

        IERC20 link = IERC20(linkToken);
        uint256 balance = link.balanceOf(address(this));
        require(_amount <= balance, "Insufficient LINK token balance");

        bool success = link.transfer(msg.sender, _amount);
        require(success, "Transfer Failed");
    }

    /// @notice Gets all product IDs created by a specific provider
    /// @param _provider Address of the provider
    /// @return Array of product IDs
    function getProviderProducts(address _provider) external view returns (uint256[] memory) {
        return providerProducts[_provider];
    }

    /// @notice Gets all policy IDs owned by a specific user
    /// @param _user Address of the user
    /// @return Array of policy IDs
    function getUserPolicy(address _user) external view returns (uint256[] memory) {
        return userPolicies[_user];
    }

    /// @notice Gets detailed information about an insurance product
    /// @param _productId ID of the product
    /// @return provider Address of the insurance provider
    /// @return name Name of the product
    /// @return description Description of the product
    /// @return minPremium Minimum premium required
    /// @return maxCoverage Maximum coverage offered
    /// @return minDuration Minimum policy duration
    /// @return maxDuration Maximum policy duration
    /// @return locationId Geographic identifier for weather data
    /// @return threshold Weather threshold value
    /// @return weatherType Type of weather condition
    /// @return aboveThreshold Whether claims trigger above or below threshold
    /// @return isActive Whether the product is active
    /// @return riskfactor Risk factor (1-100)
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

    /// @notice Gets detailed information about a policy
    /// @param _policyId ID of the policy
    /// @return productId ID of the product the policy is based on
    /// @return policyholder Address of the policyholder
    /// @return provider Address of the insurance provider
    /// @return premium Premium paid for the policy
    /// @return coverage Coverage amount of the policy
    /// @return startDate Start timestamp of the policy
    /// @return endDate End timestamp of the policy
    /// @return status Current status of the policy
    /// @return claimStatus Current claim status
    /// @return lastClaimDate Timestamp of the last claim
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

    /// @notice Gets detailed information about a claim
    /// @param _claimId ID of the claim
    /// @return policyId ID of the policy being claimed
    /// @return timestamp Timestamp when the claim was submitted
    /// @return amount Amount approved for the claim (0 if not approved)
    /// @return status Current status of the claim
    /// @return reviewer Address of the entity that reviewed the claim
    /// @return reason Reason for approval or rejection
    /// @return weatherValue Weather value that determined claim outcome
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

    /// @notice Converts a uint to a string
    /// @param _i Unsigned integer to convert
    /// @return String representation of the integer
    /// @dev Uses OpenZeppelin's Strings library
    function uint2str(uint256 _i) public pure returns (string memory) {
        return Strings.toString(_i);
    }
    
    /// @notice Fallback function to receive ETH
    /// @dev Enables contract to receive ETH payments
    receive() external payable {}       //fallback fn
}