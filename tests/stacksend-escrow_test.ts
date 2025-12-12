import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// Helper function to create a remittance
function createRemittance(
  chain: Chain,
  creator: Account,
  recipient: string,
  targetAmount: number,
  deadline: number
) {
  return chain.mineBlock([
    Tx.contractCall(
      'stacksend-escrow',
      'create-remittance',
      [
        types.principal(recipient),
        types.uint(targetAmount),
        types.uint(deadline),
        types.ascii('Test remittance'),
        types.ascii('USD-KES'),
      ],
      creator.address
    ),
  ]);
}

// ============================================================================
// DEPLOYMENT & INITIALIZATION TESTS
// ============================================================================

Clarinet.test({
  name: 'Ensure contract deploys successfully',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const contractInfo = chain.getContract('stacksend-escrow');
    assertEquals(contractInfo !== null, true);
  },
});

Clarinet.test({
  name: 'Ensure contract owner is set correctly',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'get-contract-owner', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, `${deployer.address}`);
  },
});

Clarinet.test({
  name: 'Ensure contract is not paused on deployment',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'is-paused', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, 'false');
  },
});

// ============================================================================
// CREATE-REMITTANCE TESTS
// ============================================================================

Clarinet.test({
  name: 'create-remittance: Successfully creates remittance with valid inputs',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;

    let block = createRemittance(chain, creator, recipient.address, 1000000, 1000);

    assertEquals(block.receipts.length, 1);
    assertEquals(block.receipts[0].result, '(ok u0)');
    block.receipts[0].events.expectSTXTransferEvent;
  },
});

Clarinet.test({
  name: 'create-remittance: Returns unique remittance IDs',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'create-remittance',
        [
          types.principal(recipient.address),
          types.uint(1000000),
          types.uint(1000),
          types.ascii('First remittance'),
          types.ascii('USD-KES'),
        ],
        creator.address
      ),
      Tx.contractCall(
        'stacksend-escrow',
        'create-remittance',
        [
          types.principal(recipient.address),
          types.uint(2000000),
          types.uint(1000),
          types.ascii('Second remittance'),
          types.ascii('USD-KES'),
        ],
        creator.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok u0)');
    assertEquals(block.receipts[1].result, '(ok u1)');
  },
});

Clarinet.test({
  name: 'create-remittance: Fails when recipient is creator',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;

    let block = createRemittance(chain, creator, creator.address, 1000000, 1000);

    assertEquals(block.receipts[0].result, '(err u110)'); // err-invalid-recipient
  },
});

Clarinet.test({
  name: 'create-remittance: Fails with zero target amount',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;

    let block = createRemittance(chain, creator, recipient.address, 0, 1000);

    assertEquals(block.receipts[0].result, '(err u103)'); // err-invalid-amount
  },
});

Clarinet.test({
  name: 'create-remittance: Fails with past deadline',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;

    let block = createRemittance(chain, creator, recipient.address, 1000000, 1);

    assertEquals(block.receipts[0].result, '(err u104)'); // err-invalid-deadline
  },
});

// ============================================================================
// CONTRIBUTE TESTS
// ============================================================================

Clarinet.test({
  name: 'contribute: Successfully contributes to active remittance',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    // Create remittance
    let block1 = createRemittance(chain, creator, recipient.address, 1000000, 1000);
    assertEquals(block1.receipts[0].result, '(ok u0)');

    // Contribute
    let block2 = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(500000)],
        contributor.address
      ),
    ]);

    assertEquals(block2.receipts[0].result, '(ok true)');
    block2.receipts[0].events.expectSTXTransferEvent(
      500000,
      contributor.address,
      `${chain.getContract('stacksend-escrow')?.contract_id}.stacksend-escrow`
    );
  },
});

