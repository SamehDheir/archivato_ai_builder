import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { JobsService } from './jobs.service';
import { GENERATE_JOB } from './pipeline.constants';

/** The shape of the fake jobs this queue hands back (a subset of bullmq's Job). */
interface FakeJob {
  id: string;
  data: unknown;
  progress: number;
  returnvalue: unknown;
  failedReason: string | undefined;
  getState: () => Promise<string>;
}

/** A minimal fake BullMQ queue backed by an in-memory map. */
function fakeQueue() {
  const jobs = new Map<string, FakeJob>();
  let seq = 0;
  const queue = {
    add: jest.fn(async (_name: string, data: unknown) => {
      const id = String(++seq);
      const job: FakeJob = {
        id,
        data,
        progress: 0,
        returnvalue: undefined,
        failedReason: undefined,
        getState: async () => 'waiting',
      };
      jobs.set(id, job);
      return job;
    }),
    getJob: jest.fn(async (id: string) => jobs.get(id) ?? undefined),
  } as unknown as Queue;
  return { queue, jobs };
}

describe('JobsService', () => {
  it('enqueues a valid stage as a generate job', async () => {
    const { queue } = fakeQueue();
    const svc = new JobsService(queue);

    const status = await svc.enqueue('sess-1', 'requirements');

    expect(queue.add).toHaveBeenCalledWith(
      GENERATE_JOB,
      { sessionId: 'sess-1', stage: 'requirements' },
      expect.objectContaining({ attempts: 1 }),
    );
    expect(status).toMatchObject({
      sessionId: 'sess-1',
      stage: 'requirements',
      state: 'waiting',
    });
  });

  it('rejects an unknown stage with 400', async () => {
    const { queue } = fakeQueue();
    const svc = new JobsService(queue);
    await expect(svc.enqueue('sess-1', 'nope')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns status for a job that belongs to the session', async () => {
    const { queue } = fakeQueue();
    const svc = new JobsService(queue);
    const { id } = await svc.enqueue('sess-1', 'review');
    await expect(svc.status('sess-1', id)).resolves.toMatchObject({
      stage: 'review',
    });
  });

  it('404s when the job belongs to a different session (no cross-tenant read)', async () => {
    const { queue } = fakeQueue();
    const svc = new JobsService(queue);
    const { id } = await svc.enqueue('sess-1', 'review');
    await expect(svc.status('other-session', id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s for an unknown job id', async () => {
    const { queue } = fakeQueue();
    const svc = new JobsService(queue);
    await expect(svc.status('sess-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
