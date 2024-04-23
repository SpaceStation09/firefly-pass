import { expect } from "chai";
import { Signer, ZeroAddress, ZeroHash, keccak256, parseEther } from "ethers";
import hre, { network } from "hardhat";
import { MerkleTree } from "merkletreejs";
import { MaskToken, MaskToken__factory, Pass, Pass__factory } from "../types";

describe("Firefly Pass test", () => {
  let signers: Signer[];
  let deployer: Signer;
  let deployerAddress: string;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;
  let user4: Signer;
  let user1Address: string;
  let user2Address: string;
  let user3Address: string;
  let user4Address: string;
  let pass: Pass;
  let mask: MaskToken;
  let snapshotId: string;
  let whitelist: string[] = [];
  let merkleTree: MerkleTree;
  let merkleRoot: string;

  before(async () => {
    signers = await hre.ethers.getSigners();
    [deployer, user1, user2, user3, user4] = signers.slice(0, 5);
    deployerAddress = await deployer.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();
    user3Address = await user3.getAddress();
    user4Address = await user4.getAddress();

    whitelist.push(keccak256(user1Address));
    whitelist.push(keccak256(user2Address));
    whitelist.push(keccak256(user3Address));

    pass = await new Pass__factory(deployer).deploy("Firefly Pass", "Pass");
    mask = await new MaskToken__factory(deployer).deploy();
    merkleTree = new MerkleTree(whitelist, keccak256, {
      sortPairs: true,
    });
    merkleRoot = merkleTree.getHexRoot();
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
  });

  it("#Case described in doc", async () => {
    await pass.initializeActivity(ZeroAddress, 0, merkleRoot);

    //#region test mint for phase1: whitelist mint
    const leafUser1 = keccak256(user1Address);
    const proofUser1 = merkleTree.getHexProof(leafUser1);
    await pass.connect(user1).freeMint(proofUser1);
    expect(await pass.balanceOf(user1Address)).to.be.eq(1);
    await expect(pass.connect(user1).freeMint(proofUser1)).to.be.revertedWith("Pass: Already minted");
    await expect(pass.connect(user4).freeMint(proofUser1)).to.be.revertedWith("Pass: Not in whitelist");
    expect(await pass.balanceOf(user1Address)).to.be.eq(1);
    expect(await pass.balanceOf(user4Address)).to.be.eq(0);
    //#endregion

    //#region test mint for phase2: add whitelist address
    whitelist.push(keccak256(user4Address));
    merkleTree = new MerkleTree(whitelist, keccak256, {
      sortPairs: true,
    });
    merkleRoot = merkleTree.getHexRoot();
    await pass.updateWhitelist(merkleRoot);
    await expect(pass.connect(user1).freeMint(proofUser1)).to.be.revertedWith("Pass: Already minted");
    const leafUser4 = keccak256(user4Address);
    const proofUser4 = merkleTree.getHexProof(leafUser4);
    await pass.connect(user4).freeMint(proofUser4);
    expect(await pass.balanceOf(user4Address)).to.be.eq(1);
    await expect(pass.connect(user4).freeMint(proofUser4)).to.be.revertedWith("Pass: Already minted");
    //#endregion

    //#region test mint for phase3: start public sale
    await pass.setPublicMint(true);
    await expect(pass.connect(user4).freeMint(proofUser4)).to.be.revertedWith("Pass: Already minted");
    await pass.connect(signers[5]).freeMint([ZeroHash]);
    expect(await pass.balanceOf(await signers[5].getAddress())).to.be.eq(1);
    await expect(pass.connect(signers[5]).freeMint([ZeroHash])).to.be.revertedWith("Pass: Already minted");
    //#endregion

    //#region test mint for phase4: change price
    const user6Address = await signers[6].getAddress();
    await pass.changePrice(await mask.getAddress(), parseEther("1"));
    await expect(pass.connect(signers[6]).freeMint([ZeroHash])).to.be.revertedWith(
      "Pass: Insufficient balance for payment",
    );

    await mask.transfer(user6Address, parseEther("1"));
    await expect(pass.connect(signers[6]).freeMint([ZeroHash])).to.be.revertedWith(
      "Pass: Insufficient allowance for payment",
    );

    await mask.connect(signers[6]).approve(await pass.getAddress(), parseEther("1"));
    await pass.connect(signers[6]).freeMint([ZeroHash]);
    expect(await pass.balanceOf(user6Address)).to.be.eq(1);
    checkMinted([1, 4, 5, 6]);
    //#endregion

    //#region test mint for phase5: close open sale and change price
    await pass.setPublicMint(false);
    await pass.changePrice(ZeroAddress, 0);
    await expect(pass.connect(signers[7]).freeMint([ZeroHash])).to.be.revertedWith("Pass: Not in whitelist");
    const leafUser2 = keccak256(user2Address);
    const proofUser2 = merkleTree.getHexProof(leafUser2);
    await pass.connect(user2).freeMint(proofUser2);
    expect(await pass.balanceOf(user2Address)).to.be.eq(1);
    checkMinted([1, 2, 4, 5, 6]);
    //#endregion

    //#region test mint for airdrop
    await expect(pass.airdrop(user1Address)).to.be.revertedWith("Pass: Already minted");
    await pass.airdrop(await signers[7].getAddress());
    expect(await pass.balanceOf(await signers[7].getAddress())).to.be.eq(1);
    //#endregion

    const totalSupply = await pass.totalSupply();
    expect(totalSupply).to.be.eq(6);
  });

  describe("Test for each function", () => {
    it("if caller is not owner, cannot initialize the activity", async () => {
      await expect(pass.connect(user1).initializeActivity(ZeroAddress, 0, merkleRoot)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("Cannot call freeMint before initialize the activity", async () => {
      await expect(pass.connect(user1).freeMint([])).to.be.revertedWith("Pass: Activity not initialized");
    });

    it("Should withdraw token success (native token)", async () => {
      await pass.initializeActivity(ZeroAddress, parseEther("1"), merkleRoot);
      const leafUser1 = keccak256(user1Address);
      const proofUser1 = merkleTree.getHexProof(leafUser1);
      await pass.connect(user1).freeMint(proofUser1, { value: parseEther("1") });

      let contractBalanceBefore = await hre.ethers.provider.getBalance(await pass.getAddress());
      let deployerBalanceBefore = await hre.ethers.provider.getBalance(deployerAddress);
      expect(contractBalanceBefore).to.be.eq(parseEther("1"));
      await pass.withdrawToken(ZeroAddress, parseEther("1"));
      let contractBalanceAfter = await hre.ethers.provider.getBalance(await pass.getAddress());
      let deployerBalanceAfter = await hre.ethers.provider.getBalance(deployerAddress);
      expect(contractBalanceAfter).to.be.eq(0);
      expect(deployerBalanceAfter).to.be.gt(deployerBalanceBefore);

      const leafUser2 = keccak256(user2Address);
      const proofUser2 = merkleTree.getHexProof(leafUser2);
      await pass.connect(user2).freeMint(proofUser2, { value: parseEther("1") });

      contractBalanceBefore = await hre.ethers.provider.getBalance(await pass.getAddress());
      deployerBalanceBefore = await hre.ethers.provider.getBalance(deployerAddress);
      await pass.withdrawToken(ZeroAddress, parseEther("2"));
      contractBalanceAfter = await hre.ethers.provider.getBalance(await pass.getAddress());
      deployerBalanceAfter = await hre.ethers.provider.getBalance(deployerAddress);
      expect(contractBalanceAfter).to.be.eq(0);
      expect(deployerBalanceAfter - deployerBalanceBefore).to.be.lt(parseEther("1"));
    });

    it("Should withdraw token success (erc20 token)", async () => {
      await pass.initializeActivity(await mask.getAddress(), parseEther("1"), merkleRoot);
      const leafUser1 = keccak256(user1Address);
      const proofUser1 = merkleTree.getHexProof(leafUser1);
      await mask.transfer(user1Address, parseEther("1"));
      await mask.connect(user1).approve(await pass.getAddress(), parseEther("1"));
      await pass.connect(user1).freeMint(proofUser1);

      let contractBalanceBefore = await mask.balanceOf(await pass.getAddress());
      let deployerBalanceBefore = await mask.balanceOf(deployerAddress);
      expect(contractBalanceBefore).to.be.eq(parseEther("1"));
      await pass.withdrawToken(await mask.getAddress(), parseEther("1"));
      let contractBalanceAfter = await mask.balanceOf(await pass.getAddress());
      let deployerBalanceAfter = await mask.balanceOf(deployerAddress);
      expect(contractBalanceAfter).to.be.eq(0);
      expect(deployerBalanceAfter - deployerBalanceBefore).to.be.eq(parseEther("1"));

      const leafUser2 = keccak256(user2Address);
      const proofUser2 = merkleTree.getHexProof(leafUser2);
      await mask.transfer(user2Address, parseEther("1"));
      await mask.connect(user2).approve(await pass.getAddress(), parseEther("1"));
      await pass.connect(user2).freeMint(proofUser2);

      contractBalanceBefore = await mask.balanceOf(await pass.getAddress());
      deployerBalanceBefore = await mask.balanceOf(deployerAddress);
      await pass.withdrawToken(await mask.getAddress(), parseEther("2"));
      contractBalanceAfter = await mask.balanceOf(await pass.getAddress());
      deployerBalanceAfter = await mask.balanceOf(deployerAddress);
      expect(contractBalanceAfter).to.be.eq(0);
      expect(deployerBalanceAfter - deployerBalanceBefore).to.be.eq(parseEther("1"));
    });

    it("Should airdrop works fine", async () => {
      await pass.initializeActivity(ZeroAddress, parseEther("1"), merkleRoot);
      await expect(pass.connect(user1).airdrop(deployerAddress)).to.be.revertedWith("Ownable: caller is not the owner");
      //owner can airdrop to other address and ignore all limit
      await pass.airdrop(user4Address);
      expect(await pass.balanceOf(user4Address)).to.be.eq(1);
      await expect(pass.airdrop(user4Address)).to.be.revertedWith("Pass: Already minted");
    });

    it("Should airdropBatch works fine", async () => {
      await pass.initializeActivity(ZeroAddress, parseEther("1"), merkleRoot);
      await expect(pass.connect(user1).airdropBatch(deployerAddress, 100)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await pass.airdropBatch(user4Address, 100);
      const mintBatchEvent = (await pass.queryFilter(pass.filters.BatchMint()))[0];
      const result = mintBatchEvent.args;
      expect(result.recipient).to.be.eq(user4Address);
      expect(result.startTokenId).to.be.eq(0);
      expect(result.endTokenId).to.be.eq(99);
      expect(await pass.balanceOf(user4Address)).to.be.eq(100);
      const ifRecipientRecorded = await pass.mintedAddresses(user4Address);
      expect(ifRecipientRecorded).to.be.false;
    });

    it("Should mintedAddress getter works fine", async () => {
      await pass.initializeActivity(ZeroAddress, parseEther("1"), merkleRoot);
      await pass.airdrop(user4Address);
      const ifUser4Minted = await pass.mintedAddresses(user4Address);
      expect(ifUser4Minted).to.be.eq(true);

      const leafUser1 = keccak256(user1Address);
      const proofUser1 = merkleTree.getHexProof(leafUser1);
      await pass.connect(user1).freeMint(proofUser1, { value: parseEther("1") });
      const ifUser1Minted = await pass.mintedAddresses(user1Address);
      expect(ifUser1Minted).to.be.eq(true);
    });
  });

  async function checkMinted(indexes: number[]) {
    for (const index of indexes) {
      await expect(pass.connect(signers[index]).freeMint([ZeroHash])).to.be.revertedWith("Pass: Already minted");
    }
  }
});
