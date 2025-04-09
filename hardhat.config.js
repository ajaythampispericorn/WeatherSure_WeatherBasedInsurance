require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, 
      },
      viaIR: true, 
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    infura: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_URL}`,
      accounts: [process.env.PRIVATE_KEY]
    }
  },
};
