// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "./ILCars.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Marketplace {
    ILCars public immutable nft;
    IERC20 public immutable tokens;

    uint public constant AUCTION_DURATION = 3 days;

    struct ListedItem {
        address seller;
        uint price;
        bool onSale;
    }

    struct AuctionItem {
        address seller;
        uint minPrice;
        bool onSale;
        uint startTime;
        uint highestBid;
        address highestBidder;
        uint bidsCount;
    }

    mapping(uint => ListedItem) public listedItems;
    mapping(uint => AuctionItem) public auctionItems;

    event ItemCreated(address indexed creator, uint indexed tokenId);
    event ItemListed(address indexed lister, uint indexed tokenId, uint price);
    event ItemBought(address indexed seller, address indexed buyer, uint indexed tokenId);
    event CanceledListing(uint indexed tokenId);

    constructor(address _nft, address _tokens) {
        nft = ILCars(_nft);
        tokens = IERC20(_tokens);
    }

    function createItem(address to, string memory imageCID) external {
        uint tokenId = nft.mint(to, imageCID);
        emit ItemCreated(to, tokenId);
    }

    function listItem(uint tokenId, uint price) external {
        nft.transferFrom(msg.sender, address(this), tokenId);
        listedItems[tokenId] = ListedItem(msg.sender, price, true);
        emit ItemListed(msg.sender, tokenId, price);
    }

    function buyItem(uint tokenId) external {
        ListedItem storage item = listedItems[tokenId];
        tokens.transferFrom(msg.sender, item.seller, item.price);
        nft.safeTransferFrom(address(this), msg.sender, tokenId);
        emit ItemBought(item.seller, msg.sender, tokenId);
        delete listedItems[tokenId];
    }

    function cancel(uint tokenId) external {
        require(msg.sender == listedItems[tokenId].seller, "You are not the seller");
        nft.transferFrom(address(this), msg.sender, tokenId);
        delete listedItems[tokenId];
        emit CanceledListing(tokenId);
    }
 
    function listItemOnAuction(uint tokenId, uint minPrice) external {
        nft.transferFrom(msg.sender, address(this), tokenId);
        auctionItems[tokenId] = AuctionItem(msg.sender, minPrice, true, block.timestamp, minPrice, address(0), 0);
    }
 
    function makeBid(uint tokenId, uint price) external {
        AuctionItem storage item = auctionItems[tokenId];
        require(item.onSale, "Token is not on auction");
        require(price > item.highestBid, "Your bid is not highest");
        require(msg.sender != item.highestBidder, "Your bid is highest");
        tokens.transferFrom(msg.sender, address(this), price);
        if (item.highestBidder != address(0)) {
            tokens.transfer(item.highestBidder, item.highestBid);
        }
        item.bidsCount += 1;
        item.highestBid = price;
        item.highestBidder = msg.sender;
    }
 
    function finishAuction(uint tokenId) external {
        AuctionItem storage item = auctionItems[tokenId];
        require(item.onSale, "Token is not on auction");
        require(item.startTime + AUCTION_DURATION < block.timestamp, "Auction is in progress");
        if (item.bidsCount > 1) {
            tokens.transfer(item.seller, item.highestBid);
            nft.safeTransferFrom(address(this), item.highestBidder, tokenId);
        } else {
            if (item.highestBidder != address(0)) {
                tokens.transfer(item.highestBidder, item.highestBid);
            }
            nft.safeTransferFrom(address(this), item.seller, tokenId);
        }
        delete auctionItems[tokenId];
    }
 
    function cancelAuction(uint tokenId) external {
        AuctionItem storage item = auctionItems[tokenId];
        require(msg.sender == item.seller, "You are not the seller");
        require(item.startTime + AUCTION_DURATION > block.timestamp, "Auction finished");
        if (item.highestBidder != address(0)) {
            tokens.transfer(item.highestBidder, item.highestBid);
        }
        nft.safeTransferFrom(address(this), item.seller, tokenId);
        delete auctionItems[tokenId];
    }
}