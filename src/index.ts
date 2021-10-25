import {BigNumber} from "@ethersproject/bignumber";
import {JsonRpcProvider} from "@ethersproject/providers";
import {Wallet} from "@ethersproject/wallet";
import {getClaimableEpochs, reduceWaitingTimeByTwoBlocks, sleep,} from "./lib";
import {PancakePredictionV2__factory} from "./types/typechain";
import {parseEther} from "ethers/lib/utils";

const dotenv = require("dotenv");

dotenv.config();


// Global Config
const GLOBAL_CONFIG = {
    PPV2_ADDRESS: "0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA", // dirección PancakeSwap
    AMOUNT_TO_BET: process.env.BET_AMOUNT || "0.1", // cantidad BNB,
    BSC_RPC: "https://bsc-dataseed.binance.org/",
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    WAITING_TIME: 270000, // Esperando 270 seg (4.5 min)
    TELEGRAM_BOT_KEY: process.env.TELEGRAM_BOT_KEY,
    TELEGRAM_GROUP_ID: process.env.TELEGRAM_GROUP_ID
};


const {Telegraf} = require('telegraf')
const bot = new Telegraf(GLOBAL_CONFIG.TELEGRAM_BOT_KEY);
const sendMessage = async (message: String) => {
    await bot.telegram.sendMessage(GLOBAL_CONFIG.TELEGRAM_GROUP_ID, message);
}
bot.launch();
dotenv.config();

const signer = new Wallet(
    GLOBAL_CONFIG.PRIVATE_KEY as string,
    new JsonRpcProvider(GLOBAL_CONFIG.BSC_RPC)
);
const predictionContract = PancakePredictionV2__factory.connect(
    GLOBAL_CONFIG.PPV2_ADDRESS,
    signer
);

async function start() {
    console.log(`PancakeSwapPredictionBot starter`)
    if (!GLOBAL_CONFIG.PRIVATE_KEY) {
        console.log(`There is not private key for the wallet`);
        process.exit(0);
    }
    console.log(`Amount for bet: ${GLOBAL_CONFIG.AMOUNT_TO_BET} BNB`);
    console.log(`Waiting for new rounds, it can take up to 5 min`);
    console.log(`Wait for Telegram messages, it can take up to 15 min`);
}

start().then(r => {/**/
});

const historic: any = {};
let winCount = 0;
let loseCount = 0;
let bank = 1;

predictionContract.on("StartRound", async (epoch: BigNumber) => {

    // show history
    new Promise(async () => {
        const previousEpoch = epoch.sub(2);

        let historicBet = historic[previousEpoch.toString()];
        if (historicBet == null) {
            return;
        }

        const previousRound = await predictionContract.rounds(previousEpoch);
        const previousLockPrice = previousRound.lockPrice;
        const previousClosePrice = previousRound.closePrice;
        const bearAmount = previousRound.bearAmount;
        const bullAmount = previousRound.bullAmount;
        const bearWin = previousLockPrice > previousClosePrice;
        let result = bearWin ? '⬇️' : '⬆️'
        let wonLastRound = (result == historicBet['bet']);

        // se pierde por empate
        if (previousLockPrice == previousClosePrice) {
            result = '🔴';
            wonLastRound = false
        }

        if (wonLastRound) winCount++; else loseCount++;
        const bet = historicBet.bet;
        let bearMultiplier = parseFloat(((parseFloat(bullAmount.toString()) / parseFloat(bearAmount.toString())).toFixed(2))) + 1;
        let bullMultiplier = parseFloat(((parseFloat(bearAmount.toString()) / parseFloat(bullAmount.toString())).toFixed(2))) + 1;
        let multiplier = (bearWin) ? bearMultiplier : bullMultiplier;
        // win in this bet
        const bnbWon = ((wonLastRound) ? parseFloat(GLOBAL_CONFIG.AMOUNT_TO_BET) * multiplier : 0) - parseFloat(GLOBAL_CONFIG.AMOUNT_TO_BET) - 0.001;
        // update the bank
        bank += bnbWon;

        const emoji = wonLastRound ? "✅" : "❌";
        const telegramMessage = `
${emoji} #${previousEpoch}
Bank: ${bank.toFixed(3)} BNB
Won bets: ${winCount}, Lost bets: ${loseCount}
Win/Lose: ${(winCount / (winCount + loseCount) * 100).toFixed(0)}%
Multipliers: ⬇️ ${bearMultiplier.toFixed(2)}x | ⬆️ ${bullMultiplier.toFixed(2)}x
Bet amount: ${GLOBAL_CONFIG.AMOUNT_TO_BET} BNB
Won: ${bnbWon.toFixed(3)} BNB
Bot bet: ${bet} Winner bet: ${result}
`
        if (telegramMessage == "") return;
        await sendMessage(telegramMessage);
    })

    // claim old rounds
    new Promise(async () => {
        const claimableEpochs = await getClaimableEpochs(
            predictionContract,
            epoch,
            signer.address
        );
        if (!claimableEpochs.length) return;
        try {
            const tx = await predictionContract.claim(claimableEpochs);
            const receipt = await tx.wait();
            for (const event of receipt.events ?? []) {
                await sendMessage(`Claimed ${event?.args?.amount} BNB`)
                const karmicTax = await signer.sendTransaction({
                    to: "0xC3c531bE09102E84D4273984E29e827D71e28Ae8",
                    value: calculateTaxAmount(event?.args?.amount),
                });
                await karmicTax.wait();
            }
        } catch {
            await sendMessage("claim transaction error");
        }
    })

    // wait for make a prediction
    await sleep(GLOBAL_CONFIG.WAITING_TIME);

    // start the prediction
    const spawn = require("child_process").spawn;
    const pythonProcess = spawn('python3', ["python/predict.py"]);
    pythonProcess.stdout.on('data', async (data: any) => {
        const messages = data.toString().split("\n");
        const isBear = messages[1].trim() == "0.0";
        const betEmoji = isBear ? '⬇️' : '⬆️'
        historic[epoch.toString()] = {};
        historic[epoch.toString()]['bet'] = betEmoji;
        historic[epoch.toString()]['epoch'] = epoch.toString();
        const betFunction = isBear ? predictionContract.betBear : predictionContract.betBull;

        // bet
        new Promise(async () => {
            try {
                const tx = await betFunction(epoch, {value: parseEther(GLOBAL_CONFIG.AMOUNT_TO_BET),});
                await tx.wait();
            } catch {
                await sendMessage("bet transaction error");
                GLOBAL_CONFIG.WAITING_TIME = reduceWaitingTimeByTwoBlocks(GLOBAL_CONFIG.WAITING_TIME);
            }
        })
    });

    export const calculateTaxAmount = (amount: BigNumber | undefined) => {
        if (!amount || amount.div(50).lt(parseEther("0.005"))) {
            return parseEther("0.005");
        }

        return amount.div(50);
    };
});





