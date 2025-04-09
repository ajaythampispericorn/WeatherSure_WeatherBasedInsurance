const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("Weather_Insurance", (m) => {
    // Deploy mock tokens for testing
    const mockLinkToken = m.contract("MockLinkToken");
    const mockOracle = m.contract("MockOracle", [
        m.getContractAddress(mockLinkToken)
    ]);
    
    // Encode the job ID as bytes32 - using the one from tests
    const jobId = ethers.encodeBytes32String("29fa9aa13bf146878");
    // Set the oracle fee
    const fee = ethers.parseEther("0.1");
    
    // Deploy the WeatherInsurance contract
    const weatherInsurance = m.contract("WeatherInsurance", [
        m.getContractAddress(mockLinkToken),
        m.getContractAddress(mockOracle),
        jobId,
        fee
    ]);
    
    // Fund the contract with LINK tokens for Chainlink operations
    m.call(mockLinkToken, "transfer", [
        m.getContractAddress(weatherInsurance),
        ethers.parseEther("10") // 10 LINK tokens
    ]);
    
    // Define role hashes exactly as in the contract
    const RISK_ACCESSOR_ROLE = m.staticCall(weatherInsurance, "RISK_ACCESSOR_ROLE");
    const CLAIMS_MANAGER_ROLE = m.staticCall(weatherInsurance, "CLAIMS_MANAGER_ROLE");
    
    // Set up roles with placeholder addresses - replace with your actual addresses
    const riskAssessorAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; 
    const claimsManagerAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; 
    
    // Grant roles
    m.call(weatherInsurance, "grantRole", [
        RISK_ACCESSOR_ROLE,
        riskAssessorAddress
    ]);
    
    m.call(weatherInsurance, "grantRole", [
        CLAIMS_MANAGER_ROLE,
        claimsManagerAddress
    ]);
    
    // Set up default platform parameters
    m.call(weatherInsurance, "updatePlatformFee", [
        250, // 2.5% fee in basis points
        "0x90F79bf6EB2c4f870365E785982E1f101E93b906" // Fee collector address
    ]);
    
    // Set provider minimum stake
    m.call(weatherInsurance, "updateProviderMinimumStake", [
        ethers.parseEther("10") // 10 ETH minimum stake
    ]);
    
    // Return all deployed contracts
    return { 
        mockLinkToken, 
        mockOracle, 
        weatherInsurance 
    };
});