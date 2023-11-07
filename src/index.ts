#! /usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any */

import { APTOS_COIN, AptosAccount, AptosClient, HexString } from "aptos";
import BigNumber from "bignumber.js";
import { Command } from "commander";
import { textSync } from "figlet";
import fs from "fs";
import { parse } from "yaml";
import { description, name, version } from "../package.json";

interface EntryFunctionPayload {
  function: string;
  type_arguments: Array<string>;
  arguments: Array<any>;
}

const NODE_URL = "https://fullnode.testnet.aptoslabs.com";

const app = new Command()
  .version(version)
  .description(description)
  .option("-k, --private-key <value>", "Your wallet private key")
  .option("-n, --number <value>", "Faucet count between 1-3", "1")
  .option(
    "-c, --contract <value>",
    "Faucet contract address",
    "0x43417434fd869edee76cca2a4d2301e528a1551b1d719b75c350c3c97d15b8b9"
  )
  .parse(process.argv);

const options = app.opts();

function formatCoinAmount(amount: bigint, decimal: number) {
  return {
    Balance: BigNumber(amount.toString())
      .div(BigNumber(10).pow(decimal))
      .decimalPlaces(4)
      .toString(),
  };
}

const executeTransaction = async (
  client: AptosClient,
  account: AptosAccount,
  payload: EntryFunctionPayload
) => {
  const rawTransaction = await client.generateTransaction(
    account.address().hex(),
    payload,
    {
      max_gas_amount: "2000",
    }
  );
  const hash = await client.signAndSubmitTransaction(account, rawTransaction);
  await client.waitForTransaction(hash, { checkSuccess: true });
};

const printBalanceInfo = async (
  client: AptosClient,
  account: AptosAccount,
  faucetContract: string
) => {
  const accountResources = await client.getAccountResources(account.address());
  const aBalance = accountResources.find(
    (it) => it.type === `0x1::coin::CoinStore<${APTOS_COIN}>`
  );
  const uBalance = accountResources.find(
    (it) => it.type === `0x1::coin::CoinStore<${faucetContract}::coins::USDT>`
  );
  const bBalance = accountResources.find(
    (it) => it.type === `0x1::coin::CoinStore<${faucetContract}::coins::BTC>`
  );
  const result = {
    Aptos: formatCoinAmount((aBalance as any).data.coin.value, 8),
    USDT: formatCoinAmount((uBalance as any).data.coin.value, 6),
    BTC: formatCoinAmount((bBalance as any).data.coin.value, 8),
  };
  console.table(result);
};

const faucet = async () => {
  console.log(textSync(name));
  console.log(version);
  console.log(description);
  const faucetCount = Number(options.number);
  const faucetContract = HexString.ensure(options.contract).hex();

  if (isNaN(faucetCount) || faucetCount < 0 || faucetCount > 10) {
    app.error("Invalid faucet count");
  }

  let privateKey = options.privateKey;

  if (!privateKey) {
    // find private key from aptos config file
    try {
      const config = parse(fs.readFileSync(".aptos/config.yaml", "utf-8"));
      privateKey = config?.profiles?.default?.private_key;
    } catch (err) {
      throw Error("Can't read account private key");
    }
  }

  if (!privateKey) {
    throw Error("No private key");
  }

  const client = new AptosClient(NODE_URL);
  const mainAccount = new AptosAccount(
    HexString.ensure(privateKey).toUint8Array()
  );
  await printBalanceInfo(client, mainAccount, faucetContract);
  for (let index = 0; index < faucetCount; index++) {
    console.log(`[${index + 1}/${faucetCount}] Faucet`);
    const account = new AptosAccount();

    // Transfer to new account
    await executeTransaction(client, mainAccount, {
      function: "0x1::aptos_account::transfer",
      type_arguments: [],
      arguments: [account.address().hex(), "1000000"],
    });

    // Faucet from new account
    await executeTransaction(client, account, {
      function: `${faucetContract}::faucet::request`,
      arguments: [faucetContract],
      type_arguments: [`${faucetContract}::coins::USDT`],
    });
    await executeTransaction(client, account, {
      function: `${faucetContract}::faucet::request`,
      arguments: [faucetContract],
      type_arguments: [`${faucetContract}::coins::BTC`],
    });

    // Transfer coin back to main account

    const accountResources = await client.getAccountResources(
      account.address()
    );
    const uBalance = accountResources.find(
      (it) => it.type === `0x1::coin::CoinStore<${faucetContract}::coins::USDT>`
    );
    const bBalance = accountResources.find(
      (it) => it.type === `0x1::coin::CoinStore<${faucetContract}::coins::BTC>`
    );

    await executeTransaction(client, account, {
      function: "0x1::aptos_account::transfer_coins",
      type_arguments: [`${faucetContract}::coins::USDT`],
      arguments: [
        mainAccount.address().hex(),
        (uBalance as any).data.coin.value,
      ],
    });

    await executeTransaction(client, account, {
      function: "0x1::aptos_account::transfer_coins",
      type_arguments: [`${faucetContract}::coins::BTC`],
      arguments: [
        mainAccount.address().hex(),
        (bBalance as any).data.coin.value,
      ],
    });
  }

  await printBalanceInfo(client, mainAccount, faucetContract);
  console.log("Finish.");
};

faucet();
