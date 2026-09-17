import { Router, Request, Response } from 'express';
import { getDatabase, now, parseRowJson, withTxn } from '../db';
import { randomUUID } from 'crypto';
import { requireRole } from '../middleware/security';
import { ROLE_ACCESS } from '../../shared/role-permissions';
import { notifyKdsUpdate } from '../services/kds';
import { cloudSync } from '../services/cloud-sync';

const router = Router();

const ACTIVE_ORDER_STATUS_SQL = "status NOT IN ('completed', 'cancelled')";

function activeOrderForTable(db: ReturnType<typeof getDatabase>, tableId: string, orderId?: number | string) {
  const whereOrder = orderId ? ' AND o.id = ?' : '';
  const params = orderId ? [tableId, orderId] : [tableId];
  const order = parseRowJson(db.prepare(`
    SELECT o.*, u.name AS waiter_name FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE o.table_id = ? AND o.status NOT IN ('completed', 'cancelled')${whereOrder}
    ORDER BY o.created_at DESC LIMIT 1
  `).get(...params) as any);
  if (!order?.customer_id) return order;

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id);
  return { ...order, customer: customer || null };
}

function itemReadinessForOrder(db: ReturnType<typeof getDatabase>, orderId: number) {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS n FROM order_items
    WHERE order_id = ? AND status NOT IN ('cancelled', 'voided', 'void_adjustment', 'refunded')
    GROUP BY status
  `).all(orderId) as { status: string; n: number }[];
  const readiness: Record<string, number> = {};
  for (const row of rows) readiness[row.status] = row.n;
  return readiness;
}

function tableShape(table: any, activeOrder?: any, db?: ReturnType<typeof getDatabase>) {
  const currentOrder = activeOrder || null;
  return {
    ...table,
    name: table.number,
    activeOrder: currentOrder,
    current_order: currentOrder,
    order_total: currentOrder ? currentOrder.total : null,
    stay_started_at: currentOrder ? currentOrder.created_at : null,
    waiter_name: currentOrder?.waiter_name || null,
    item_readiness: currentOrder && db ? itemReadinessForOrder(db, currentOrder.id) : null,
  };
}

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    let query = 'SELECT * FROM tables WHERE 1=1';
    const params: any[] = [];

    if (req.query.status) {
      query += ' AND status = ?';
      params.push(req.query.status);
    }
    if (req.query.floor) {
      query += ' AND floor = ?';
      params.push(req.query.floor);
    }
    if (req.query.section) {
      query += ' AND section = ?';
      params.push(req.query.section);
    }
    if (req.query.kitchen_station_id) {
      query += ' AND kitchen_station_id = ?';
      params.push(req.query.kitchen_station_id);
    }
    if (req.query.active === 'true' || req.query.active === '1') {
      query += ' AND is_active = 1';
    }

    query += ' ORDER BY number';

    const rows = db.prepare(query).all(...params);
    // Normalize: frontend expects `name`, schema column is `number`
    const tables = rows.map((t: any) => tableShape(t, activeOrderForTable(db, t.id), db));
    res.json({ tables });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const activeOrder = activeOrderForTable(db, req.params.id as string);

    // Normalize: frontend expects `name`, schema column is `number`
    res.json({ table: tableShape(table as any, activeOrder, db) });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post('/', requireRole(...ROLE_ACCESS.ownerManager), (req: Request, res: Response) => {
  try {
    // Accept `number` (schema column) or `name` (legacy frontend field)
    const { number, name, capacity, floor, section, position_x, position_y, kitchen_station_id } = req.body;
    const tableNumber = number || name;

    if (!tableNumber) {
      return res.status(400).json({ error: 'Table number is required' });
    }

    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM tables WHERE number = ?').get(tableNumber) as any;
    if (existing) {
      if (existing.is_active === 0) {
        return res.status(400).json({ error: `Table ${tableNumber} already exists but is deactivated. Please reactivate it from the list.` });
      } else {
        return res.status(400).json({ error: 'Table number already exists' });
      }
    }

    const tableId = `tbl-${randomUUID().slice(0, 8)}`;
    const result = db.prepare(`
      INSERT INTO tables (id, number, capacity, floor, section, position_x, position_y, kitchen_station_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tableId, tableNumber, capacity || 4, floor || null, section || null,
      position_x || null, position_y || null, kitchen_station_id || null, now(), now()
    );

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);
    res.status(201).json({ table });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put('/:id', requireRole(...ROLE_ACCESS.ownerManager), (req: Request, res: Response) => {
  try {
    const { number, name, capacity, floor, section, position_x, position_y, kitchen_station_id } = req.body;
    const tableNumber = number || name;
    const db = getDatabase();

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    if (tableNumber) {
      const existing = db.prepare('SELECT * FROM tables WHERE number = ? AND id != ?').get(tableNumber, req.params.id);
      if (existing) {
        return res.status(400).json({ error: 'Table number already exists' });
      }
    }

    db.prepare(`
      UPDATE tables SET
        number = COALESCE(?, number),
        capacity = COALESCE(?, capacity),
        floor = COALESCE(?, floor),
        section = COALESCE(?, section),
        position_x = COALESCE(?, position_x),
        position_y = COALESCE(?, position_y),
        kitchen_station_id = COALESCE(?, kitchen_station_id),
        updated_at = ?
      WHERE id = ?
    `).run(tableNumber, capacity, floor, section, position_x, position_y, kitchen_station_id, now(), req.params.id);

    const updated = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    res.json({ table: updated });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post('/:id/deactivate', requireRole(...ROLE_ACCESS.ownerManager), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id) as any;
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    if (table.is_active === 0) {
      return res.status(400).json({ error: 'Already deactivated' });
    }

    const activeOrder = db.prepare(`
      SELECT * FROM orders WHERE table_id = ? AND ${ACTIVE_ORDER_STATUS_SQL}
    `).get(req.params.id);
    if (activeOrder) {
      return res.status(400).json({ error: 'Cannot deactivate table with active orders' });
    }

    db.prepare('UPDATE tables SET is_active = 0, updated_at = ? WHERE id = ?').run(now(), req.params.id);
    const updated = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    res.json({ table: tableShape(updated as any) });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post('/:id/reactivate', requireRole(...ROLE_ACCESS.ownerManager), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id) as any;
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    if (table.is_active === 1) {
      return res.status(400).json({ error: 'Already active' });
    }

    db.prepare('UPDATE tables SET is_active = 1, updated_at = ? WHERE id = ?').run(now(), req.params.id);
    const updated = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    res.json({ table: tableShape(updated as any) });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post('/:id/move-order', requireRole(...ROLE_ACCESS.sales), (req: Request, res: Response) => {
  try {
    const sourceTableId = req.params.id as string;
    const { target_table_id, order_id } = req.body;

    if (!target_table_id) {
      return res.status(400).json({ error: 'target_table_id is required' });
    }
    if (target_table_id === sourceTableId) {
      return res.status(400).json({ error: 'Order is already on this table' });
    }

    const db = getDatabase();
    const moved = withTxn(() => {
      const sourceTable = db.prepare('SELECT * FROM tables WHERE id = ?').get(sourceTableId) as any;
      if (!sourceTable) {
        const error: any = new Error('Source table not found');
        error.status = 404;
        throw error;
      }

      const targetTable = db.prepare('SELECT * FROM tables WHERE id = ?').get(target_table_id) as any;
      if (!targetTable) {
        const error: any = new Error('Target table not found');
        error.status = 404;
        throw error;
      }

      const order = activeOrderForTable(db, sourceTableId, order_id) as any;
      if (!order) {
        const error: any = new Error(order_id ? 'Active order not found on source table' : 'Source table has no active order');
        error.status = 404;
        throw error;
      }

      const targetActiveOrder = activeOrderForTable(db, target_table_id) as any;
      if (targetActiveOrder) {
        const error: any = new Error('Target table already has an active order');
        error.status = 409;
        throw error;
      }

      const nowStr = now();
      const movedStatus = sourceTable.status === 'precheck' ? 'precheck' : 'occupied';
      db.prepare('UPDATE orders SET table_id = ?, type = ?, updated_at = ? WHERE id = ?')
        .run(target_table_id, order.type, nowStr, order.id);
      db.prepare("UPDATE tables SET status = 'available', updated_at = ? WHERE id = ?")
        .run(nowStr, sourceTableId);
      db.prepare('UPDATE tables SET status = ?, updated_at = ? WHERE id = ?')
        .run(movedStatus, nowStr, target_table_id);

      const updatedOrder = parseRowJson(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) as any);
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      const updatedSource = db.prepare('SELECT * FROM tables WHERE id = ?').get(sourceTableId) as any;
      const updatedTarget = db.prepare('SELECT * FROM tables WHERE id = ?').get(target_table_id) as any;

      return {
        order: {
          ...updatedOrder,
          items,
          table: { ...updatedTarget, name: updatedTarget.number },
        },
        sourceTable: tableShape(updatedSource, activeOrderForTable(db, sourceTableId), db),
        targetTable: tableShape(updatedTarget, activeOrderForTable(db, target_table_id), db),
      };
    });

    cloudSync.recordOrderChanged(moved.order.id, 'order.table_moved');
    notifyKdsUpdate();

    res.json({
      order: moved.order,
      sourceTable: moved.sourceTable,
      targetTable: moved.targetTable,
    });
  } catch (error: any) {
    const statusCode = error.status || 500;
    console.error('[API] Table move failed:', error);
    res.status(statusCode).json({ error: statusCode >= 500 ? 'Table move failed' : error.message });
  }
});

function mergeBlockReason(db: ReturnType<typeof getDatabase>, orderId: number): string | null {
  const bills = db.prepare('SELECT * FROM bills WHERE order_id = ?').all(orderId) as any[];
  for (const bill of bills) {
    if (bill.split_group_id) return 'Cannot merge a split check';
    if (bill.payment_status !== 'unpaid') return 'Cannot merge a paid or partially paid check';
    if (bill.precheck_printed_at) return 'Cancel the precheck before merging tables';
  }
  return null;
}

router.post('/:id/merge-order', requireRole(...ROLE_ACCESS.sales), (req: Request, res: Response) => {
  try {
    const destTableId = req.params.id as string;
    const { source_table_id } = req.body || {};
    if (!source_table_id) {
      return res.status(400).json({ error: 'source_table_id is required' });
    }
    if (source_table_id === destTableId) {
      return res.status(400).json({ error: 'Cannot merge a table with itself' });
    }

    const db = getDatabase();
    const merged = withTxn(() => {
      const destTable = db.prepare('SELECT * FROM tables WHERE id = ?').get(destTableId) as any;
      const sourceTable = db.prepare('SELECT * FROM tables WHERE id = ?').get(source_table_id) as any;
      if (!destTable || !sourceTable) {
        const error: any = new Error('Table not found');
        error.status = 404;
        throw error;
      }

      const destOrder = activeOrderForTable(db, destTableId) as any;
      const sourceOrder = activeOrderForTable(db, source_table_id) as any;
      if (!destOrder) {
        const error: any = new Error('Destination table has no active order');
        error.status = 404;
        throw error;
      }
      if (!sourceOrder) {
        const error: any = new Error('Source table has no active order');
        error.status = 404;
        throw error;
      }
      if (destTable.status === 'precheck' || sourceTable.status === 'precheck') {
        const error: any = new Error('Cancel the precheck before merging tables');
        error.status = 409;
        throw error;
      }

      const destBlock = mergeBlockReason(db, destOrder.id);
      if (destBlock) {
        const error: any = new Error(destBlock);
        error.status = 409;
        throw error;
      }
      const sourceBlock = mergeBlockReason(db, sourceOrder.id);
      if (sourceBlock) {
        const error: any = new Error(sourceBlock);
        error.status = 409;
        throw error;
      }

      const nowStr = now();
      db.prepare('UPDATE order_items SET order_id = ?, updated_at = ? WHERE order_id = ?')
        .run(destOrder.id, nowStr, sourceOrder.id);

      const destSubtotal = Number(destOrder.subtotal || 0) + Number(sourceOrder.subtotal || 0);
      const destTax = Number(destOrder.tax_amount || 0) + Number(sourceOrder.tax_amount || 0);
      const destDiscount = Number(destOrder.discount_amount || 0) + Number(sourceOrder.discount_amount || 0);
      const destTotal = Number(destOrder.total || 0) + Number(sourceOrder.total || 0);
      const destGuests = Math.min(99, Math.max(1, Number(destOrder.guest_count || 1) + Number(sourceOrder.guest_count || 1)));

      db.prepare(`
        UPDATE orders SET subtotal = ?, tax_amount = ?, discount_amount = ?, total = ?, guest_count = ?, updated_at = ?
        WHERE id = ?
      `).run(destSubtotal, destTax, destDiscount, destTotal, destGuests, nowStr, destOrder.id);

      db.prepare(`
        UPDATE orders SET table_id = NULL, status = 'cancelled', subtotal = 0, tax_amount = 0, total = 0,
          cancelled_at = ?, cancellation_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(nowStr, `Merged into table ${destTable.number}`, nowStr, sourceOrder.id);

      db.prepare("DELETE FROM bills WHERE order_id = ? AND payment_status = 'unpaid' AND COALESCE(paid_amount, 0) = 0")
        .run(sourceOrder.id);

      const destBill = db.prepare("SELECT * FROM bills WHERE order_id = ? AND payment_status != 'paid'").get(destOrder.id) as any;
      if (destBill) {
        const newBalance = Math.max(0, destTotal - (destBill.paid_amount || 0));
        db.prepare('UPDATE bills SET subtotal = ?, tax_amount = ?, discount_amount = ?, total = ?, balance = ?, updated_at = ? WHERE id = ?')
          .run(destSubtotal, destTax, destDiscount, destTotal, newBalance, nowStr, destBill.id);
      }

      db.prepare("UPDATE tables SET status = 'available', updated_at = ? WHERE id = ?").run(nowStr, source_table_id);
      db.prepare("UPDATE tables SET status = 'occupied', updated_at = ? WHERE id = ?").run(nowStr, destTableId);

      const updatedDest = parseRowJson(db.prepare('SELECT * FROM orders WHERE id = ?').get(destOrder.id) as any);
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(destOrder.id);
      const updatedSourceTable = db.prepare('SELECT * FROM tables WHERE id = ?').get(source_table_id) as any;
      const updatedDestTable = db.prepare('SELECT * FROM tables WHERE id = ?').get(destTableId) as any;

      return {
        order: { ...updatedDest, items, table: { ...updatedDestTable, name: updatedDestTable.number } },
        sourceTable: tableShape(updatedSourceTable, activeOrderForTable(db, source_table_id), db),
        targetTable: tableShape(updatedDestTable, activeOrderForTable(db, destTableId), db),
      };
    });

    cloudSync.recordOrderChanged(merged.order.id, 'order.table_merged');
    notifyKdsUpdate();
    res.json(merged);
  } catch (error: any) {
    const statusCode = error.status || 500;
    console.error('[API] Table merge failed:', error);
    res.status(statusCode).json({ error: statusCode >= 500 ? 'Table merge failed' : error.message });
  }
});

router.patch('/:id/status', requireRole(...ROLE_ACCESS.ownerManager), (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['available', 'occupied', 'reserved', 'cleaning', 'held', 'precheck'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Use: ${validStatuses.join(', ')}` });
    }

    const db = getDatabase();
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    db.prepare('UPDATE tables SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now(), req.params.id);

    const updated = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    res.json({ table: updated });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export const tableRoutes = router;
