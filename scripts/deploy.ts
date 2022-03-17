import { ethers } from "hardhat";

async function main() {
  if (!process.env.ERC721_ADDRESS || !process.env.ERC20_ADDRESS) {
    throw new Error('ERC721_ADDRESS or ERC20_ADDRESS is not provided');
  }
  console.log('deploying LegendaryCars');
  
  const LegendaryCars = await ethers.getContractFactory("LegendaryCars");
  const legendaryCars = await LegendaryCars.deploy();
  await legendaryCars.deployed();

  console.log('deploying Air');

  const Air = await ethers.getContractFactory("Air");
  const air = await Air.deploy();
  await air.deployed();

  console.log('deploying Marketplace');
  const Marketplace = await ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy(legendaryCars.address, air.address);//(process.env.ERC721_ADDRESS, process.env.ERC20_ADDRESS);
  await marketplace.deployed();

  await legendaryCars.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER')), marketplace.address)

  console.log("LegendaryCars deployed to:", legendaryCars.address);
  console.log("Air deployed to:", air.address);
  console.log("Marketplace deployed to:", marketplace.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
