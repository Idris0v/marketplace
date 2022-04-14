import { deployContract, loadFixture } from "ethereum-waffle";
import { Wallet } from "ethers";

import { expect } from "chai";
import { Marketplace } from "../typechain";

import MarketplaceMock from '../artifacts/contracts/Marketplace.sol/Marketplace.json';
import ERC721Mock from '../artifacts/contracts/LegendaryCars.sol/LegendaryCars.json';
import ERC20Mock from '../artifacts/contracts/Air.sol/Air.json';
import { ethers, network } from "hardhat";

xdescribe('Marketplace', () => {
    const metaCID = 'qwertyuiop';
    const minterRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER'));

    async function fixture([owner, user1, user2]: Wallet[], provider: any) {
        const erc20 = await deployContract(owner, ERC20Mock, ['TestToken', 'TST', 18]);
        const erc721 = await deployContract(owner, ERC721Mock);
        const marketplace = (await deployContract(owner, MarketplaceMock, [erc721.address, erc20.address])) as unknown as Marketplace;

        await erc721.grantRole(minterRole, marketplace.address);

        await erc20.mint(1000, user1.address);
        await erc20.mint(1000, user2.address);
        await erc20.connect(user1).approve(marketplace.address, 1000);
        await erc20.connect(user2).approve(marketplace.address, 1000);

        return { marketplace, erc20, erc721, owner, user1, user2, provider };
    }

    it('Should create contracts correctly', async () => {
        const { marketplace, erc20, erc721, owner, user1 } = await loadFixture(fixture);
        expect(marketplace.address).be.properAddress;
        expect(erc20.address).be.properAddress;
        expect(erc721.address).be.properAddress;
    });

    it('Should create nft item', async () => {
        const { marketplace, erc20, erc721, owner, user1 } = await loadFixture(fixture);

        await marketplace.createItem(user1.address, metaCID);
        
        expect(await erc721.ownerOf(1)).equal(user1.address);
        expect(await erc721.tokenURI(1)).to.contain(metaCID);
    });

    it('Should list nft item', async () => {
        const { marketplace, erc20, erc721, owner, user1 } = await loadFixture(fixture);

        await marketplace.createItem(user1.address, metaCID);
        await erc721.connect(user1).approve(marketplace.address, 1);
        await marketplace.connect(user1).listItem(1, 100);
        const listedItem = await marketplace.listedItems(1);

        expect(listedItem.seller).equal(user1.address);
        expect(Number(listedItem.price)).equal(100);
    });

    it('Should buy listed nft item', async () => {
        const { marketplace, erc20, erc721, owner, user1 } = await loadFixture(fixture);

        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItem(1, 100);

        await marketplace.connect(user1).buyItem(1);

        expect(await erc721.ownerOf(1)).equal(user1.address);
        expect(Number(await erc20.balanceOf(owner.address))).equal(100);
    });

    it('Should cancel nft item listing', async () => {
        const { marketplace, erc20, erc721, owner, user1 } = await loadFixture(fixture);

        await marketplace.createItem(user1.address, metaCID);
        await erc721.connect(user1).approve(marketplace.address, 1);
        await marketplace.connect(user1).listItem(1, 100);

        await marketplace.connect(user1).cancel(1);
        const listedItem = await marketplace.listedItems(1);

        expect(await erc721.ownerOf(1)).equal(user1.address);
        expect(listedItem.seller).equal(ethers.constants.AddressZero);
    });

    it('Should list nft item on auction', async () => {
        const { marketplace, erc20, erc721, owner, user1, user2 } = await loadFixture(fixture);

        await marketplace.createItem(user1.address, metaCID);
        await erc721.connect(user1).approve(marketplace.address, 1);
        await marketplace.connect(user1).listItemOnAuction(1, 100);

        const auctionItem = await marketplace.auctionItems(1);

        expect(auctionItem.seller).equal(user1.address);
        expect(Number(auctionItem.minPrice)).equal(100);
        expect(Number(auctionItem.bidsCount)).equal(0);
        expect(await erc721.ownerOf(1)).equal(marketplace.address);
    });

    it('Should make bids to nft item on auction', async () => {
        const { marketplace, erc20, erc721, owner, user1, user2 } = await loadFixture(fixture);

        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await marketplace.connect(user1).makeBid(1, 200);
        expect(await erc20.balanceOf(user1.address)).equal(800);

        let auctionItem = await marketplace.auctionItems(1);
        expect(Number(auctionItem.highestBid)).equal(200);
        expect(auctionItem.highestBidder).equal(user1.address);

        await marketplace.connect(user2).makeBid(1, 300);
        expect(await erc20.balanceOf(user2.address)).equal(700);
        expect(await erc20.balanceOf(user1.address)).equal(1000);

        auctionItem = await marketplace.auctionItems(1);
        expect(Number(auctionItem.highestBid)).equal(300);
        expect(auctionItem.highestBidder).equal(user2.address);
        expect(auctionItem.bidsCount).equal(2);
    });

    xit('Should withdraw nft and tokens on finish auction', async () => {
        const { marketplace, erc20, erc721, owner, user1, user2, provider } = await loadFixture(fixture);

        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await marketplace.connect(user1).makeBid(1, 200);
        await marketplace.connect(user2).makeBid(1, 300);

        await network.provider.send("evm_increaseTime", [259200]);
        await network.provider.send("evm_mine");

        await marketplace.finishAuction(1);

        const auctionItem = await marketplace.auctionItems(1);
        expect(auctionItem.seller).equal(ethers.constants.AddressZero);
        expect(await erc20.balanceOf(owner.address)).equal(300);
        expect(await erc20.balanceOf(user2.address)).equal(700);
        expect(await erc721.ownerOf(1)).equal(user2.address);
    });

    it('Should revert auction on finish when less than 2 bids', async () => {
        const { marketplace, erc20, erc721, owner, user1, user2 } = await loadFixture(fixture);

        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await marketplace.connect(user1).makeBid(1, 200);

        await network.provider.send("evm_increaseTime", [3 * 24 * 3600]);
        await network.provider.send("evm_mine");

        await expect(marketplace.finishAuction(1)).be.revertedWith('Auction is in progress');
    });

    it('Should cancel ongoing auction', async () => {
        const { marketplace, erc20, erc721, owner, user1, user2 } = await loadFixture(fixture);

        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await marketplace.connect(user1).makeBid(1, 200);
        await marketplace.cancelAuction(1);

        const auctionItem = await marketplace.auctionItems(1);
        expect(auctionItem.seller).equal(ethers.constants.AddressZero);
        expect(await erc721.ownerOf(1)).equal(owner.address);
        expect(await erc20.balanceOf(owner.address)).equal(0);
        expect(await erc20.balanceOf(user1.address)).equal(1000);
    });
});