Clarinet.test({
  name: 'contribute: Updates total-raised correctly',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(300000)],
        contributor.address
      ),
    ]);

    // Check remittance details
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'get-remittance', [types.uint(0)], creator.address),
    ]);

    // Result should contain total-raised: u300000
    assertEquals(block.receipts[0].result.includes('u300000'), true);
  },
});

Clarinet.test({
  name: 'contribute: Auto-updates status to funded when target reached',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    // Contribute exact target amount
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(1000000)],
        contributor.address
      ),
    ]);

    // Check status
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'get-remittance', [types.uint(0)], creator.address),
    ]);

    assertEquals(block.receipts[0].result.includes('"funded"'), true);
  },
});

Clarinet.test({
  name: 'contribute: Handles multiple contributions from same user',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    // First contribution
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(300000)],
        contributor.address
      ),
    ]);

    // Second contribution
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(200000)],
        contributor.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Check contribution total
    let checkBlock = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'get-contribution',
        [types.uint(0), types.principal(contributor.address)],
        creator.address
      ),
    ]);

    // Should have u500000 total
    assertEquals(checkBlock.receipts[0].result.includes('u500000'), true);
  },
});

Clarinet.test({
  name: 'contribute: Fails on non-existent remittance',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const contributor = accounts.get('wallet_3')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(999), types.uint(100000)],
        contributor.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u101)'); // err-not-found
  },
});

Clarinet.test({
  name: 'contribute: Fails with zero amount',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(0)],
        contributor.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u103)'); // err-invalid-amount
  },
});

// ============================================================================
// RELEASE-FUNDS TESTS
// ============================================================================

Clarinet.test({
  name: 'release-funds: Successfully releases funds to recipient',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    // Contribute to reach target
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(1000000)],
        contributor.address
      ),
    ]);

    // Release funds
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'release-funds', [types.uint(0)], recipient.address),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
    // Should have 2 STX transfer events: net amount to recipient + fee to owner
    assertEquals(block.receipts[0].events.length >= 2, true);
  },
});

Clarinet.test({
  name: 'release-funds: Calculates platform fee correctly (0.5%)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(1000000)],
        contributor.address
      ),
    ]);

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'release-funds', [types.uint(0)], recipient.address),
    ]);

    // Platform fee should be 5000 (0.5% of 1000000)
    // Net amount should be 995000
    const events = block.receipts[0].events;
    // Check that one transfer is 995000 (net to recipient)
    const hasNetTransfer = events.some((e: any) => e.stx_transfer_event?.amount === '995000');
    assertEquals(hasNetTransfer, true);
  },
});

Clarinet.test({
  name: 'release-funds: Only recipient can release',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(1000000)],
        contributor.address
      ),
    ]);

    // Try to release as creator (not recipient)
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'release-funds', [types.uint(0)], creator.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u102)'); // err-unauthorized
  },
});

Clarinet.test({
  name: 'release-funds: Prevents double-release',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(1000000)],
        contributor.address
      ),
    ]);

    // First release
    chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'release-funds', [types.uint(0)], recipient.address),
    ]);

    // Try second release
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'release-funds', [types.uint(0)], recipient.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u108)'); // err-invalid-status
  },
});

Clarinet.test({
  name: 'release-funds: Fails when not funded',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    // Try to release without contributions
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'release-funds', [types.uint(0)], recipient.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u108)'); // err-invalid-status
  },
});

// ============================================================================
// CANCEL-REMITTANCE TESTS
// ============================================================================

Clarinet.test({
  name: 'cancel-remittance: Successfully cancels active remittance',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'cancel-remittance', [types.uint(0)], creator.address),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
  },
});

Clarinet.test({
  name: 'cancel-remittance: Refunds all contributors correctly',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor1 = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    // Contribute
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(500000)],
        contributor1.address
      ),
    ]);

    // Cancel and refund
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'cancel-remittance', [types.uint(0)], creator.address),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
    // Should have STX transfer event for refund
    const hasRefund = block.receipts[0].events.some(
      (e: any) => e.stx_transfer_event?.amount === '500000'
    );
    assertEquals(hasRefund, true);
  },
});

