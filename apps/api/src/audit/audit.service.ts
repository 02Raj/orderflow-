import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';

export interface AuditEntry {
  restaurantId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Cash-handling disputes are the reason this exists: voids, refunds and price overrides are the
 * events an owner asks about after a bad shift, so they are recorded even in the MVP.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DatabaseService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.query(
        `insert into audit_logs (id, restaurant_id, user_id, action, entity, entity_id, metadata)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          entry.restaurantId,
          entry.userId ?? null,
          entry.action,
          entry.entity,
          entry.entityId ?? null,
          JSON.stringify(entry.metadata ?? {}),
        ],
      );
    } catch (error) {
      // Auditing must never block service at the counter.
      this.logger.warn(`Failed to write audit log ${entry.action}: ${(error as Error).message}`);
    }
  }

  list(restaurantId: string, limit = 100) {
    return this.db.many(
      `select action, entity, entity_id as "entityId", metadata, created_at as "createdAt"
       from audit_logs where restaurant_id = $1 order by created_at desc limit $2`,
      [restaurantId, limit],
    );
  }
}
