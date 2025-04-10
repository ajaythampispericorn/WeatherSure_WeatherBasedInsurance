// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Mock Chainlink Token Contract
/// @notice A mock implementation of the LINK token for testing purposes
/// @dev Extends OpenZeppelin's ERC20 with Chainlink-specific transferAndCall functionality
contract MockLinkToken is ERC20 {
    /// @notice Initializes the mock LINK token
    /// @dev Mints 10,000 LINK tokens to the contract deployer
    constructor() ERC20("Mock LINK", "mLINK") {
        _mint(msg.sender, 10000 * 10**18); // Mint 10,000 LINK to deployer
    }
    
    /// @notice Transfers tokens and calls a function on the recipient if it's a contract
    /// @dev Implements the transferAndCall method required by Chainlink interfaces
    /// @param _to The address to transfer tokens to
    /// @param _value The amount of tokens to transfer
    /// @param _data Additional data to pass to the receiving contract
    /// @return success Whether the transfer and subsequent call were successful
    function transferAndCall(
        address _to,
        uint256 _value,
        bytes calldata _data
    ) 
        external
        returns (bool success)
    {
        // Transfer tokens first
        success = transfer(_to, _value);
        
        if (success && _to.code.length > 0) {
            (bool callSuccess, ) = _to.call(
                abi.encodeWithSignature(
                    "onTokenTransfer(address,uint256,bytes)",
                    msg.sender,
                    _value,
                    _data
                )
            );
            
            if (!callSuccess) {
                return success;
            }
        }
        return success;
    }
}