Clarinet.test({
  name: 'cancel-remittance: Only creator can cancel',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const other = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    // Try to cancel as non-creator
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'cancel-remittance', [types.uint(0)], other.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u102)'); // err-unauthorized
  },
});

Clarinet.test({
  name: 'cancel-remittance: Fails on completed remittance',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    // Contribute and release
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(1000000)],
        contributor.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'release-funds', [types.uint(0)], recipient.address),
    ]);

    // Try to cancel completed remittance
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'cancel-remittance', [types.uint(0)], creator.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u108)'); // err-invalid-status
  },
});

Clarinet.test({
  name: 'cancel-remittance: Handles zero contributions gracefully',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    // Cancel with no contributions
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'cancel-remittance', [types.uint(0)], creator.address),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
  },
});

// ============================================================================
// INTEGRATION/FLOW TESTS
// ============================================================================

Clarinet.test({
  name: 'Complete flow: create → contribute → release',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    // Create
    let block1 = createRemittance(chain, creator, recipient.address, 1000000, 1000);
    assertEquals(block1.receipts[0].result, '(ok u0)');

    // Contribute
    let block2 = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(1000000)],
        contributor.address
      ),
    ]);
    assertEquals(block2.receipts[0].result, '(ok true)');

    // Release
    let block3 = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'release-funds', [types.uint(0)], recipient.address),
    ]);
    assertEquals(block3.receipts[0].result, '(ok true)');
  },
});

Clarinet.test({
  name: 'Complete flow: create → contribute → cancel',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor = accounts.get('wallet_3')!;

    // Create
    let block1 = createRemittance(chain, creator, recipient.address, 1000000, 1000);
    assertEquals(block1.receipts[0].result, '(ok u0)');

    // Contribute
    let block2 = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(500000)],
        contributor.address
      ),
    ]);
    assertEquals(block2.receipts[0].result, '(ok true)');

    // Cancel
    let block3 = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'cancel-remittance', [types.uint(0)], creator.address),
    ]);
    assertEquals(block3.receipts[0].result, '(ok true)');
  },
});

Clarinet.test({
  name: 'Multiple contributors scenario',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;
    const contributor1 = accounts.get('wallet_3')!;
    const deployer = accounts.get('deployer')!;

    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    // Multiple contributors
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(400000)],
        contributor1.address
      ),
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(600000)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
    assertEquals(block.receipts[1].result, '(ok true)');

    // Check status is funded
    let checkBlock = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'get-remittance', [types.uint(0)], creator.address),
    ]);
    assertEquals(checkBlock.receipts[0].result.includes('"funded"'), true);
  },
});

// ============================================================================
// ADMIN FUNCTIONS TESTS
// ============================================================================

Clarinet.test({
  name: 'pause-contract: Successfully pauses contract (owner only)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'pause-contract', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Check if paused
    let checkBlock = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'is-paused', [], deployer.address),
    ]);
    assertEquals(checkBlock.receipts[0].result, 'true');
  },
});

Clarinet.test({
  name: 'pause-contract: Fails when called by non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const wallet = accounts.get('wallet_1')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'pause-contract', [], wallet.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only
  },
});

Clarinet.test({
  name: 'pause-contract: Fails when already paused',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // First pause
    chain.mineBlock([Tx.contractCall('stacksend-escrow', 'pause-contract', [], deployer.address)]);

    // Try to pause again
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'pause-contract', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u109)'); // err-contract-paused
  },
});

Clarinet.test({
  name: 'unpause-contract: Successfully unpauses contract',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // First pause
    chain.mineBlock([Tx.contractCall('stacksend-escrow', 'pause-contract', [], deployer.address)]);

    // Then unpause
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'unpause-contract', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Check if unpaused
    let checkBlock = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'is-paused', [], deployer.address),
    ]);
    assertEquals(checkBlock.receipts[0].result, 'false');
  },
});

