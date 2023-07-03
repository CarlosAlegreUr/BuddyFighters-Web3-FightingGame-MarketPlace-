const { assert, expect } = require("chai");
const { ethers, getNamedAccounts, deployments } = require("hardhat");

const { prices } = require("../../../../businessConstants.json");

describe("BFNFTFightsManager.sol tests", function () {
    let deployer,
        client1,
        client2,
        BFNFTFightsManagerContract,
        BFNFTFightsManagerClient1,
        fightStartedEventFilter,
        fightResultEventFilter,
        priceForFightTicket,
        betInEthers,
        startFightValues,
        fightId;
    // Helper functions
    async function allowStartFight(player, inputs) {
        const types = [
            { type: "string[2]" },
            { type: "uint256[2]" },
            { type: "uint256[2]" },
            { type: "bool" },
        ];
        const coder = new ethers.AbiCoder();
        const abiEncodedInput = await coder.encode(types, inputs);
        const validInput = await ethers.keccak256(abiEncodedInput);
        await BFNFTFightsManagerContract.allowInputs(
            player,
            [validInput],
            "startFight(address[2],uint256[2],uint256[2],bool)",
            false
        );
    }

    async function getFightId(players, tokenIds) {
        const types = [
            { type: "address" },
            { type: "address" },
            { type: "uint256" },
            { type: "uint256" },
        ];
        const inputs = [players[0], players[1], tokenIds[0], tokenIds[1]];
        const coder = new ethers.AbiCoder();
        const abiEncodedInput = await coder.encode(types, inputs);
        const fightId = await ethers.keccak256(abiEncodedInput);
        return fightId;
    }

    // Tests
    beforeEach(async function () {
        const {
            deployer: d,
            client1: c,
            client2: c2,
        } = await getNamedAccounts();
        deployer = d;
        client1 = c;
        client2 = c2;
        // Contracts with different signers
        inputControlModularJustContract = await ethers.getContract(
            "InputControlModularFight"
        );
        BFNFTFightsManagerContract = await ethers.getContract(
            "BFNFTFightsManager",
            deployer
        );
        BFNFTFightsManagerClient1 = await ethers.getContract(
            "BFNFTFightsManager",
            client1
        );
        BFNFTFightsManagerClient2 = await ethers.getContract(
            "BFNFTFightsManager",
            client2
        );
        // Event filters
        fightStartedEventFilter = await BFNFTFightsManagerContract.filters
            .BFNFT__FManager__FightStarted;
        fightResultEventFilter = await BFNFTFightsManagerContract.filters
            .BFNFT__FManager__FightResult;

        // Prices
        priceForFightTicket = await ethers.parseEther(
            await prices.fightTicket.toString()
        );
        betInEthers = await ethers.parseEther("0.1");
        fightId = await getFightId([client1, client2], [1, 0]);
        startFightValues = [
            [client1, client2],
            [1, 0],
            [betInEthers, betInEthers],
            false,
        ];
    });

    it("buyTicket(): Only buys 1 ticket per call.", async () => {
        let ticketsOfC1 = await ethers.toNumber(
            await BFNFTFightsManagerContract.getTicketsOf(client1)
        );
        assert.equal(0, ticketsOfC1);
        await BFNFTFightsManagerClient1.buyTicket({
            value: priceForFightTicket,
        });
        ticketsOfC1 = await ethers.toNumber(
            await BFNFTFightsManagerContract.getTicketsOf(client1)
        );
        assert.equal(1, ticketsOfC1);
        await BFNFTFightsManagerClient2.buyTicket({
            value: priceForFightTicket,
        });
        await BFNFTFightsManagerClient1.buyTicket({
            value: priceForFightTicket,
        });
        await BFNFTFightsManagerClient2.buyTicket({
            value: priceForFightTicket,
        });
    });

    it("setBet(): Is called correctly.", async () => {
        await BFNFTFightsManagerClient1.setBet({
            value: betInEthers,
        });
        await BFNFTFightsManagerClient2.setBet({
            value: betInEthers,
        });
    });

    it("startFight(): Owner can't start fights.", async () => {
        await expect(
            BFNFTFightsManagerContract.startFight(
                [client1, client2],
                [0, 1],
                [betInEthers, betInEthers],
                false
            )
        ).to.be.revertedWithCustomError(
            BFNFTFightsManagerContract,
            "BFNFT__FManager__OwnerMusntCallStartFightToPreventAbuse"
        );
    });

    it("startFight(): If called as expected, fights start correctly and event emitted.", async () => {
        // Tickets and players' bets have been set before in the tests above.
        await expect(
            BFNFTFightsManagerClient1.startFight(
                [client1, client2],
                [0, 1],
                [betInEthers, betInEthers],
                false
            )
        ).to.be.revertedWithCustomError(
            inputControlModularJustContract,
            "InputControlModular__NotAllowedInput"
        );
        // To later check if tickets correctly decrease.
        const ticketsC1prev = await BFNFTFightsManagerContract.getTicketsOf(
            client1
        );
        const ticketsC2prev = await BFNFTFightsManagerContract.getTicketsOf(
            client2
        );

        // Giving permission to players
        await allowStartFight(client1, startFightValues);
        await allowStartFight(client2, startFightValues);

        // Permision given to both players, checking for
        // correct fightId update and emitted event startFightValues.
        // Notice getFightId() is tested here too
        let fightState = await BFNFTFightsManagerContract.getIsFightActive(
            fightId
        );
        assert.equal(fightState, false);
        // Getting event from logs

        const types = [
            { type: "string[2]" },
            { type: "uint256[2]" },
            { type: "uint256[2]" },
            { type: "bool" },
        ];
        const inputs = [
            [client1, client2],
            [1, 0],
            [betInEthers, betInEthers],
            false,
        ];
        const coder = new ethers.AbiCoder();
        const abiEncodedInput = await coder.encode(types, inputs);
        const validInput = await ethers.keccak256(abiEncodedInput);

        const xd = await inputControlModularJustContract.getAllowedInputs(
            "startFight(address[2],uint256[2],uint256[2],bool)",
            client1
        );

        const executed = await BFNFTFightsManagerContract.whatsGoingOn(
            [client1, client2],
            [1, 0],
            [betInEthers, betInEthers],
            false
        );
        const txResponse = await BFNFTFightsManagerClient1.startFight(
            [client1, client2],
            [1, 0],
            [betInEthers, betInEthers],
            false
        );
        const txReceipt = await txResponse.wait();
        const txBlock = txReceipt.blockNumber;
        const query = await BFNFTFightsManagerContract.queryFilter(
            fightStartedEventFilter,
            txBlock
        );
        const fightIdSet = query[0].args[0];
        assert.deepEqual(fightId, fightIdSet);
        fightState = awaitBFNFTFightsManagerContract.getIsFightActive(fightId);
        assert.equal(fightState, true);

        // Only 1 ticket should have been used.
        let ticketsC1later = await BFNFTFightsManagerContract.getTicketsOf(
            client1
        );
        let ticketsC2later = await BFNFTFightsManagerContract.getTicketsOf(
            client2
        );
        assert.equal(ticketsC1prev, ticketsC1later + 1);
        assert.equal(ticketsC2prev, ticketsC2later + 1);

        await expect(
            BFNFTFightsManagerClient2.startFight(
                [client1, client2],
                [1, 0],
                [betInEthers, betInEthers],
                false
            )
        ).to.be.revertedWithCustomError(
            BFNFTFightsManagerContract,
            "BFNFT__FManager__CalledByOponentAlreadyDontWorry"
        );

        // Only 1 ticket should still have been used.
        ticketsC1later = await BFNFTFightsManagerContract.getTicketsOf(client1);
        ticketsC2later = await BFNFTFightsManagerContract.getTicketsOf(client2);
        assert.equal(ticketsC1prev, ticketsC1later + 1);
        assert.equal(ticketsC2prev, ticketsC2later + 1);
    });

    it("setBet(): Player can't bet during battle.", async () => {
        await expect(
            BFNFTFightsManagerClient1.setBet({
                value: betInEthers,
            })
        ).to.be.revertedWithCustomError(
            BFNFTFightsManagerContract,
            "BFNFT__FManager__CantBetDuringFight"
        );
        await expect(
            BFNFTFightsManagerClient2.setBet({
                value: betInEthers,
            })
        ).to.be.revertedWithCustomError(
            BFNFTFightsManagerContract,
            "BFNFT__FManager__CantBetDuringFight"
        );
    });

    it("declareWinner(): Only owner can call it.", async () => {
        await expect(
            BFNFTFightsManagerClient1.declareWinner(fightId, client1, [
                client1,
                client2,
            ])
        ).to.be.reverted;
        await expect(
            BFNFTFightsManagerClient2.declareWinner(fightId, client2, [
                client1,
                client2,
            ])
        ).to.be.reverted;
    });

    it("declareWinner(): Player set as winner recieves the price and event is emitted correctly.", async () => {
        const provider = new ethers.JsonRpcProvider("http://localhost:8545");
        const prevBalanceC1 = await provider.getBalance(client1);

        const prevBalanceC2 = await provider.getBalance(client2);

        const txResponse = await BFNFTFightsManagerContract.declareWinner(
            fightId,
            client1,
            [client1, client2]
        );
        const txReceipt = await txResponse.wait();
        const txBlock = txReceipt.blockNumber;
        const query = await BFNFTFightsManagerContract.queryFilter(
            fightResultEventFilter,
            txBlock
        );
        const fightIdSet = query[0].args[0];
        const winner = query[0].args[1];
        assert.deepEqual(fightId, fightIdSet);
        assert.deepEqual(client1, winner);

        const currentBalanceC1 = await provider.getBalance(client1);
        assert.isAbove(currentBalanceC1, prevBalanceC1);

        const currentBalanceC2 = await provider.getBalance(client2);
        assert.equal(currentBalanceC2, prevBalanceC2);
    });

    it("declareWinner(): Fight settings are reseted.", async () => {
        let fightState = await BFNFTFightsManagerContract.getIsFightActive(
            fightId
        );
        assert.equal(fightState, false);
    });

    it("startFight(): Tickets of players must be higher than 0.", async () => {
        await allowStartFight(client1, startFightValues);
        await expect(
            BFNFTFightsManagerClient1.startFight(
                [client1, client2],
                [1, 0],
                [betInEthers, betInEthers],
                false
            )
        ).to.be.revertedWithCustomError(
            BFNFTFightsManagerContract,
            "BFNFT__FManager__PlayerHasNoTitckets"
        );
    });

    it("startFight(): If a bet sent is lower than agreed, tickets to 0 penalty is applied all bets are returned.", async () => {
        // Player 1 wont set the bet correctly.
        await BFNFTFightsManagerClient1.buyTicket({
            value: priceForFightTicket,
        });
        await BFNFTFightsManagerClient1.buyTicket({
            value: priceForFightTicket,
        });
        await BFNFTFightsManagerClient1.buyTicket({
            value: priceForFightTicket,
        });
        const ticketsOfC1prev = await ethers.toNumber(
            await BFNFTFightsManagerContract.getTicketsOf(client1)
        );
        assert.notEqual(0, ticketsOfC1prev);
        const ticketsOfC2prev = await ethers.toNumber(
            await BFNFTFightsManagerContract.getTicketsOf(client2)
        );

        await allowStartFight(client2, startFightValues);
        await BFNFTFightsManagerClient2.buyTicket({
            value: priceForFightTicket,
        });
        await BFNFTFightsManagerClient2.setBet(betInEthers);

        const provider = new ethers.JsonRpcProvider("http://localhost:8545");
        const prevBalanceC1 = await provider.getBalance(client1);
        const prevBalanceC2 = await provider.getBalance(client2);

        // Client2 which bet as it should wants to start but 1 doesn't bet.
        await BFNFTFightsManagerClient2.startFight(
            [client1, client2],
            [1, 0],
            [betInEthers, betInEthers],
            false
        );

        // Client 1 can't call startFight now.
        await expect(
            BFNFTFightsManagerClient1.startFight(
                [client1, client2],
                [1, 0],
                [betInEthers, betInEthers],
                false
            )
        ).to.be.reverted;

        // Client 2 behave properly so it's bet is returned.
        const currentBalanceC2 = await provider.getBalance(client2);
        assert.isAbove(currentBalanceC2, prevBalanceC2);
        const currentBalanceC1 = await provider.getBalance(client1);
        assert.equal(currentBalanceC1, prevBalanceC1);

        // Client 1 didnt bet what he said, punishment tickets go to 0.
        const ticketsOfC1 = await ethers.toNumber(
            await BFNFTFightsManagerContract.getTicketsOf(client1)
        );
        // Client 2 should have same tickets.
        assert.equal(0, ticketsOfC1);
        const ticketsOfC2 = await ethers.toNumber(
            await BFNFTFightsManagerContract.getTicketsOf(client2)
        );
        assert.equal(ticketsOfC2prev, ticketsOfC2);
    });

    it("buyTicket(): Must pay the correct price.", async () => {
        const badPrice = await ethers.parseEther(
            await (prices.fightTicket - 0.01).toString()
        );
        await expect(
            BFNFTFightsManagerClient1.buyTicket({ value: badPrice })
        ).to.be.revertedWithCustomError(
            BFNFTFightsManagerContract,
            "BFNFT__FManager__NotPayedEnough"
        );
    });
});