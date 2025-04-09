import { expect } from "chai";
import hardhat from "hardhat";
const { ethers } = hardhat;
import { AbiCoder } from "ethers";

describe("WeatherInsurance", function () {
  let weatherInsurance;
  let mockLinkToken;
  let mockOracle;
  
  let owner;
  let provider1;
  let provider2;
  let riskAssessor;
  let claimsManager;
  let policyholder1;
  let policyholder2;
  let feeCollector;
  
  let ADMIN_ROLE;
  let INSURANCE_PROVIDER_ROLE;
  let RISK_ACCESSOR_ROLE;
  let CLAIMS_MANAGER_ROLE;
  
  const MIN_PROVIDER_STAKE = ethers.parseEther("10");
  const JOBID = ethers.encodeBytes32String("29fa9aa13bf146878");
  const FEE = ethers.parseEther("0.1");
  
  let productId;
  let policyId;
  
  it("Should deploy contracts and check basic functionality", async function () {
    [owner, provider1, provider2, riskAssessor, claimsManager, policyholder1, policyholder2, feeCollector] = await ethers.getSigners();
    
    // Deploy mock LINK token
    const MockLinkToken = await ethers.getContractFactory("MockLinkToken");
    mockLinkToken = await MockLinkToken.deploy();
    
    // Deploy mock Oracle
    const MockOracle = await ethers.getContractFactory("MockOracle");
    mockOracle = await MockOracle.deploy(await mockLinkToken.getAddress());
    
    // Deploy WeatherInsurance with owner as deployer
    const WeatherInsurance = await ethers.getContractFactory("WeatherInsurance", owner);
    weatherInsurance = await WeatherInsurance.deploy(
      await mockLinkToken.getAddress(),
      await mockOracle.getAddress(),
      JOBID,
      FEE
    );
    
    // Set up roles
    ADMIN_ROLE = await weatherInsurance.ADMIN_ROLE();
    INSURANCE_PROVIDER_ROLE = await weatherInsurance.INSURANCE_PROVIDER_ROLE();
    RISK_ACCESSOR_ROLE = await weatherInsurance.RISK_ACCESSOR_ROLE();
    CLAIMS_MANAGER_ROLE = await weatherInsurance.CLAIMS_MANAGER_ROLE();
    INSURANCE_PROVIDER_ROLE = await weatherInsurance.INSURANCE_PROVIDER_ROLE();

    const hasAdminRole = await weatherInsurance.hasRole(ADMIN_ROLE, owner.address);
    expect(hasAdminRole).to.be.true;
    
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const hasDefaultAdminRole = await weatherInsurance.hasRole(DEFAULT_ADMIN_ROLE, owner.address);
    expect(hasDefaultAdminRole).to.be.true;
    
    expect(await weatherInsurance.platformFeePercentage()).to.equal(250n); // 2.5%
    expect(await weatherInsurance.feeCollector()).to.equal(owner.address);
    expect(await weatherInsurance.providerMinimumStake()).to.equal(MIN_PROVIDER_STAKE);
  });
  
  describe("After successful deployment", function() {
    beforeEach(async function() {
      [owner, provider1, provider2, riskAssessor, claimsManager, policyholder1, policyholder2, feeCollector] = await ethers.getSigners();
      
      const MockLinkToken = await ethers.getContractFactory("MockLinkToken");
      mockLinkToken = await MockLinkToken.deploy();

      const MockOracle = await ethers.getContractFactory("MockOracle");
      mockOracle = await MockOracle.deploy(await mockLinkToken.getAddress());
      
      const WeatherInsurance = await ethers.getContractFactory("WeatherInsurance", owner);
      weatherInsurance = await WeatherInsurance.deploy(
        await mockLinkToken.getAddress(),
        await mockOracle.getAddress(),
        JOBID,
        FEE
      );
      
      ADMIN_ROLE = await weatherInsurance.ADMIN_ROLE();
      INSURANCE_PROVIDER_ROLE = await weatherInsurance.INSURANCE_PROVIDER_ROLE();
      RISK_ACCESSOR_ROLE = await weatherInsurance.RISK_ACCESSOR_ROLE();
      CLAIMS_MANAGER_ROLE = await weatherInsurance.CLAIMS_MANAGER_ROLE();

      await weatherInsurance.connect(owner).grantRole(RISK_ACCESSOR_ROLE, riskAssessor.address);
      await weatherInsurance.connect(owner).grantRole(CLAIMS_MANAGER_ROLE, claimsManager.address);
      
      await mockLinkToken.transfer(await weatherInsurance.getAddress(), ethers.parseEther("10"));

      await weatherInsurance.connect(provider1).stakeAsProvider({ value: MIN_PROVIDER_STAKE });

      await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Weather Insurance",
        "Insurance against heavy rainfall",
        ethers.parseEther("0.1"),
        ethers.parseEther("1"),   
        86400, 
        2592000, 
        "TVM", 
        100, 
        0,
        true // aboveThreshold
      );
      
      productId = 0; // First product
    });
    
    it("Should set the right owner", async function() {
      const hasAdminRole = await weatherInsurance.hasRole(ADMIN_ROLE, owner.address);
      expect(hasAdminRole).to.be.true;
    });
    
    it("Should have correct initial values", async function() {
      expect(await weatherInsurance.platformFeePercentage()).to.equal(250n); // 2.5%
      expect(await weatherInsurance.feeCollector()).to.equal(owner.address);
      expect(await weatherInsurance.providerMinimumStake()).to.equal(MIN_PROVIDER_STAKE);
    });
      
      it("Should have the correct LINK token balance", async function () {
        const balance = await mockLinkToken.balanceOf(await weatherInsurance.getAddress()); // Updated for v6
        expect(balance).to.equal(ethers.parseEther("10"));
      });
    });
  
    describe("Stake As Provider", function () {
      beforeEach(async function () {
        const MockLinkToken = await ethers.getContractFactory("MockLinkToken");
        mockLinkToken = await MockLinkToken.deploy();
        
        const MockOracle = await ethers.getContractFactory("MockOracle");
        mockOracle = await MockOracle.deploy(await mockLinkToken.getAddress());
        
        const WeatherInsurance = await ethers.getContractFactory("WeatherInsurance", owner);
        weatherInsurance = await WeatherInsurance.deploy(
          await mockLinkToken.getAddress(),
          await mockOracle.getAddress(),
          JOBID,
          FEE
        );
      })
      it("Should allow staking ETH", async function () {
        await weatherInsurance.connect(provider2).stakeAsProvider({ value: MIN_PROVIDER_STAKE });
        const stake = await weatherInsurance.providerStakes(provider2.address);
        expect(stake).to.equal(MIN_PROVIDER_STAKE);
      });
      
      it("Should grant INSURANCE_PROVIDER_ROLE when stake meets minimum", async function () {
        await weatherInsurance.connect(provider2).stakeAsProvider({ value: MIN_PROVIDER_STAKE });
        const hasRole = await weatherInsurance.hasRole(INSURANCE_PROVIDER_ROLE, provider2.address);
        expect(hasRole).to.equal(true);
      });
      
      it("Should set provider as active", async function () {
        await weatherInsurance.connect(provider2).stakeAsProvider({ value: MIN_PROVIDER_STAKE });
        const isActive = await weatherInsurance.activeProviders(provider2.address);
        expect(isActive).to.equal(true);
      });
      
      it("Should not grant role if stake is below minimum", async function () {
        await weatherInsurance.connect(provider2).stakeAsProvider({ value: ethers.parseUnits("3") });
        const hasRole = await weatherInsurance.hasRole(INSURANCE_PROVIDER_ROLE, provider2.address);
        expect(hasRole).to.equal(false);
      });
      
      it("Should emit ProviderStaked event", async function () {
        const stakeAmount = ethers.parseUnits("15");
        await expect(weatherInsurance.connect(provider2).stakeAsProvider({ value: stakeAmount }))
          .to.emit(weatherInsurance, "ProviderStaked")
          .withArgs(provider2.address, stakeAmount);
      });
      
      it("Should allow additional staking", async function () {
        await weatherInsurance.connect(provider2).stakeAsProvider({ value: ethers.parseUnits("5") });
        await weatherInsurance.connect(provider2).stakeAsProvider({ value: ethers.parseUnits("6") });
        const stake = await weatherInsurance.providerStakes(provider2.address);
        expect(stake).to.equal(ethers.parseUnits("11"));
      });
    });
    
    describe("Unstake As Provider", function () {
      beforeEach(async function () {
        const MockLinkToken = await ethers.getContractFactory("MockLinkToken");
        mockLinkToken = await MockLinkToken.deploy();
        
        const MockOracle = await ethers.getContractFactory("MockOracle");
        mockOracle = await MockOracle.deploy(await mockLinkToken.getAddress());
        
        const WeatherInsurance = await ethers.getContractFactory("WeatherInsurance", owner);
        weatherInsurance = await WeatherInsurance.deploy(
          await mockLinkToken.getAddress(),
          await mockOracle.getAddress(),
          JOBID,
          FEE
        );
        await weatherInsurance.connect(provider2).stakeAsProvider({ value: ethers.parseUnits("15") });

        await weatherInsurance.connect(provider1).stakeAsProvider({ value: MIN_PROVIDER_STAKE });
      
      await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Weather Insurance",
        "Insurance against heavy rainfall",
        ethers.parseEther("0.1"), 
        ethers.parseEther("1"),  
        86400, 
        2592000, 
        "TVM", 
        100, 
        0, 
        true 
      );
      
      productId = 0; 
      });
      
      it("Should allow unstaking ETH", async function () {
        await weatherInsurance.connect(provider2).unstakeAsProvider(ethers.parseUnits("5"));
        const stake = await weatherInsurance.providerStakes(provider2.address);
        expect(stake).to.equal(ethers.parseUnits("10"));
      });
      
      it("Should revoke role if stake falls below minimum", async function () {
        await weatherInsurance.connect(provider2).unstakeAsProvider(ethers.parseUnits("6"));
        const hasRole = await weatherInsurance.hasRole(INSURANCE_PROVIDER_ROLE, provider2.address);
        expect(hasRole).to.equal(false);
      });
      
      it("Should set provider as inactive if stake falls below minimum", async function () {
        await weatherInsurance.connect(provider2).unstakeAsProvider(ethers.parseUnits("6"));
        const isActive = await weatherInsurance.activeProviders(provider2.address);
        expect(isActive).to.equal(false);
      });
      
      it("Should emit ProviderUnstaked event", async function () {
        const unstakeAmount = ethers.parseUnits("5");
        await expect(weatherInsurance.connect(provider2).unstakeAsProvider(unstakeAmount))
          .to.emit(weatherInsurance, "ProviderUnstaked")
          .withArgs(provider2.address, unstakeAmount);
      });
      
      it("Should fail if not a provider", async function () {
        await expect(weatherInsurance.connect(policyholder1).unstakeAsProvider(ethers.parseUnits("1")))
          .to.be.revertedWith("Not A Provider");
      });
      
      it("Should fail if amount is invalid", async function () {
        await expect(weatherInsurance.connect(provider2).unstakeAsProvider(ethers.parseUnits("20")))
          .to.be.revertedWith("Invalid Amount");
        
        await expect(weatherInsurance.connect(provider2).unstakeAsProvider(0))
          .to.be.revertedWith("Invalid Amount");
      });
      
      it("Should fail if provider has active policies", async function () {
        await weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          86400, // 1 day
          { value: ethers.parseUnits("0.1") }
        );
        
        await expect(weatherInsurance.connect(provider1).unstakeAsProvider(ethers.parseUnits("1")))
          .to.be.revertedWith("Cannot Unstake with active policies!!!");
      });
      
      it("Should transfer ETH to provider", async function () {
        const initialBalance = await ethers.provider.getBalance(provider2.address);
        const tx = await weatherInsurance.connect(provider2).unstakeAsProvider(ethers.parseUnits("5"));
        const receipt = await tx.wait();
        const fullTx = await ethers.provider.getTransaction(tx.hash);
        const gasPrice = fullTx.gasPrice;

        const gasUsed = (receipt.gasUsed) * gasPrice;
        
        const finalBalance = await ethers.provider.getBalance(provider2.address);
        expect(finalBalance).to.equal(
          initialBalance + (ethers.parseUnits("5")) - gasUsed
        );
      });
    });
  
  describe("Insurance Product Management", function () {
    describe("Create Insurance Product", function () {
      it("Should create a new insurance product", async function () {
        await weatherInsurance.connect(provider1).createInsuranceProduct(
          "Temperature Insurance",
          "Insurance against high temperatures",
          ethers.parseUnits("0.2"),
          ethers.parseUnits("2"),
          86400,
          2592000,
          "SFO",
          35,
          1, // WeatherType-TEMPERATURE
          true
        );
        
        const newProductId = 1;
        const product = await weatherInsurance.products(newProductId);
        
        expect(product.provider).to.equal(provider1.address);
        expect(product.name).to.equal("Temperature Insurance");
        expect(product.description).to.equal("Insurance against high temperatures");
        expect(product.minPremium).to.equal(ethers.parseUnits("0.2"));
        expect(product.maxCoverage).to.equal(ethers.parseUnits("2"));
        expect(product.minDuration).to.equal(86400);
        expect(product.maxDuration).to.equal(2592000);
        expect(product.isActive).to.equal(true);
        expect(product.riskfactor).to.equal(50);
      });
      
      it("Should update the provider's product list", async function () {
        await weatherInsurance.connect(provider1).createInsuranceProduct(
          "Wind Insurance",
          "Insurance against strong winds",
          ethers.parseUnits("0.15"),
          ethers.parseUnits("1.5"),
          86400,
          2592000,
          "CLT",
          50,
          2, // WeatherType-WIND
          true
        );
        
        const providerProducts = await weatherInsurance.getProviderProducts(provider1.address);
        expect(providerProducts.length).to.equal(3);
        expect(providerProducts[1]).to.equal(1);
      });
      
      it("Should emit ProductCreated event", async function () {
        await expect(weatherInsurance.connect(provider1).createInsuranceProduct(
          "Test Insurance",
          "Test Description",
          ethers.parseUnits("0.1"),
          ethers.parseUnits("1"),
          86400,
          2592000,
          "TEST",
          10,
          0,
          false
        ))
          .to.emit(weatherInsurance, "ProductCreated")
          .withArgs(3, provider1.address, "Test Insurance");
      });
      
      it("Should fail if not a provider", async function () {
        await expect(
          weatherInsurance.connect(policyholder1).createInsuranceProduct(
            "Test Insurance",
            "Test Description",
            ethers.parseUnits("0.1"),
            ethers.parseUnits("1"),
            86400,
            2592000,
            "TEST",
            10,
            0,
            false
          )
        ).to.be.revertedWith("Not A Provider");
      });
      
      it("Should fail if provider is not active", async function () {
        await weatherInsurance.connect(provider2).stakeAsProvider({ value: ethers.parseUnits("10") });
        await weatherInsurance.connect(provider2).unstakeAsProvider(ethers.parseUnits("11"));

        
        await expect(weatherInsurance.connect(provider2).createInsuranceProduct(
          "Test Insurance",
          "Test Description",
          ethers.parseUnits("0.1"),
          ethers.parseUnits("1"),
          86400,
          2592000,
          "TEST",
          10,
          0,
          false
        ))
          .to.be.revertedWith("Not A Provider");
      });
      
      it("Should fail with invalid parameters", async function () {
        // Min premium <= 0
        await expect(weatherInsurance.connect(provider1).createInsuranceProduct(
          "Test Insurance",
          "Test Description",
          0,
          ethers.parseUnits("1"),
          86400,
          2592000,
          "TEST",
          10,
          0,
          false
        ))
          .to.be.revertedWith("Premium must be above zero");
        
        // Max coverage <= min premium
        await expect(weatherInsurance.connect(provider1).createInsuranceProduct(
          "Test Insurance",
          "Test Description",
          ethers.parseUnits("1"),
          ethers.parseUnits("0.5"),
          86400,
          2592000,
          "TEST",
          10,
          0,
          false
        ))
          .to.be.revertedWith("Max coverage must exceed Premium");
        
        // Min duration <= 0
        await expect(weatherInsurance.connect(provider1).createInsuranceProduct(
          "Test Insurance",
          "Test Description",
          ethers.parseUnits("0.1"),
          ethers.parseUnits("1"),
          0,
          2592000,
          "TEST",
          10,
          0,
          false
        ))
          .to.be.revertedWith("Duration cannot be zero");
        
        // Max duration < min duration
        await expect(weatherInsurance.connect(provider1).createInsuranceProduct(
          "Test Insurance",
          "Test Description",
          ethers.parseUnits("0.1"),
          ethers.parseUnits("1"),
          2592000,
          86400,
          "TEST",
          10,
          0,
          false
        ))
          .to.be.revertedWith("Total duration cannot be less than minimum duration");
      });
    });
    
    describe("Update Insurance Product", function () {
      it("Should update an existing product by provider", async function () {
        await weatherInsurance.connect(provider1).updateInsuranceProduct(
          productId,
          true,
          ethers.parseUnits("0.2"),
          ethers.parseUnits("2")
        );
        
        const product = await weatherInsurance.products(productId);
        expect(product.isActive).to.equal(true);
        expect(product.minPremium).to.equal(ethers.parseUnits("0.2"));
        expect(product.maxCoverage).to.equal(ethers.parseUnits("2"));
      });
      
      it("Should update an existing product by admin", async function () {
        await weatherInsurance.connect(owner).updateInsuranceProduct(
          productId,
          true,
          ethers.parseUnits("0.2"),
          ethers.parseUnits("2")
        );
        
        const product = await weatherInsurance.products(productId);
        expect(product.isActive).to.equal(true);
        expect(product.minPremium).to.equal(ethers.parseUnits("0.2"));
        expect(product.maxCoverage).to.equal(ethers.parseUnits("2"));
      });
      
      it("Should emit ProductUpdated event", async function () {
        await expect(weatherInsurance.connect(provider1).updateInsuranceProduct(
          productId,
          true,
          ethers.parseUnits("0.2"),
          ethers.parseUnits("2")
        ))
          .to.emit(weatherInsurance, "ProductUpdated")
          .withArgs(productId, provider1.address);
      });
      
      it("Should fail if product does not exist", async function () {
        await expect(weatherInsurance.connect(provider1).updateInsuranceProduct(
          99,
          false,
          ethers.parseUnits("0.2"),
          ethers.parseUnits("2")
        ))
          .to.be.revertedWith("Product Does Not Exist");
      });
      
      it("Should fail if not provider or admin", async function () {
        await expect(weatherInsurance.connect(policyholder1).updateInsuranceProduct(
          productId,
          true,
          ethers.parseUnits("0.2"),
          ethers.parseUnits("2")
        ))
          .to.be.revertedWith("Unauthorized");
      });
      
      it("Should fail with invalid parameters", async function () {
        // Min premium <= 0
        await expect(weatherInsurance.connect(provider1).updateInsuranceProduct(
          productId,
          true,
          0,
          ethers.parseUnits("2")
        ))
          .to.be.revertedWith("There should be a minimum premium");
        
        // Max coverage <= min premium
        await expect(weatherInsurance.connect(provider1).updateInsuranceProduct(
          productId,
          true,
          ethers.parseUnits("2"),
          ethers.parseUnits("1")
        ))
          .to.be.revertedWith("Maximum coverage to be greater than minimum premium");
      });
    });
    
    describe("Update Risk", function () {
      let productId;

    beforeEach(async function () {
      await weatherInsurance.connect(provider1).stakeAsProvider({ value: ethers.parseUnits("10") });
      const tx = await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Test Insurance",
        "Test Description",
        ethers.parseUnits("0.1"),
        ethers.parseUnits("1"),
        86400,
        2592000,
        "TEST",
        10,
        0,
        false
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment.name === "ProductCreated");
      productId = event.args.productId;

      ADMIN_ROLE = await weatherInsurance.ADMIN_ROLE();
      INSURANCE_PROVIDER_ROLE = await weatherInsurance.INSURANCE_PROVIDER_ROLE();
      RISK_ACCESSOR_ROLE = await weatherInsurance.RISK_ACCESSOR_ROLE();
      CLAIMS_MANAGER_ROLE = await weatherInsurance.CLAIMS_MANAGER_ROLE();
      
      await weatherInsurance.connect(owner).grantRole(RISK_ACCESSOR_ROLE, riskAssessor.address);
      });
      it("Should update risk factor by risk assessor", async function () {
        await weatherInsurance.connect(riskAssessor).updateRisk(productId, 75);
        
        const product = await weatherInsurance.products(productId);
        expect(product.riskfactor).to.equal(75);
      });
      
      it("Should emit ProductUpdated event", async function () {
        await expect(weatherInsurance.connect(riskAssessor).updateRisk(productId, 75))
          .to.emit(weatherInsurance, "ProductUpdated")
          .withArgs(productId, provider1.address);
      });
      
      it("Should fail if not risk assessor", async function () {
        await expect(weatherInsurance.connect(provider1).updateRisk(productId, 75))
          .to.be.revertedWith("Not Authorized. Only Risk Assessor Allowed!!!");
      });
      
      it("Should fail if product does not exist", async function () {
        await expect(weatherInsurance.connect(riskAssessor).updateRisk(99, 75))
          .to.be.revertedWith("Product Does not exist");
      });
      
      it("Should fail with invalid risk factor", async function () {
        await expect(weatherInsurance.connect(riskAssessor).updateRisk(productId, 0))
          .to.be.revertedWith("Invalid Risk Factor");
        
        await expect(weatherInsurance.connect(riskAssessor).updateRisk(productId, 101))
          .to.be.revertedWith("Invalid Risk Factor");
      });
    });
    
    describe("Get Product Details", function () {
      it("Should return full product details", async function () {
        const details = await weatherInsurance.getProductDetails(productId);

        expect(details.provider).to.equal(provider1.address);
        expect(details.name).to.equal("Weather Insurance");
        expect(details.description).to.equal("Insurance against heavy rainfall");
        expect(details.minPremium).to.equal(ethers.parseUnits("0.2"));
        expect(details.maxCoverage).to.equal(ethers.parseUnits("2"));
        expect(details.minDuration).to.equal(86400);
        expect(details.maxDuration).to.equal(2592000);
        expect(details.locationId).to.equal("TVM");
        expect(details.threshold).to.equal(100);
        expect(details.weatherType).to.equal(0);
        expect(details.aboveThreshold).to.equal(true);
        expect(details.riskfactor).to.equal(50);
      });
      
      it("Should fail if product does not exist", async function () {
        await expect(weatherInsurance.getProductDetails(99))
          .to.be.revertedWith("Product Does not Exist");
      });
    });
    
    describe("Get Provider Products", function () {
      it("Should return all products for a provider", async function () {
        await weatherInsurance.connect(provider1).createInsuranceProduct(
          "Second Insurance",
          "Another insurance",
          ethers.parseUnits("0.15"),
          ethers.parseUnits("1.5"),
          86400,
          2592000,
          "KOCHI",
          30,
          1,
          true
        );
        
        const products = await weatherInsurance.getProviderProducts(provider1.address);
        expect(products.length).to.equal(10);
        expect(products[0]).to.equal(0);
        expect(products[1]).to.equal(1);
      });
      
      it("Should return empty array for non-providers", async function () {
        const products = await weatherInsurance.getProviderProducts(policyholder1.address);
        expect(products.length).to.equal(0);
      });
    });
  });
  
  describe("Policy Management", function () {
    describe("Purchase Policy", function () {
      let productId;

  beforeEach(async function () {
    const tx = await weatherInsurance.connect(provider1).createInsuranceProduct(
      "Sample Insurance",
      "Sample insurance description",
      ethers.parseUnits("0.1"), 
      ethers.parseUnits("1"),   
      86400,                  
      2592000,                
      "SAMPLE",
      50,                     
      0,                      
      true                   
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment.name === "ProductCreated");
    productId = event.args.productId;

    await weatherInsurance.connect(provider1).stakeAsProvider({ value: ethers.parseUnits("10") });
  });
      it("Should create a new policy", async function () {
        await weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          86400,
          { value: ethers.parseUnits("0.1") }
        );
        
        policyId = 0;
        
        const policy = await weatherInsurance.policies(policyId);
        
        expect(policy.productId).to.equal(productId);
        expect(policy.policyholder).to.equal(policyholder1.address);
        expect(policy.provider).to.equal(provider1.address);
        expect(policy.premium).to.equal(ethers.parseUnits("0.1"));
        
        // risk factor = 50%, premium = 0.1, coverage should be (100-50)/10 * 0.1 = 0.5
        expect(policy.coverage).to.equal(ethers.parseUnits("0.5"));
        
        expect(policy.status).to.equal(0); // PolicyStatus.ACTIVE
        expect(policy.claimStatus).to.equal(0); // ClaimStatus.NONE
      });
      
      it("Should update user's policy list", async function () {
        await weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          86400,
          { value: ethers.parseUnits("0.1") }
        );
        
        const userPolicies = await weatherInsurance.getUserPolicy(policyholder1.address);
        expect(userPolicies.length).to.equal(2);
        expect(userPolicies[0]).to.equal(0);
      });
      
      it("Should transfer platform fee to fee collector", async function () {
        const initialBalance = await ethers.provider.getBalance(owner.address);
        
        await weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          86400,
          { value: ethers.parseUnits("0.1") }
        );
        
        const finalBalance = await ethers.provider.getBalance(owner.address);
        const platformFee = ethers.parseUnits("0.1")* 250n / 10000n; // 2.5% 
        
        expect(finalBalance).to.equal(initialBalance + platformFee);
      });
      
      it("Should increase provider's stake", async function () {
        const initialStake = await weatherInsurance.providerStakes(provider1.address);
        
        await weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          86400,
          { value: ethers.parseUnits("0.1") }
        );
        
        const finalStake = await weatherInsurance.providerStakes(provider1.address);
        const premium = ethers.parseUnits("0.1");
        const platformFee = premium *(250n) / 10000n; // 2.5%
        const providerAmount = premium - platformFee;
        
        expect(finalStake).to.equal(initialStake + providerAmount);
      });
      
      it("Should emit PolicyCreated event", async function () {
        await expect(weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          86400,
          { value: ethers.parseUnits("0.1") }
        ))
          .to.emit(weatherInsurance, "PolicyCreated")
          .withArgs(4, productId, policyholder1.address);
      });
      
      it("Should fail if product does not exist", async function () {
        await expect(weatherInsurance.connect(policyholder1).purchasePolicy(
          99,
          86400,
          { value: ethers.parseUnits("0.1") }
        ))
          .to.be.revertedWith("Product doesnot exist");
      });
      
      it("Should fail if product is not active", async function () {
        await weatherInsurance.connect(provider1).updateInsuranceProduct(
          productId,
          false,
          ethers.parseUnits("0.1"),
          ethers.parseUnits("1")
        );
        
        await expect(weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          86400,
          { value: ethers.parseUnits("0.1") }
        ))
          .to.be.revertedWith("Product Not Active");
      });
      
      it("Should fail if premium is too low", async function () {
        await expect(weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          86400,
          { value: ethers.parseUnits("0.05") }
        ))
          .to.be.revertedWith("Premium Too Low");
      });
      
      it("Should fail if premium exceeds maximum coverage", async function () {
        await expect(weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          86400,
          { value: ethers.parseUnits("2") }
        ))
          .to.be.revertedWith("Premium exceeds maximum coverage");
      });
      
      it("Should fail if duration is too short", async function () {
        await expect(weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          3600, // 1 hour
          { value: ethers.parseUnits("0.1") }
        ))
          .to.be.revertedWith("Duration too short");
      });
      
      it("Should fail if duration is too long", async function () {
        await expect(weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          3000000, // ~35 days
          { value: ethers.parseUnits("0.1") }
        ))
          .to.be.revertedWith("Duration too long");
      });
      
      it("Should fail if provider stake is too low", async function () {
        await weatherInsurance.connect(provider2).stakeAsProvider({ value: ethers.parseUnits("1") });
        
        await weatherInsurance.connect(provider2).createInsuranceProduct(
          "Premium Insurance",
          "High coverage insurance", 
          ethers.parseUnits("1"),   
          ethers.parseUnits("100"), 
          86400,                    
          2592000,                  
          "TVM",                    
          1000,                    
          0,          
          true             
        );
        
        const productId = await weatherInsurance.productCount() - 1n;

        await weatherInsurance.connect(owner).grantRole(RISK_ACCESSOR_ROLE, owner.address);
        await weatherInsurance.connect(owner).updateRisk(productId, 10); // risk 10%

        await expect(weatherInsurance.connect(policyholder1).purchasePolicy(
          productId,
          86400,
          { value: ethers.parseUnits("2") }
        ))
          .to.be.revertedWith("Provider Stake low to payout coverage");
      });
  });
    
    describe("Cancel Policy", function () {
      let cancelPolicyId; 
      let cancelProductId; 
  
    beforeEach(async function () {
      const tx = await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Cancel Policy Test Insurance",
        "Insurance product for cancel policy tests",
        ethers.parseUnits("0.1"), 
        ethers.parseUnits("1"),   
        86400, 
        2592000, 
        "TVM", 
        100, 
        0, 
        true 
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => 
        log.fragment && log.fragment.name === "ProductCreated"
      );
      cancelProductId = event.args.productId;
      
      const policyTx = await weatherInsurance.connect(policyholder1).purchasePolicy(
        cancelProductId,
        2592000,
        { value: ethers.parseUnits("0.1") }
      );
      
      const policyReceipt = await policyTx.wait();
      const policyEvent = policyReceipt.logs.find(log => 
        log.fragment && log.fragment.name === "PolicyCreated"
      );
      cancelPolicyId = policyEvent.args.policyId;
    });
      
      it("Should cancel an active policy", async function () {
        await weatherInsurance.connect(policyholder1).cancelPolicy(policyId);
        
        const policy = await weatherInsurance.policies(policyId);
        expect(policy.status).to.equal(3); // PolicyStatus.CANCELLED
      });
      
      it("Should refund a portion of the premium", async function () {
        const initialBalance = await ethers.provider.getBalance(policyholder1.address);
        
        const tx = await weatherInsurance.connect(policyholder1).cancelPolicy(cancelPolicyId);
        const receipt = await tx.wait();
        const fullTx = await ethers.provider.getTransaction(tx.hash);
        const gasPrice = fullTx.gasPrice;
        const gasUsed = (receipt.gasUsed) * gasPrice;
        
        const finalBalance = await ethers.provider.getBalance(policyholder1.address);
 
        const premium = ethers.parseUnits("0.1");
        const refundAmount = premium * 75n / 100n;

        expect(finalBalance).to.be.closeTo(
          initialBalance + refundAmount - gasUsed,
          ethers.parseUnits("0.001") 
        );
      });
      
      it("Should fail if not policyholder", async function () {
        await expect(weatherInsurance.connect(provider1).cancelPolicy(policyId))
          .to.be.revertedWith("Not PolicyHolder");
      });
      
      it("Should fail if policy does not exist", async function () {
        await expect(weatherInsurance.connect(policyholder1).cancelPolicy(99))
          .to.be.revertedWith("Policy does not exist");
      });
      
      it("Should fail if policy is not active", async function () {
        await weatherInsurance.connect(policyholder1).cancelPolicy(cancelPolicyId);
        
        await expect(weatherInsurance.connect(policyholder1).cancelPolicy(cancelPolicyId))
          .to.be.revertedWith("Policy not active");
      });
    });
    
    describe("Renew Policy", function () {
      let renewProductId;
      let renewPolicyId;

    beforeEach(async function () {
      const tx = await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Renew Policy Test Insurance",
        "Test insurance for renew policy",
        ethers.parseUnits("0.1"),
        ethers.parseUnits("1"),
        86400, // claim period
        2592000, // duration
        "TVM",
        100,
        0,
        true
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log =>
        log.fragment && log.fragment.name === "ProductCreated"
      );
      renewProductId = event.args.productId;

      const policyTx = await weatherInsurance.connect(policyholder1).purchasePolicy(
        renewProductId,
        86400,
        { value: ethers.parseUnits("0.1") }
      );

      const policyReceipt = await policyTx.wait();
      const policyEvent = policyReceipt.logs.find(log =>
        log.fragment && log.fragment.name === "PolicyCreated"
      );
      renewPolicyId = policyEvent.args.policyId;

      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine");
    });
      
      it("Should renew an expired policy", async function () {
        await weatherInsurance.connect(policyholder1).renewPolicy(renewPolicyId, {
          value: ethers.parseUnits("0.1")
        });
        
        const policy = await weatherInsurance.policies(policyId);
        
        expect(policy.status).to.equal(3); // PolicyStatus.ACTIVE
        expect(policy.premium).to.equal(ethers.parseUnits("0.1"));
        expect(policy.claimStatus).to.equal(0); // ClaimStatus.NONE
        expect(policy.lastClaimDate).to.equal(0);
        
        const duration = policy.endDate - policy.startDate;
        expect(duration).to.equal(86400);
      });
      
      it("Should transfer platform fee to fee collector", async function () {
        const initialBalance = await ethers.provider.getBalance(owner.address);
        
        await weatherInsurance.connect(policyholder1).renewPolicy(renewPolicyId, {
          value: ethers.parseUnits("0.1")
        });
        
        const finalBalance = await ethers.provider.getBalance(owner.address);
        const platformFee = ethers.parseUnits("0.1")*(250n) / (10000n); // 2.5%
        
        expect(finalBalance).to.equal(initialBalance + platformFee);
      });
      
      it("Should increase provider's stake", async function () {
        const initialStake = await weatherInsurance.providerStakes(provider1.address);
        
        await weatherInsurance.connect(policyholder1).renewPolicy(renewPolicyId, {
          value: ethers.parseUnits("0.1")
        });
        
        const finalStake = await weatherInsurance.providerStakes(provider1.address);
        const premium = ethers.parseUnits("0.1");
        const platformFee = premium * (250n) / (10000n); // 2.5% of premium
        const providerAmount = premium - platformFee;
        
        expect(finalStake).to.equal(initialStake+providerAmount);
      });
      
      it("Should fail if not policyholder", async function () {
        await expect(weatherInsurance.connect(provider1).renewPolicy(policyId, {
          value: ethers.parseUnits("0.1")
        }))
          .to.be.revertedWith("Not the policy holder");
      });
      
      it("Should fail if policy does not exist", async function () {
        await expect(weatherInsurance.connect(policyholder1).renewPolicy(99, {
          value: ethers.parseUnits("0.1")
        }))
          .to.be.revertedWith("Policy does Not Exist");
      });
      
      it("Should fail if policy cannot be renewed", async function () {
        await weatherInsurance.connect(policyholder1).renewPolicy(renewPolicyId, {
          value: ethers.parseUnits("0.1")
        });

        await expect(weatherInsurance.connect(policyholder1).renewPolicy(renewPolicyId, {
          value: ethers.parseUnits("0.1")
        }))
          .to.be.revertedWith("Policy not yet expired");
      });
      
      it("Should fail if policy's associated product is not active", async function () {
        await weatherInsurance.connect(provider1).updateInsuranceProduct(
          renewProductId,
          false,
          ethers.parseUnits("0.1"),
          ethers.parseUnits("1")
        );
        
        await expect(weatherInsurance.connect(policyholder1).renewPolicy(renewPolicyId, {
          value: ethers.parseUnits("0.1")
        }))
          .to.be.revertedWith("Product is not active");
      });
      
      it("Should fail if insufficient amount sent", async function () {
        await expect(weatherInsurance.connect(policyholder1).renewPolicy(renewPolicyId, {
          value: ethers.parseUnits("0.05")
        }))
          .to.be.revertedWith("Insufficient Amount");
      });
    });
    
    describe("Get Policy Details", function () {
      let testProductId;
      let testPolicyId;

      beforeEach(async function () {
        const tx = await weatherInsurance.connect(provider1).createInsuranceProduct(
          "Test Policy Insurance",
          "Test insurance for policy creation",
          ethers.parseUnits("0.1"), 
          ethers.parseUnits("1"), 
          86400, 
          2592000, 
          "TVM",
          100, 
          0, 
          true 
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find(log =>
          log.fragment && log.fragment.name === "ProductCreated"
        );
        testProductId = event.args.productId;

        const policyTx = await weatherInsurance.connect(policyholder1).purchasePolicy(
          testProductId,
          86400, 
          { value: ethers.parseUnits("0.2") } 
        );

        const policyReceipt = await policyTx.wait();
        const policyEvent = policyReceipt.logs.find(log =>
          log.fragment && log.fragment.name === "PolicyCreated"
        );
        testPolicyId = policyEvent.args.policyId;
      });

    
      it("Should return full policy details", async function () {
        const details = await weatherInsurance.getPolicyDetails(testPolicyId);
    
        expect(details.productId).to.equal(testProductId);
        expect(details.policyholder).to.equal(policyholder1.address);
        expect(details.provider).to.equal(provider1.address);
        expect(details.premium).to.equal(ethers.parseUnits("0.2"));
        expect(details.coverage).to.equal(ethers.parseUnits("1"));
        expect(details.status).to.equal(0); // PolicyStatus.ACTIVE
        expect(details.claimStatus).to.equal(0); // ClaimStatus.NONE
        expect(details.lastClaimDate).to.equal(0);
    
        const duration = details.endDate - details.startDate;
        expect(duration).to.equal(86400);
      });
    
      it("Should fail if policy does not exist", async function () {
        await expect(weatherInsurance.getPolicyDetails(99))
          .to.be.revertedWith("Policy does not exist");
      });
    });
    
    
    describe("Get User Policy", function () {
      let testProductId;
      beforeEach(async function () {
        // Create insurance product
        const tx = await weatherInsurance.connect(provider1).createInsuranceProduct(
          "Policy Test Insurance",
          "Test insurance for policy details",
          ethers.parseUnits("0.1"),
          ethers.parseUnits("1"),
          86400, // min duration
          2592000, // max duration
          "TVM",
          100,
          0,
          true
        );
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => 
          log.fragment && log.fragment.name === "ProductCreated"
        );
        testProductId = event.args.productId;
      });

      it("Should return all policies for a user", async function () {
        await weatherInsurance.connect(policyholder1).purchasePolicy(
          testProductId,
          86400,
          { value: ethers.parseUnits("0.1") }
        );

        await weatherInsurance.connect(policyholder1).purchasePolicy(
          testProductId,
          172800, // 2 days
          { value: ethers.parseUnits("0.15") }
        );
        
        const policies = await weatherInsurance.getUserPolicy(policyholder1.address);
        expect(policies.length).to.equal(22);
        expect(policies[0]).to.equal(0);
        expect(policies[1]).to.equal(1);
      });
      
      it("Should return empty array for users with no policies", async function () {
        const policies = await weatherInsurance.getUserPolicy(policyholder2.address);
        expect(policies.length).to.equal(0);
      });
    });
  });
  
  describe("Claims Management", function () {
    let testProductId;
    let testPolicyId;
    let owner, provider1, policyholder1, riskAssessor, claimsManager;

    const JOBID = ethers.encodeBytes32String("29fa9aa13bf146878");
    const FEE = ethers.parseEther("0.1");
    beforeEach(async function () {

      [owner, provider1, policyholder1, riskAssessor, claimsManager] = await ethers.getSigners();
      const MockLinkToken = await ethers.getContractFactory("MockLinkToken");
      mockLinkToken = await MockLinkToken.deploy();

    const MockOracle = await ethers.getContractFactory("MockOracle");
    mockOracle = await MockOracle.deploy(await mockLinkToken.getAddress());
  
    const WeatherInsurance = await ethers.getContractFactory("WeatherInsurance");
    weatherInsurance = await WeatherInsurance.deploy(
      await mockLinkToken.getAddress(),
      await mockOracle.getAddress(),
      JOBID,
      FEE
    );

    await mockLinkToken.transfer(await weatherInsurance.getAddress(), ethers.parseEther("10"));

  ADMIN_ROLE = await weatherInsurance.ADMIN_ROLE();
  INSURANCE_PROVIDER_ROLE = await weatherInsurance.INSURANCE_PROVIDER_ROLE();
  RISK_ACCESSOR_ROLE = await weatherInsurance.RISK_ACCESSOR_ROLE();
  CLAIMS_MANAGER_ROLE = await weatherInsurance.CLAIMS_MANAGER_ROLE();

  await weatherInsurance.connect(owner).grantRole(RISK_ACCESSOR_ROLE, riskAssessor.address);
  await weatherInsurance.connect(owner).grantRole(CLAIMS_MANAGER_ROLE, claimsManager.address);
  
  await weatherInsurance.connect(owner).grantRole(INSURANCE_PROVIDER_ROLE, provider1.address);


  await weatherInsurance.connect(provider1).stakeAsProvider({ value: ethers.parseEther("20") });

      const tx = await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Test Policy Insurance",
        "Test insurance for policy creation",
        ethers.parseUnits("0.1"), 
        ethers.parseUnits("1"), 
        86400, 
        2592000, 
        "TVM",
        100, 
        0, 
        true 
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log =>
        log.fragment && log.fragment.name === "ProductCreated"
      );
      testProductId = event.args.productId;

      const policyTx = await weatherInsurance.connect(policyholder1).purchasePolicy(
        testProductId,
        86400, 
        { value: ethers.parseUnits("0.2") } 
      );

      const policyReceipt = await policyTx.wait();
      const policyEvent = policyReceipt.logs.find(log =>
        log.fragment && log.fragment.name === "PolicyCreated"
      );
      testPolicyId = policyEvent.args.policyId;
    });

    describe("Submit Claim", function () {
      it("Should submit a claim and initiate Chainlink request", async function () {
        const tx = await weatherInsurance.connect(policyholder1).submitClaim(testPolicyId);
        const receipt = await tx.wait();
      
        const submitEvent = receipt.logs.find(log => {
          try {
            const parsed = weatherInsurance.interface.parseLog(log);
            return parsed && parsed.name === "ClaimSubmitted";
          } catch (e) {
            return false;
          }
        });
      
        expect(submitEvent).to.not.be.undefined;

        const policy = await weatherInsurance.policies(testPolicyId);
        expect(policy.claimStatus).to.equal(1); // ClaimStatus.PENDING
      });
      

      it("Should fail if not policyholder", async function () {
        await expect(weatherInsurance.connect(provider1).submitClaim(testPolicyId))
          .to.be.revertedWith("Not the policy holder");
      });
      
      it("Should fail if policy does not exist", async function () {
        await expect(weatherInsurance.connect(policyholder1).submitClaim(99))
          .to.be.revertedWith("Policy Does Not Exist");
      });
      
      it("Should fail if policy is not active", async function () {
        await weatherInsurance.connect(policyholder1).cancelPolicy(testPolicyId);
        
        await expect(weatherInsurance.connect(policyholder1).submitClaim(testPolicyId))
          .to.be.revertedWith("Policy not active");
      });

      it("Should fail if policy has expired", async function () {
        await ethers.provider.send("evm_increaseTime", [2592001]);
        await ethers.provider.send("evm_mine");
        
        await expect(weatherInsurance.connect(policyholder1).submitClaim(testPolicyId))
          .to.be.revertedWith("Policy Expired");
      });
    });
    
    describe("Fetch Weather Data", function () {
      let policyId;
      let requestId;
      let claimId;
      
      beforeEach(async function () {
        await weatherInsurance.connect(provider1).createInsuranceProduct(
          "Test Insurance",
          "Test Description",
          ethers.parseUnits("0.1"),
          ethers.parseUnits("1"),
          86400,
          2592000,
          "TEST",
          100,
          0, 
          true 
        );
        
        await weatherInsurance.connect(policyholder1).purchasePolicy(
          0, // first product
          86400, // 1 day
          { value: ethers.parseUnits("0.2") }
        );
        
        policyId = 0;
        
        await mockLinkToken.transfer(
          await weatherInsurance.getAddress(),
          ethers.parseEther("10")
        );
        
        const tx = await weatherInsurance.connect(policyholder1).submitClaim(policyId);

        const policy = await weatherInsurance.policies(policyId);
        requestId = policy.requestId;

        const receipt = await tx.wait();
        const claimEvent = receipt.logs.find(log => {
          try {
            const parsed = weatherInsurance.interface.parseLog(log);
            return parsed && parsed.name === "ClaimSubmitted";
          } catch (e) {
            return false;
          }
        });
        
        if (claimEvent) {
          const parsedEvent = weatherInsurance.interface.parseLog(claimEvent);
          claimId = parsedEvent.args.claimId;
        } else {
          claimId = 0; // Fallback if event not found
        }
      });
      
      
      it("Should approve claim when weather condition is met", async function () {
        const weatherValue = 150;
        const abiCoder = AbiCoder.defaultAbiCoder();
        
        const initialBalance = await ethers.provider.getBalance(policyholder1.address);
        
        // Mock the oracle response
        await mockOracle.fulfillOracleRequest(
          requestId,
          weatherInsurance.getAddress(),
          Buffer.from(weatherInsurance.interface.getFunction("fetchWeatherData").selector.slice(2), "hex"),
          0,
          Buffer.from(abiCoder.encode(["bytes32", "uint256"], [requestId, weatherValue]).slice(2), "hex")
        );
        
        const claim = await weatherInsurance.claims(claimId);
        expect(claim.status).to.equal(2); // ClaimStatus.APPROVED
        expect(claim.weatherValue).to.equal(weatherValue);
        expect(claim.amount).to.equal(ethers.parseUnits("1"));
        
        const policy = await weatherInsurance.policies(testPolicyId);
        expect(policy.claimStatus).to.equal(2); // ClaimStatus.APPROVED

        const finalBalance = await ethers.provider.getBalance(policyholder1.address);
        expect(finalBalance).to.equal(initialBalance + (ethers.parseUnits("1")));
      });
      
      it("Should reject claim when weather condition is not met", async function () {
        // Mock weather value belowthreshold
        const weatherValue = 50;
        const abiCoder = AbiCoder.defaultAbiCoder();
        
        // Mock the oracle response
        await mockOracle.fulfillOracleRequest(
          requestId,
          weatherInsurance.getAddress(),
          Buffer.from(weatherInsurance.interface.getFunction("fetchWeatherData").selector.slice(2), "hex"),
          0,
          Buffer.from(abiCoder.encode(["bytes32", "uint256"], [requestId, weatherValue]).slice(2), "hex")
        );

        const claim = await weatherInsurance.claims(claimId);
        expect(claim.status).to.equal(3); // ClaimStatus.REJECTED
        expect(claim.weatherValue).to.equal(weatherValue);
        expect(claim.amount).to.equal(0); // No payout

        const policy = await weatherInsurance.policies(testPolicyId);
        expect(policy.claimStatus).to.equal(3); // ClaimStatus.REJECTED
      });
      
      it("Should emit proper events for approved claims", async function () {
        const weatherValue = 150;
        const abiCoder = AbiCoder.defaultAbiCoder();
        
        // Mock the oracle response
        const tx = await mockOracle.fulfillOracleRequest(
          requestId,
          weatherInsurance.getAddress(),
          Buffer.from(weatherInsurance.interface.getFunction("fetchWeatherData").selector.slice(2), "hex"),
          0,
          Buffer.from(abiCoder.encode(["bytes32", "uint256"], [requestId, weatherValue]).slice(2), "hex")
        );
        const receipt = await tx.wait();
        
        const weatherDataReceivedEvent = receipt.logs.find(
          log => weatherInsurance.interface.parseLog(log).name === "WeatherDataReceived"
        );
        expect(weatherDataReceivedEvent).to.not.be.undefined;
        
        const claimProcessedEvent = receipt.logs.find(
          log => weatherInsurance.interface.parseLog(log).name === "ClaimProcessed"
        );
        expect(claimProcessedEvent).to.not.be.undefined;
        
        const policyClaimedEvent = receipt.logs.find(
          log => weatherInsurance.interface.parseLog(log).name === "PolicyClaimed"
        );
        expect(policyClaimedEvent).to.not.be.undefined;
      });
      
      it("Should emit proper events for rejected claims", async function () {
        // Mock weather value that doesn't meet the threshold
        const weatherValue = 50;
        const abiCoder = AbiCoder.defaultAbiCoder();
        
        // Mock the oracle response
        const tx = await mockOracle.fulfillOracleRequest(
          requestId,
          weatherInsurance.getAddress(),
          Buffer.from(weatherInsurance.interface.getFunction("fetchWeatherData").selector.slice(2), "hex"),
          0,
          Buffer.from(abiCoder.encode(["bytes32", "uint256"], [requestId, weatherValue]).slice(2), "hex")
        );
        const receipt = await tx.wait();

        const weatherDataReceivedEvent = receipt.logs.find(
          log => weatherInsurance.interface.parseLog(log).name === "WeatherDataReceived"
        );
        expect(weatherDataReceivedEvent).to.not.be.undefined;
        
        const claimProcessedEvent = receipt.logs.find(
          log => weatherInsurance.interface.parseLog(log).name === "ClaimProcessed"
        );
        expect(claimProcessedEvent).to.not.be.undefined;

        const policyClaimedEvent = receipt.logs.find(
          log => weatherInsurance.interface.parseLog(log).name === "PolicyClaimed"
        );
        expect(policyClaimedEvent).to.be.undefined;
      });
      
      it("Should reduce provider stake for approved claims", async function () {
        const initialStake = await weatherInsurance.providerStakes(provider1.address);
 
        const weatherValue = 150;
        const abiCoder = AbiCoder.defaultAbiCoder();
        
        // Mock oracle response
        await mockOracle.fulfillOracleRequest(
          requestId,
          await weatherInsurance.getAddress(),
          Buffer.from(weatherInsurance.interface.getFunction("fetchWeatherData").selector.slice(2), "hex"),
          0,
          Buffer.from(abiCoder.encode(["bytes32", "uint256"], [requestId, weatherValue]).slice(2), "hex")
        );
        
        const finalStake = await weatherInsurance.providerStakes(provider1.address);

        const policy = await weatherInsurance.policies(policyId);
        const coverage = policy.coverage;

        expect(finalStake).to.equal(initialStake - coverage);
      });
    });
    
    describe("Get Claim Details", function () {
      let testProductId;
      let testPolicyId;
      let testClaimId;

      beforeEach(async function () {
        const tx = await weatherInsurance.connect(provider1).createInsuranceProduct(
          "Test Policy Insurance",
          "Test insurance for policy creation",
          ethers.parseUnits("0.1"), 
          ethers.parseUnits("1"), 
          86400, 
          2592000, 
          "TVM",
          100, 
          0, 
          true 
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find(log =>
          log.fragment && log.fragment.name === "ProductCreated"
        );
        testProductId = event.args.productId;

        const policyTx = await weatherInsurance.connect(policyholder1).purchasePolicy(
          testProductId,
          86400, 
          { value: ethers.parseUnits("0.2") } 
        );

        const policyReceipt = await policyTx.wait();
        const policyEvent = policyReceipt.logs.find(log =>
          log.fragment && log.fragment.name === "PolicyCreated"
        );
        testPolicyId = policyEvent.args.policyId;

        const claimTx = await weatherInsurance.connect(policyholder1).submitClaim(
          testPolicyId
        );

        const claimReceipt = await claimTx.wait();
        const claimEvent = claimReceipt.logs.find(log =>
          log.fragment && log.fragment.name === "ClaimSubmitted"
        );
        testClaimId = claimEvent.args.claimId;

      });
      
      it("Should return full claim details", async function () {
        const details = await weatherInsurance.getClaimDetails(testClaimId);
        
        expect(details.policyId).to.equal(testPolicyId);
        expect(details.status).to.equal(1); // ClaimStatus.PENDING
        expect(details.amount).to.equal(0);
        expect(details.weatherValue).to.equal(0);
      });
      
      it("Should fail if claim does not exist", async function () {
        await expect(weatherInsurance.getClaimDetails(99))
          .to.be.revertedWith("Claim does not exist");
      });
    });
  });
  
  describe("Admin Functions", function () {
    describe("Update Oracle Parameters", function () {
      it("Should update oracle parameters", async function () {
        const newOracle = await mockOracle.getAddress();
        const newJobId = ethers.encodeBytes32String("newjobid");
        const newFee = ethers.parseUnits("0.2");
        
        await weatherInsurance.connect(owner).updateOracleParameters(
          newOracle,
          newJobId,
          newFee
        );
      });
      
      it("Should fail if not admin", async function () {
        const newOracle = await mockOracle.getAddress();
        const newJobId = ethers.encodeBytes32String("newjobid");
        const newFee = ethers.parseUnits("0.2");
        await expect(weatherInsurance.connect(provider1).updateOracleParameters(
          newOracle,
          newJobId,
          newFee
        ))
          .to.be.revertedWith("Not Admin");
      });
    });
    
    describe("Update Platform Fee", function () {
      it("Should update platform fee percentage", async function () {
        await weatherInsurance.connect(owner).updatePlatformFee(
          500, // 5%
          feeCollector.address
        );
        
        expect(await weatherInsurance.platformFeePercentage()).to.equal(500n);
        expect(await weatherInsurance.feeCollector()).to.equal(feeCollector.address);
      });
      
      it("Should fail if not admin", async function () {
        await expect(weatherInsurance.connect(provider1).updatePlatformFee(
          500,
          feeCollector.address
        ))
          .to.be.revertedWith("Not Admin");
      });
      
      it("Should fail if fee is too high", async function () {
        await expect(weatherInsurance.connect(owner).updatePlatformFee(
          1001, // 10.01%
          feeCollector.address
        ))
          .to.be.revertedWith("Fee too high");
      });
      
      it("Should fail if fee collector is zero address", async function () {
        await expect(weatherInsurance.connect(owner).updatePlatformFee(
          500,
          ethers.ZeroAddress
        ))
          .to.be.revertedWith("invalid Address");
      });
    });
    
    describe("Update Provider Minimum Stake", function () {
      it("Should update minimum stake", async function () {
        const newMinimum = ethers.parseUnits("20");
        await weatherInsurance.connect(owner).updateProviderMinimumStake(newMinimum);
        
        expect(await weatherInsurance.providerMinimumStake()).to.equal(newMinimum);
      });
      
      it("Should fail if not admin", async function () {
        await expect(weatherInsurance.connect(provider1).updateProviderMinimumStake(
          ethers.parseUnits("20")
        ))
          .to.be.revertedWith("Not Admin");
      });
      
      it("Should fail if minimum is zero", async function () {
        await expect(weatherInsurance.connect(owner).updateProviderMinimumStake(0))
          .to.be.revertedWith("Minimum must be above 0 ETH");
      });
    });
    
    describe("Withdraw Link", function () {
      it("Should allow admin to withdraw LINK tokens", async function () {
        const amount = ethers.parseUnits("1");
        const initialBalance = await mockLinkToken.balanceOf(owner.address);
        
        await weatherInsurance.connect(owner).withdrawLink(amount);
        
        const finalBalance = await mockLinkToken.balanceOf(owner.address);
        expect(finalBalance).to.equal(initialBalance + (amount));
      });
      
      it("Should fail if not admin", async function () {
        await expect(weatherInsurance.connect(provider1).withdrawLink(
          ethers.parseUnits("1")
        ))
          .to.be.revertedWith("Not admin");
      });
      
      it("Should fail if insufficient balance", async function () {
        const tooMuch = ethers.parseUnits("11"); // Contract only has 10 LINK
        
        await expect(weatherInsurance.connect(owner).withdrawLink(tooMuch))
          .to.be.revertedWith("Insufficient LINK token balance");
      });
    });
  });
  
  describe("Utility Functions", function () {
    it("Should convert uint to string", async function () {
      const value = 12345;
      const result = await weatherInsurance.uint2str(value);
      expect(result).to.equal("12345");
    });
    
    it("Should accept ETH via receive function", async function () {
      const weatherInsuranceAddress = await weatherInsurance.getAddress();
      const initialBalance = await ethers.provider.getBalance(weatherInsuranceAddress);
      
      // Send ETH directly
      await owner.sendTransaction({
        to: weatherInsuranceAddress,
        value: ethers.parseUnits("1")
      });
      
      const finalBalance = await ethers.provider.getBalance(weatherInsuranceAddress);
      expect(finalBalance).to.equal(initialBalance + ethers.parseUnits("1"));
    });
  });
  
  describe("Edge Cases", function () {
    let testProductId;
    
    beforeEach(async function () {
      const WeatherInsurance = await ethers.getContractFactory("WeatherInsurance", owner);
    weatherInsurance = await WeatherInsurance.deploy(
      await mockLinkToken.getAddress(),
      await mockOracle.getAddress(),
      JOBID,
      FEE
    );

    await weatherInsurance.connect(provider1).stakeAsProvider({ value: ethers.parseUnits("10") });
      
      const tx = await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Test Policy Insurance",
        "Test insurance for policy creation",
        ethers.parseUnits("0.1"), 
        ethers.parseUnits("1"), 
        86400, 
        2592000, 
        "TVM",
        100, 
        0, 
        true 
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log =>
        log.fragment && log.fragment.name === "ProductCreated"
      );
      testProductId = event.args.productId;
      

    });

    it("Should handle multiple policies for the same product", async function () {
      await weatherInsurance.connect(policyholder1).purchasePolicy(
        testProductId,
        86400,
        { value: ethers.parseUnits("0.2") }
      );

      await weatherInsurance.connect(policyholder2).purchasePolicy(
        testProductId,
        172800,
        { value: ethers.parseUnits("0.2") }
      );
      
      const policy1 = await weatherInsurance.policies(0);
      const policy2 = await weatherInsurance.policies(1);
      
      expect(policy1.productId).to.equal(testProductId);
      expect(policy2.productId).to.equal(testProductId);
      expect(policy1.policyholder).to.equal(policyholder1.address);
      expect(policy2.policyholder).to.equal(policyholder2.address);
    });
    
    it("Should handle threshold comparison correctly for aboveThreshold=false", async function () {
      await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Below Threshold Insurance",
        "Insurance for values below threshold",
        ethers.parseUnits("0.1"),
        ethers.parseUnits("1"),
        86400,
        2592000,
        "TEST",
        50,
        0,
        false // Below threshold
      );

      await weatherInsurance.connect(policyholder1).purchasePolicy(
        1,
        86400,
        { value: ethers.parseUnits("0.1") }
      );
      
      await mockLinkToken.transfer(await weatherInsurance.getAddress(), ethers.parseEther("1"));
      
      await weatherInsurance.connect(policyholder1).submitClaim(0);

      const policy = await weatherInsurance.policies(0);
      const requestId = policy.requestId;

      const weatherValue = 30;
      const abiCoder = AbiCoder.defaultAbiCoder();
      
      const initialBalance = await ethers.provider.getBalance(policyholder1.address);
      
      // Mock oracle response
      await mockOracle.fulfillOracleRequest(
        requestId,
        await weatherInsurance.getAddress(),
        Buffer.from(weatherInsurance.interface.getFunction("fetchWeatherData").selector.slice(2), "hex"),
        0,
        Buffer.from(abiCoder.encode(["bytes32", "uint256"], [requestId, weatherValue]).slice(2), "hex")
      );

      const claim = await weatherInsurance.claims(0);
      expect(claim.status).to.equal(2); // ClaimStatus.APPROVED

      const finalBalance = await ethers.provider.getBalance(policyholder1.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });
    
    it("Should handle the case where provider has multiple products", async function () {
      await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Second Insurance",
        "Another insurance product",
        ethers.parseUnits("0.2"),
        ethers.parseUnits("2"),
        86400,
        2592000,
        "SECOND",
        100,
        1, // Temperature
        true
      );
      
      const providerProducts = await weatherInsurance.getProviderProducts(provider1.address);
      expect(providerProducts.length).to.equal(2);
      expect(providerProducts[0]).to.equal(0);
      expect(providerProducts[1]).to.equal(1);
    });
    
    it("Should handle policies with different durations", async function () {
      await weatherInsurance.connect(policyholder1).purchasePolicy(
        productId,
        86400,
        { value: ethers.parseUnits("0.1") }
      );
      
      await weatherInsurance.connect(policyholder1).purchasePolicy(
        productId,
        172800,
        { value: ethers.parseUnits("0.1") }
      );
      
      const policy1 = await weatherInsurance.policies(0);
      const policy2 = await weatherInsurance.policies(1);
      
      const duration1 = policy1.endDate - policy1.startDate;
      const duration2 = policy2.endDate - policy2.startDate;
      
      expect(duration1).to.equal(86400);
      expect(duration2).to.equal(172800);
    });
    
    it("Should handle multiple claims from the same policy", async function () {
      await weatherInsurance.connect(policyholder1).purchasePolicy(
        productId,
        604800, 
        { value: ethers.parseUnits("0.1") }
      );
      
      await mockLinkToken.transfer(await weatherInsurance.getAddress(), ethers.parseEther("1"));
      
      await weatherInsurance.connect(policyholder1).submitClaim(0);

      let policy = await weatherInsurance.policies(0);
      const requestId1 = policy.requestId;

      const weatherValue1 = 50;
      const abiCoder = AbiCoder.defaultAbiCoder();
      
      await mockOracle.fulfillOracleRequest(
        requestId1,
        await weatherInsurance.getAddress(),
        Buffer.from(weatherInsurance.interface.getFunction("fetchWeatherData").selector.slice(2), "hex"),
        0,
        Buffer.from(abiCoder.encode(["bytes32", "uint256"], [requestId1, weatherValue1]).slice(2), "hex")
      );
      
      const claim1 = await weatherInsurance.claims(0);
      expect(claim1.status).to.equal(3); // ClaimStatus.REJECTED

      await mockLinkToken.transfer(await weatherInsurance.getAddress(), ethers.parseEther("1"));
      
      await weatherInsurance.connect(policyholder1).submitClaim(0);

      policy = await weatherInsurance.policies(0);
      const requestId2 = policy.requestId;

      const weatherValue2 = 150;
      
      const balanceBefore = await ethers.provider.getBalance(policyholder1.address);

      await mockOracle.fulfillOracleRequest(
        requestId2,
        await weatherInsurance.getAddress(),
        Buffer.from(weatherInsurance.interface.getFunction("fetchWeatherData").selector.slice(2), "hex"),
        0,
        Buffer.from(abiCoder.encode(["bytes32", "uint256"], [requestId2, weatherValue2]).slice(2), "hex")
      );

      const claim2 = await weatherInsurance.claims(1);
      expect(claim2.status).to.equal(2); // ClaimStatus.APPROVED
      
      const balanceAfter = await ethers.provider.getBalance(policyholder1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });
    
    it("Should handle very small and very large premium amounts", async function () {

      await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Micro Insurance",
        "Very small premium insurance",
        ethers.parseUnits("0.001"), // 0.001 ETH min premium
        ethers.parseUnits("0.01"), // 0.01 ETH max coverage
        86400,
        2592000,
        "MICRO",
        10,
        0,
        true
      );

      await weatherInsurance.connect(policyholder1).purchasePolicy(
        1, // Microproduct
        86400,
        { value: ethers.parseUnits("0.001") }
      );
      
      const microPolicy = await weatherInsurance.policies(0);
      expect(microPolicy.premium).to.equal(ethers.parseUnits("0.001"));
      
      await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Macro Insurance",
        "Very large premium insurance",
        ethers.parseUnits("5"), // 5 ETH min premium
        ethers.parseUnits("20"), // 20 ETH max coverage
        86400,
        2592000,
        "MACRO",
        10,
        0,
        true
      );

      await weatherInsurance.connect(provider1).stakeAsProvider({ value: ethers.parseUnits("15") });

      await weatherInsurance.connect(policyholder1).purchasePolicy(
        2, // Macro product
        86400,
        { value: ethers.parseUnits("5") }
      );
      
      const macroPolicy = await weatherInsurance.policies(1);
      expect(macroPolicy.premium).to.equal(ethers.parseUnits("5"));
    });
  });
  
  describe("Integration Tests", function () {
    it("Should handle full lifecycle from product creation to claim payout", async function () {
      await weatherInsurance.connect(provider1).createInsuranceProduct(
        "Full Lifecycle Test",
        "Test full lifecycle",
        ethers.parseUnits("0.2"), 
        ethers.parseUnits("5"),    
        86400,
        2592000,
        "FULL",
        50,
        0, 
        true
      );
      
      await weatherInsurance.connect(owner).grantRole(RISK_ACCESSOR_ROLE, riskAssessor.address);

      await weatherInsurance.connect(riskAssessor).updateRisk(0, 30); // Lower risk = higher coverage

      await weatherInsurance.connect(policyholder1).purchasePolicy(
        0, 
        172800,
        { value: ethers.parseUnits("0.2") }
      );

      await mockLinkToken.transfer(await weatherInsurance.getAddress(), ethers.parseEther("10"));
      await weatherInsurance.connect(policyholder1).submitClaim(0);

      const policy = await weatherInsurance.policies(0);
      const requestId = policy.requestId;

      const weatherValue = 75; // > 50 threshold
      const balanceBefore = await ethers.provider.getBalance(policyholder1.address);
      
      // Mock oracle response
      const abiCoder = AbiCoder.defaultAbiCoder();
      await mockOracle.fulfillOracleRequest(
        requestId,
        await weatherInsurance.getAddress(),
        Buffer.from(weatherInsurance.interface.getFunction("fetchWeatherData").selector.slice(2), "hex"),
        0,
        Buffer.from(abiCoder.encode(["bytes32", "uint256"], [requestId, weatherValue]).slice(2), "hex")
      );
      
      const claim = await weatherInsurance.claims(0);
      expect(claim.status).to.equal(2); // ClaimStatus.APPROVED
      
      const balanceAfter = await ethers.provider.getBalance(policyholder1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });
    
    it("Should handle updating provider status based on stake changes", async function () {
      await weatherInsurance.connect(provider2).stakeAsProvider({ value: MIN_PROVIDER_STAKE });
      expect(await weatherInsurance.hasRole(INSURANCE_PROVIDER_ROLE, provider2.address)).to.equal(true);
      expect(await weatherInsurance.activeProviders(provider2.address)).to.equal(true);

      await weatherInsurance.connect(provider2).unstakeAsProvider(ethers.parseUnits("0.1"));
      expect(await weatherInsurance.hasRole(INSURANCE_PROVIDER_ROLE, provider2.address)).to.equal(false);
      expect(await weatherInsurance.activeProviders(provider2.address)).to.equal(false);
      await weatherInsurance.connect(provider2).stakeAsProvider({ value: ethers.parseUnits("1") });
      expect(await weatherInsurance.hasRole(INSURANCE_PROVIDER_ROLE, provider2.address)).to.equal(true);
      expect(await weatherInsurance.activeProviders(provider2.address)).to.equal(true);

      await weatherInsurance.connect(owner).updateProviderMinimumStake(ethers.parseUnits("15"));

      expect(await weatherInsurance.hasRole(INSURANCE_PROVIDER_ROLE, provider2.address)).to.equal(true);
      await weatherInsurance.connect(provider2).unstakeAsProvider(ethers.parseUnits("1"));
      expect(await weatherInsurance.hasRole(INSURANCE_PROVIDER_ROLE, provider2.address)).to.equal(false);
      expect(await weatherInsurance.activeProviders(provider2.address)).to.equal(false);
    });
  });
  describe("Oracle Tests", function () {
    // Mock contracts
    let mockLinkToken;
    let mockOracle;
    let weatherInsurance;
    
    // Test accounts
    let owner;
    let provider;
    let user;
    let failureTarget;
    
    // Constants
    const JOBID = ethers.encodeBytes32String("29fa9aa13bf146878");
    const FEE = ethers.parseEther("0.1");
    
    beforeEach(async function () {
      [owner, provider, user, failureTarget] = await ethers.getSigners();
      
      // Deploy mock LINK token
      const MockLinkToken = await ethers.getContractFactory("MockLinkToken");
      mockLinkToken = await MockLinkToken.deploy();
      
      // Deploy mock Oracle
      const MockOracle = await ethers.getContractFactory("MockOracle");
      mockOracle = await MockOracle.deploy(await mockLinkToken.getAddress());
      
      // Deploy WeatherInsurance
      const WeatherInsurance = await ethers.getContractFactory("WeatherInsurance");
      weatherInsurance = await WeatherInsurance.deploy(
        await mockLinkToken.getAddress(),
        await mockOracle.getAddress(),
        JOBID,
        FEE
      );
    });
    
    describe("MockOracle Tests", function () {
      it("should test fulfillOracleRequest with zero callback address", async function () {
        // Create a request ID that doesn't exist in the mapping
        const requestId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));
        
        // This will execute the branch where callbackAddress == address(0)
        await mockOracle.fulfillOracleRequest(
          requestId,
          123 // weather value
        );
        
        // No assertions needed, we're just trying to execute this branch for coverage
      });
    });
    
    describe("MockLinkToken Tests", function () {
      it("should test transferAndCall to an EOA", async function () {
        // Transfer to a regular address (EOA)
        await mockLinkToken.transferAndCall(
          user.address,
          ethers.parseEther("1"),
          "0x" // empty data
        );
        
        // Check balance was transferred
        expect(await mockLinkToken.balanceOf(user.address)).to.equal(ethers.parseEther("1"));
      });
    
    });
  });
});