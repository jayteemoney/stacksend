import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure contract deploys successfully",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;

        // Verify contract is deployed
        const contractInfo = chain.getContract('stacksend-escrow');
        assertEquals(contractInfo !== null, true);
    },
});

Clarinet.test({
    name: "Ensure contract owner is set correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;

        let block = chain.mineBlock([
            Tx.contractCall(
                'stacksend-escrow',
                'get-contract-owner',
                [],
                deployer.address
            )
        ]);

        assertEquals(block.receipts[0].result, `${deployer.address}`);
    },
});

Clarinet.test({
    name: "Ensure contract is not paused on deployment",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;

        let block = chain.mineBlock([
            Tx.contractCall(
                'stacksend-escrow',
                'is-paused',
                [],
                deployer.address
            )
        ]);

        assertEquals(block.receipts[0].result, 'false');
    },
});

// Additional tests will be added across Days 9-10 as per PROJECT_PLAN.md
