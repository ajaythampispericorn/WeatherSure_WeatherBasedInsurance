// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockLinkToken is ERC20 {
    constructor() ERC20("Mock LINK", "mLINK") {
        _mint(msg.sender, 10000 * 10**18); // Mint 10,000 LINK to deployer
    }
    
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