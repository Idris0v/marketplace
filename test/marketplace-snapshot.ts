import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { LegendaryCars, Marketplace } from "../typechain";

describe('Marketplace', function() {
    const metaCID = 'qwertyuiop';
    const minterRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER'));
    let erc20: any;
    let erc721: LegendaryCars;
    let marketplace: Marketplace
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let clean: any;

    before(async function() {
        [owner, user1, user2] = await ethers.getSigners();
        const AirFactory = await ethers.getContractFactory("Air");
        const LegendaryCarsFactory = await ethers.getContractFactory("LegendaryCars");
        const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
        erc20 = await AirFactory.deploy();
        erc721 = await LegendaryCarsFactory.deploy();
        marketplace = await MarketplaceFactory.deploy(erc721.address, erc20.address);

        await erc721.grantRole(minterRole, marketplace.address);

        await erc20.mint(1000, user1.address);
        await erc20.mint(1000, user2.address);
        await erc20.connect(user1).approve(marketplace.address, 1000);
        await erc20.connect(user2).approve(marketplace.address, 1000);

        clean = await network.provider.request({
            method: "evm_snapshot",
            params: []
        });
    });

    afterEach(async  function() {
        await network.provider.request({
            method: "evm_revert",
            params: [clean],
        });

        clean = await network.provider.request({
            method: "evm_snapshot",
            params: []
        });
    });

    it('Should create contracts correctly', async function() {
        expect(marketplace.address).be.properAddress;
        expect(erc20.address).be.properAddress;
        expect(erc721.address).be.properAddress;
    });

    it('Should create nft item', async function() {
        await marketplace.createItem(user1.address, metaCID);
        
        expect(await erc721.ownerOf(1)).equal(user1.address);
        expect(await erc721.tokenURI(1)).to.contain(metaCID);
    });

    it('Should list nft item', async function() {
        await marketplace.createItem(user1.address, metaCID);
        await erc721.connect(user1).approve(marketplace.address, 1);
        await marketplace.connect(user1).listItem(1, 100);
        const listedItem = await marketplace.listedItems(1);

        expect(listedItem.seller).equal(user1.address);
        expect(Number(listedItem.price)).equal(100);
    });

    it('Should buy listed nft item', async function() {
        await marketplace.createItem(owner.address, metaCID);
        
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItem(1, 100);

        await marketplace.connect(user1).buyItem(1);

        expect(await erc721.ownerOf(1)).equal(user1.address);
        expect(Number(await erc20.balanceOf(owner.address))).equal(100);
    });

    it('Should cancel nft item listing', async () => {
        await marketplace.createItem(user1.address, metaCID);
        await erc721.connect(user1).approve(marketplace.address, 1);
        await marketplace.connect(user1).listItem(1, 100);

        await marketplace.connect(user1).cancel(1);
        const listedItem = await marketplace.listedItems(1);

        expect(await erc721.ownerOf(1)).equal(user1.address);
        expect(listedItem.seller).equal(ethers.constants.AddressZero);
    });

    it('Should list nft item on auction', async () => {
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

    it('Should withdraw nft and tokens on finish auction', async () => {
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

    it('Should return assets when auction finished with less than 2 bids', async () => {
        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await marketplace.connect(user1).makeBid(1, 200);

        await network.provider.send("evm_increaseTime", [3 * 24 * 3600]);
        await network.provider.send("evm_mine");
        await marketplace.finishAuction(1);

        const auctionItem = await marketplace.auctionItems(1);
        expect(auctionItem.seller).equal(ethers.constants.AddressZero);
        expect(await erc20.balanceOf(user1.address)).equal(1000);
        expect(await erc721.ownerOf(1)).equal(owner.address);
    });

    it('Should cancel ongoing auction', async () => {
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