import { parse } from "csv-parse/sync";
import { config as envConfig } from "dotenv";
import { AlchemyProvider, isAddress, parseUnits, Wallet } from "ethers";
import fs from "fs/promises";
import path, { resolve } from "path";
import { Pass__factory } from "../types";
import { defaultGas, GasLevel } from "./utils";

envConfig({ path: resolve(__dirname, "./.env") });
const RECIPIENTS_FILE = path.resolve(__dirname, "recipients.csv");
const PASS_ADDRESS = "0x8D03d9b43e98Cc2f790Be4E96503fD0CcFd04a2D";
const alchemyId = process.env.ALCHEMY_PROJECT_ID ?? "F".repeat(32);
const privateKey = process.env.PRIVATE_KEY ?? `0x${"F".repeat(64)}`;
const etherscanAPI = process.env.ETHERSCAN_KEY ?? `0x${"F".repeat(64)}`;
const alchemyProvider = new AlchemyProvider("matic", alchemyId);
const dropper = new Wallet(privateKey, alchemyProvider);

async function main() {
  const gasStation = `https://api.polygonscan.com/api?module=gastracker&action=gasoracle&apikey=${etherscanAPI}`;
  const res = await fetch(gasStation);
  let gasPlan: GasLevel = defaultGas;
  if (res.ok) {
    const gas = await res.json();
    const standardGasPrice = Math.round(parseFloat(gas.result.ProposeGasPrice));
    const standardBaseFee = Math.round(parseFloat(gas.result.suggestBaseFee));
    const suggestedPriority = (standardGasPrice - standardBaseFee).toString();
    gasPlan.maxPriorityFee = parseUnits(suggestedPriority, "gwei");
  }

  const data = await fs.readFile(RECIPIENTS_FILE, "utf-8");
  const columns = ["address"];
  const recipients = parse(data, { delimiter: ",", columns, from: 2, skip_empty_lines: true });
  for (const recipient of recipients) {
    const isAddr = isAddress(recipient.address);
    if (!isAddr) console.log(recipient.address);
  }
  const pass = Pass__factory.connect(PASS_ADDRESS, alchemyProvider);

  for (const recipient of recipients) {
    console.log(`### Sending Pass to ${recipient.address} ...`);
    const isMinted = await pass.mintedAddresses(recipient.address);
    if (isMinted) {
      console.log(`### ${recipient.address} Already Minted`);
      continue;
    }
    const tx = await pass.connect(dropper).airdrop(recipient.address, {
      maxPriorityFeePerGas: gasPlan.maxPriorityFee,
    });
    console.log(`Tx: ${tx.hash}`);
  }
}

main();
