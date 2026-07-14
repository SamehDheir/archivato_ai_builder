import { NotFoundException } from '@nestjs/common';
import type {
  ApiDesign,
  RequirementDocument,
  SystemDesign,
} from '@archivato/shared';
import { VersionsService } from './versions.service';
import { InMemoryProjectVersionRepository } from './in-memory-project-version.repository';
import { InMemoryRequirementDocumentRepository } from '../requirements/in-memory-requirement-document.repository';
import { InMemorySystemDesignRepository } from '../system-design/in-memory-system-design.repository';
import { InMemoryDatabaseDesignRepository } from '../database-design/in-memory-database-design.repository';
import { InMemoryApiDesignRepository } from '../api-design/in-memory-api-design.repository';
import { InMemoryReviewReportRepository } from '../review/in-memory-review-report.repository';

const SID = 's1';
const requirements = { sessionId: SID, functional: [] } as unknown as RequirementDocument;
const systemDesign = { sessionId: SID } as unknown as SystemDesign;
const apiDesign = { sessionId: SID } as unknown as ApiDesign;

function makeService() {
  const reqRepo = new InMemoryRequirementDocumentRepository();
  const sysRepo = new InMemorySystemDesignRepository();
  const dbRepo = new InMemoryDatabaseDesignRepository();
  const apiRepo = new InMemoryApiDesignRepository();
  const reviewRepo = new InMemoryReviewReportRepository();
  const verRepo = new InMemoryProjectVersionRepository();
  const svc = new VersionsService(
    verRepo,
    reqRepo,
    sysRepo,
    dbRepo,
    apiRepo,
    reviewRepo,
  );
  return { svc, reqRepo, sysRepo, dbRepo, apiRepo, reviewRepo };
}

describe('VersionsService', () => {
  it('skips snapshotting when nothing has been generated', async () => {
    const { svc } = makeService();
    await svc.snapshot(SID, 'noop');
    expect(await svc.list(SID)).toHaveLength(0);
  });

  it('captures a version per modification and dedupes no-op snapshots', async () => {
    const { svc, reqRepo, sysRepo } = makeService();

    await reqRepo.upsert(requirements);
    await svc.snapshot(SID, 'generate requirements');
    await svc.snapshot(SID, 'again — unchanged'); // deduped
    expect(await svc.list(SID)).toHaveLength(1);

    await sysRepo.upsert(systemDesign);
    await svc.snapshot(SID, 'generate system-design');

    const list = await svc.list(SID);
    expect(list).toHaveLength(2);
    expect(list[0].version).toBe(2); // newest first
    expect(list[1].version).toBe(1);
  });

  it('returns a version with its full snapshot', async () => {
    const { svc, reqRepo } = makeService();
    await reqRepo.upsert(requirements);
    await svc.snapshot(SID, 'v1');

    const v1 = await svc.get(SID, 1);
    expect(v1.version).toBe(1);
    expect(v1.snapshot.requirements).not.toBeNull();
    expect(v1.snapshot.systemDesign).toBeNull();

    await expect(svc.get(SID, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restores a version exactly (re-adds present, removes absent) + records it', async () => {
    const { svc, reqRepo, sysRepo, apiRepo } = makeService();

    // v1: requirements only
    await reqRepo.upsert(requirements);
    await svc.snapshot(SID, 'generate requirements');
    // v2: + system + api
    await sysRepo.upsert(systemDesign);
    await apiRepo.upsert(apiDesign);
    await svc.snapshot(SID, 'generate later stages');

    const restored = await svc.restore(SID, 1);
    expect(restored.systemDesign).toBeNull();

    // The live artifacts now match v1: requirements kept, system/api removed.
    expect(await reqRepo.findBySessionId(SID)).not.toBeNull();
    expect(await sysRepo.findBySessionId(SID)).toBeNull();
    expect(await apiRepo.findBySessionId(SID)).toBeNull();

    // Restore is itself recorded as the newest version.
    const list = await svc.list(SID);
    expect(list[0].version).toBe(3);
    expect(list[0].label).toBe('restore v1');
  });
});
