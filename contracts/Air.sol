// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Air is ERC20, AccessControl {
    bytes32 public constant MINTER = keccak256("MINTER");

    constructor() ERC20("Air", "AIR") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        grantRole(MINTER, msg.sender);
    }

    function mint(uint amount, address to) external onlyRole(MINTER) {
        _mint(to, amount);
    }

    function burn(uint amount, address from) external onlyRole(MINTER) {
        _burn(from, amount);
    }
}
