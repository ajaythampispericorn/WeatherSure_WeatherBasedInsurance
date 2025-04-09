// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract MockOracle {
    address public linkToken;
    
    struct Request {
        address callbackAddress;
        bytes4 callbackFunctionId;
    }
    
    mapping(bytes32 => Request) private requests;
    
    event ChainlinkRequested(bytes32 indexed id);
    event ChainlinkFulfilled(bytes32 indexed id);
    
    constructor(address _linkToken) {
        linkToken = _linkToken;
    }
    
    function onTokenTransfer(
        address _sender,
        uint256 _amount,
        bytes calldata _data
    ) external returns (bool) {
        require(msg.sender == linkToken, "Only callable from LINK");
        
        (bytes32 requestId, address callbackAddress, bytes4 callbackFunctionId) = 
            abi.decode(_data, (bytes32, address, bytes4));
            
        requests[requestId] = Request({
            callbackAddress: callbackAddress,
            callbackFunctionId: callbackFunctionId
        });
        
        emit ChainlinkRequested(requestId);
        return true;
    }
    
    function fulfillOracleRequest(
        bytes32 _requestId,
        uint256 _weatherValue
    ) external returns (bool) {
        bytes4 callbackSelector = bytes4(keccak256("fetchWeatherData(bytes32,uint256)"));
        
        Request memory request = requests[_requestId];
        address callbackAddress = request.callbackAddress;
        
        if (callbackAddress == address(0)) {
            callbackAddress = msg.sender;
        } else {
            delete requests[_requestId];
        }
        
        (bool success, ) = callbackAddress.call(
            abi.encodeWithSelector(callbackSelector, _requestId, _weatherValue)
        );
        
        if (success) {
            emit ChainlinkFulfilled(_requestId);
        }
        
        return success;
    }
    
    function fulfillOracleRequest(
        bytes32 _requestId,
        address _callbackAddress,
        bytes4 _callbackFunctionId,
        uint256 _expiration,
        bytes calldata _data
    ) external returns (bool) {
        (bool success, ) = _callbackAddress.call(abi.encodePacked(_callbackFunctionId, _data));
        
        if (success) {
            emit ChainlinkFulfilled(_requestId);
        }
        
        return success;
    }
}