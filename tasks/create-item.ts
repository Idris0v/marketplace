import { task } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";

task('createitem', 'create nft')
    .addParam('to', 'nft to mint to')
    .addParam('cid', 'ipfs cid')
    .setAction(async ({ to, cid }, { ethers }) => {
        if (!process.env.MARKETPLACE_ADDRESS) {
            throw new Error('process.env.MARKETPLACE_ADDRESS is not provided');
        }

        const marketplace = await ethers.getContractAt(
            "Marketplace",
            process.env.MARKETPLACE_ADDRESS
        );

        const tx = await marketplace.createItem(to, cid);
        await tx.wait();
    });