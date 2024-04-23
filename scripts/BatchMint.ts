import { parse } from "csv-parse/sync";
import { config as envConfig } from "dotenv";
import { AlchemyProvider, Wallet, parseUnits } from "ethers";
import fs from "fs/promises";
import path, { resolve } from "path";
import { Pass__factory } from "../types";
import { GasLevel, defaultGas } from "./utils";

envConfig({ path: resolve(__dirname, "./.env") });
const RECIPIENTS_FILE = path.resolve(__dirname, "recipients.csv");
const PASS_ADDRESS = "0xD12ce073961447Df9B8FF73bD995C338426aB816";
const alchemyId = process.env.ALCHEMY_PROJECT_ID ?? "F".repeat(32);
const privateKey = process.env.PRIVATE_KEY ?? `0x${"F".repeat(64)}`;
const alchemyProvider = new AlchemyProvider("matic-amoy", alchemyId);
const dropper = new Wallet(privateKey, alchemyProvider);

async function main() {
  const gasStation = "https://gasstation-testnet.polygon.technology/amoy";
  const res = await fetch(gasStation);
  let gasPlan: GasLevel = defaultGas;
  if (res.ok) {
    const gas = await res.json();
    const standardPriority = Math.round(parseFloat(gas.standard.maxPriorityFee)).toString();
    const standardFee = Math.round(parseFloat(gas.standard.maxFee)).toString();
    gasPlan.maxPriorityFee = parseUnits(standardPriority, "gwei");
    gasPlan.maxFee = parseUnits(standardFee, "gwei");
  }

  const data = await fs.readFile(RECIPIENTS_FILE, "utf-8");
  const columns = ["address"];
  const recipients = parse(data, { delimiter: ",", columns, from: 2, skip_empty_lines: true });

  const pass = Pass__factory.connect(PASS_ADDRESS, alchemyProvider);

  for (const recipient of recipients) {
    const tx = await pass.connect(dropper).airdrop(recipient.address, {
      maxFeePerGas: gasPlan.maxFee,
      maxPriorityFeePerGas: gasPlan.maxPriorityFee,
    });

    await tx.wait();
    console.log(`### Sending Pass to ${recipient.address} ...`);
  }
}

main();
