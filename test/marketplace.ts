import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ContractReceipt } from "ethers";
import { ethers, network } from "hardhat";
import { LegendaryCars, Marketplace } from "../typechain";


xdescribe('Marketplace', () => {
    const metaCID = 'qwertyuiop';
    let erc20: any;
    let erc721: LegendaryCars;
    let marketplace: Marketplace
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER'));

    beforeEach(async () => {
        [owner, user1, user2] = await ethers.getSigners();
        const AirFactory = await ethers.getContractFactory("Air");
        const LegendaryCarsFactory = await ethers.getContractFactory("LegendaryCars");
        const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
        erc20 = await AirFactory.deploy();
        erc721 = await LegendaryCarsFactory.deploy();
        marketplace = await MarketplaceFactory.deploy(erc721.address, erc20.address);

        await erc721.grantRole(MINTER_ROLE, marketplace.address);

        await erc20.mint(1000, user1.address);
        await erc20.mint(1000, user2.address);
        await erc20.connect(user1).approve(marketplace.address, 1000);
        await erc20.connect(user2).approve(marketplace.address, 1000);
    });

    it('Should create contracts correctly', async () => {
        expect(marketplace.address).be.properAddress;
        expect(erc20.address).be.properAddress;
        expect(erc721.address).be.properAddress;
    });

    it('Should create nft item', async function () {
        const tx = await marketplace.createItem(user1.address, metaCID);

        expect(await erc721.ownerOf(1)).equal(user1.address);
        expect(await erc721.tokenURI(1)).to.contain(metaCID);

        const receipt: ContractReceipt = await tx.wait();
        const events = receipt.events?.filter(x => {
            return x.event === 'ItemCreated';
        });
        const event = (events as any)[0];
        expect(event, 'ItemCreated event wasn`t emitted').be.ok;
        expect(event.args.creator).eq(user1.address);
        expect(event.args.tokenId).eq(1);
    });

    it('Should list nft item', async () => {
        await marketplace.createItem(user1.address, metaCID);
        await erc721.connect(user1).approve(marketplace.address, 1);
        const tx = await marketplace.connect(user1).listItem(1, 100);
        const listedItem = await marketplace.listedItems(1);

        expect(listedItem.seller).equal(user1.address);
        expect(Number(listedItem.price)).equal(100);
        const receipt: ContractReceipt = await tx.wait();
        const events = receipt.events?.filter(x => {
            return x.event === 'ItemListed';
        });
        const event = (events as any)[0];
        expect(event, 'ItemListed event wasn`t emitted').be.ok;
        expect(event.args.lister).eq(user1.address);
        expect(event.args.tokenId).eq(1);
        expect(event.args.price).eq(100);
    });

    it('Should buy listed nft item', async () => {
        await marketplace.createItem(owner.address, metaCID);

        await erc721.approve(marketplace.address, 1);
        await marketplace.listItem(1, 100);

        const tx = await marketplace.connect(user1).buyItem(1);

        expect(await erc721.ownerOf(1)).equal(user1.address);
        expect(Number(await erc20.balanceOf(owner.address))).equal(100);

        const receipt: ContractReceipt = await tx.wait();
        const events = receipt.events?.filter(x => {
            return x.event === 'ItemBought';
        });
        const event = (events as any)[0];
        expect(event, 'ItemBought event wasn`t emitted').be.ok;
        expect(event.args.seller).eq(owner.address);
        expect(event.args.buyer).eq(user1.address);
        expect(event.args.tokenId).eq(1);
    });

    it('Should cancel nft item listing', async () => {
        await marketplace.createItem(user1.address, metaCID);
        await erc721.connect(user1).approve(marketplace.address, 1);
        await marketplace.connect(user1).listItem(1, 100);
        await expect(marketplace.connect(user2).cancel(1)).be.revertedWith('You are not the seller');
        const tx = await marketplace.connect(user1).cancel(1);
        const listedItem = await marketplace.listedItems(1);

        expect(await erc721.ownerOf(1)).equal(user1.address);
        expect(listedItem.seller).equal(ethers.constants.AddressZero);

        const receipt: ContractReceipt = await tx.wait();
        const events = receipt.events?.filter(x => {
            return x.event === 'CanceledListing';
        });
        const event = (events as any)[0];
        expect(event, 'CanceledListing event wasn`t emitted').be.ok;
        expect(event.args.tokenId).eq(1);
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

    it('Should not make bids to item is not on auction', async () => {
        await expect(marketplace.connect(user1).makeBid(1, 200)).be.revertedWith('Token is not on auction');
    });

    it('Should not make incorrect bids', async () => {
        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await marketplace.connect(user1).makeBid(1, 200);
        
        await expect(marketplace.connect(user2).makeBid(1, 200)).be.revertedWith('Your bid is not highest');
        await expect(marketplace.connect(user1).makeBid(1, 300)).be.revertedWith('Your bid is highest');
    });

    it('Should send nft and tokens to participants on finish auction', async () => {
        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await marketplace.connect(user1).makeBid(1, 200);
        await marketplace.connect(user2).makeBid(1, 300);

        await network.provider.send("evm_increaseTime", [3 * 24 * 3600]);
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

    it('Should not return air when auction finished with no bids', async () => {
        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await network.provider.send("evm_increaseTime", [3 * 24 * 3600]);
        await network.provider.send("evm_mine");
        await marketplace.finishAuction(1);

        const auctionItem = await marketplace.auctionItems(1);
        expect(auctionItem.seller).equal(ethers.constants.AddressZero);
        expect(await erc721.ownerOf(1)).equal(owner.address);
    });

    it('Should revert finish if auction not started', async () => {
        await expect(marketplace.finishAuction(1)).be.revertedWith('Token is not on auction');
    });

    it('Should revert finish if auction is in progress', async () => {
        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await expect(marketplace.finishAuction(1)).be.revertedWith('Auction is in progress');
    });

    it('Should cancel ongoing auction', async () => {
        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await marketplace.cancelAuction(1);

        const auctionItem = await marketplace.auctionItems(1);
        expect(auctionItem.seller).equal(ethers.constants.AddressZero);
        expect(await erc721.ownerOf(1)).equal(owner.address);
        expect(await erc20.balanceOf(owner.address)).equal(0);
        expect(await erc20.balanceOf(user1.address)).equal(1000);
    });

    it('Should cancel ongoing auction and return tokens', async () => {
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

    it('Should revert cancel if sender is not seller', async () => {
        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await expect(marketplace.connect(user1).cancelAuction(1)).be.revertedWith('You are not the seller');
    });

    it('Should revert cancel if auction finished', async () => {
        await marketplace.createItem(owner.address, metaCID);
        await erc721.approve(marketplace.address, 1);
        await marketplace.listItemOnAuction(1, 100);

        await network.provider.send("evm_increaseTime", [3 * 24 * 3600]);
        await network.provider.send("evm_mine");

        await expect(marketplace.cancelAuction(1)).be.revertedWith('Auction finished');
    });
});