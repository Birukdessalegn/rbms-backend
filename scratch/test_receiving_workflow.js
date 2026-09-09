const pool = require('../src/config/database');
const transfersService = require('../src/modules/inventory/transfers.service');

async function testWorkflow() {
  try {
    console.log('--- Step 1: Find a product with stock ---');
    const pRes = await pool.query(
      `SELECT p.id, p.name, i.quantity as main_qty
       FROM products p
       JOIN inventory i ON p.id = i.product_id
       WHERE i.quantity > 5
       LIMIT 1`
    );

    if (pRes.rows.length === 0) {
      console.log('No product with sufficient stock to test');
      process.exit(0);
    }

    const prod = pRes.rows[0];
    console.log(`Using product: ${prod.name} (ID: ${prod.id}, Central Qty: ${prod.main_qty})`);

    // Get a user
    const uRes = await pool.query(`SELECT id, username FROM users LIMIT 1`);
    const user = uRes.rows[0];

    console.log('\n--- Step 2: Create / Dispatch Transfer to Bar ---');
    const transfer = await transfersService.createTransfer({
      fromLocation: 'main',
      toLocation: 'bar',
      items: [{ productId: prod.id, quantity: 2, notes: 'Test restock' }],
      notes: 'Dispatched for test',
      userId: user?.id,
    });

    console.log('Created Transfer:', {
      id: transfer.id,
      number: transfer.transfer_number,
      status: transfer.status,
      from: transfer.from_location,
      to: transfer.to_location,
      dispatched_by: transfer.dispatched_by_username,
      received_by: transfer.received_by_username,
    });

    if (transfer.status !== 'dispatched') {
      throw new Error(`Expected status 'dispatched', got '${transfer.status}'`);
    }

    console.log('\n--- Step 3: Confirm Receipt at Bar ---');
    const received = await transfersService.receiveTransfer(transfer.id, {
      userId: user?.id,
      receivingNotes: 'Verified 2 bottles in good condition at Bar',
    });

    console.log('Received Transfer Result:', {
      id: received.id,
      number: received.transfer_number,
      status: received.status,
      received_by: received.received_by_username,
      received_at: received.received_at,
      receiving_notes: received.receiving_notes,
    });

    if (received.status !== 'completed') {
      throw new Error(`Expected status 'completed', got '${received.status}'`);
    }

    console.log('\n--- Step 4: Verify in getTransfers list ---');
    const allTransfers = await transfersService.getTransfers({ limit: 5 });
    const target = allTransfers.find((t) => t.id === transfer.id);
    console.log('Found in getTransfers:', {
      number: target.transfer_number,
      status: target.status,
      dispatched_by: target.dispatched_by_username,
      received_by: target.received_by_username,
      received_at: target.received_at,
      receiving_notes: target.receiving_notes,
      total_items: target.total_items,
      items: target.items,
    });

    console.log('\n✅ ALL WORKFLOW TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

testWorkflow();
