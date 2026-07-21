/**
 * Supporting tables, only when the requirements actually ask for them.
 *
 * The Database Designer's prompt carried this line:
 *
 *   *"Add an audit-log entity whenever the requirements restrict who may read or
 *   change records, or name a regulated data category."*
 *
 * The intent was conditional. The condition was not: **every** application with
 * more than one role restricts who may read or change records, so the rule fired
 * on everything, and a lightweight internal task board for 30–50 people shipped
 * an `audit_logs` table nobody asked for. An unrequested table is not free — it
 * is a migration, a write on every mutation, a retention question, and a line
 * item in the effort estimate that becomes a line item in the price.
 *
 * This is the same division of labour the tenancy module established: the prompt
 * states the rule, deterministic code decides which world we are in and enforces
 * the same verdict on the output, so prompt and backstop can never disagree.
 *
 * **Asymmetric, like `applyTenancy`, and in the same direction of caution.** The
 * evidence bar for KEEPING an audit log is deliberately low — any genuine audit,
 * traceability or regulated-data signal is enough — because a project that needs
 * an audit trail and lacks one has a compliance hole, while a project that has
 * one and did not need it has only paid for a table. Only a design with no signal
 * at all loses it.
 *
 * Pure and runtime-free.
 */

import type { DatabaseDesign, Entity, Relation } from './database-design';
import type { RequirementDocument } from './requirements';

/**
 * Explicit demand for an audit trail.
 *
 * Note what is NOT here: roles, permissions, "only admins can edit", or
 * "authorized users". Those describe access CONTROL, which every application
 * has; an audit trail is a record of what was done after the fact, and it is a
 * separate, separately-priced capability. Conflating the two is the exact bug
 * this module exists to fix.
 */
const AUDIT_DEMAND_EN =
  /\b(?:audit|audit(?:ing)? trail|audit log|activity log|change history|history of changes|track (?:all )?changes|who (?:changed|modified|deleted|accessed)|traceab\w*|non[- ]?repudiation|tamper[- ]?(?:proof|evident)|forensic|immutable log|retention polic\w*|regulatory report\w*)\b/i;

const AUDIT_DEMAND_AR =
  /(?:تدقيق|سجل التدقيق|سجل النشاط|سجل التغييرات|تتبع التغييرات|من قام بالتعديل|عدم الإنكار|قابلية التتبع|سياسة الاحتفاظ)/;

/**
 * Data categories whose handling implies an audit obligation regardless of
 * whether anyone wrote the word "audit". A named regime, or the health/financial
 * record types those regimes govern.
 */
const REGULATED_DATA_EN =
  /\b(?:hipaa|gdpr|pdpl|nca|ccpa|pci[- ]?dss|pci|sox|iso ?27001|phi|protected health|medical record|health record|patient record|prescription|clinical|financial transaction|ledger|kyc|aml|anti[- ]?money)\b/i;

const REGULATED_DATA_AR =
  /(?:بيانات صحية|السجل الطبي|سجل المريض|وصفة طبية|معاملات مالية|دفتر الأستاذ|اعرف عميلك|غسل الأموال|حماية البيانات الشخصية)/;

/**
 * Explicit demand for delivery tracking on notifications.
 *
 * "Send the user a reminder" is not this. Sending is the feature; recording
 * whether each send succeeded, was opened, or must be retried is a second
 * feature with its own table, and it is only built when asked for.
 */
const DELIVERY_DEMAND_EN =
  /\b(?:delivery (?:status|receipt|report|log)|delivery[- ]?tracking|read receipt|open rate|bounce\w*|undeliverable|failed (?:notification|message|email|sms)|resend|retry (?:the )?(?:notification|message|email)|notification history|message history|audit of (?:notifications|messages))\b/i;

const DELIVERY_DEMAND_AR =
  /(?:حالة التسليم|إيصال التسليم|تتبع التسليم|إشعار مقروء|رسائل فاشلة|إعادة الإرسال|سجل الإشعارات)/;

/** Every sentence in the requirement document a supporting-table signal can live in. */
function requirementHaystack(requirements: RequirementDocument): string {
  return [
    requirements.executiveSummary ?? '',
    ...(requirements.functional ?? []).map((f) => `${f.title} ${f.description}`),
    ...(requirements.nonFunctional ?? []).map((n) => `${n.category} ${n.description}`),
    ...(requirements.businessRules ?? []).map((b) => b.description),
    ...(requirements.constraints ?? []),
  ].join(' ');
}

/**
 * Do the requirements genuinely call for an audit trail?
 *
 * True on an explicit audit/traceability demand, or on a regulated data category
 * whose handling implies one. False on "we have roles and permissions" — see
 * `AUDIT_DEMAND_EN`.
 */
export function requiresAuditLog(requirements: RequirementDocument): boolean {
  const text = requirementHaystack(requirements);
  return (
    AUDIT_DEMAND_EN.test(text) ||
    AUDIT_DEMAND_AR.test(text) ||
    REGULATED_DATA_EN.test(text) ||
    REGULATED_DATA_AR.test(text)
  );
}

