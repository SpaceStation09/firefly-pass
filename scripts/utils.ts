import { BigNumberish, parseUnits } from "ethers";

export interface GasInfo {
  safeLow: GasLevel;
  standard: GasLevel;
  fast: GasLevel;
  estimatedBaseFee?: string;
  blockTime?: number;
  blockNumber?: number;
}

export interface GasLevel {
  maxPriorityFee: BigNumberish;
  maxFee: BigNumberish;
}

export const defaultGas: GasLevel = {
  maxPriorityFee: parseUnits("35", "gwei"),
  maxFee: parseUnits("40", "gwei"),
};