Clarinet.test({
  name: 'unpause-contract: Fails when called by non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const wallet = accounts.get('wallet_1')!;

    // Pause first
    chain.mineBlock([Tx.contractCall('stacksend-escrow', 'pause-contract', [], deployer.address)]);

    // Try to unpause with non-owner
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'unpause-contract', [], wallet.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only
  },
});

Clarinet.test({
  name: 'unpause-contract: Fails when contract is not paused',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'unpause-contract', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u108)'); // err-invalid-status
  },
});

Clarinet.test({
  name: 'update-platform-fee: Successfully updates fee within limits',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Update to 1% (100 bps)
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'update-platform-fee',
        [types.uint(100)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Check new fee
    let checkBlock = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'get-platform-fee', [], deployer.address),
    ]);
    assertEquals(checkBlock.receipts[0].result, 'u100');
  },
});

Clarinet.test({
  name: 'update-platform-fee: Fails when exceeding max fee (5%)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Try to set to 6% (600 bps) - should fail
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'update-platform-fee',
        [types.uint(600)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u103)'); // err-invalid-amount
  },
});

Clarinet.test({
  name: 'update-platform-fee: Fails when called by non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const wallet = accounts.get('wallet_1')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'update-platform-fee', [types.uint(100)], wallet.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only
  },
});

Clarinet.test({
  name: 'update-platform-fee: Accepts max fee of 500 bps (5%)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'update-platform-fee',
        [types.uint(500)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Verify fee
    let checkBlock = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'get-platform-fee', [], deployer.address),
    ]);
    assertEquals(checkBlock.receipts[0].result, 'u500');
  },
});

Clarinet.test({
  name: 'emergency-withdraw: Successfully withdraws funds (owner only)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const recipient = accounts.get('wallet_1')!;

    // First, send some STX to contract via a contribution
    const creator = accounts.get('wallet_2')!;
    const recipientWallet = accounts.get('wallet_3')!;
    createRemittance(chain, creator, recipientWallet.address, 1000000, 1000);

    chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(100000)],
        creator.address
      ),
    ]);

    // Emergency withdraw
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'emergency-withdraw',
        [types.uint(50000), types.principal(recipient.address)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
  },
});

Clarinet.test({
  name: 'emergency-withdraw: Fails when called by non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const wallet = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'emergency-withdraw',
        [types.uint(50000), types.principal(recipient.address)],
        wallet.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only
  },
});

Clarinet.test({
  name: 'emergency-withdraw: Fails with zero amount',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const recipient = accounts.get('wallet_1')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'emergency-withdraw',
        [types.uint(0), types.principal(recipient.address)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u103)'); // err-invalid-amount
  },
});

Clarinet.test({
  name: 'get-platform-fee: Returns current platform fee',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-escrow', 'get-platform-fee', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, 'u50'); // Default 0.5%
  },
});

Clarinet.test({
  name: 'Paused contract blocks create-remittance',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;

    // Pause contract
    chain.mineBlock([Tx.contractCall('stacksend-escrow', 'pause-contract', [], deployer.address)]);

    // Try to create remittance
    let block = createRemittance(chain, creator, recipient.address, 1000000, 1000);

    assertEquals(block.receipts[0].result, '(err u109)'); // err-contract-paused
  },
});

Clarinet.test({
  name: 'Paused contract blocks contribute',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const creator = accounts.get('wallet_1')!;
    const recipient = accounts.get('wallet_2')!;

    // Create remittance while unpaused
    createRemittance(chain, creator, recipient.address, 1000000, 1000);

    // Pause contract
    chain.mineBlock([Tx.contractCall('stacksend-escrow', 'pause-contract', [], deployer.address)]);

    // Try to contribute
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-escrow',
        'contribute',
        [types.uint(0), types.uint(100000)],
        creator.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u109)'); // err-contract-paused
  },
});
