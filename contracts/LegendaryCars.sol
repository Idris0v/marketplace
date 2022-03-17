//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract LegendaryCars is ERC721URIStorage, AccessControl {
    bytes32 public constant MINTER = keccak256("MINTER");

    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    constructor() ERC721("LegendaryCars", "LGDC") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        grantRole(MINTER, msg.sender);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function mint(address to, string memory imageCID) external onlyRole(MINTER) returns (uint256) {
        _tokenIds.increment();

        uint256 newItemId = _tokenIds.current();
        _mint(to, newItemId);
        _setTokenURI(newItemId, imageCID);

        return newItemId;
    }

    function burn(uint tokenId) external onlyRole(MINTER) {
        _burn(tokenId);
    }

    function baseTokenURI() public pure returns (string memory) {
        return _baseURI();
    }

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://";
    }
}
