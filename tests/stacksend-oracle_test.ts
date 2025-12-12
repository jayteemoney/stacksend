import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// ============================================================================
// DEPLOYMENT & INITIALIZATION TESTS
// ============================================================================

Clarinet.test({
  name: 'Ensure oracle contract deploys successfully',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const contractInfo = chain.getContract('stacksend-oracle');
    assertEquals(contractInfo !== null, true);
  },
});

Clarinet.test({
  name: 'Ensure oracle owner is set correctly',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-oracle', 'get-contract-owner', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, `${deployer.address}`);
  },
});

Clarinet.test({
  name: 'Ensure oracle is active by default',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-oracle', 'is-active', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, 'true');
  },
});

Clarinet.test({
  name: 'Ensure owner is authorized by default',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'is-authorized',
        [types.principal(deployer.address)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, 'true');
  },
});

// ============================================================================
// UPDATE EXCHANGE RATE TESTS
// ============================================================================

Clarinet.test({
  name: 'update-exchange-rate: Successfully updates rate (owner)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Update USD-KES rate to 150.5 (150.50000000 with 8 decimals)
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(15050000000)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Verify the rate was stored
    let checkBlock = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'get-exchange-rate',
        [types.ascii('USD-KES')],
        deployer.address
      ),
    ]);

    assertEquals(checkBlock.receipts[0].result.includes('u15050000000'), true);
  },
});

Clarinet.test({
  name: 'update-exchange-rate: Successfully updates rate (authorized updater)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const updater = accounts.get('wallet_1')!;

    // Authorize the updater
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'add-authorized-updater',
        [types.principal(updater.address)],
        deployer.address
      ),
    ]);

    // Update rate as authorized updater
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-NGN'), types.uint(78000000000)],
        updater.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
  },
});

Clarinet.test({
  name: 'update-exchange-rate: Fails when unauthorized',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const unauthorized = accounts.get('wallet_1')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(15050000000)],
        unauthorized.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u204)'); // err-unauthorized
  },
});

Clarinet.test({
  name: 'update-exchange-rate: Fails with rate below minimum',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Try to set rate below min-rate (u100)
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(50)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u203)'); // err-invalid-rate
  },
});

Clarinet.test({
  name: 'update-exchange-rate: Fails with rate above maximum',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Try to set rate above max-rate
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(99999999999999999)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u203)'); // err-invalid-rate
  },
});

Clarinet.test({
  name: 'update-exchange-rate: Fails with empty currency pair',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii(''), types.uint(15050000000)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u205)'); // err-invalid-pair
  },
});

Clarinet.test({
  name: 'update-exchange-rate: Fails when oracle is paused',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Pause the oracle
    chain.mineBlock([Tx.contractCall('stacksend-oracle', 'pause-oracle', [], deployer.address)]);

    // Try to update rate
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(15050000000)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u204)'); // err-unauthorized
  },
});

Clarinet.test({
  name: 'update-exchange-rate: Accepts minimum valid rate',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(100)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
  },
});

Clarinet.test({
  name: 'update-exchange-rate: Accepts maximum valid rate',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(10000000000000000)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
  },
});

// ============================================================================
// GET EXCHANGE RATE TESTS
// ============================================================================

Clarinet.test({
  name: 'get-exchange-rate: Returns rate data for existing pair',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Set a rate first
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(15050000000)],
        deployer.address
      ),
    ]);

    // Get the rate
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'get-exchange-rate',
        [types.ascii('USD-KES')],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result.includes('u15050000000'), true);
    assertEquals(block.receipts[0].result.includes('rate:'), true);
    assertEquals(block.receipts[0].result.includes('updated-at:'), true);
  },
});

Clarinet.test({
  name: 'get-exchange-rate: Fails for non-existent pair',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'get-exchange-rate',
        [types.ascii('EUR-GHS')],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u201)'); // err-not-found
  },
});

Clarinet.test({
  name: 'get-fresh-exchange-rate: Returns fresh rate',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Set a rate
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(15050000000)],
        deployer.address
      ),
    ]);

    // Get fresh rate immediately
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'get-fresh-exchange-rate',
        [types.ascii('USD-KES')],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result.includes('u15050000000'), true);
  },
});

// ============================================================================
// AUTHORIZATION TESTS
// ============================================================================

Clarinet.test({
  name: 'add-authorized-updater: Successfully adds updater (owner only)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const newUpdater = accounts.get('wallet_1')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'add-authorized-updater',
        [types.principal(newUpdater.address)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Verify authorization
    let checkBlock = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'is-authorized',
        [types.principal(newUpdater.address)],
        deployer.address
      ),
    ]);

    assertEquals(checkBlock.receipts[0].result, 'true');
  },
});

Clarinet.test({
  name: 'add-authorized-updater: Fails when called by non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const wallet = accounts.get('wallet_1')!;
    const newUpdater = accounts.get('wallet_2')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'add-authorized-updater',
        [types.principal(newUpdater.address)],
        wallet.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u200)'); // err-owner-only
  },
});

Clarinet.test({
  name: 'remove-authorized-updater: Successfully removes updater',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const updater = accounts.get('wallet_1')!;

    // Add updater first
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'add-authorized-updater',
        [types.principal(updater.address)],
        deployer.address
      ),
    ]);

    // Remove updater
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'remove-authorized-updater',
        [types.principal(updater.address)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Verify not authorized
    let checkBlock = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'is-authorized',
        [types.principal(updater.address)],
        deployer.address
      ),
    ]);

    assertEquals(checkBlock.receipts[0].result, 'false');
  },
});