/** Do the requirements ask for notification DELIVERY tracking, not just sending? */
export function requiresDeliveryLog(requirements: RequirementDocument): boolean {
  const text = requirementHaystack(requirements);
  return DELIVERY_DEMAND_EN.test(text) || DELIVERY_DEMAND_AR.test(text);
}

/**
 * Tables that exist only to record what happened.
 *
 * `logs` in any of its usual spellings. Deliberately anchored to the whole table
 * name: a table merely *containing* the word (`login_attempts`, `workout_logs`
 * in a fitness tracker, `call_logs` in a CRM) is domain data the product is
 * about, and stripping it would delete the client's actual feature.
 */
const AUDIT_TABLE =
  /^(?:audit_logs?|audit_trails?|audit_entries|activity_logs?|activity_feed|change_logs?|changelogs?|event_logs?|system_logs?|access_logs?|history_logs?)$/i;

/**
 * Notification delivery logs — never `notifications` itself.
 *
 * A reminder board legitimately stores the notifications it must send; what it
 * does not need, unasked, is a second table recording the delivery outcome of
 * each one.
 */
const DELIVERY_LOG_TABLE =
  /^(?:notification_logs?|notification_deliveries|notification_history|message_logs?|email_logs?|sms_logs?|delivery_logs?|delivery_receipts?)$/i;

/** What `stripUnrequestedSupportTables` did, so the caller can report it. */
export interface SupportTableResult {
  design: DatabaseDesign;
  /** Table names removed. Empty when the schema was already proportionate. */
  removed: string[];
}

/**
 * Remove log-style tables the requirements never asked for.
 *
 * Removal is a three-part edit, and skipping any part leaves a schema that will
 * not migrate: the entity itself, every relation that touches it, and every
 * foreign-key column in a surviving table that references it. The last one is
 * the easy miss — a dangling `references` produces SQL DDL with a constraint
 * pointing at a table that does not exist, which fails at `ALTER TABLE` rather
 * than anywhere near here.
 *
 * A log table that other tables genuinely depend on is KEPT regardless. Nothing
 * normally references an audit log (it references others), so this is a rare
 * case — but if a design has built real structure on top of one, tearing it out
 * would do more damage than the unrequested table does.
 */
export function stripUnrequestedSupportTables(
  design: DatabaseDesign,
  requirements: RequirementDocument,
): SupportTableResult {
  const keepAudit = requiresAuditLog(requirements);
  const keepDelivery = requiresDeliveryLog(requirements);
  if (keepAudit && keepDelivery) return { design, removed: [] };

  const entities = design.entities ?? [];
  const doomed = new Set<string>();
  for (const entity of entities) {
    const name = (entity.name ?? '').trim();
    if (!keepAudit && AUDIT_TABLE.test(name)) doomed.add(name);
    if (!keepDelivery && DELIVERY_LOG_TABLE.test(name)) doomed.add(name);
  }
  if (doomed.size === 0) return { design, removed: [] };

  // A log table something else hangs off is load-bearing — leave it alone.
  for (const entity of entities) {
    if (doomed.has(entity.name)) continue;
    for (const column of entity.columns ?? []) {
      const target = column.references?.entity;
      if (target && doomed.has(target)) doomed.delete(target);
    }
  }
  if (doomed.size === 0) return { design, removed: [] };

  const survivors: Entity[] = entities
    .filter((e) => !doomed.has(e.name))
    .map((e) => ({
      ...e,
      // No surviving table references a doomed one (checked above), so this only
      // ever runs when a design contradicted itself; keeping it is cheap
      // insurance against emitting a broken foreign key.
      columns: (e.columns ?? []).filter((c) => !doomed.has(c.references?.entity ?? '')),
    }));

  const relations: Relation[] = (design.relations ?? []).filter(
    (r) => !doomed.has(r.from) && !doomed.has(r.to),
  );

  return {
    design: { ...design, entities: survivors, relations },
    removed: [...doomed],
  };
}

/**
 * The supporting-table instruction for the prompt, decided by the code above.
 *
 * English (it is an instruction to the model, not prose a client reads). Both
 * branches are stated explicitly rather than only the positive one: a rule with
 * no stated negative case reads to a model as a professional default, which is
 * how the original conditional line ended up firing on every project.
 */
export function supportTableDirective(requirements: RequirementDocument): string {
  const lines: string[] = [];
  lines.push(
    requiresAuditLog(requirements)
      ? 'AUDIT TRAIL: the requirements call for one — include an audit-log table recording actor, action, target record and timestamp.'
      : 'AUDIT TRAIL: the requirements do NOT ask for one. Do NOT add an audit_logs, activity_log, change_log or event_log table. Roles and permissions alone are access control, not an audit requirement, and an unrequested audit table is billed to a client who never asked for it.',
  );
  lines.push(
    requiresDeliveryLog(requirements)
      ? 'NOTIFICATION DELIVERY: the requirements ask for delivery tracking — record per-notification delivery state.'
      : 'NOTIFICATION DELIVERY: no delivery-tracking requirement was stated. Do NOT add a separate notification_log / delivery_log table. If notifications are a feature, one notifications table is enough.',
  );
  lines.push(
    'More generally: add a table only when a functional requirement, a business rule or a stated constraint needs it. Do not add tables because a professional product usually has them.',
  );
  return lines.join('\n');
}
