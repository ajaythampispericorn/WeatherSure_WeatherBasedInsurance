// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Mock Chainlink Oracle Contract
/// @notice A mock implementation of the Chainlink Oracle for testing
/// @dev Simulates the request-response cycle of a Chainlink Oracle node
contract MockOracle {
    /// @notice Address of the LINK token contract
    address public linkToken;
    
    /// @notice Structure to store oracle request details
    /// @dev Used to track pending requests and their callback information
    struct Request {
        address callbackAddress;
        bytes4 callbackFunctionId;
    }
    
    /// @notice Maps request IDs to their corresponding request details
    mapping(bytes32 => Request) private requests;
    
    /// @notice Emitted when a new oracle request is created
    /// @param id The ID of the created request
    event ChainlinkRequested(bytes32 indexed id);

    /// @notice Emitted when an oracle request is fulfilled
    /// @param id The ID of the fulfilled request
    event ChainlinkFulfilled(bytes32 indexed id);
    
    /// @notice Initializes the mock oracle with a reference to the LINK token
    /// @param _linkToken Address of the LINK token contract
    constructor(address _linkToken) {
        linkToken = _linkToken;
    }
    
    /// @notice Callback function used by the LINK token contract when tokens are sent
    /// @dev Processes oracle requests that are initiated by LINK token transfers
    /// @param _data ABI encoded request data (requestId, callback address, callback function ID)
    /// @return True if the request was successfully processed
    function onTokenTransfer( bytes calldata _data ) external returns (bool) {
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
    
    /// @notice Fulfills an oracle request with weather data
    /// @dev Simulates an oracle node responding with weather value
    /// @param _requestId ID of the request to fulfill
    /// @param _weatherValue Weather value to return in the response
    /// @return True if the fulfillment was successful
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
    
    /// @notice Fulfills an oracle request with custom data
    /// @dev Allows more flexibility in fulfilling requests with arbitrary data
    /// @param _requestId ID of the request to fulfill
    /// @param _callbackAddress Address to call with the response
    /// @param _callbackFunctionId Function selector to call
    /// @param _expiration Timestamp after which the request is considered expired
    /// @param _data ABI encoded response data
    /// @return True if the fulfillment was successful
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