Clarinet.test({
  name: 'remove-authorized-updater: Fails when called by non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const wallet = accounts.get('wallet_1')!;
    const updater = accounts.get('wallet_2')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'remove-authorized-updater',
        [types.principal(updater.address)],
        wallet.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u200)'); // err-owner-only
  },
});

Clarinet.test({
  name: 'is-authorized: Returns true for owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'is-authorized',
        [types.principal(deployer.address)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, 'true');
  },
});

Clarinet.test({
  name: 'is-authorized: Returns false for unauthorized address',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const unauthorized = accounts.get('wallet_1')!;

    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'is-authorized',
        [types.principal(unauthorized.address)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, 'false');
  },
});

// ============================================================================
// PAUSE/UNPAUSE TESTS
// ============================================================================

Clarinet.test({
  name: 'pause-oracle: Successfully pauses oracle (owner only)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-oracle', 'pause-oracle', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Check if paused
    let checkBlock = chain.mineBlock([
      Tx.contractCall('stacksend-oracle', 'is-active', [], deployer.address),
    ]);
    assertEquals(checkBlock.receipts[0].result, 'false');
  },
});

Clarinet.test({
  name: 'pause-oracle: Fails when called by non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const wallet = accounts.get('wallet_1')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-oracle', 'pause-oracle', [], wallet.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u200)'); // err-owner-only
  },
});

Clarinet.test({
  name: 'unpause-oracle: Successfully unpauses oracle',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Pause first
    chain.mineBlock([Tx.contractCall('stacksend-oracle', 'pause-oracle', [], deployer.address)]);

    // Unpause
    let block = chain.mineBlock([
      Tx.contractCall('stacksend-oracle', 'unpause-oracle', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Check if active
    let checkBlock = chain.mineBlock([
      Tx.contractCall('stacksend-oracle', 'is-active', [], deployer.address),
    ]);
    assertEquals(checkBlock.receipts[0].result, 'true');
  },
});

Clarinet.test({
  name: 'unpause-oracle: Fails when called by non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const wallet = accounts.get('wallet_1')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-oracle', 'unpause-oracle', [], wallet.address),
    ]);

    assertEquals(block.receipts[0].result, '(err u200)'); // err-owner-only
  },
});

// ============================================================================
// UTILITY FUNCTIONS TESTS
// ============================================================================

Clarinet.test({
  name: 'get-rate-decimals: Returns 8',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-oracle', 'get-rate-decimals', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, 'u8');
  },
});

Clarinet.test({
  name: 'get-max-rate-age: Returns 86400 (24 hours)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    let block = chain.mineBlock([
      Tx.contractCall('stacksend-oracle', 'get-max-rate-age', [], deployer.address),
    ]);

    assertEquals(block.receipts[0].result, 'u86400');
  },
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

Clarinet.test({
  name: 'Multiple currency pairs can be stored independently',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Set multiple rates
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(15050000000)],
        deployer.address
      ),
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-NGN'), types.uint(78000000000)],
        deployer.address
      ),
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('EUR-GHS'), types.uint(1350000000)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
    assertEquals(block.receipts[1].result, '(ok true)');
    assertEquals(block.receipts[2].result, '(ok true)');

    // Verify each rate
    let checkBlock = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'get-exchange-rate',
        [types.ascii('USD-KES')],
        deployer.address
      ),
      Tx.contractCall(
        'stacksend-oracle',
        'get-exchange-rate',
        [types.ascii('USD-NGN')],
        deployer.address
      ),
      Tx.contractCall(
        'stacksend-oracle',
        'get-exchange-rate',
        [types.ascii('EUR-GHS')],
        deployer.address
      ),
    ]);

    assertEquals(checkBlock.receipts[0].result.includes('u15050000000'), true);
    assertEquals(checkBlock.receipts[1].result.includes('u78000000000'), true);
    assertEquals(checkBlock.receipts[2].result.includes('u1350000000'), true);
  },
});

Clarinet.test({
  name: 'Rate can be updated multiple times',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Initial rate
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(15050000000)],
        deployer.address
      ),
    ]);

    // Update rate
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(15100000000)],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');

    // Verify new rate
    let checkBlock = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'get-exchange-rate',
        [types.ascii('USD-KES')],
        deployer.address
      ),
    ]);

    assertEquals(checkBlock.receipts[0].result.includes('u15100000000'), true);
  },
});

Clarinet.test({
  name: 'Authorized updater can update after authorization',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const updater = accounts.get('wallet_1')!;

    // Authorize updater
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'add-authorized-updater',
        [types.principal(updater.address)],
        deployer.address
      ),
    ]);

    // Update as authorized user
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(15050000000)],
        updater.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(ok true)');
  },
});

Clarinet.test({
  name: 'Removed updater cannot update rates',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const updater = accounts.get('wallet_1')!;

    // Authorize and then remove
    chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'add-authorized-updater',
        [types.principal(updater.address)],
        deployer.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'remove-authorized-updater',
        [types.principal(updater.address)],
        deployer.address
      ),
    ]);

    // Try to update
    let block = chain.mineBlock([
      Tx.contractCall(
        'stacksend-oracle',
        'update-exchange-rate',
        [types.ascii('USD-KES'), types.uint(15050000000)],
        updater.address
      ),
    ]);

    assertEquals(block.receipts[0].result, '(err u204)'); // err-unauthorized
  },
});
