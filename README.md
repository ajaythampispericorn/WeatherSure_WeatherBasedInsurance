# WEATHERSURE - A DECENTRALIZED WEATHER BASED INSURANCE SERVICE  

A decentralized parametric weather insurance platform built on Ethereum with Chainlink oracle integration. This platform enables insurance providers to create and manage weather-based insurance products while policyholders can protect themselves against adverse weather conditions with automated, transparent claims processing.  

## OVERVIEW  

WeatherSure is a parametric insurance platform that removes the need for manual claims assessment by using smart contracts and Chainlink oracles to automatically verify weather conditions and process payouts.  

This platform enables:  

- Insurance providers to stake funds, create customized weather insurance products, and earn returns  
- Policyholders to purchase insurance products with clear terms and receive automatic payouts when conditions are met  
- Risk Assessors to evaluate and adjust risk factors for different products  
- Claims Managers to oversee the claims process ( most of the claims are processed automatically)  

## FEATURES  

### For Insurance Providers  

- Stake ETH as collateral to become an insurance provider  
- Create customized weather insurance products with specific parameters  
    - Location  
    - Weather parameter (rainfall, temperature, wind)  
    - Threshold limits  
    - Premium and coverage amounts  
    - Policy duration constraints  
- Earn platform fees from premiums  
- Manage product risk factors  

### For Policy Holders  

- Purchase insurance policies with transparent terms  
- Premiums based on risk assessment and coverage amount  
- Automatic claims processing when weather conditions meet policy thresholds  
- Option to cancel policies early with a partial refund  
- Ability to renew expired policies  

### Platform Features  

- Role-based access control (admin, insurance provider, risk assessor, claims manager)  
- Integration with Chainlink oracles for reliable weather data  
- Automated, trustless claims processing  
- Configurable platform fees  
- Provider staking mechanism to ensure solvency  

## SMART CONTRACTS  

### WeatherInsurance.sol  

The main contract handling all insurance operations, with the following key components:  

- Role Management: Admin, Provider, Risk Assessor, Claims Manager  
- Product Management: Creation, updating of insurance products  
- Policy Management: Purchase, cancellation, and renewal of policies  
- Claims Processing: Submission and verification of claims  
- Provider Staking: Provider stake management and verification  
- Oracle Integration: Weather data fetching and verification  

### MockLinkToken.sol  

A mock implementation of the LINK token for testing and development environments  

### MockOracle.sol  

A mock Chainlink oracle for testing and development environments  

## GETTING STARTED  

### Prerequesites  

- Node.js  
- npm  
- Hardhat  

### Installation  

1. Clone the repository  
```  
git clone https://github.com/ajaythampispericorn/WeatherSure_WeatherBasedInsurance  
cd WeatherSure_WeatherBasedInsurance  
```  

2. Install dependencies  
```  
npm install  
```  
3. Create a .env file with the following parameters  
```  
INFURA_URL=your_infura_api_key  
PRIVATE_KEY=your_private_key  
```  

### Deployment  

1. To deploy locally  

```  
npx hardhat node  
npx hardhat ignition deploy ignition/modules/Weather_Insurance.js  
```  

2. To deploy to SEPOLIA testnet  

```  
npx hardhat ignition deploy ignition/modules/Weather_Insurance.js --network sepolia  
```

### Testing and Coverage  

```  
npx hardhat test  
npx hardhat coverage
```  

### LICENSE  

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.