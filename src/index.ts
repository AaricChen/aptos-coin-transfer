#! /usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any */

import colors from "ansicolor";
import { APTOS_COIN, AptosAccount, AptosClient, HexString } from "aptos";
import assert from "assert";
import BigNumber from "bignumber.js";
import { Command } from "commander";
import { textSync } from "figlet";
import fs from "fs";
import { description, version } from "../package.json";

interface EntryFunctionPayload {
  function: string;
  type_arguments: Array<string>;
  arguments: Array<any>;
}

const ENDPOINT = {
  mainnet: "https://fullnode.mainnet.aptoslabs.com",
  testnet: "https://fullnode.testnet.aptoslabs.com",
};

function formatCoinAmount(amount: bigint, decimal: number) {
  return BigNumber(amount.toString())
    .div(BigNumber(10).pow(decimal))
    .decimalPlaces(4)
    .toString();
}

function toDust(amount: BigNumber, decimal: number) {
  return amount.times(BigNumber(10).pow(decimal)).decimalPlaces(decimal);
}

async function printBalanceInfo(client: AptosClient, account: AptosAccount) {
  const accountResources = await client.getAccountResources(account.address());
  const balance = accountResources.find(
    (it) => it.type === `0x1::coin::CoinStore<${APTOS_COIN}>`
  );
  console.log(
    `Current account balance is ${colors.green(
      formatCoinAmount((balance as any).data.coin.value, 8) + " APT"
    )}`
  );
}

async function executeTransaction(
  client: AptosClient,
  account: AptosAccount,
  payload: EntryFunctionPayload
) {
  const rawTransaction = await client.generateTransaction(
    account.address().hex(),
    payload,
    {
      max_gas_amount: "2000",
    }
  );
  const hash = await client.signAndSubmitTransaction(account, rawTransaction);
  await client.waitForTransaction(hash, { checkSuccess: true });
}

new Command()
  .version(version)
  .description(description)
  .requiredOption("-k, --private-key <value>", "Your wallet private key")
  .requiredOption("--amount <value>", "Transfer amount in APT. e.g. 1.2")
  .option(
    "-f, --address-file <value>",
    "Address csv file which contains target transfer addresses. default is address.csv in current directory",
    "address.csv"
  )
  .option(
    "-n, --network <value>",
    "Aptos network. default is testnet",
    "testnet"
  )
  .action(async (options) => {
    console.log(textSync("Coin Transfer"));
    console.log(version);
    console.log(description);

    let endpoint;

    if (options.network === "testnet") {
      endpoint = ENDPOINT.testnet;
    } else if (options.network === "mainnet") {
      endpoint = ENDPOINT.mainnet;
    } else {
      throw new Error("Invalid network");
    }

    const aptosClient = new AptosClient(endpoint);
    const mainAccount = new AptosAccount(
      HexString.ensure(options.privateKey).toUint8Array()
    );

    const coinAmount = BigNumber(options.amount);
    assert(coinAmount.gt(0), "Invalid amount");
    const addressFileContent = fs.readFileSync(options.addressFile, {
      encoding: "utf-8",
    });

    const addresses = addressFileContent
      .split("\n")
      .filter((it) => it.length > 0)
      .map((it) => {
        return HexString.ensure(it);
      });

    console.log(
      `Prepare to transfer ${colors.green(
        coinAmount.toNumber() + " APT"
      )} to ${colors.blue(addresses.length)} addresses on ${colors.yellow(
        options.network
      )}.`
    );

    await printBalanceInfo(aptosClient, mainAccount);

    for (let index = 0; index < addresses.length; index++) {
      const address = addresses[index];
      console.log(
        colors.dim(`[${index + 1}/${addresses.length}] Transfer to ${address}`)
      );
      await executeTransaction(aptosClient, mainAccount, {
        function: "0x1::aptos_account::transfer",
        type_arguments: [],
        arguments: [
          HexString.ensure(address).hex(),
          toDust(coinAmount, 8).toString(),
        ],
      });
    }

    await printBalanceInfo(aptosClient, mainAccount);
    console.log(colors.green("Transfer finished."));
  })
  .parse(process.argv);

// async () => {
//   console.log(textSync(name));
//   console.log(version);
//   console.log(description);
//   const faucetCount = Number(options.number);
//   const faucetContract = HexString.ensure(options.contract).hex();

//   if (isNaN(faucetCount) || faucetCount < 0 || faucetCount > 1000) {
//     app.error("Invalid faucet count");
//   }

//   let privateKey = options.privateKey;

//   if (!privateKey) {
//     // find private key from aptos config file
//     try {
//       const config = parse(fs.readFileSync(".aptos/config.yaml", "utf-8"));
//       privateKey = config?.profiles?.default?.private_key;
//     } catch (err) {
//       throw Error("Can't read account private key");
//     }
//   }

//   if (!privateKey) {
//     throw Error("No private key");
//   }

//   const client = new AptosClient(ENDPOINT.testnet);
//   const mainAccount = new AptosAccount(
//     HexString.ensure(privateKey).toUint8Array()
//   );
//   await printBalanceInfo(client, mainAccount);
//   for (let index = 0; index < faucetCount; index++) {
//     console.log(`[${index + 1}/${faucetCount}] Faucet`);
//     const account = new AptosAccount();

//     // Transfer to new account
//     await executeTransaction(client, mainAccount, {
//       function: "0x1::aptos_account::transfer",
//       type_arguments: [],
//       arguments: [account.address().hex(), "1000000"],
//     });

//     // Faucet from new account
//     await executeTransaction(client, account, {
//       function: `${faucetContract}::faucet::request`,
//       arguments: [faucetContract],
//       type_arguments: [`${faucetContract}::coins::USDT`],
//     });
//     await executeTransaction(client, account, {
//       function: `${faucetContract}::faucet::request`,
//       arguments: [faucetContract],
//       type_arguments: [`${faucetContract}::coins::BTC`],
//     });

//     // Transfer coin back to main account

//     const accountResources = await client.getAccountResources(
//       account.address()
//     );
//     const uBalance = accountResources.find(
//       (it) => it.type === `0x1::coin::CoinStore<${faucetContract}::coins::USDT>`
//     );
//     const bBalance = accountResources.find(
//       (it) => it.type === `0x1::coin::CoinStore<${faucetContract}::coins::BTC>`
//     );

//     await executeTransaction(client, account, {
//       function: "0x1::aptos_account::transfer_coins",
//       type_arguments: [`${faucetContract}::coins::USDT`],
//       arguments: [
//         mainAccount.address().hex(),
//         (uBalance as any).data.coin.value,
//       ],
//     });

//     await executeTransaction(client, account, {
//       function: "0x1::aptos_account::transfer_coins",
//       type_arguments: [`${faucetContract}::coins::BTC`],
//       arguments: [
//         mainAccount.address().hex(),
//         (bBalance as any).data.coin.value,
//       ],
//     });
//   }

//   await printBalanceInfo(client, mainAccount);
//   console.log("Finish.");
// };
